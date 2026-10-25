import { createHash, randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import {
  gatheringInputSchema,
  gatheringMessageInputSchema,
  gatheringModeInputSchema,
  rsvpInputSchema,
  smallGroupInputSchema,
  type GatheringGuestList,
  type GatheringInput,
  type GatheringInvite,
  type GatheringMessageView,
  type GatheringMode,
  type GatheringPerson,
  type GatheringSpace,
  type GatheringSummary,
} from "../../contracts/src/gatherings.js";
import type { Actor } from "./index.js";
import { AppError, GUEST } from "./social.js";
import type { SocialService } from "./social.js";

export interface Gathering extends GatheringInput {
  id: string;
  ownerId: string;
  createdAt: string;
  /** Absent on gatherings made before ADR 0037; they read as `announce`. */
  mode?: GatheringMode;
  /** Members the host named as photographers (ADR 0038). */
  photographers?: string[];
}
interface GatheringMember {
  gatheringId: string;
  userId: string;
  at: string;
}
interface SmallGroup {
  id: string;
  gatheringId: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: string;
}
interface GatheringMessage {
  id: string;
  gatheringId: string;
  /** Absent for the main chat. */
  group?: string;
  from: string;
  text: string;
  at: string;
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
const maxGroups = 200;
/** The most recent messages a chat answers; older ones stay stored for the memory later. */
const shownMessages = 200;

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
  /** Installed by the community layer: whether `viewerId` may see `userId` (blocks, suspensions). */
  peopleFilter: (viewerId: string, userId: string) => boolean = () => true;
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  /** Run inside the transaction that removes a gathering, so the day's records go with it. */
  readonly onDrop: ((gatheringId: string) => void)[] = [];
  find(id: string) {
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
    const { ownerId: _owner, mode: _mode, photographers: _photographers, ...rest } = g;
    const host = this.store.get<User>("user", g.ownerId);
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
  /** The gatherings you host, answered while signed in, or joined; soonest date first. */
  mine(actor: Actor): GatheringSummary[] {
    const me = this.social.actor(actor);
    const answered = new Set([
      ...this.store
        .all<GatheringRsvp>("gathering-rsvp")
        .filter((r) => r.userId === me)
        .map((r) => r.gatheringId),
      ...this.store
        .all<GatheringMember>("gathering-member")
        .filter((m) => m.userId === me)
        .map((m) => m.gatheringId),
    ]);
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
        arrived: this.arrived(gathering).length,
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
      if (userId) this.addMember(gathering, userId);
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
    for (const hook of this.onDrop) hook(id);
    for (const kind of ["gathering-rsvp", "gathering-member"])
      for (const key of this.store.ids(kind))
        if (key.startsWith(`${id}:`)) this.store.remove(kind, key);
    for (const g of this.store.all<SmallGroup>("gathering-group"))
      if (g.gatheringId === id) this.store.remove("gathering-group", g.id);
    for (const m of this.store.all<GatheringMessage>("gathering-message"))
      if (m.gatheringId === id) this.store.remove("gathering-message", m.id);
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
    for (const key of this.store.ids("gathering-member"))
      if (key.endsWith(`:${userId}`)) this.store.remove("gathering-member", key);
    for (const m of this.store.all<GatheringMessage>("gathering-message"))
      if (m.from === userId) this.store.remove("gathering-message", m.id);
    for (const g of this.store.all<SmallGroup>("gathering-group")) {
      if (!g.members.includes(userId)) continue;
      const members = g.members.filter((m) => m !== userId);
      if (!members.length) this.store.remove("gathering-group", g.id);
      else this.store.put("gathering-group", g.id, { ...g, members });
    }
  }

  // The moment group (ADR 0037) -----------------------------------------------------------
  // These are shared with the day itself (gathering-day.ts).
  addMember(gathering: Gathering, userId: string) {
    if (userId === gathering.ownerId) return;
    const key = `${gathering.id}:${userId}`;
    if (!this.store.get("gathering-member", key))
      this.store.put("gathering-member", key, {
        gatheringId: gathering.id,
        userId,
        at: this.now().toISOString(),
      } satisfies GatheringMember);
  }
  isMember(gathering: Gathering, userId: string) {
    return (
      gathering.ownerId === userId ||
      !!this.store.get("gathering-member", `${gathering.id}:${userId}`)
    );
  }
  /**
   * The gathering for one of its members. Anyone else, signed in or not, gets the same
   * `NOT_FOUND` as for a gathering that does not exist: the invite is public, the group is not.
   */
  memberOf(actor: Actor, id: string) {
    const me = this.social.actor(actor);
    const gathering = this.store.get<Gathering>("gathering", id);
    if (!gathering || !this.isMember(gathering, me)) throw new AppError("NOT_FOUND", 404);
    return { me, gathering };
  }
  memberIds(gathering: Gathering) {
    return [
      gathering.ownerId,
      ...this.store
        .all<GatheringMember>("gathering-member")
        .filter((m) => m.gatheringId === gathering.id)
        .map((m) => m.userId),
    ];
  }
  person(userId: string): GatheringPerson | undefined {
    const u = this.store.get<User>("user", userId);
    if (!u) return undefined;
    const { id, name, handle, initials, color, avatarAssetId } = u;
    return { id, name, handle, initials, color, ...(avatarAssetId ? { avatarAssetId } : {}) };
  }
  groupFor(gathering: Gathering, me: string, groupId: string) {
    const group = this.store.get<SmallGroup>("gathering-group", groupId);
    // A small group is hidden from the rest of the moment, the host included.
    if (!group || group.gatheringId !== gathering.id || !group.members.includes(me))
      throw new AppError("NOT_FOUND", 404);
    return group;
  }
  space(actor: Actor, id: string): GatheringSpace {
    const { me, gathering } = this.memberOf(actor, id);
    const members = this.memberIds(gathering)
      .filter((userId) => this.peopleFilter(me, userId))
      .map((userId) => this.person(userId))
      .filter((p): p is GatheringPerson => !!p);
    const groups = this.store
      .all<SmallGroup>("gathering-group")
      .filter((g) => g.gatheringId === id && g.members.includes(me))
      .map((g) => ({ id: g.id, name: g.name, memberIds: g.members }));
    return {
      invite: this.inviteOf(gathering),
      me,
      role: gathering.ownerId === me ? "host" : "member",
      mode: gathering.mode ?? "announce",
      members,
      groups,
      arrived: this.arrived(gathering).filter((userId) => this.peopleFilter(me, userId)),
    };
  }
  /** Who came in through the door QR, in the order they arrived. */
  arrived(gathering: Gathering) {
    return this.store
      .all<{ gatheringId: string; userId: string; at: string }>("gathering-checkin")
      .filter((c) => c.gatheringId === gathering.id)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((c) => c.userId);
  }
  /** Signed in and holding the link: join the group without answering the RSVP again. */
  join(actor: Actor, id: string) {
    const me = this.social.actor(actor);
    const gathering = this.find(id);
    this.store.transaction(() => this.addMember(gathering, me));
    return this.space(actor, id);
  }
  setMode(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.memberOf(actor, id);
    if (gathering.ownerId !== me) throw new AppError("NOT_HOST", 403);
    const { mode } = gatheringModeInputSchema.parse(input);
    this.store.transaction(() => this.store.put("gathering", id, { ...gathering, mode }));
    return this.space(actor, id);
  }
  messages(actor: Actor, id: string, groupId?: string): GatheringMessageView[] {
    const { me, gathering } = this.memberOf(actor, id);
    if (groupId) this.groupFor(gathering, me, groupId);
    return this.store
      .all<GatheringMessage>("gathering-message")
      .filter((m) => m.gatheringId === id && (m.group ?? "") === (groupId ?? ""))
      .filter((m) => this.peopleFilter(me, m.from))
      .slice(-shownMessages)
      .map((m) => ({ m, from: this.person(m.from) }))
      .filter((x): x is { m: GatheringMessage; from: GatheringPerson } => !!x.from)
      .map(({ m, from }) => ({ id: m.id, from, text: m.text, at: m.at }));
  }
  send(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.memberOf(actor, id);
    const { text, group } = gatheringMessageInputSchema.parse(input);
    if (group) this.groupFor(gathering, me, group);
    else if ((gathering.mode ?? "announce") === "announce" && gathering.ownerId !== me)
      throw new AppError("ANNOUNCEMENTS_ONLY", 403);
    const message: GatheringMessage = {
      id: randomUUID(),
      gatheringId: id,
      ...(group ? { group } : {}),
      from: me,
      text,
      at: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("gathering-message", message.id, message));
    return this.messages(actor, id, group);
  }
  /**
   * A small group inside the moment: any member makes one with other members of the same
   * moment. It shares the moment's date and place, is hidden from everyone outside it, and goes
   * when the moment goes.
   */
  createGroup(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.memberOf(actor, id);
    const { name, members } = smallGroupInputSchema.parse(input);
    const inMoment = new Set(this.memberIds(gathering));
    const chosen = [...new Set([me, ...members])];
    if (chosen.some((userId) => !inMoment.has(userId) || !this.peopleFilter(me, userId)))
      throw new AppError("NOT_A_MEMBER", 400);
    const existing = this.store
      .all<SmallGroup>("gathering-group")
      .filter((g) => g.gatheringId === id);
    if (existing.length >= maxGroups) throw new AppError("TOO_MANY_GROUPS", 429);
    const group: SmallGroup = {
      id: randomUUID(),
      gatheringId: id,
      name,
      ownerId: me,
      members: chosen,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("gathering-group", group.id, group));
    return this.space(actor, id);
  }
  leaveGroup(actor: Actor, id: string, groupId: string) {
    const { me, gathering } = this.memberOf(actor, id);
    const group = this.groupFor(gathering, me, groupId);
    const members = group.members.filter((m) => m !== me);
    this.store.transaction(() => {
      if (!members.length) {
        this.store.remove("gathering-group", group.id);
        for (const m of this.store.all<GatheringMessage>("gathering-message"))
          if (m.group === group.id) this.store.remove("gathering-message", m.id);
      } else this.store.put("gathering-group", group.id, { ...group, members });
    });
    return this.space(actor, id);
  }
}
