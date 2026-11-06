import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { collectionById, registerCollection } from "../../contracts/src/identity.js";
import type { Chapter, Collection } from "../../contracts/src/identity.js";
import {
  huntFindSchema,
  huntSetupSchema,
  swapSchema,
  ticketDoorSchema,
  ticketSetupSchema,
  type EventTickets,
  type Meeting,
  type Ticket,
} from "../../contracts/src/org-rooms.js";
import type { Actor } from "./index.js";
import type { IdentityService } from "./identity.js";
import type { OrgService } from "./orgs.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

/** A rotating code changes this often; a scan stays good for the current code and a few before. */
const stepMs = 30_000;
const steps = 6;
/** How long a paid ticket is kept for its buyer while they pay. */
const holdMs = 10 * 60_000;
const sign = (secret: string, text: string) =>
  createHmac("sha256", secret).update(text).digest("base64url").slice(0, 8);
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Takes the money for a paid ticket. Wired by the server: a demo that always succeeds in demo
 * mode, and nothing in production until a payment provider is chosen, which turns paid tickets
 * off rather than giving them away.
 */
export interface Payments {
  name: string;
  charge(input: { userId: string; amount: number; currency: string; description: string }): {
    ref: string;
  };
}

/**
 * Tickets for an organisation's events. They open in waves: a presale for the people who hold
 * enough of its stamps, then its own people and any stamp holder, then, if the admin says so,
 * everyone. A free event keeps a line when it's full; a paid one holds a seat while its buyer
 * pays. At the door the organisation shows a QR that changes every 30 seconds and ticket holders
 * scan it with their own phone; coming in leaves a stamp. At the event, two people can scan each
 * other to remember they met, and The Hunt hides printed QRs around the venue to find.
 */
