import { createHash, randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import {
  gatheringInputSchema,
  rsvpInputSchema,
  type GatheringGuestList,
  type GatheringInput,
  type GatheringInvite,
  type GatheringSummary,
} from "../../contracts/src/gatherings.js";
import type { Actor } from "./index.js";
import { AppError, GUEST } from "./social.js";
import type { SocialService } from "./social.js";

interface Gathering extends GatheringInput {
  id: string;
  ownerId: string;
  createdAt: string;
}
interface GatheringRsvp {
  gatheringId: string;
  /** A hash of the number salted with the gathering, so two invites never share a key. */
  phoneKey: string;
  phoneEnd: string;
  name: string;
  attending: boolean;
  guests: number;
  message: string;
  at: string;
  userId?: string;
}
/** Enough for one person's year of events; a ceiling against scripted abuse, not a product rule. */
const maxPerHost = 50;
/** A wedding can be big; past this the invite stops taking answers rather than growing forever. */
const maxAnswers = 3000;

/**
 * A phone number as digits with its country code. Numbers written the Indonesian way ("0812…")
 * get 62 in front, since Indonesian weddings are the first place this is used (ADR 0036);
 * anyone else writes their number with "+" or "00". Answers 8 to 15 digits, as E.164 allows.
 */
export function normalizePhone(raw: string) {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // Already international.
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) throw new AppError("INVALID_PHONE", 400);
  return digits;
}

/**
 * Moments as gatherings (ADR 0036). A host makes an invite from a template; anyone with the link
 * reads it and answers with a name and phone number, no account needed. Only the host sees the
 * answers. Phone numbers are never stored: a salted hash recognises a second answer from the
 * same number, and the last three digits help the host tell people apart.
 */
export class GatheringsService {
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  private find(id: string) {
    const gathering = this.store.get<Gathering>("gathering", id);
    if (!gathering) throw new AppError("NOT_FOUND", 404);
    return gathering;
  }
  private answers(id: string) {
    return this.store
      .all<GatheringRsvp>("gathering-rsvp")
      .filter((r) => r.gatheringId === id)
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  private inviteOf(g: Gathering): GatheringInvite {
    const { ownerId, ...rest } = g;
    const host = this.store.get<User>("user", ownerId);
    return { ...rest, hostName: host?.name ?? "" };
  }
  create(actor: Actor, input: unknown): GatheringInvite {
    const ownerId = this.social.actor(actor);
    const parsed = gatheringInputSchema.parse(input);
    const owned = this.store.all<Gathering>("gathering").filter((g) => g.ownerId === ownerId);
    if (owned.length >= maxPerHost) throw new AppError("TOO_MANY_GATHERINGS", 429);
    const gathering: Gathering = {
      ...parsed,
      id: randomUUID(),
      ownerId,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("gathering", gathering.id, gathering));
    return this.inviteOf(gathering);
  }
  /** The invite as anyone with the link sees it, signed in or not. */
  invite(id: string): GatheringInvite {
    return this.inviteOf(this.find(id));
  }
  /** The gatherings you host and the ones you answered while signed in, soonest date first. */
  mine(actor: Actor): GatheringSummary[] {
    const me = this.social.actor(actor);
    const answered = new Set(
      this.store
        .all<GatheringRsvp>("gathering-rsvp")
        .filter((r) => r.userId === me)
        .map((r) => r.gatheringId),
    );
    return this.store
      .all<Gathering>("gathering")
      .filter((g) => g.ownerId === me || answered.has(g.id))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => ({
        id: g.id,
        kind: g.kind,
        title: g.title,
        date: g.date,
        place: g.place,
        host: g.ownerId === me,
      }));
  }
  /** Every answer, for the host only. */
  guests(actor: Actor, id: string): GatheringGuestList {
    const me = this.social.actor(actor);
    const gathering = this.find(id);
    if (gathering.ownerId !== me) throw new AppError("NOT_HOST", 403);
    const rsvps = this.answers(id).map((r) => ({
      name: r.name,
      phoneEnd: r.phoneEnd,
      attending: r.attending,
      guests: r.attending ? r.guests : 0,
      message: r.message,
      at: r.at,
      member: !!r.userId,
    }));
    return {
      invite: this.inviteOf(gathering),
      totals: {
        attending: rsvps.filter((r) => r.attending).length,
        declined: rsvps.filter((r) => !r.attending).length,
        guests: rsvps.reduce((sum, r) => sum + r.guests, 0),
      },
      rsvps,
    };
  }
  /**
   * A guest's answer. The same number answering again replaces its earlier answer, so a family
   * can change its mind. `actor` is the guest (empty) or a signed-in person, whose account is
   * then linked to the answer so the gathering shows up in their list.
   */
  respond(actor: Actor, id: string, input: unknown) {
    const gathering = this.find(id);
    const parsed = rsvpInputSchema.parse(input);
    const digits = normalizePhone(parsed.phone);
    const userId = actor.userId === GUEST ? undefined : this.social.actor(actor);
    const phoneKey = createHash("sha256").update(`${gathering.id}:${digits}`).digest("hex");
    const key = `${gathering.id}:${phoneKey}`;
    this.store.transaction(() => {
      const current = this.store.get<GatheringRsvp>("gathering-rsvp", key);
      if (!current && this.answers(gathering.id).length >= maxAnswers)
        throw new AppError("GATHERING_FULL", 409);
      const linked = userId ?? current?.userId;
      const next: GatheringRsvp = {
        gatheringId: gathering.id,
        phoneKey,
        phoneEnd: digits.slice(-3),
        name: parsed.name,
        attending: parsed.attending,
        guests: parsed.guests,
        message: parsed.message,
        at: this.now().toISOString(),
        ...(linked ? { userId: linked } : {}),
      };
      this.store.put("gathering-rsvp", key, next);
    });
    return { name: parsed.name, attending: parsed.attending, guests: parsed.guests };
  }
  /** The host removes the gathering and every answer with it. */
  remove(actor: Actor, id: string) {
    const me = this.social.actor(actor);
    const gathering = this.find(id);
    if (gathering.ownerId !== me) throw new AppError("NOT_HOST", 403);
    this.store.transaction(() => this.drop(id));
    return { ok: true };
  }
  private drop(id: string) {
    for (const key of this.store.ids("gathering-rsvp"))
      if (key.startsWith(`${id}:`)) this.store.remove("gathering-rsvp", key);
    this.store.remove("gathering", id);
  }
  /**
   * Called inside the account-deletion transaction: their gatherings go; answers they gave stay
   * with the host, unlinked from the account.
   */
  erase(userId: string) {
    for (const g of this.store.all<Gathering>("gathering"))
      if (g.ownerId === userId) this.drop(g.id);
    for (const key of this.store.ids("gathering-rsvp")) {
      const r = this.store.get<GatheringRsvp>("gathering-rsvp", key);
      if (r?.userId === userId) {
        const { userId: _gone, ...rest } = r;
        this.store.put("gathering-rsvp", key, rest);
      }
    }
  }
}
