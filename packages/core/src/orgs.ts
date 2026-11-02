import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import {
  collections,
  handoverSchema,
  orgById,
  orgs,
  termStartSchema,
} from "../../contracts/src/identity.js";
import type { Chapter, Term } from "../../contracts/src/identity.js";
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
}