export class OrgEventsService {
  payments: Payments | undefined;
  constructor(
    private readonly social: SocialService,
    private readonly orgs: OrgService,
    private readonly identity: IdentityService,
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
  private needSetup(orgId: string, stampId: string) {
    const setup = this.setup(orgId, stampId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    return setup;
  }
  /** The event's tickets, oldest first. A hold whose time ran out is no ticket at all. */
  private tickets(orgId: string, stampId: string) {
    const now = this.now().toISOString();
    return this.store
      .all<Ticket>("event-ticket")
      .filter(
        (t) =>
          t.orgId === orgId &&
          t.stampId === stampId &&
          !(t.status === "held" && (t.heldUntil ?? "") < now),
      )
      .sort((a, b) => a.at.localeCompare(b.at));
  }
  private ticketKey(t: { orgId: string; stampId: string; userId: string }) {
    return `${t.orgId}:${t.stampId}:${t.userId}`;
  }
  private myTicket(orgId: string, stampId: string, userId: string) {
    return this.tickets(orgId, stampId).find((t) => t.userId === userId);
  }
  private taken(all: Ticket[]) {
    return all.filter((t) => t.status === "going" || t.status === "held").length;
  }
  /** How many of the organisation's stamps someone holds: crew, came, found the hunt. */
  stampsHeld(userId: string, orgId: string) {
    return this.store
      .all<Chapter>("chapter")
      .filter((c) => c.ownerId === userId && c.orgId === orgId && c.kind === "stamp").length;
  }
  /** The first wave: the organisation's own people and anyone holding one of its stamps. */
  firstWave(userId: string, orgId: string) {
    return this.orgs.isOwn(userId, orgId) || this.stampsHeld(userId, orgId) > 0;
  }
  /** Which wave someone is in, and when it opens for them; null when no wave is theirs. */
  private wave(userId: string | undefined, setup: EventTickets) {
    if (!userId) return { wave: null, opens: setup.everyone ?? null };
    if (setup.presale && this.stampsHeld(userId, setup.orgId) >= setup.presale.minStamps)
      return { wave: "presale" as const, opens: setup.presale.opens };
    if (this.firstWave(userId, setup.orgId))
      return { wave: "first" as const, opens: setup.firstWave };
    return { wave: "everyone" as const, opens: setup.everyone ?? null };
  }
  /** The admin sets an event's date, place, seats, waves and price. Fewer seats than taken is refused. */
  setTickets(actor: Actor, orgId: string, stampId: string, input: unknown) {
    this.orgs.requireAdmin(actor, orgId);
    this.event(orgId, stampId);
    const parsed = ticketSetupSchema.parse(input);
    const price = parsed.price ?? 0;
    if (price > 0 && !this.payments) throw new AppError("PAYMENTS_OFF", 503);
    if (price > 0 && !parsed.currency) throw new AppError("CURRENCY_REQUIRED", 400);
    if (parsed.capacity < this.taken(this.tickets(orgId, stampId)))
      throw new AppError("CAPACITY_BELOW_TAKEN", 409);
    const before = this.setup(orgId, stampId);
    const next: EventTickets = {
      orgId,
      stampId,
      when: parsed.when,
      place: parsed.place,
      capacity: parsed.capacity,
      firstWave: parsed.firstWave,
      ...(parsed.everyone ? { everyone: parsed.everyone } : {}),
      ...(parsed.presale ? { presale: parsed.presale } : {}),
      ...(price > 0 ? { price, currency: parsed.currency } : {}),
      ...(before?.hunt ? { hunt: before.hunt } : {}),
      secret: before?.secret ?? randomBytes(32).toString("hex"),
    };
    this.store.transaction(() => {
      this.store.put("event-tickets", this.key(orgId, stampId), next);
      this.promote(next);
    });
    return this.view(orgId, stampId);
  }
  /** Seats freed up in a free event (someone gave theirs back, more seats) go down the line. */
  private promote(setup: EventTickets) {
    if (setup.price) return;
    const all = this.tickets(setup.orgId, setup.stampId);
    let free = setup.capacity - this.taken(all);
    for (const t of all) {
      if (free <= 0) break;
      if (t.status !== "waiting") continue;
      this.store.put("event-ticket", this.ticketKey(t), { ...t, status: "going" } satisfies Ticket);
      free--;
    }
  }
  has(orgId: string, stampId: string) {
    return !!this.setup(orgId, stampId);
  }
  /** One event's tickets, as the viewer sees them. */
  view(orgId: string, stampId: string, viewerId?: string) {
    const stamp = this.event(orgId, stampId);
    const setup = this.needSetup(orgId, stampId);
    const all = this.tickets(orgId, stampId);
    const waiting = all.filter((t) => t.status === "waiting");
    const mine = viewerId ? all.find((t) => t.userId === viewerId) : undefined;
    const { wave, opens } = this.wave(viewerId, setup);
    const found = viewerId ? this.found(orgId, stampId, viewerId) : [];
    return {
      id: stamp.id,
      name: stamp.name,
      when: setup.when,
      place: setup.place,
      capacity: setup.capacity,
      left: Math.max(0, setup.capacity - this.taken(all)),
      waiting: waiting.length,
      price: setup.price ?? 0,
      currency: setup.currency ?? null,
      presale: setup.presale ?? null,
      firstWave: setup.firstWave,
      everyone: setup.everyone ?? null,
      over: setup.when < this.now().toISOString(),
      /** When this viewer can claim: their wave's time, or null if no wave is theirs. */
      opensForYou: opens,
      yourWave: wave,
      hunt: setup.hunt
        ? { spots: setup.hunt.length, found: found.length, done: found.length >= setup.hunt.length }
        : null,
      mine: mine
        ? {
            status: mine.status,
            ...(mine.status === "waiting"
              ? { place: waiting.findIndex((t) => t.userId === mine.userId) + 1 }
              : {}),
            ...(mine.heldUntil && mine.status === "held" ? { heldUntil: mine.heldUntil } : {}),
            ...(mine.paid
              ? { paid: { amount: mine.paid.amount, currency: mine.paid.currency } }
              : {}),
            ...(mine.arrivedAt ? { arrivedAt: mine.arrivedAt } : {}),
          }
        : null,
    };
  }
  /** Every event with tickets that hasn't happened yet, soonest first. */
  list(orgId: string, viewerId?: string) {
    const now = this.now().toISOString();
    return this.store
      .all<EventTickets>("event-tickets")
      .filter((s) => s.orgId === orgId && s.when >= now)
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
  /**
   * Take a ticket once your wave is open. A free one is yours at once, or a place in line when
   * it's full; a paid one is held for you for ten minutes while you pay.
   */
  claim(actor: Actor, orgId: string, stampId: string) {
    const userId = this.social.actor(actor);
    if (!this.orgs.canSee(orgId, userId)) throw new AppError("NOT_FOUND", 404);
    const setup = this.needSetup(orgId, stampId);
    const now = this.now();
    if (setup.when < now.toISOString()) throw new AppError("EVENT_OVER", 409);
    const { opens } = this.wave(userId, setup);
    if (!opens || opens > now.toISOString()) throw new AppError("TICKETS_NOT_OPEN", 409);
    const all = this.tickets(orgId, stampId);
    if (!all.some((t) => t.userId === userId)) {
      const full = this.taken(all) >= setup.capacity;
      if (setup.price && full) throw new AppError("SOLD_OUT", 409);
      const ticket: Ticket = setup.price
        ? {
            orgId,
            stampId,
            userId,
            status: "held",
            at: now.toISOString(),
            heldUntil: new Date(now.getTime() + holdMs).toISOString(),
          }
        : { orgId, stampId, userId, status: full ? "waiting" : "going", at: now.toISOString() };
      this.store.transaction(() => this.store.put("event-ticket", this.ticketKey(ticket), ticket));
    }
    return this.view(orgId, stampId, userId);
  }
  /** Pay for a held ticket. */
  pay(actor: Actor, orgId: string, stampId: string) {
    const userId = this.social.actor(actor);
    const setup = this.needSetup(orgId, stampId);
    const ticket = this.myTicket(orgId, stampId, userId);
    if (!ticket || ticket.status !== "held") throw new AppError("NO_HOLD", 409);
    if (!this.payments || !setup.price || !setup.currency) throw new AppError("PAYMENTS_OFF", 503);
    const { ref } = this.payments.charge({
      userId,
      amount: setup.price,
      currency: setup.currency,
      description: this.event(orgId, stampId).name,
    });
    const paid: Ticket = {
      orgId,
      stampId,
      userId,
      status: "going",
      at: ticket.at,
      paid: { amount: setup.price, currency: setup.currency, ref },
    };
    this.store.transaction(() => this.store.put("event-ticket", this.ticketKey(paid), paid));
    return this.view(orgId, stampId, userId);
  }
  /** Give it back; the first in line gets it. A paid ticket is refunded by the organiser. */
  release(actor: Actor, orgId: string, stampId: string) {
    const userId = this.social.actor(actor);
    const setup = this.needSetup(orgId, stampId);
    const key = this.ticketKey({ orgId, stampId, userId });
    const ticket = this.store.get<Ticket>("event-ticket", key);
    if (ticket?.arrivedAt) throw new AppError("ALREADY_ARRIVED", 409);
    if (ticket?.paid) throw new AppError("REFUND_BY_ORGANISER", 409);
    if (ticket)
      this.store.transaction(() => {
        this.store.remove("event-ticket", key);
        this.promote(setup);
      });
    return this.view(orgId, stampId, userId);
  }

  // The door ---------------------------------------------------------------------------------
  private fresh(secret: string, text: (step: number) => string, code: string) {
    const step = Math.floor(this.now().getTime() / stepMs);
    return Array.from({ length: steps }, (_, i) => sign(secret, text(step - i))).some((c) =>
      same(c, code),
    );
  }
  /** The admin's door screen: a QR that changes every 30 seconds, and who has come. */
  door(actor: Actor, orgId: string, stampId: string) {
    this.orgs.requireAdmin(actor, orgId);
    const setup = this.needSetup(orgId, stampId);
    const t = this.now().getTime();
    const step = Math.floor(t / stepMs);
    const code = sign(setup.secret, `door:${stampId}:${step}`);
    const all = this.tickets(orgId, stampId);
    return {
      path: `/o/${encodeURIComponent(orgId)}?door=${encodeURIComponent(stampId)}.${code}`,
      rotatesInMs: (step + 1) * stepMs - t,
      arrived: all.filter((x) => x.arrivedAt).length,
      going: all.filter((x) => x.status === "going").length,
    };
  }
  /** A ticket holder scanned the door: they're in, and they keep a stamp that says they came. */
  arrive(actor: Actor, orgId: string, stampId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const setup = this.needSetup(orgId, stampId);
    const { code } = ticketDoorSchema.parse(input);
    if (!this.fresh(setup.secret, (s) => `door:${stampId}:${s}`, code))
      throw new AppError("DOOR_CODE_EXPIRED", 400);
    const key = this.ticketKey({ orgId, stampId, userId });
    const ticket = this.store.get<Ticket>("event-ticket", key);
    if (!ticket || ticket.status !== "going") throw new AppError("NO_TICKET", 403);
    if (!ticket.arrivedAt)
      this.store.transaction(() => {
        this.store.put("event-ticket", key, {
          ...ticket,
          arrivedAt: this.now().toISOString(),
        } satisfies Ticket);
        this.stamp(orgId, stampId, userId, "went", "Was there");
      });
    return this.view(orgId, stampId, userId);
  }
  /**
   * Gives one of the organisation's own stamps for this event: "went" (came through the door) or
   * "hunt" (found every spot). Each kind is a collection of the organisation's, made as needed.
   */
  private stamp(
    orgId: string,
    stampId: string,
    userId: string,
    kind: "went" | "hunt",
    word: string,
  ) {
    const event = this.event(orgId, stampId);
    const org = this.orgs.org(orgId);
    const id = `${kind}-${orgId}`.slice(0, 40);
    const before = collectionById(id);
    if (!before?.stamps.some((s) => s.id === stampId)) {
      const collection: Collection = {
        id,
        name: `${org.name}: ${kind === "went" ? "was there" : "found them all"}`,
        orgId,
        stamps: [...(before?.stamps ?? []), { id: stampId, name: event.name }],
      };
      this.store.put("collection", id, collection);
      registerCollection(collection);
    }
    const held = this.store
      .all<Chapter>("chapter")
      .some((c) => c.ownerId === userId && c.collection === id && c.stamp === stampId);
    if (held) return;
    const setup = this.setup(orgId, stampId);
    this.identity.grantChapter({
      ownerId: userId,
      kind: "stamp",
      label: `${word}, ${event.name}`,
      orgId,
      collection: id,
      stamp: stampId,
      ...(setup ? { from: Number(setup.when.slice(0, 4)) } : {}),
      method: "invite",
      audience: this.orgs.visibility(orgId) === "private" ? "circle" : "public",
    });
  }

  // Meeting people ---------------------------------------------------------------------------
  private going(orgId: string, stampId: string, userId: string) {
    const t = this.myTicket(orgId, stampId, userId);
    return t?.status === "going";
  }
  /** Your own QR at the event, for someone else to scan. It changes every 30 seconds. */
  swapCode(actor: Actor, orgId: string, stampId: string) {
    const userId = this.social.actor(actor);
    const setup = this.needSetup(orgId, stampId);
    if (!this.going(orgId, stampId, userId)) throw new AppError("NO_TICKET", 403);
    const t = this.now().getTime();
    const step = Math.floor(t / stepMs);
    const code = sign(setup.secret, `swap:${stampId}:${userId}:${step}`);
    return {
      path: `/o/${encodeURIComponent(orgId)}?swap=${encodeURIComponent(stampId)}.${encodeURIComponent(userId)}.${code}`,
      rotatesInMs: (step + 1) * stepMs - t,
    };
  }
  /** You scanned someone's QR at the same event: you both remember you met there. */
  swap(actor: Actor, orgId: string, stampId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const setup = this.needSetup(orgId, stampId);
    const { from, code } = swapSchema.parse(input);
    if (from === userId) throw new AppError("SWAP_SELF", 400);
    if (!this.fresh(setup.secret, (s) => `swap:${stampId}:${from}:${s}`, code))
      throw new AppError("SWAP_CODE_EXPIRED", 400);
    if (!this.going(orgId, stampId, userId) || !this.going(orgId, stampId, from))
      throw new AppError("NO_TICKET", 403);
    if (this.orgs.blockedEither(userId, from)) throw new AppError("NOT_FOUND", 404);
    const people = [userId, from].sort() as [string, string];
    const key = `${orgId}:${stampId}:${people.join(":")}`;
    if (!this.store.get<Meeting>("event-meeting", key))
      this.store.transaction(() =>
        this.store.put("event-meeting", key, {
          orgId,
          stampId,
          people,
          at: this.now().toISOString(),
        } satisfies Meeting),
      );
    return { met: from, event: this.event(orgId, stampId).name };
  }
  /** Who someone met, at which event. Only they see it. */
  meetings(userId: string) {
    return this.store
      .all<Meeting>("event-meeting")
      .filter((m) => m.people.includes(userId) && !this.orgs.blockedEither(...m.people))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  // The Hunt ---------------------------------------------------------------------------------
  private spotCode(setup: EventTickets, i: number) {
    return sign(setup.secret, `hunt:${setup.stampId}:${i}:${setup.hunt?.[i] ?? ""}`);
  }
  private found(orgId: string, stampId: string, userId: string) {
    return (
      this.store.get<{ found: number[] }>("hunt-find", this.ticketKey({ orgId, stampId, userId }))
        ?.found ?? []
    );
  }
  /** The admin names the spots; each gets a QR to print and hide. Renaming spots resets them. */
  setHunt(actor: Actor, orgId: string, stampId: string, input: unknown) {
    this.orgs.requireAdmin(actor, orgId);
    const setup = this.needSetup(orgId, stampId);
    const { spots } = huntSetupSchema.parse(input);
    this.store.transaction(() =>
      this.store.put("event-tickets", this.key(orgId, stampId), { ...setup, hunt: spots }),
    );
    return this.huntSheet(actor, orgId, stampId);
  }
  /** The sheet to print: each spot's name and its QR path. */
  huntSheet(actor: Actor, orgId: string, stampId: string) {
    this.orgs.requireAdmin(actor, orgId);
    const setup = this.needSetup(orgId, stampId);
    return {
      event: this.event(orgId, stampId).name,
      spots: (setup.hunt ?? []).map((name, i) => ({
        name,
        path: `/o/${encodeURIComponent(orgId)}?hunt=${encodeURIComponent(stampId)}.${i}.${this.spotCode(setup, i)}`,
      })),
    };
  }
  /** A ticket holder found a spot. Finding every one leaves a stamp. */
  find(actor: Actor, orgId: string, stampId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const setup = this.needSetup(orgId, stampId);
    const { spot, code } = huntFindSchema.parse(input);
    if (!setup.hunt || spot >= setup.hunt.length || !same(this.spotCode(setup, spot), code))
      throw new AppError("HUNT_SPOT_UNKNOWN", 400);
    if (!this.going(orgId, stampId, userId)) throw new AppError("NO_TICKET", 403);
    const key = this.ticketKey({ orgId, stampId, userId });
    const found = [...new Set([...this.found(orgId, stampId, userId), spot])].sort((a, b) => a - b);
    const done = found.length >= setup.hunt.length;
    this.store.transaction(() => {
      this.store.put("hunt-find", key, { found });
      if (done) this.stamp(orgId, stampId, userId, "hunt", "Found them all");
    });
    return { spot: setup.hunt[spot], found: found.length, spots: setup.hunt.length, done };
  }
}
