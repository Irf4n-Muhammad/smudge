import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { collectionById } from "../../contracts/src/identity.js";
import type { Chapter } from "../../contracts/src/identity.js";
import {
  ticketDoorSchema,
  ticketSetupSchema,
  type EventTickets,
  type Ticket,
} from "../../contracts/src/org-rooms.js";
import type { Actor } from "./index.js";
import type { OrgService } from "./orgs.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

/** The door code changes this often; a scan stays good for the current code and a few before. */
const doorStepMs = 30_000;
const doorSteps = 6;
const sign = (secret: string, text: string) =>
  createHmac("sha256", secret).update(text).digest("base64url").slice(0, 8);
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Free tickets for an organisation's events. They open in waves: first the organisation's own
 * people and anyone who holds one of its stamps (they came before), then, if the admin says so,
 * everyone. When it's full, people wait in line and move up when someone gives theirs back.
 * At the door the organisation shows a QR that changes every 30 seconds; a ticket holder scans
 * it with their own phone, so a screenshot of someone else's ticket gets nobody in.
 */
export class OrgEventsService {
  constructor(
    private readonly social: SocialService,
    private readonly orgs: OrgService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  private key(orgId: string, stampId: string) {
    return `${orgId}:${stampId}`;
  }
  private event(orgId: string, stampId: string) {
    const collection = collectionById(`crew-${orgId}`.slice(0, 40));
    const stamp = collection?.stamps.find((s) => s.id === stampId);
    if (!stamp) throw new AppError("NOT_FOUND", 404);
    return stamp;
  }
  private setup(orgId: string, stampId: string) {
    return this.store.get<EventTickets>("event-tickets", this.key(orgId, stampId));
  }
  private tickets(orgId: string, stampId: string) {
    return this.store
      .all<Ticket>("event-ticket")
      .filter((t) => t.orgId === orgId && t.stampId === stampId)
      .sort((a, b) => a.at.localeCompare(b.at));
  }
  /** The first wave: the organisation's own people and anyone holding one of its stamps. */
  firstWave(userId: string, orgId: string) {
    return (
      this.orgs.isOwn(userId, orgId) ||
      this.store
        .all<Chapter>("chapter")
        .some((c) => c.ownerId === userId && c.orgId === orgId && c.kind === "stamp")
    );
  }
  /** The admin sets an event's date, place, size and waves. Fewer seats than taken is refused. */
  setTickets(actor: Actor, orgId: string, stampId: string, input: unknown) {
    this.orgs.requireAdmin(actor, orgId);
    this.event(orgId, stampId);
    const parsed = ticketSetupSchema.parse(input);
    const going = this.tickets(orgId, stampId).filter((t) => t.status === "going").length;
    if (parsed.capacity < going) throw new AppError("CAPACITY_BELOW_TAKEN", 409);
    const before = this.setup(orgId, stampId);
    const next: EventTickets = {
      orgId,
      stampId,
      when: parsed.when,
      place: parsed.place,
      capacity: parsed.capacity,
      firstWave: parsed.firstWave,
      ...(parsed.everyone ? { everyone: parsed.everyone } : {}),
      secret: before?.secret ?? randomBytes(32).toString("hex"),
    };
    this.store.transaction(() => {
      this.store.put("event-tickets", this.key(orgId, stampId), next);
      this.promote(next);
    });
    return this.view(orgId, stampId);
  }
  /** Seats freed up (someone gave theirs back, or the admin added seats) go down the line. */
  private promote(setup: EventTickets) {
    const all = this.tickets(setup.orgId, setup.stampId);
    let free = setup.capacity - all.filter((t) => t.status === "going").length;
    for (const t of all) {
      if (free <= 0) break;
      if (t.status !== "waiting") continue;
      this.store.put("event-ticket", this.ticketKey(t), { ...t, status: "going" } satisfies Ticket);
      free--;
    }
  }
  private ticketKey(t: { orgId: string; stampId: string; userId: string }) {
    return `${t.orgId}:${t.stampId}:${t.userId}`;
  }
  has(orgId: string, stampId: string) {
    return !!this.setup(orgId, stampId);
  }
  /** One event's tickets, as the viewer sees them. */
  view(orgId: string, stampId: string, viewerId?: string) {
    const stamp = this.event(orgId, stampId);
    const setup = this.setup(orgId, stampId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    const all = this.tickets(orgId, stampId);
    const going = all.filter((t) => t.status === "going");
    const waiting = all.filter((t) => t.status === "waiting");
    const mine = viewerId ? all.find((t) => t.userId === viewerId) : undefined;
    const now = this.now().toISOString();
    const first = viewerId ? this.firstWave(viewerId, orgId) : false;
    const opens = first ? setup.firstWave : setup.everyone;
    return {
      id: stamp.id,
      name: stamp.name,
      when: setup.when,
      place: setup.place,
      capacity: setup.capacity,
      left: Math.max(0, setup.capacity - going.length),
      waiting: waiting.length,
      firstWave: setup.firstWave,
      everyone: setup.everyone ?? null,
      over: setup.when < now,
      /** When this viewer can claim: their wave's time, or null if no wave is theirs. */
      opensForYou: opens ?? null,
      yourWave: viewerId ? (first ? "first" : "everyone") : null,
      mine: mine
        ? {
            status: mine.status,
            ...(mine.status === "waiting"
              ? { place: waiting.findIndex((t) => t.userId === mine.userId) + 1 }
              : {}),
            ...(mine.arrivedAt ? { arrivedAt: mine.arrivedAt } : {}),
          }
        : null,
    };
  }
  /** Every event with tickets that hasn't happened yet, soonest first. */
  list(orgId: string, viewerId?: string) {
    const setups = this.store.all<EventTickets>("event-tickets").filter((s) => s.orgId === orgId);
    const now = this.now().toISOString();
    return setups
      .filter((s) => s.when >= now)
      .sort((a, b) => a.when.localeCompare(b.when))
      .slice(0, 10)
      .flatMap((s) => {
        try {
          return [this.view(orgId, s.stampId, viewerId)];
        } catch {
          return [];
        }
      });
  }
  /** Take a free ticket, or a place in line when it's full. Once each; your wave must be open. */
  claim(actor: Actor, orgId: string, stampId: string) {
    const userId = this.social.actor(actor);
    if (!this.orgs.canSee(orgId, userId)) throw new AppError("NOT_FOUND", 404);
    const setup = this.setup(orgId, stampId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    const now = this.now().toISOString();
    if (setup.when < now) throw new AppError("EVENT_OVER", 409);
    const opens = this.firstWave(userId, orgId) ? setup.firstWave : setup.everyone;
    if (!opens || opens > now) throw new AppError("TICKETS_NOT_OPEN", 409);
    const all = this.tickets(orgId, stampId);
    if (!all.some((t) => t.userId === userId)) {
      const going = all.filter((t) => t.status === "going").length;
      const ticket: Ticket = {
        orgId,
        stampId,
        userId,
        status: going < setup.capacity ? "going" : "waiting",
        at: now,
      };
      this.store.transaction(() => this.store.put("event-ticket", this.ticketKey(ticket), ticket));
    }
    return this.view(orgId, stampId, userId);
  }
  /** Give it back; the first in line gets it. */
  release(actor: Actor, orgId: string, stampId: string) {
    const userId = this.social.actor(actor);
    const setup = this.setup(orgId, stampId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    const key = this.ticketKey({ orgId, stampId, userId });
    const ticket = this.store.get<Ticket>("event-ticket", key);
    if (ticket?.arrivedAt) throw new AppError("ALREADY_ARRIVED", 409);
    if (ticket)
      this.store.transaction(() => {
        this.store.remove("event-ticket", key);
        this.promote(setup);
      });
    return this.view(orgId, stampId, userId);
  }
  /** The admin's door screen: a QR that changes every 30 seconds, and who has come. */
  door(actor: Actor, orgId: string, stampId: string) {
    this.orgs.requireAdmin(actor, orgId);
    const setup = this.setup(orgId, stampId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    const t = this.now().getTime();
    const step = Math.floor(t / doorStepMs);
    const code = sign(setup.secret, `door:${stampId}:${step}`);
    const all = this.tickets(orgId, stampId);
    return {
      path: `/o/${encodeURIComponent(orgId)}?door=${encodeURIComponent(stampId)}.${code}`,
      rotatesInMs: (step + 1) * doorStepMs - t,
      arrived: all.filter((x) => x.arrivedAt).length,
      going: all.filter((x) => x.status === "going").length,
    };
  }
  /** A ticket holder scanned the door: they're in. Without a ticket, the door says so. */
  arrive(actor: Actor, orgId: string, stampId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const setup = this.setup(orgId, stampId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    const { code } = ticketDoorSchema.parse(input);
    const step = Math.floor(this.now().getTime() / doorStepMs);
    const fresh = Array.from({ length: doorSteps }, (_, i) =>
      sign(setup.secret, `door:${stampId}:${step - i}`),
    ).some((c) => same(c, code));
    if (!fresh) throw new AppError("DOOR_CODE_EXPIRED", 400);
    const key = this.ticketKey({ orgId, stampId, userId });
    const ticket = this.store.get<Ticket>("event-ticket", key);
    if (!ticket || ticket.status !== "going") throw new AppError("NO_TICKET", 403);
    if (!ticket.arrivedAt)
      this.store.transaction(() =>
        this.store.put("event-ticket", key, {
          ...ticket,
          arrivedAt: this.now().toISOString(),
        } satisfies Ticket),
      );
    return this.view(orgId, stampId, userId);
  }
}
