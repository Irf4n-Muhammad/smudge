import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import {
  collections,
  handoverSchema,
  orgById,
  orgCreateSchema,
  orgs,
  registerOrg,
  roomPostSchema,
  roomStateSchema,
  termStartSchema,
} from "../../contracts/src/identity.js";
import type { Chapter, Org, RoomPost, RoomStateItem, Term } from "../../contracts/src/identity.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";
import type { IdentityService } from "./identity.js";

/**
 * Organisations as a place of their own: a public face anyone can open, terms (kepengurusan)
 * where the past ones are locked but stay on their people's pages, and a handover that moves
 * the admin role without passing a password around. Posts read the viewer's own memberships
 * through `org.read`; nobody else's.
 */
export class OrgService {
  constructor(
    private readonly social: SocialService,
    private readonly identity: IdentityService,
    private readonly now: () => Date = () => new Date(),
  ) {
    social.capabilityHandlers["org.read"] = (actor, _postId, payload, preview) =>
      preview ? { memberships: [] } : this.memberships(actor, payload);
    for (const org of this.store.all<Org>("org")) registerOrg(org);
  }
  private get store() {
    return this.social.store;
  }
  private org(id: string) {
    const org = orgById(id);
    if (!org) throw new AppError("NOT_FOUND", 404);
    return org;
  }
  private requireAdmin(actor: Actor, orgId: string) {
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
  /** What anyone may see: the organisation, its terms, and how many people it has held. */
  publicPage(orgId: string) {
    const org = this.org(orgId);
    const people = new Set(this.members(orgId).map((c) => c.ownerId));
    const terms = this.terms(orgId);
    return {
      id: org.id,
      name: org.name,
      kind: org.kind,
      members: people.size,
      terms: terms.map(({ id, label, from, to, locked }) => ({ id, label, from, to, locked })),
      current: terms.find((t) => !t.locked)?.label ?? null,
      collections: collections
        .filter((c) => c.orgId === orgId)
        .map((c) => ({ id: c.id, name: c.name, stamps: c.stamps.length })),
    };
  }
  /** The admin's side: the same page plus who runs it now. */
  manage(actor: Actor, orgId: string) {
    this.requireAdmin(actor, orgId);
    const users = this.store.all<User>("user");
    return {
      ...this.publicPage(orgId),
      admins: this.identity.orgAdmins(orgId).map((id) => {
        const u = users.find((x) => x.id === id);
        return { id, name: u?.name ?? id, handle: u?.handle ?? "" };
      }),
    };
  }
  /**
   * Someone starts their own organisation (a himpunan, a UKM, a fanbase) and runs it. A few per
   * person, so names can't be squatted in bulk.
   */
  createOrg(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = orgCreateSchema.parse(input);
    const started = this.store.all<Org>("org").filter((o) => o.admins[0] === userId);
    if (started.length >= 3) throw new AppError("TOO_MANY_ORGS", 429);
    const base =
      parsed.name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32)
        .replace(/-+$/, "") || "org";
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
        if (!t.locked) this.store.put("term", t.id, { ...t, locked: true } satisfies Term);
      this.store.put("term", term.id, term);
    });
    return term;
  }
  lockTerm(actor: Actor, orgId: string, termId: string) {
    this.requireAdmin(actor, orgId);
    const term = this.store.get<Term>("term", termId);
    if (!term || term.orgId !== orgId) throw new AppError("NOT_FOUND", 404);
    const next = { ...term, locked: true };
    this.store.transaction(() => this.store.put("term", term.id, next));
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
    if (this.identity.orgAdmins(term.orgId).includes(userId) || term.createdBy === userId)
      return true;
    return this.members(term.orgId).some(
      (c) =>
        c.ownerId === userId &&
        (c.from === undefined
          ? !term.locked
          : c.from <= term.from &&
            (c.to === "now" || (c.to === undefined ? c.from === term.from : c.to >= term.from))),
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
    const state = this.store.get<{ items: RoomStateItem[] }>("room-state", termId)?.items ?? [];
    return {
      term: { id: term.id, label: term.label, locked: term.locked },
      admin,
      canPost: !term.locked,
      state: [...state].sort((a, b) => (a.when ?? "9999").localeCompare(b.when ?? "9999")),
      announcements: posts
        .filter((p) => p.kind === "announcement")
        .slice(-20)
        .reverse()
        .map(view),
      messages: posts
        .filter((p) => p.kind === "message")
        .slice(-100)
        .map(view),
    };
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
  /** Announcements are the admins'; anyone in the room talks. A locked term is read only. */
  post(actor: Actor, orgId: string, termId: string, input: unknown) {
    const { userId, admin } = this.openRoom(actor, orgId, termId);
    const parsed = roomPostSchema.parse(input);
    if (parsed.kind === "announcement" && !admin) throw new AppError("ORG_ADMIN_REQUIRED", 403);
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
}
