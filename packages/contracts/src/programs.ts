import { z } from "zod";

/**
 * Programs between people on a page (ADR 0043): a quiz about the owner that friends take, and a
 * cat the owner's friends keep fed. Both live on the page as sections, read through the page's
 * capabilities, and store their state by the owner, not by the page design.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
export const quizQuestionSchema = z
  .object({
    text: text(120),
    options: z.array(text(40)).min(2).max(4),
    /** Index of the right option. Never leaves the server in a read. */
    answer: z.number().int().min(0).max(3),
  })
  .strict()
  .refine((q) => q.answer < q.options.length, "The answer must be one of the options");
export const quizSetupSchema = z
  .object({ questions: z.array(quizQuestionSchema).min(1).max(10) })
  .strict();
export type QuizSetup = z.infer<typeof quizSetupSchema>;
export const quizAnswerSchema = z
  .object({ answers: z.array(z.number().int().min(0).max(3)).min(1).max(10) })
  .strict();
export interface QuizScore {
  userId: string;
  name: string;
  score: number;
  total: number;
  at: string;
}
export interface QuizView {
  /** Questions without their answers; empty when the owner has not written any yet. */
  questions: { text: string; options: string[] }[];
  /** This viewer's last result, with the right option per question, or null. */
  mine: { score: number; total: number; correct: number[]; picked: number[] } | null;
  /** Best results first, the owner never among them. */
  board: { name: string; score: number; total: number }[];
  takers: number;
  own: boolean;
}
export type CatMood = "hungry" | "fine" | "happy";
export interface CatFeed {
  userId: string;
  name: string;
  at: string;
}
export interface CatView {
  mood: CatMood;
  /** Who fed the cat in the last day, latest first. */
  today: { name: string; at: string }[];
  fedByMe: boolean;
  lastFed: string | null;
  feeds: number;
}
/** What a Paint wall section grants while it is on the page; nothing more, nothing longer. */
export const programCapabilities = {
  quiz: ["quiz.read", "quiz.answer"],
  cat: ["cat.read", "cat.feed"],
} as const;
