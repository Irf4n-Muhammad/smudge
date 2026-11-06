import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import {
  collectionById,
  collections,
  crewAwardSchema,
  crewEventSchema,
  handoverSchema,
  orgById,
  orgCreateSchema,
  circleStartSchema,
  orgLookSchema,
  orgPostReviewSchema,
  orgPostSchema,
  orgVisibilitySchema,
  orgs,
  registerCollection,
  registerOrg,
  roomPostSchema,
  roomStateSchema,
  termStartSchema,
} from "../../contracts/src/identity.js";
import type {
  Chapter,
  Collection,
  Org,
  OrgLook,
  OrgPost,
  OrgVisibility,
  RoomPost,
  RoomStateItem,
  Term,
} from "../../contracts/src/identity.js";
import {
  roomMuteSchema,
  roomReportSchema,
  roomSlowSchema,
  type RoomReport,
  type RoomSettings,
  type Yearbook,
} from "../../contracts/src/org-rooms.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";
import type { IdentityService } from "./identity.js";

/** The group chats a finished term can turn into. Wired by the server. */
export interface Circles {
  openCircle(ownerId: string, name: string): string;
  joinCircle(groupId: string, userId: string): void;
  circleMembers(groupId: string): string[] | null;
}
interface TermCircle {
  groupId: string;
  name: string;
  startedBy: string;
  at: string;
}

/**
 * Organisations as a place of their own: a public face anyone can open, terms (kepengurusan)
 * where the past ones are locked but stay on their people's pages, and a handover that moves
 * the admin role without passing a password around. Posts read the viewer's own memberships
 * through `org.read`; nobody else's.
 */
export class OrgService {
  circles: Circles | undefined;
  /** Installed by the server: whether two people blocked each other, either way. */
  blockedEither: (a: string, b: string) => boolean = () => false;
  constructor(
    private readonly social: SocialService,
    private readonly identity: IdentityService,
    private readonly now: () => Date = () => new Date(),
  ) {
    social.capabilityHandlers["org.read"] = (actor, _postId, payload, preview) =>
      preview ? { memberships: [] } : this.memberships(actor, payload);
    for (const org of this.store.all<Org>("org")) registerOrg(org);
    for (const collection of this.store.all<Collection>("collection"))
      registerCollection(collection);
    // A private organisation's chapters stay with its own people.
    identity.chapterGates.push(
      (viewerId, c) =>
        !c.orgId || this.visibility(c.orgId) !== "private" || this.isOwn(viewerId, c.orgId),
    );
    identity.chapterLine = (c) => this.lineOf(c);
  }
  private get store() {
    return this.social.store;
  }
  org(id: string) {
    const org = orgById(id);
    if (!org) throw new AppError("NOT_FOUND", 404);
    return org;
  }
  requireAdmin(actor: Actor, orgId: string) {
    const userId = this.social.actor(actor);
    this.org(orgId);
    if (!this.identity.orgAdmins(orgId).includes(userId))
      throw new AppError("ORG_ADMIN_REQUIRED", 403);
    return userId;
  }
  terms(orgId: string) {
    this.org(orgId);
    return this.store
      .all<Term>("term")
      .filter((t) => t.orgId === orgId)
      .sort((a, b) => b.from - a.from || b.createdAt.localeCompare(a.createdAt));
  }
  private members(orgId: string) {
    return this.store
      .all<Chapter>("chapter")
      .filter((c) => c.orgId === orgId && (c.kind === "member" || c.kind === "title"));
  }
  /**
   * Who the organisation placed in a term, by the chapters that cover it, with the role their
   * chapter names ("Director, Teater Senja 2025/26" is a director). Titles come before members.
   */
  private placed(term: Term, only?: (c: Chapter) => boolean) {
    const byPerson = new Map<string, Chapter>();
    for (const c of this.members(term.orgId))
      if (covers(c, term) && (!only || only(c))) {
        const held = byPerson.get(c.ownerId);
        if (!held || (held.kind === "member" && c.kind === "title")) byPerson.set(c.ownerId, c);
      }
    return [...byPerson.values()].sort(
      (a, b) =>
        Number(b.kind === "title") - Number(a.kind === "title") ||
        a.createdAt.localeCompare(b.createdAt),
    );
  }
  /**
   * What anyone may see: the organisation, its terms, how many people it has held, and each
   * term's company as far as those people made their chapter public.
   */
  publicPage(orgId: string, viewerId?: string, joinCode?: string) {
    const org = this.org(orgId);
    if (!this.canSee(orgId, viewerId)) {
      // Someone holding a join link may see enough of a private organisation to join it.
      if (joinCode && this.validJoin(orgId, joinCode))
        return {
          id: org.id,
          name: org.name,
          kind: org.kind,
          visibility: this.visibility(orgId),
          members: 0,
          since: null,
          company: [],
          terms: [],
          current: null,
          collections: [],
          posts: [],
          lines: [],
          look: this.look(orgId),
        };
      throw new AppError("NOT_FOUND", 404);
    }
    const people = new Set(this.members(orgId).map((c) => c.ownerId));
    const terms = this.terms(orgId);
    const users = new Map(this.store.all<User>("user").map((u) => [u.id, u]));
    const since = Math.min(
      ...terms.map((t) => t.from),
      ...this.members(orgId).flatMap((c) => (c.from === undefined ? [] : [c.from])),
    );
    return {
      id: org.id,
      name: org.name,
      kind: org.kind,
      members: people.size,
      since: Number.isFinite(since) ? since : null,
      company: terms.slice(0, 12).map((t) => ({
        termId: t.id,
        people: this.placed(t, (c) => c.audience === "public")
          .slice(0, 60)
          .flatMap((c) => {
            const u = users.get(c.ownerId);
            return u ? [{ ...personOf(u), role: roleOf(c.label) }] : [];
          }),
      })),
      terms: terms.map(({ id, label, from, to, locked }) => ({ id, label, from, to, locked })),
      current: terms.find((t) => !t.locked)?.label ?? null,
      collections: collections
        .filter((c) => c.orgId === orgId)
        .map((c) => ({ id: c.id, name: c.name, stamps: c.stamps.length })),
      visibility: this.visibility(orgId),
      // What the organisation published, as itself. Who drafted it stays inside.
      posts: this.orgPosts(orgId)
        .filter((p) => p.status === "published")
        .slice(0, 10)
        .map((p) => ({ id: p.id, text: p.text, at: p.reviewedAt ?? p.createdAt })),
      lines: this.publicLines(orgId, users),
      look: this.look(orgId),
    };
  }

