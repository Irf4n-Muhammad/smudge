import { randomBytes, randomUUID } from "node:crypto";
import {
  dropSchema,
  fanNoteSchema,
  fanRoomSchema,
  type DropView,
  type FanNote,
  type FanPerson,
  type FanRoomView,
} from "../../contracts/src/fans.js";
import type { User } from "../../contracts/src/experience.js";
import { orgById, type Chapter } from "../../contracts/src/identity.js";
import type { Actor } from "./index.js";
import type { Payments } from "./org-events.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface Room {
  ownerId: string;
  title: string;
  perks: string;
  price: number;
  stampOrgId: string | null;
  createdAt: string;
}
interface Fan {
  ownerId: string;
  userId: string;
  since: string;
  until: string;
  ref?: string;
}
interface Note {
  id: string;
  ownerId: string;
  authorId: string;
  text: string;
  createdAt: string;
}
interface Drop {
  id: string;
  ownerId: string;
  title: string;
  note: string;
  price: number;
  quantity: number;
  opens: string;
  everyone?: string;
  color: string;
  image?: string;
  createdAt: string;
}
interface Claim {
  dropId: string;
  userId: string;
  code: string;
  ref?: string;
  at: string;
}

/** A membership runs a month and is paid again to stay. */
const MONTH = 30 * 86_400_000;
const NOTES = 50;

/**
 * Fans: a creator opens a room people join (paid monthly, or free), with notes only fans read,
 * and drops (merch, early releases) that open first for fans and for people holding the
 * creator's chosen stamps, the proven fans, then for everyone. Money goes through the server's
 * payment partner; with none, paid rooms and drops are off rather than free.
 */
