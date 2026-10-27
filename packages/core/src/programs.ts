import { z } from "zod";
import {
  quizAnswerSchema,
  quizSetupSchema,
  type CatFeed,
  type CatView,
  type QuizScore,
  type QuizSetup,
  type QuizView,
} from "../../contracts/src/programs.js";
import type { Actor } from "./index.js";
import { AppError, GUEST, type SocialService } from "./social.js";

const day = 24 * 60 * 60_000;
const keepFeeds = 200;

/**
 * Programs between people (ADR 0043). The page is the door; the state belongs to the owner, so
 * a new design keeps the quiz and the cat. Reads go to whoever may see the owner's posts, writes
 * to signed-in people the owner has not blocked. The owner's own answers never count.
 */
export class ProgramService {
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  /** Who may read someone's programs besides the owner; the server installs the privacy rules. */
  viewFilter: (viewerId: string, ownerId: string) => boolean = () => true;
  private get store() {
    return this.social.store;
  }
  private canSee(viewerId: string, ownerId: string) {
    return viewerId === ownerId || this.viewFilter(viewerId, ownerId);
  }
  private name(userId: string) {
    return this.social.users().find((u) => u.id === userId)?.name ?? "Someone";
  }
  /** Writes need an account, and the owner must not have blocked the writer (or the reverse). */
  private writer(actor: Actor, ownerId: string) {
    if (!actor.userId || actor.userId === GUEST) throw new AppError("SIGN_IN_REQUIRED", 401);
    const me = this.social.actor(actor);
    if (me !== ownerId) this.social.relationGuard(me, ownerId);
    return me;
  }

  // Quiz: "how well do you know me?" -----------------------------------------------------------
  /** The owner's questions with their answers, for the editor only. */
  quiz(actor: Actor): QuizSetup {
    const me = this.social.actor(actor);
    return this.store.get<QuizSetup>("quiz", me) ?? { questions: [] };
  }
  setQuiz(actor: Actor, input: unknown): QuizSetup {
    const me = this.social.actor(actor);
    const value = quizSetupSchema.parse(input);
    this.store.transaction(() => {
      this.store.put("quiz", me, value);
      // New questions, new game: old scores would compare against a different quiz.
      for (const key of this.store.ids("quiz-score"))
        if (key.startsWith(`${me}:`)) this.store.remove("quiz-score", key);
    });
    return value;
  }
  private scores(ownerId: string) {
    return this.store
      .ids("quiz-score")
      .filter((k) => k.startsWith(`${ownerId}:`))
      .map((k) => this.store.get<QuizScore>("quiz-score", k)!)
      .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  }
  quizRead(viewerId: string, ownerId: string): QuizView {
    const empty: QuizView = { questions: [], mine: null, board: [], takers: 0, own: false };
    if (!this.canSee(viewerId, ownerId)) return empty;
    const setup = this.store.get<QuizSetup>("quiz", ownerId);
    if (!setup) return { ...empty, own: viewerId === ownerId };
    const scores = this.scores(ownerId);
    const mine = viewerId
      ? this.store.get<QuizScore & { picked: number[] }>("quiz-score", `${ownerId}:${viewerId}`)
      : undefined;
    return {
      questions: setup.questions.map((q) => ({ text: q.text, options: q.options })),
      mine: mine
        ? {
            score: mine.score,
            total: mine.total,
            correct: setup.questions.map((q) => q.answer),
            picked: mine.picked,
          }
        : null,
      board: scores.slice(0, 10).map((s) => ({ name: s.name, score: s.score, total: s.total })),
      takers: scores.length,
      own: viewerId === ownerId,
    };
  }
  quizAnswer(actor: Actor, ownerId: string, payload: unknown): QuizView {
    const me = this.writer(actor, ownerId);
    if (me === ownerId) throw new AppError("OWN_QUIZ", 409);
    if (!this.canSee(me, ownerId)) throw new AppError("NOT_FOUND", 404);
    const setup = this.store.get<QuizSetup>("quiz", ownerId);
    if (!setup) throw new AppError("NOT_FOUND", 404);
    const { answers } = quizAnswerSchema.parse(payload);
    if (answers.length !== setup.questions.length) throw new AppError("VALIDATION_FAILED", 400);
    const score = setup.questions.filter((q, i) => q.answer === answers[i]).length;
    const record: QuizScore & { picked: number[] } = {
      userId: me,
      name: this.name(me),
      score,
      total: setup.questions.length,
      picked: answers,
      at: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("quiz-score", `${ownerId}:${me}`, record));
    return this.quizRead(me, ownerId);
  }

  // The cat: friends keep it fed -----------------------------------------------------------------
  private feeds(ownerId: string) {
    return this.store.get<CatFeed[]>("cat", ownerId) ?? [];
  }
  catRead(viewerId: string, ownerId: string): CatView {
    const quiet: CatView = { mood: "hungry", today: [], fedByMe: false, lastFed: null, feeds: 0 };
    if (!this.canSee(viewerId, ownerId)) return quiet;
    const feeds = this.feeds(ownerId);
    const since = this.now().getTime() - day;
    const today = feeds.filter((f) => new Date(f.at).getTime() >= since).reverse();
    const last = feeds[feeds.length - 1];
    return {
      mood: today.length >= 3 ? "happy" : today.length ? "fine" : "hungry",
      today: today.map((f) => ({ name: f.name, at: f.at })),
      fedByMe: !!viewerId && today.some((f) => f.userId === viewerId),
      lastFed: last?.at ?? null,
      feeds: feeds.length,
    };
  }
  catFeed(actor: Actor, ownerId: string): CatView {
    const me = this.writer(actor, ownerId);
    if (!this.canSee(me, ownerId)) throw new AppError("NOT_FOUND", 404);
    const feeds = this.feeds(ownerId);
    const since = this.now().getTime() - day;
    if (feeds.some((f) => f.userId === me && new Date(f.at).getTime() >= since))
      throw new AppError("CAT_FED", 409);
    const next = [...feeds, { userId: me, name: this.name(me), at: this.now().toISOString() }];
    this.store.transaction(() => this.store.put("cat", ownerId, next.slice(-keepFeeds)));
    return this.catRead(me, ownerId);
  }

  /** The page asks through its capability grants; the owner's publication decides the grants. */
  capability(actor: Actor, ownerId: string, method: string, payload: unknown): unknown {
    const viewer = actor.userId;
    if (method === "quiz.read") {
      z.undefined().parse(payload);
      return this.quizRead(viewer, ownerId);
    }
    if (method === "quiz.answer") return this.quizAnswer(actor, ownerId, payload);
    if (method === "cat.read") {
      z.undefined().parse(payload);
      return this.catRead(viewer, ownerId);
    }
    if (method === "cat.feed") {
      z.undefined().parse(payload);
      return this.catFeed(actor, ownerId);
    }
    throw new AppError("CAPABILITY_DENIED", 403);
  }
  /** Runs inside the account deletion's transaction. */
  erase(userId: string) {
    this.store.remove("quiz", userId);
    for (const key of this.store.ids("quiz-score"))
      if (key.startsWith(`${userId}:`) || key.endsWith(`:${userId}`))
        this.store.remove("quiz-score", key);
    this.store.remove("cat", userId);
    for (const key of this.store.ids("cat")) {
      const feeds = this.store.get<CatFeed[]>("cat", key) ?? [];
      if (feeds.some((f) => f.userId === userId))
        this.store.put(
          "cat",
          key,
          feeds.filter((f) => f.userId !== userId),
        );
    }
  }
}
