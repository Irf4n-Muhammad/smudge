import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import {
  oprecApplySchema,
  oprecCreateSchema,
  oprecDecideSchema,
} from "../../contracts/src/identity.js";
import type { Chapter, Oprec, OprecApplication, Term } from "../../contracts/src/identity.js";
import type { Actor } from "./index.js";
import type { IdentityService } from "./identity.js";
import type { OrgService } from "./orgs.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

/**
 * Open recruitment for a term (rush week, freshers' fair). Applicants apply with the profile they already have
 * instead of retyping it into a form; the committee sees their proven chapters; whoever is
 * accepted gets a chapter from the organisation, which also opens the term's room to them.
 */
export class OprecService {
  constructor(
    private readonly social: SocialService,
    private readonly identity: IdentityService,
    private readonly orgs: OrgService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  private today() {
    return this.now().toISOString().slice(0, 10);
  }
  private oprec(orgId: string, oprecId: string) {
    const oprec = this.store.get<Oprec>("oprec", oprecId);
    if (!oprec || oprec.orgId !== orgId) throw new AppError("NOT_FOUND", 404);
    return oprec;
  }
  private applications(oprecId: string) {
    return this.store
      .all<OprecApplication>("oprec-application")
      .filter((a) => a.oprecId === oprecId);
  }
  /** One recruitment at a time, for the current term. */
  create(actor: Actor, orgId: string, input: unknown) {
    const userId = this.orgs.requireAdmin(actor, orgId);
    const parsed = oprecCreateSchema.parse(input);
    const term = this.orgs.terms(orgId).find((t) => !t.locked);
    if (!term) throw new AppError("NO_OPEN_TERM", 409);
    if (parsed.closes < this.today()) throw new AppError("OPREC_CLOSES_IN_PAST", 400);
    if (this.store.all<Oprec>("oprec").some((o) => o.orgId === orgId && o.open))
      throw new AppError("OPREC_ALREADY_OPEN", 409);
    const oprec: Oprec = {
      id: randomUUID(),
      orgId,
      termId: term.id,
      ...parsed,
      open: true,
      createdBy: userId,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("oprec", oprec.id, oprec));
    return oprec;
  }
  close(actor: Actor, orgId: string, oprecId: string) {
    this.orgs.requireAdmin(actor, orgId);
    const oprec = { ...this.oprec(orgId, oprecId), open: false };
    this.store.transaction(() => this.store.put("oprec", oprec.id, oprec));
    return oprec;
  }
  /** What anyone sees: the current recruitment, how many applied, and whether it still takes people. */
  current(orgId: string) {
    this.orgs.org(orgId);
    const oprec = this.store
      .all<Oprec>("oprec")
      .filter((o) => o.orgId === orgId && o.open)
      .at(-1);
    if (!oprec) return null;
    const term = this.store.get<Term>("term", oprec.termId);
    return {
      id: oprec.id,
      title: oprec.title,
      roles: oprec.roles,
      questions: oprec.questions,
      closes: oprec.closes,
      term: term?.label ?? null,
      accepting: oprec.closes >= this.today(),
      applicants: this.applications(oprec.id).length,
    };
  }
  apply(actor: Actor, orgId: string, oprecId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const oprec = this.oprec(orgId, oprecId);
    if (!oprec.open || oprec.closes < this.today()) throw new AppError("OPREC_CLOSED", 409);
    const parsed = oprecApplySchema.parse(input);
    const role = oprec.roles.find((r) => r.toLowerCase() === parsed.role.toLowerCase());
    if (!role) throw new AppError("ROLE_UNKNOWN", 400);
    if (parsed.answers.length > oprec.questions.length) throw new AppError("TOO_MANY_ANSWERS", 400);
    if (this.applications(oprecId).some((a) => a.userId === userId))
      throw new AppError("ALREADY_APPLIED", 409);
    const application: OprecApplication = {
      id: randomUUID(),
      oprecId,
      userId,
      role,
      answers: parsed.answers,
      status: "applied",
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("oprec-application", application.id, application));
    return application;
  }
  mine(actor: Actor, orgId: string, oprecId: string) {
    const userId = this.social.actor(actor);
    this.oprec(orgId, oprecId);
    const mine = this.applications(oprecId).find((a) => a.userId === userId);
    return mine ? { role: mine.role, status: mine.status } : null;
  }
  /** The committee's list: each applicant with the chapters they show the world. */
  list(actor: Actor, orgId: string, oprecId: string) {
    const adminId = this.orgs.requireAdmin(actor, orgId);
    const oprec = this.oprec(orgId, oprecId);
    const users = new Map(this.store.all<User>("user").map((u) => [u.id, u]));
    return {
      oprec,
      applications: this.applications(oprecId).map((a) => {
        const u = users.get(a.userId);
        return {
          ...a,
          applicant: { id: a.userId, name: u?.name ?? "Someone", handle: u?.handle ?? "" },
          proven: this.store
            .all<Chapter>("chapter")
            .filter(
              (c) =>
                c.ownerId === a.userId &&
                c.audience === "public" &&
                c.kind !== "together" &&
                // A private organisation's chapters stay with its own people.
                (!c.orgId || this.orgs.canSee(c.orgId, adminId)),
            )
            .map((c) => c.label),
        };
      }),
    };
  }
  /** Accepting hands out the organisation's chapter for the term; declining just says no. */
  decide(actor: Actor, orgId: string, oprecId: string, applicationId: string, input: unknown) {
    this.orgs.requireAdmin(actor, orgId);
    const oprec = this.oprec(orgId, oprecId);
    const { accept } = oprecDecideSchema.parse(input);
    const application = this.store.get<OprecApplication>("oprec-application", applicationId);
    if (!application || application.oprecId !== oprecId) throw new AppError("NOT_FOUND", 404);
    if (application.status !== "applied") throw new AppError("ALREADY_DECIDED", 409);
    const term = this.store.get<Term>("term", oprec.termId)!;
    const org = this.orgs.org(orgId);
    return this.store.transaction(() => {
      const decided: OprecApplication = {
        ...application,
        status: accept ? "accepted" : "declined",
        decidedAt: this.now().toISOString(),
      };
      this.store.put("oprec-application", decided.id, decided);
      const chapter = accept
        ? this.identity.grantChapter({
            ownerId: application.userId,
            kind: "member",
            label: `${application.role}, ${org.name} ${term.label}`,
            orgId,
            from: term.from,
            ...(term.to === undefined ? {} : { to: term.to }),
            method: "invite",
            audience: "public",
          })
        : null;
      return { application: decided, chapter };
    });
  }
}