  // Who finds it ----------------------------------------------------------------------------
  visibility(orgId: string): OrgVisibility {
    return (
      this.store.get<{ visibility: OrgVisibility }>("org-visibility", orgId)?.visibility ?? "public"
    );
  }
  setVisibility(actor: Actor, orgId: string, input: unknown) {
    this.requireAdmin(actor, orgId);
    const { visibility } = orgVisibilitySchema.parse(input);
    this.store.transaction(() => this.store.put("org-visibility", orgId, { visibility }));
    return { visibility };
  }
  /** One of the organisation's own: an admin, or someone it placed by a chapter, past or present. */
  isOwn(userId: string, orgId: string) {
    return (
      this.identity.orgAdmins(orgId).includes(userId) ||
      this.members(orgId).some((c) => c.ownerId === userId)
    );
  }
  /** A private organisation is there only for its own people; to anyone else it doesn't exist. */
  canSee(orgId: string, viewerId?: string) {
    return this.visibility(orgId) !== "private" || (!!viewerId && this.isOwn(viewerId, orgId));
  }
  private validJoin(orgId: string, code: string) {
    const invite = this.store.get<{ orgId: string; used: number; uses: number }>(
      "invite",
      code.toUpperCase(),
    );
    return !!invite && invite.orgId === orgId && invite.used < invite.uses;
  }

  // The line of each title ------------------------------------------------------------------
  /**
   * Every title the organisation gave, by role, in the order people first held it: the line a
   * new Head of Comms joins as its seventh.
   */
  private lines(orgId: string) {
    const byRole = new Map<string, { role: string; chapters: Chapter[] }>();
    for (const c of this.members(orgId)) {
      if (c.kind !== "title") continue;
      const role = roleOf(c.label);
      const line = byRole.get(role.toLowerCase()) ?? { role, chapters: [] };
      line.chapters.push(c);
      byRole.set(role.toLowerCase(), line);
    }
    const year = (c: Chapter) => c.from ?? Number(c.createdAt.slice(0, 4));
    for (const line of byRole.values()) {
      const seen = new Set<string>();
      line.chapters = line.chapters
        .sort((a, b) => year(a) - year(b) || a.createdAt.localeCompare(b.createdAt))
        .filter((c) => !seen.has(c.ownerId) && seen.add(c.ownerId));
    }
    return byRole;
  }
  lineOf(chapter: Chapter) {
    if (chapter.kind !== "title" || !chapter.orgId || !orgById(chapter.orgId)) return undefined;
    const line = this.lines(chapter.orgId).get(roleOf(chapter.label).toLowerCase());
    const n = line ? line.chapters.findIndex((c) => c.ownerId === chapter.ownerId) + 1 : 0;
    return line && n > 0 ? { n, role: line.role } : undefined;
  }
  /** The lines as anyone may see them: only the people who made that title public, numbered. */
  private publicLines(orgId: string, users: Map<string, User>) {
    return [...this.lines(orgId).values()]
      .map((line) => ({
        role: line.role,
        holders: line.chapters
          .map((c, i) => ({ c, n: i + 1 }))
          .filter(({ c }) => c.audience === "public" && users.has(c.ownerId))
          .slice(-30)
          .map(({ c, n }) => ({
            ...personOf(users.get(c.ownerId)!),
            n,
            ...(c.from === undefined ? {} : { from: c.from }),
          })),
      }))
      .filter((line) => line.holders.length > 0)
      .slice(0, 12);
  }

