import { z } from "zod";
import { orgs, themeEvents, themeFonts } from "./identity.js";

/**
 * Community themes (ADR 0024): anyone designs a theme in their own HTML and CSS, Smudge reviews
 * it, and only approved themes reach the Themes market. Everything here arrives from a client and
 * is untrusted; the creator always comes from the session, never from this body.
 */
export const themeAnchors = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom-left",
] as const;
export const themeLimits = {
  pieces: 6,
  html: 6000,
  css: 6000,
  minSize: 12,
  maxSize: 360,
  maxOffset: 400,
  /** Submissions one person may have waiting for review at once. */
  pending: 5,
} as const;

/**
 * Pieces are drawn as images, where scripts never run and nothing outside the image loads, so
 * these rules are not the containment. They tell the designer early, and plainly, that something
 * cannot work, and they keep the review queue free of code that only pretends to.
 */
const rules: [RegExp, string][] = [
  [
    /<\s*(script|iframe|frame|object|embed|link|meta|base|form|input|button|textarea|select|video|audio)\b/i,
    "Scripts, frames, forms and media tags are not allowed. Use HTML elements and CSS.",
  ],
  [/\son[a-z]+\s*=/i, "Event handlers (onclick and the like) are not allowed."],
  [/javascript\s*:/i, "javascript: links are not allowed."],
  [/@import/i, "@import is not allowed. Put all CSS in the piece."],
  [
    /url\(\s*(?!\s*['"]?\s*(data:|#))/i,
    "url() may only use data: URIs. Outside files never load in a theme.",
  ],
  [
    /\b(src|href|xlink:href)\s*=\s*(?!\s*['"]?\s*(data:|#))/i,
    "src and href may only use data: URIs. Outside files never load in a theme.",
  ],
];
export function themeCodeProblem(code: string): string | null {
  for (const [pattern, message] of rules) if (pattern.test(code)) return message;
  return null;
}

/**
 * Pieces may hang outside a post freely, but inside it they live along an edge: at most this many
 * pixels deep on at least one axis, so the post underneath stays readable while people scroll.
 */
export const themeBand = 110;
export function pieceDepth(p: {
  anchor: (typeof themeAnchors)[number];
  width: number;
  height: number;
  dx: number;
  dy: number;
}) {
  const fromTop = p.dy + p.height,
    fromBottom = -p.dy,
    fromLeft = p.dx + p.width,
    fromRight = -p.dx;
  return {
    "top-left": Math.min(fromTop, fromLeft),
    top: fromTop,
    "top-right": Math.min(fromTop, fromRight),
    right: fromRight,
    "bottom-right": Math.min(fromBottom, fromRight),
    "bottom-left": Math.min(fromBottom, fromLeft),
  }[p.anchor];
}

const offset = z.number().int().min(-themeLimits.maxOffset).max(themeLimits.maxOffset);
const size = z.number().int().min(themeLimits.minSize).max(themeLimits.maxSize);
export const themePieceInputSchema = z
  .object({
    anchor: z.enum(themeAnchors),
    width: size,
    height: size,
    dx: offset,
    dy: offset,
    html: z.string().max(themeLimits.html),
    css: z.string().max(themeLimits.css),
  })
  .strict()
  .superRefine((piece, context) => {
    if (pieceDepth(piece) > themeBand)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dy"],
        message: `This piece reaches ${pieceDepth(piece)}px into the post. Keep it within ${themeBand}px of an edge.`,
      });
    if (!piece.html.trim())
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["html"], message: "Empty piece" });
    for (const key of ["html", "css"] as const) {
      const problem = themeCodeProblem(piece[key]);
      if (problem) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: problem });
    }
  });
export type ThemePieceInput = z.infer<typeof themePieceInputSchema>;

const eventIds = themeEvents.map((e) => e.id) as [string, ...string[]];
const orgIds = orgs.map((o) => o.id) as [string, ...string[]];
export const themeSubmissionSchema = z
  .object({
    name: z.string().trim().min(2, "Give your theme a name.").max(40),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    font: z.enum(themeFonts),
    /** Same kinds as catalog themes: an event or organisation is picked from the host's list. */
    kind: z.enum(["market", "event", "members"]),
    eventId: z.enum(eventIds).optional(),
    orgId: z.enum(orgIds).optional(),
    pieces: z
      .array(themePieceInputSchema)
      .min(1, "A theme needs at least one piece.")
      .max(themeLimits.pieces, `At most ${themeLimits.pieces} pieces.`),
  })
  .strict()
  .superRefine((theme, context) => {
    const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
    if ((theme.kind === "event") !== !!theme.eventId)
      issue("An event theme names one event, and only event themes do.");
    if ((theme.kind === "members") !== !!theme.orgId)
      issue("A members theme names one organisation, and only members themes do.");
  });
export type ThemeSubmissionInput = z.infer<typeof themeSubmissionSchema>;

export const themeReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject", "remove"]),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export type ThemeSubmissionStatus = "pending" | "approved" | "rejected" | "removed";
export interface ThemeSubmissionView extends ThemeSubmissionInput {
  id: string;
  creator: { id: string; handle: string; name: string };
  status: ThemeSubmissionStatus;
  /** The reviewer's note to the designer, shown with a rejection or a removal. */
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