export class FansService {
  payments: Payments | undefined;
  /** Whether the viewer may see a person; the server installs the privacy rules. */
  peopleFilter: (viewerId: string, userId: string) => boolean = () => true;
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  private person(id: string): FanPerson | null {
    const u = this.store.get<User>("user", id);
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      handle: u.handle,
      initials: u.initials,
      color: u.color,
      ...(u.avatarAssetId ? { avatarAssetId: u.avatarAssetId } : {}),
    };
  }
  private sees(viewerId: string, id: string) {
    return id === viewerId || this.peopleFilter(viewerId, id);
  }
  private charge(userId: string, amount: number, description: string) {
    if (!amount) return undefined;
    if (!this.payments) throw new AppError("PAYMENTS_OFF", 503);
    return this.payments.charge({ userId, amount, currency: "USD", description }).ref;
  }

  private room(ownerId: string) {
    return this.store.get<Room>("fan-room", ownerId);
  }
  /** An active member: joined and paid up for this month. */
  isFan(userId: string, ownerId: string) {
    const fan = this.store.get<Fan>("fan", `${ownerId}:${userId}`);
    return !!fan && Date.parse(fan.until) > this.now().getTime();
  }
  /** Holds at least one stamp of the organisation the creator chose. */
  proven(userId: string, ownerId: string) {
    const orgId = this.room(ownerId)?.stampOrgId;
    if (!orgId) return false;
    return this.store
      .all<Chapter>("chapter")
      .some((c) => c.ownerId === userId && c.orgId === orgId && c.kind === "stamp");
  }

  setRoom(actor: Actor, input: unknown) {
    const me = this.social.actor(actor);
    const value = fanRoomSchema.parse(input);
    if (value.stampOrgId && !orgById(value.stampOrgId)) throw new AppError("UNKNOWN_ORG");
    if (value.price && !this.payments) throw new AppError("PAYMENTS_OFF", 503);
    const old = this.room(me);
    this.store.transaction(() =>
      this.store.put("fan-room", me, {
        ownerId: me,
        ...value,
        createdAt: old?.createdAt ?? this.now().toISOString(),
      } satisfies Room),
    );
    return this.view(actor, me);
  }

  join(actor: Actor, ownerId: string) {
    const me = this.social.actor(actor);
    const room = this.room(ownerId);
    if (!room || !this.sees(me, ownerId)) throw new AppError("NOT_FOUND", 404);
    if (ownerId === me) throw new AppError("OWN_ROOM");
    this.social.relationGuard(me, ownerId);
    const key = `${ownerId}:${me}`;
    const old = this.store.get<Fan>("fan", key);
    const now = this.now().getTime();
    const ref = this.charge(me, room.price, `${room.title}, one month`);
    // Paying again early adds a month to what is left.
    const from = old && Date.parse(old.until) > now ? Date.parse(old.until) : now;
    this.store.transaction(() =>
      this.store.put("fan", key, {
        ownerId,
        userId: me,
        since: old?.since ?? new Date(now).toISOString(),
        until: new Date(from + MONTH).toISOString(),
        ...(ref ? { ref } : {}),
      } satisfies Fan),
    );
    return this.view(actor, ownerId);
  }

  leave(actor: Actor, ownerId: string) {
    const me = this.social.actor(actor);
    this.store.transaction(() => this.store.remove("fan", `${ownerId}:${me}`));
    return this.view(actor, ownerId);
  }

  post(actor: Actor, ownerId: string, input: unknown) {
    const me = this.social.actor(actor);
    if (!this.room(ownerId)) throw new AppError("NOT_FOUND", 404);
    if (me !== ownerId && !this.isFan(me, ownerId)) throw new AppError("FANS_ONLY", 403);
    const { text } = fanNoteSchema.parse(input);
    const note: Note = {
      id: randomUUID(),
      ownerId,
      authorId: me,
      text,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("fan-note", note.id, note));
    return this.view(actor, ownerId);
  }

  view(actor: Actor, ownerId: string): FanRoomView {
    const me = this.social.actor(actor);
    const room = this.room(ownerId);
    const owner = this.person(ownerId);
    if (!room || !owner || !this.sees(me, ownerId)) throw new AppError("NOT_FOUND", 404);
    const now = this.now().getTime();
    const fans = this.store
      .all<Fan>("fan")
      .filter((f) => f.ownerId === ownerId && Date.parse(f.until) > now);
    const following = new Set(this.social.following(actor));
    const mine = me === ownerId;
    const member = this.isFan(me, ownerId);
    const notes: FanNote[] =
      mine || member
        ? this.store
            .all<Note>("fan-note")
            .filter((n) => n.ownerId === ownerId && this.sees(me, n.authorId))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, NOTES)
            .flatMap((n) => {
              const author = this.person(n.authorId);
              if (!author) return [];
              return [
                {
                  id: n.id,
                  author,
                  byOwner: n.authorId === ownerId,
                  proven: this.proven(n.authorId, ownerId),
                  text: n.text,
                  createdAt: n.createdAt,
                },
              ];
            })
        : [];
    const org = room.stampOrgId ? orgById(room.stampOrgId) : undefined;
    const until = fans.find((f) => f.userId === me)?.until;
    return {
      owner,
      title: room.title,
      perks: room.perks,
      price: room.price,
      stampOrg: org ? { id: org.id, name: org.name } : null,
      fans: fans.length,
      friends: fans
        .filter((f) => following.has(f.userId) && this.sees(me, f.userId))
        .flatMap((f) => {
          const p = this.person(f.userId);
          return p ? [p] : [];
        })
        .slice(0, 3),
      member,
      proven: this.proven(me, ownerId),
      ...(until ? { until } : {}),
      mine,
      notes,
      drops: this.dropViews(
        me,
        this.store.all<Drop>("drop").filter((d) => d.ownerId === ownerId),
      ),
    };
  }

  createDrop(actor: Actor, input: unknown): DropView {
    const me = this.social.actor(actor);
    if (!this.room(me)) throw new AppError("NEEDS_FAN_ROOM");
    const value = dropSchema.parse(input);
    if (value.price && !this.payments) throw new AppError("PAYMENTS_OFF", 503);
    const { everyone, image, ...rest } = value;
    const drop: Drop = {
      id: randomUUID(),
      ownerId: me,
      ...rest,
      ...(everyone ? { everyone } : {}),
      ...(image ? { image } : {}),
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("drop", drop.id, drop));
    return this.dropViews(me, [drop])[0]!;
  }

  /** When a person may claim a drop: the presale for fans and stamp holders, else everyone. */
  private waveOf(userId: string, drop: Drop): { at: string | null; wave: DropView["wave"] } {
    if (
      userId === drop.ownerId ||
      this.isFan(userId, drop.ownerId) ||
      this.proven(userId, drop.ownerId)
    )
      return { at: drop.opens, wave: "fans" };
    return drop.everyone ? { at: drop.everyone, wave: "everyone" } : { at: null, wave: null };
  }

  private dropViews(viewerId: string, drops: Drop[]): DropView[] {
    const claims = this.store.all<Claim>("drop-claim");
    return drops
      .sort((a, b) => b.opens.localeCompare(a.opens))
      .flatMap((d) => {
        const owner = this.person(d.ownerId);
        if (!owner || !this.sees(viewerId, d.ownerId)) return [];
        const taken = claims.filter((c) => c.dropId === d.id);
        const mine = taken.find((c) => c.userId === viewerId);
        const { at, wave } = this.waveOf(viewerId, d);
        return [
          {
            id: d.id,
            owner,
            title: d.title,
            note: d.note,
            price: d.price,
            quantity: d.quantity,
            left: Math.max(0, d.quantity - taken.length),
            color: d.color,
            ...(d.image ? { image: d.image } : {}),
            opens: d.opens,
            ...(d.everyone ? { everyone: d.everyone } : {}),
            opensForYou: at,
            wave,
            ...(mine ? { code: mine.code } : {}),
            claimed: taken.length,
          },
        ];
      });
  }

  /** Drops from people you follow or whose room you are in, newest opening first. */
  drops(actor: Actor): DropView[] {
    const me = this.social.actor(actor);
    const following = new Set(this.social.following(actor));
    return this.dropViews(
      me,
      this.store
        .all<Drop>("drop")
        .filter((d) => d.ownerId === me || following.has(d.ownerId) || this.isFan(me, d.ownerId)),
    );
  }

  claim(actor: Actor, dropId: string): DropView {
    const me = this.social.actor(actor);
    const drop = this.store.get<Drop>("drop", dropId);
    if (!drop || !this.sees(me, drop.ownerId)) throw new AppError("NOT_FOUND", 404);
    const key = `${dropId}:${me}`;
    if (this.store.get("drop-claim", key)) throw new AppError("ALREADY_CLAIMED", 409);
    const { at } = this.waveOf(me, drop);
    if (!at || Date.parse(at) > this.now().getTime()) throw new AppError("NOT_OPEN_YET", 403);
    const taken = this.store.all<Claim>("drop-claim").filter((c) => c.dropId === dropId).length;
    if (taken >= drop.quantity) throw new AppError("SOLD_OUT", 409);
    const ref = this.charge(me, drop.price, drop.title);
    this.store.transaction(() =>
      this.store.put("drop-claim", key, {
        dropId,
        userId: me,
        code: `DROP-${randomBytes(4).toString("hex").toUpperCase()}`,
        ...(ref ? { ref } : {}),
        at: this.now().toISOString(),
      } satisfies Claim),
    );
    return this.dropViews(me, [drop])[0]!;
  }

  /** Runs inside the account-deletion transaction. */
  erase(userId: string) {
    const s = this.store;
    s.remove("fan-room", userId);
    for (const f of s.all<Fan>("fan"))
      if (f.userId === userId || f.ownerId === userId) s.remove("fan", `${f.ownerId}:${f.userId}`);
    for (const n of s.all<Note>("fan-note"))
      if (n.authorId === userId || n.ownerId === userId) s.remove("fan-note", n.id);
    const gone = new Set<string>();
    for (const d of s.all<Drop>("drop"))
      if (d.ownerId === userId) {
        s.remove("drop", d.id);
        gone.add(d.id);
      }
    for (const c of s.all<Claim>("drop-claim"))
      if (c.userId === userId || gone.has(c.dropId))
        s.remove("drop-claim", `${c.dropId}:${c.userId}`);
  }
}