  // Crew stamps -----------------------------------------------------------------------------
  private crewId(orgId: string) {
    return `crew-${orgId}`.slice(0, 40);
  }
  /** The organisation's own events, each a crew stamp, with how many people hold it. */
  events(orgId: string) {
    this.org(orgId);
    const collection = collectionById(this.crewId(orgId));
    if (!collection) return { collection: null, events: [] };
    const held = this.store
      .all<Chapter>("chapter")
      .filter((c) => c.kind === "stamp" && c.collection === collection.id);
    return {
      collection: collection.id,
      events: collection.stamps.map((st) => ({
        ...st,
        crew: held.filter((c) => c.stamp === st.id).length,
      })),
    };
  }
  /** The admin adds an event; its crew stamp goes to the people who ran it. */
  createEvent(actor: Actor, orgId: string, input: unknown) {
    this.requireAdmin(actor, orgId);
    const org = this.org(orgId);
    const { name } = crewEventSchema.parse(input);
    const id = this.crewId(orgId);
    const collection: Collection = collectionById(id) ?? {
      id,
      name: `${org.name} crew`,
      orgId,
      stamps: [],
    };
    if (collection.stamps.length >= 100) throw new AppError("CREW_FULL", 409);
    const base = slug(name, "event");
    let stampId = base;
    for (let n = 2; collection.stamps.some((st) => st.id === stampId); n++)
      stampId = `${base}-${n}`;
    const next = { ...collection, stamps: [...collection.stamps, { id: stampId, name }] };
    this.store.transaction(() => this.store.put("collection", id, next));
    registerCollection(next);
    return { collection: id, stamp: { id: stampId, name } };
  }
  /**
   * The admin gives an event's crew stamp to the people who ran it. Only the organisation's own
   * people can get one, and once each: a stamp comes from something done, never from a like.
   */
  awardCrew(actor: Actor, orgId: string, stampId: string, input: unknown) {
    this.requireAdmin(actor, orgId);
    const collection = collectionById(this.crewId(orgId));
    const stamp = collection?.stamps.find((st) => st.id === stampId);
    if (!collection || !stamp) throw new AppError("NOT_FOUND", 404);
    const { handles } = crewAwardSchema.parse(input);
    const users = this.store.all<User>("user");
    const term = this.terms(orgId).find((t) => !t.locked);
    const holds = new Set(
      this.store
        .all<Chapter>("chapter")
        .filter((c) => c.kind === "stamp" && c.collection === collection.id && c.stamp === stampId)
        .map((c) => c.ownerId),
    );
    const awarded: string[] = [];
    const skipped: { handle: string; why: "unknown" | "not-a-member" | "already" }[] = [];
    this.store.transaction(() => {
      for (const raw of new Set(handles.map((h) => h.replace(/^@/, "").toLowerCase()))) {
        const user = users.find((u) => u.handle.toLowerCase() === raw);
        if (!user) skipped.push({ handle: raw, why: "unknown" });
        else if (!this.isOwn(user.id, orgId)) skipped.push({ handle: raw, why: "not-a-member" });
        else if (holds.has(user.id)) skipped.push({ handle: raw, why: "already" });
        else {
          this.identity.grantChapter({
            ownerId: user.id,
            kind: "stamp",
            label: `Crew, ${stamp.name}`,
            orgId,
            collection: collection.id,
            stamp: stamp.id,
            ...(term ? { from: term.from } : {}),
            method: "invite",
            audience: this.visibility(orgId) === "private" ? "circle" : "public",
          });
          holds.add(user.id);
          awarded.push(user.handle);
        }
      }
    });
    return { awarded, skipped };
  }

