import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import { defaultEmotes } from "../../contracts/src/identity.js";
import type { Decoration } from "../../contracts/src/identity.js";
import {
  themeLimits,
  themeReviewSchema,
  themeSubmissionSchema,
} from "../../contracts/src/themes.js";
import type {
  ThemeSubmissionInput,
  ThemeSubmissionStatus,
  ThemeSubmissionView,
} from "../../contracts/src/themes.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface ThemeSubmission extends ThemeSubmissionInput {
  id: string;
  creatorId: string;
  status: ThemeSubmissionStatus;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
}
const KIND = "theme-submission";

/**
 * The open theme market (ADR 0024): anyone submits a theme made of their own HTML and CSS, a
 * moderator approves or rejects it, and approved themes join the catalog everyone can wear.
 * Pending and rejected work is visible only to its designer and to moderators.
 */
export class ThemeStudio {
  constructor(
    private readonly social: SocialService,
    private readonly isAdmin: (userId: string) => boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  private view(t: ThemeSubmission, users: Map<string, User>): ThemeSubmissionView {
    const creator = users.get(t.creatorId);
    const { creatorId: _c, reviewerId: _r, ...rest } = t;
    return {
      ...rest,
      creator: {
        id: t.creatorId,
        handle: creator?.handle ?? t.creatorId,
        name: creator?.name ?? t.creatorId,
      },
    };
  }
  private users() {
    return new Map(this.social.users().map((u) => [u.id, u]));
  }
  private moderator(actor: Actor) {
    const me = this.social.actor(actor);
    // Same answer as the reports queue: the review queue does not admit it exists.
    if (!this.isAdmin(me)) throw new AppError("NOT_FOUND", 404);
    return me;
  }

  submit(actor: Actor, input: unknown) {
    const creatorId = this.social.actor(actor);
    const theme = themeSubmissionSchema.parse(input);
    const waiting = this.store
      .all<ThemeSubmission>(KIND)
      .filter((t) => t.creatorId === creatorId && t.status === "pending").length;
    if (waiting >= themeLimits.pending) throw new AppError("THEME_QUEUE_FULL", 429);
    const submission: ThemeSubmission = {
      ...theme,
      id: `t-${randomUUID().slice(0, 8)}`,
      creatorId,
      status: "pending",
      note: null,
      createdAt: this.now().toISOString(),
      reviewedAt: null,
      reviewerId: null,
    };
    this.store.transaction(() => this.store.put(KIND, submission.id, submission));
    return this.view(submission, this.users());
  }
  mine(actor: Actor) {
    const me = this.social.actor(actor);
    const users = this.users();
    return this.store
      .all<ThemeSubmission>(KIND)
      .filter((t) => t.creatorId === me)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => this.view(t, users));
  }
  /**
   * A designer can take back work that nobody wears yet. An approved theme may be someone's look,
   * so it leaves the market only through review.
   */
  withdraw(actor: Actor, id: string) {
    const me = this.social.actor(actor);
    const theme = this.store.get<ThemeSubmission>(KIND, id);
    if (!theme || theme.creatorId !== me) throw new AppError("NOT_FOUND", 404);
    if (theme.status === "approved") throw new AppError("THEME_IN_MARKET", 409);
    this.store.transaction(() => this.store.remove(KIND, id));
    return this.mine(actor);
  }
  queue(actor: Actor) {
    this.moderator(actor);
    const users = this.users();
    return this.store
      .all<ThemeSubmission>(KIND)
      .filter((t) => t.status === "pending" || t.status === "approved")
      .sort(
        (a, b) =>
          Number(b.status === "pending") - Number(a.status === "pending") ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .map((t) => this.view(t, users));
  }
  review(actor: Actor, id: string, input: unknown) {
    const me = this.moderator(actor);
    const { decision, note } = themeReviewSchema.parse(input);
    const theme = this.store.get<ThemeSubmission>(KIND, id);
    if (!theme) throw new AppError("NOT_FOUND", 404);
    const from: ThemeSubmissionStatus = decision === "remove" ? "approved" : "pending";
    if (theme.status !== from) throw new AppError("THEME_ALREADY_REVIEWED", 409);
    const status: ThemeSubmissionStatus =
      decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "removed";
    const next: ThemeSubmission = {
      ...theme,
      status,
      note: note || null,
      reviewedAt: this.now().toISOString(),
      reviewerId: me,
    };
    this.store.transaction(() => this.store.put(KIND, id, next));
    return this.view(next, this.users());
  }
  /** Approved themes in catalog form. A removed theme drops out, so nobody wears it any more. */
  approved(): Decoration[] {
    return this.store
      .all<ThemeSubmission>(KIND)
      .filter((t) => t.status === "approved")
      .sort((a, b) => (a.reviewedAt ?? "").localeCompare(b.reviewedAt ?? ""))
      .map((t) => ({
        id: t.id,
        name: t.name,
        creatorId: t.creatorId,
        tier: t.kind,
        accent: t.accent,
        font: t.font,
        ...(t.eventId ? { eventId: t.eventId } : {}),
        ...(t.orgId ? { orgId: t.orgId } : {}),
        emotes: defaultEmotes,
        pieces: t.pieces.map(({ anchor, width, height, dx, dy, html, css }) => ({
          anchor,
          width,
          height,
          dx,
          dy,
          html,
          css,
        })),
      }));
  }
  /** Account deletion takes the person's designs with it, approved ones included. */
  erase(userId: string) {
    for (const t of this.store.all<ThemeSubmission>(KIND))
      if (t.creatorId === userId) this.store.remove(KIND, t.id);
  }
}