  // Posts written together ------------------------------------------------------------------
  private orgPosts(orgId: string) {
    return this.store
      .all<OrgPost>("org-post")
      .filter((p) => p.orgId === orgId)
      .sort((a, b) => (b.reviewedAt ?? b.createdAt).localeCompare(a.reviewedAt ?? a.createdAt));
  }
  /** Who may write as the organisation: its admins and the people of its open term. */
  private writes(userId: string, orgId: string) {
    const term = this.terms(orgId).find((t) => !t.locked);
    return (
      this.identity.orgAdmins(orgId).includes(userId) || (!!term && this.wasThere(userId, term))
    );
  }
  /** The drafts waiting (all of them for admins, your own otherwise) and what went out. */
  posts(actor: Actor, orgId: string) {
    const userId = this.social.actor(actor);
    this.org(orgId);
    if (!this.writes(userId, orgId)) throw new AppError("NOT_A_MEMBER", 403);
    const admin = this.identity.orgAdmins(orgId).includes(userId);
    const users = new Map(this.store.all<User>("user").map((u) => [u.id, u]));
    const view = (p: OrgPost) => {
      const u = users.get(p.authorId);
      return {
        ...p,
        author: { id: p.authorId, name: u?.name ?? "Someone", handle: u?.handle ?? "" },
      };
    };
    const all = this.orgPosts(orgId);
    return {
      admin,
      pending: all
        .filter((p) => p.status === "pending" && (admin || p.authorId === userId))
        .map(view),
      published: all
        .filter((p) => p.status === "published")
        .slice(0, 20)
        .map(view),
    };
  }
  /**
   * A member drafts a post for the organisation; it waits for an admin. An admin's own post goes
   * out at once. Nobody needs the organisation's password.
   */
  submitPost(actor: Actor, orgId: string, input: unknown) {
    const userId = this.social.actor(actor);
    this.org(orgId);
    if (!this.writes(userId, orgId)) throw new AppError("NOT_A_MEMBER", 403);
    const { text } = orgPostSchema.parse(input);
    const admin = this.identity.orgAdmins(orgId).includes(userId);
    const waiting = this.orgPosts(orgId).filter(
      (p) => p.status === "pending" && p.authorId === userId,
    );
    if (!admin && waiting.length >= 5) throw new AppError("POSTS_WAITING", 429);
    const at = this.now().toISOString();
    const post: OrgPost = {
      id: randomUUID(),
      orgId,
      authorId: userId,
      text,
      status: admin ? "published" : "pending",
      createdAt: at,
      ...(admin ? { reviewedBy: userId, reviewedAt: at } : {}),
    };
    this.store.transaction(() => this.store.put("org-post", post.id, post));
    return post;
  }
  reviewPost(actor: Actor, orgId: string, postId: string, input: unknown) {
    const userId = this.requireAdmin(actor, orgId);
    const post = this.store.get<OrgPost>("org-post", postId);
    if (!post || post.orgId !== orgId) throw new AppError("NOT_FOUND", 404);
    if (post.status !== "pending") throw new AppError("POST_NOT_PENDING", 409);
    const { approve } = orgPostReviewSchema.parse(input);
    const next: OrgPost = {
      ...post,
      status: approve ? "published" : "declined",
      reviewedBy: userId,
      reviewedAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("org-post", post.id, next));
    return next;
  }
  /** The page's look. Until the admin picks one, every organisation starts as a playbill. */
  look(orgId: string): OrgLook {
    return this.store.get<OrgLook>("org-look", orgId) ?? { look: "playbill" };
  }
  /** The admin picks a look, a colour and the page's own words. Leaving a word out resets it. */
  setLook(actor: Actor, orgId: string, input: unknown) {
    this.requireAdmin(actor, orgId);
    const look = orgLookSchema.parse(input);
    this.store.transaction(() => this.store.put("org-look", orgId, look));
    return look;
  }
  /** The admin's side: the same page plus who runs it now. */
  manage(actor: Actor, orgId: string) {
    const userId = this.requireAdmin(actor, orgId);
    const users = this.store.all<User>("user");
    return {
      ...this.publicPage(orgId, userId),
      admins: this.identity.orgAdmins(orgId).map((id) => {
        const u = users.find((x) => x.id === id);
        return { id, name: u?.name ?? id, handle: u?.handle ?? "" };
      }),
    };
  }
  /**
   * Someone starts their own organisation (a student society, a fan club) and runs it. A few per
   * person, so names can't be squatted in bulk.
   */
  createOrg(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = orgCreateSchema.parse(input);
    const started = this.store.all<Org>("org").filter((o) => o.admins[0] === userId);
    if (started.length >= 3) throw new AppError("TOO_MANY_ORGS", 429);
    const base = slug(parsed.name, "org");
    let id = base;
    for (let n = 2; orgById(id) || id === "new"; n++) id = `${base}-${n}`;
    const org: Org = { id, name: parsed.name, kind: parsed.kind, domains: [], admins: [userId] };
    this.store.transaction(() => this.store.put("org", id, org));
    registerOrg(org);
    if (parsed.term) {
      const [from] = parsed.term.match(/\d{4}/) ?? [String(this.now().getFullYear())];
      this.startTerm(actor, id, { label: parsed.term, from: Number(from) });
    }
    return this.publicPage(id);
  }
  /**
   * One link the admin puts in an IG story or a group chat: whoever opens it and joins gets a
   * member chapter for the current term, issued by the organisation.
   */
  joinLink(actor: Actor, orgId: string) {
    const userId = this.requireAdmin(actor, orgId);
    const org = this.org(orgId);
    const term = this.terms(orgId).find((t) => !t.locked);
    const key = `${orgId}:${term?.id ?? "none"}`;
    const known = this.store.get<{ code: string }>("org-join", key);
    const open = known && this.store.get<{ used: number; uses: number }>("invite", known.code);
    if (known && open && open.used < open.uses) return { code: known.code };
    const invite = this.identity.createInvite(
      { userId },
      {
        orgId,
        kind: "member",
        label: `Member, ${org.name}${term ? ` ${term.label}` : ""}`,
        period: term ? { from: term.from, ...(term.to === undefined ? {} : { to: term.to }) } : {},
        uses: 500,
      },
    );
    this.store.transaction(() => this.store.put("org-join", key, { code: invite.code }));
    return { code: invite.code };
  }
  /** What a join link offers, shown before someone signs in. */
  joinPreview(orgId: string, code: string) {
    this.org(orgId);
    const invite = this.store.get<{ orgId: string; label: string; used: number; uses: number }>(
      "invite",
      code.toUpperCase(),
    );
    if (!invite || invite.orgId !== orgId || invite.used >= invite.uses)
      throw new AppError("INVITE_INVALID", 404);
    return { label: invite.label };
  }
  /** A new term begins; the one before it is locked, never deleted. */
  startTerm(actor: Actor, orgId: string, input: unknown) {
    const userId = this.requireAdmin(actor, orgId);
    const parsed = termStartSchema.parse(input);
    const terms = this.terms(orgId);
    if (terms.some((t) => t.label.toLowerCase() === parsed.label.toLowerCase()))
      throw new AppError("TERM_EXISTS", 409);
    const term: Term = {
      id: randomUUID(),
      orgId,
      label: parsed.label,
      from: parsed.from,
      ...(parsed.to === undefined ? {} : { to: parsed.to }),
      locked: false,
      createdBy: userId,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => {
      for (const t of terms)
        if (!t.locked) {
          this.store.put("term", t.id, { ...t, locked: true } satisfies Term);
          this.keepYearbook({ ...t, locked: true });
        }
      this.store.put("term", term.id, term);
    });
    return term;
  }
  lockTerm(actor: Actor, orgId: string, termId: string) {
    this.requireAdmin(actor, orgId);
    const term = this.store.get<Term>("term", termId);
    if (!term || term.orgId !== orgId) throw new AppError("NOT_FOUND", 404);
    const next = { ...term, locked: true };
    this.store.transaction(() => {
      this.store.put("term", term.id, next);
      if (!term.locked) this.keepYearbook(next);
    });
    return next;
  }
  /**
   * The admin role moves to the next person. The outgoing admin leaves with a chapter for the
   * term they ran, given by the organisation, so the work stays on their page.
   */
  handover(actor: Actor, orgId: string, input: unknown) {
    const userId = this.requireAdmin(actor, orgId);
    const parsed = handoverSchema.parse(input);
    const handle = parsed.handle.replace(/^@/, "").toLowerCase();
    const next = this.store.all<User>("user").find((u) => u.handle.toLowerCase() === handle);
    if (!next) throw new AppError("INVALID_USER", 404);
    if (next.id === userId) throw new AppError("HANDOVER_TO_SELF", 400);
    const admins = this.identity.orgAdmins(orgId).filter((id) => id !== userId);
    const term = this.terms(orgId).find((t) => !t.locked);
    const org = this.org(orgId);
    return this.store.transaction(() => {
      this.store.put("org-admins", orgId, { admins: [...new Set([...admins, next.id])] });
      const chapter = this.identity.grantChapter({
        ownerId: userId,
        kind: "title",
        label: `${parsed.role}, ${org.name}${term ? ` ${term.label}` : ""}`,
        orgId,
        ...(term ? { from: term.from, ...(term.to === undefined ? {} : { to: term.to }) } : {}),
        method: "invite",
        audience: "public",
      });
      return { admin: { id: next.id, name: next.name, handle: next.handle }, chapter };
    });
  }
  /**
   * For posts: the viewer's own memberships, titles and stamp counts. A post never sees anyone
   * else's, and decides nothing with them; the server does (a presale checks again on its side).
   */
  memberships(actor: Actor, payload: unknown) {
    const me = this.social.actor(actor);
    const only =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { orgId?: unknown }).orgId === "string"
        ? (payload as { orgId: string }).orgId
        : null;
    const mine = this.identity.chaptersFor(actor, me).filter((c) => c.orgId);
    const byOrg = new Map<string, Chapter[]>();
    for (const c of mine) byOrg.set(c.orgId!, [...(byOrg.get(c.orgId!) ?? []), c]);
    return {
      memberships: orgs
        .filter((o) => byOrg.has(o.id) && (!only || o.id === only))
        .map((o) => {
          const held = byOrg.get(o.id)!;
          const stamps: Record<string, number> = {};
          for (const c of held)
            if (c.kind === "stamp" && c.collection)
              stamps[c.collection] = (stamps[c.collection] ?? 0) + 1;
          return {
            orgId: o.id,
            name: o.name,
            kind: o.kind,
            admin: this.identity.orgAdmins(o.id).includes(me),
            roles: held
              .filter((c) => c.kind === "member" || c.kind === "title")
              .map((c) => ({
                kind: c.kind,
                label: c.label,
                ...(c.from === undefined ? {} : { from: c.from }),
                ...(c.to === undefined ? {} : { to: c.to }),
              })),
            stamps,
          };
        }),
    };
  }

  private term(orgId: string, termId: string) {
    const term = this.store.get<Term>("term", termId);
    if (!term || term.orgId !== orgId) throw new AppError("NOT_FOUND", 404);
    return term;
  }
  /**
   * Who may enter a term's room: today's admins, whoever ran it, and the people the organisation
   * placed in that term (a member or title chapter whose years cover it). A chapter with no
   * years counts for the current term only.
   */
  private inRoom(userId: string, term: Term) {
    return this.identity.orgAdmins(term.orgId).includes(userId) || this.wasThere(userId, term);
  }
  /** Who was part of a term: whoever ran it and the people placed in it. */
  private wasThere(userId: string, term: Term) {
    return (
      term.createdBy === userId ||
      this.members(term.orgId).some((c) => c.ownerId === userId && covers(c, term))
    );
  }
  /**
   * A term's talk belongs to the people who were there. Today's admins run the open term, so
   * they read its talk; a locked term's talk stays with its own people, never the next committee.
   */
  private hearsTalk(userId: string, term: Term) {
    return (
      this.wasThere(userId, term) ||
      (!term.locked && this.identity.orgAdmins(term.orgId).includes(userId))
    );
  }
  /** The rooms this person can open, newest term first. */
  rooms(actor: Actor, orgId: string) {
    const userId = this.social.actor(actor);
    return this.terms(orgId)
      .filter((t) => this.inRoom(userId, t))
      .map(({ id, label, locked }) => ({ id, label, locked }));
  }
  room(actor: Actor, orgId: string, termId: string) {
    const userId = this.social.actor(actor);
    const term = this.term(orgId, termId);
    if (!this.inRoom(userId, term)) throw new AppError("NOT_A_MEMBER", 403);
    const admin = this.identity.orgAdmins(orgId).includes(userId);
    const users = new Map(this.store.all<User>("user").map((u) => [u.id, u]));
    const who = (id: string) => {
      const u = users.get(id);
      return { id, name: u?.name ?? "Someone", handle: u?.handle ?? "" };
    };
    const posts = this.store
      .all<RoomPost>("room-post")
      .filter((p) => p.termId === termId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const view = (p: RoomPost) => ({ ...p, author: who(p.userId) });
    const settings = this.settings(termId);
    const reports = admin && this.hearsTalk(userId, term) ? this.reportsOf(termId, posts) : [];
    const state = this.store.get<{ items: RoomStateItem[] }>("room-state", termId)?.items ?? [];
    this.markSeen(userId, termId);
    const mine = this.placed(term, (c) => c.ownerId === userId)[0];
    const me = users.get(userId);
    const talk = this.hearsTalk(userId, term);
    const circle = this.circleOf(term);
    const inCircle = circle ? (this.circles?.circleMembers(circle.groupId) ?? []) : [];
    return {
      term: { id: term.id, label: term.label, locked: term.locked },
      you: {
        ...(me ? personOf(me) : { id: userId, name: "You", handle: "", initials: "", color: "" }),
        role: mine ? roleOf(mine.label) : admin ? "Admin" : null,
      },
      people: new Set([
        ...this.placed(term).map((c) => c.ownerId),
        ...this.identity.orgAdmins(orgId),
      ]).size,
      admin,
      canPost: !term.locked,
      state: [...state].sort((a, b) => (a.when ?? "9999").localeCompare(b.when ?? "9999")),
      announcements: posts
        .filter((p) => p.kind === "announcement")
        .slice(-20)
        .reverse()
        .map(view),
      talk,
      messages: talk
        ? posts
            .filter((p) => p.kind === "message" && !this.blockedEither(userId, p.userId))
            .slice(-100)
            .map(view)
        : [],
      slow: settings.slow,
      muted: settings.muted.includes(userId),
      // What the admins look after: reports on messages, and who can't talk for now.
      ...(admin
        ? {
            reports: reports.map((r) => ({ ...r, post: view(r.post) })),
            mutedPeople: settings.muted.map(who),
          }
        : {}),
      yearbook: term.locked && this.wasThere(userId, term) ? this.yearbook(term) : null,
      // Once a term is over, the people who were there may keep talking as a circle of their own.
      circle:
        term.locked && this.wasThere(userId, term)
          ? circle
            ? {
                name: circle.name,
                groupId: circle.groupId,
                people: inCircle.length,
                joined: inCircle.includes(userId),
                startedBy: who(circle.startedBy).name,
              }
            : { name: null }
          : null,
    };
  }
  private circleOf(term: Term) {
    const circle = this.store.get<TermCircle>("term-circle", term.id);
    // A circle whose last member left is gone; the term may start another.
    return circle && this.circles?.circleMembers(circle.groupId) ? circle : undefined;
  }
  /**
   * A term is over and its people want to keep going: one of them opens a circle, a group chat
   * of its own outside the organisation. Nobody is added; the others join if they want to.
   */
  startCircle(actor: Actor, orgId: string, termId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const term = this.term(orgId, termId);
    if (!term.locked) throw new AppError("TERM_STILL_OPEN", 409);
    if (!this.wasThere(userId, term)) throw new AppError("NOT_A_MEMBER", 403);
    if (!this.circles) throw new AppError("CIRCLES_OFF", 503);
    if (this.circleOf(term)) return this.joinCircle(actor, orgId, termId);
    const { name } = circleStartSchema.parse(input);
    const groupId = this.circles.openCircle(userId, name);
    const circle: TermCircle = { groupId, name, startedBy: userId, at: this.now().toISOString() };
    this.store.transaction(() => this.store.put("term-circle", term.id, circle));
    return { groupId };
  }
  joinCircle(actor: Actor, orgId: string, termId: string) {
    const userId = this.social.actor(actor);
    const term = this.term(orgId, termId);
    if (!this.wasThere(userId, term)) throw new AppError("NOT_A_MEMBER", 403);
    const circle = this.circleOf(term);
    if (!circle || !this.circles) throw new AppError("NOT_FOUND", 404);
    this.circles.joinCircle(circle.groupId, userId);
    return { groupId: circle.groupId };
  }
  /**
   * Which days someone opened a room, so the trial can tell readers who come back from people
   * who looked once. Written at most once a day per person.
   */
  private markSeen(userId: string, termId: string) {
    const key = `${termId}:${userId}`;
    const today = this.now().toISOString().slice(0, 10);
    const seen = this.store.get<{ days: string[] }>("room-seen", key);
    if (seen?.days.includes(today)) return;
    const days = [...(seen?.days ?? []), today].slice(-60);
    this.store.transaction(() => this.store.put("room-seen", key, { days }));
  }
  private openRoom(actor: Actor, orgId: string, termId: string) {
    const userId = this.social.actor(actor);
    const term = this.term(orgId, termId);
    if (!this.inRoom(userId, term)) throw new AppError("NOT_A_MEMBER", 403);
    if (term.locked) throw new AppError("TERM_LOCKED", 409);
    return { userId, term, admin: this.identity.orgAdmins(orgId).includes(userId) };
  }
  /** Admins keep the state on top current; a locked term's state stays as it was left. */
  setState(actor: Actor, orgId: string, termId: string, input: unknown) {
    const { userId, admin } = this.openRoom(actor, orgId, termId);
    if (!admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    const parsed = roomStateSchema.parse(input);
    const items = this.store.get<{ items: RoomStateItem[] }>("room-state", termId)?.items ?? [];
    if (items.length >= 30) throw new AppError("ROOM_STATE_FULL", 409);
    const item: RoomStateItem = {
      id: randomUUID(),
      kind: parsed.kind,
      text: parsed.text,
      ...(parsed.when ? { when: parsed.when } : {}),
      by: userId,
      at: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("room-state", termId, { items: [...items, item] }));
    return item;
  }
  removeState(actor: Actor, orgId: string, termId: string, itemId: string) {
    const { admin } = this.openRoom(actor, orgId, termId);
    if (!admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    const items = this.store.get<{ items: RoomStateItem[] }>("room-state", termId)?.items ?? [];
    this.store.transaction(() =>
      this.store.put("room-state", termId, { items: items.filter((i) => i.id !== itemId) }),
    );
    return { removed: items.length - items.filter((i) => i.id !== itemId).length };
  }
  /**
   * Announcements are the admins'; anyone in the room talks, unless an admin muted them or slow
   * mode asks them to wait. A locked term is read only.
   */
  post(actor: Actor, orgId: string, termId: string, input: unknown) {
    const { userId, admin } = this.openRoom(actor, orgId, termId);
    const parsed = roomPostSchema.parse(input);
    if (parsed.kind === "announcement" && !admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    if (parsed.kind === "message" && !admin) {
      const { slow, muted } = this.settings(termId);
      if (muted.includes(userId)) throw new AppError("MUTED", 403);
      const last = this.store
        .all<RoomPost>("room-post")
        .filter((p) => p.termId === termId && p.userId === userId && p.kind === "message")
        .reduce((a, p) => (p.createdAt > a ? p.createdAt : a), "");
      if (slow && last && this.now().getTime() - Date.parse(last) < slow * 1000)
        throw new AppError("SLOW_MODE", 429);
    }
    const post: RoomPost = {
      id: randomUUID(),
      termId,
      userId,
      kind: parsed.kind,
      text: parsed.text,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("room-post", post.id, post));
    return post;
  }

  // Keeping the talk decent ------------------------------------------------------------------
  private settings(termId: string): RoomSettings {
    return this.store.get<RoomSettings>("room-settings", termId) ?? { slow: 0, muted: [] };
  }
  /** Slow mode: how long each person waits between messages. Admins never wait. */
  setSlow(actor: Actor, orgId: string, termId: string, input: unknown) {
    const { admin } = this.openRoom(actor, orgId, termId);
    if (!admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    const { seconds } = roomSlowSchema.parse(input);
    const next = { ...this.settings(termId), slow: seconds };
    this.store.transaction(() => this.store.put("room-settings", termId, next));
    return next;
  }
  /** An admin stops someone talking in this term's room, or lets them again. They still read. */
  setMute(actor: Actor, orgId: string, termId: string, input: unknown) {
    const { admin, userId } = this.openRoom(actor, orgId, termId);
    if (!admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    const { userId: who, muted } = roomMuteSchema.parse(input);
    if (who === userId || this.identity.orgAdmins(orgId).includes(who))
      throw new AppError("CANT_MUTE_ADMIN", 400);
    const settings = this.settings(termId);
    const next = {
      ...settings,
      muted: muted
        ? [...new Set([...settings.muted, who])].slice(-200)
        : settings.muted.filter((id) => id !== who),
    };
    this.store.transaction(() => this.store.put("room-settings", termId, next));
    return next;
  }
  private roomPost(term: Term, postId: string) {
    const post = this.store.get<RoomPost>("room-post", postId);
    if (!post || post.termId !== term.id) throw new AppError("NOT_FOUND", 404);
    return post;
  }
  /** Anyone who hears the talk can report a message to the admins, once. */
  report(actor: Actor, orgId: string, termId: string, postId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const term = this.term(orgId, termId);
    if (!this.hearsTalk(userId, term)) throw new AppError("NOT_A_MEMBER", 403);
    if (term.locked) throw new AppError("TERM_LOCKED", 409);
    const post = this.roomPost(term, postId);
    if (post.userId === userId) throw new AppError("CANT_REPORT_SELF", 400);
    const { reason } = roomReportSchema.parse(input);
    const report: RoomReport = { postId, termId, userId, reason, at: this.now().toISOString() };
    this.store.transaction(() => this.store.put("room-report", `${postId}:${userId}`, report));
    return { reported: true };
  }
  private reportsOf(termId: string, posts: RoomPost[]) {
    const byPost = new Map<string, RoomReport[]>();
    for (const r of this.store.all<RoomReport>("room-report"))
      if (r.termId === termId) byPost.set(r.postId, [...(byPost.get(r.postId) ?? []), r]);
    return posts
      .filter((p) => byPost.has(p.id))
      .map((p) => {
        const reports = byPost.get(p.id)!;
        return {
          post: p,
          count: reports.length,
          reasons: [...new Set(reports.map((r) => r.reason))],
        };
      })
      .sort((a, b) => b.count - a.count);
  }
  private clearReports(postId: string) {
    for (const r of this.store.all<RoomReport>("room-report"))
      if (r.postId === postId) this.store.remove("room-report", `${postId}:${r.userId}`);
  }
  /** Its author takes a message back, or an admin takes it down. */
  removePost(actor: Actor, orgId: string, termId: string, postId: string) {
    const { userId, admin, term } = this.openRoom(actor, orgId, termId);
    const post = this.roomPost(term, postId);
    if (post.userId !== userId && !admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    this.store.transaction(() => {
      this.store.remove("room-post", postId);
      this.clearReports(postId);
    });
    return { removed: true };
  }
  /** An admin looked and the message stays. */
  dismissReports(actor: Actor, orgId: string, termId: string, postId: string) {
    const { admin, term } = this.openRoom(actor, orgId, termId);
    if (!admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
    this.roomPost(term, postId);
    this.store.transaction(() => this.clearReports(postId));
    return { dismissed: true };
  }

  // The yearbook -----------------------------------------------------------------------------
  /**
   * What a term left behind: its people and roles, what it decided, the first word and the last
   * note. Made when the term locks and kept as it was, for the people who were there.
   */
  private makeYearbook(term: Term): Yearbook {
    const users = new Map(this.store.all<User>("user").map((u) => [u.id, u]));
    const name = (id: string) => users.get(id)?.name ?? "Someone";
    const posts = this.store
      .all<RoomPost>("room-post")
      .filter((p) => p.termId === term.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const messages = posts.filter((p) => p.kind === "message");
    const notes = posts.filter((p) => p.kind === "announcement");
    const state = this.store.get<{ items: RoomStateItem[] }>("room-state", term.id)?.items ?? [];
    const decisions = state.filter((i) => i.kind === "decision");
    const collection = collectionById(`crew-${term.orgId}`.slice(0, 40));
    const crew = new Map<string, number>();
    for (const c of this.store.all<Chapter>("chapter"))
      if (
        c.kind === "stamp" &&
        c.orgId === term.orgId &&
        c.collection === collection?.id &&
        c.from === term.from &&
        c.stamp
      )
        crew.set(c.stamp, (crew.get(c.stamp) ?? 0) + 1);
    const first = messages[0];
    const last = notes[notes.length - 1];
    return {
      termId: term.id,
      label: term.label,
      from: term.from,
      ...(term.to === undefined ? {} : { to: term.to }),
      madeAt: this.now().toISOString(),
      people: this.placed(term).flatMap((c) => {
        const u = users.get(c.ownerId);
        return u ? [{ id: u.id, name: u.name, handle: u.handle, role: roleOf(c.label) }] : [];
      }),
      counts: {
        messages: messages.length,
        announcements: notes.length,
        decisions: decisions.length,
        scheduled: state.length - decisions.length,
      },
      decisions: decisions.slice(0, 10).map((d) => d.text),
      firstWord: first ? { name: name(first.userId), text: first.text.slice(0, 200) } : null,
      lastNote: last ? { name: name(last.userId), text: last.text.slice(0, 300) } : null,
      crew: [...crew]
        .map(([stamp, people]) => ({
          event: collection?.stamps.find((s) => s.id === stamp)?.name ?? stamp,
          people,
        }))
        .sort((a, b) => b.people - a.people),
    };
  }
  private keepYearbook(term: Term) {
    if (!this.store.get<Yearbook>("term-yearbook", term.id))
      this.store.put("term-yearbook", term.id, this.makeYearbook(term));
  }
  /** A term locked before yearbooks existed gets one the first time someone opens it. */
  private yearbook(term: Term) {
    const kept = this.store.get<Yearbook>("term-yearbook", term.id);
    if (kept) return kept;
    const made = this.makeYearbook(term);
    this.store.transaction(() => this.store.put("term-yearbook", term.id, made));
    return made;
  }
}

/** A chapter covers a term when its years do; one with no years counts for the open term only. */
function covers(c: Chapter, term: Term) {
  return c.from === undefined
    ? !term.locked
    : c.from <= term.from &&
        (c.to === "now" || (c.to === undefined ? c.from === term.from : c.to >= term.from));
}
function slug(name: string, fallback: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/, "") || fallback
  );
}
/** "Stage manager, Teater Senja 2025/26" → "Stage manager". */
function roleOf(label: string) {
  return label.split(",")[0]!.trim();
}
function personOf(u: User) {
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    initials: u.initials,
    color: u.color,
    ...(u.avatarAssetId ? { avatarAssetId: u.avatarAssetId } : {}),
  };
}
