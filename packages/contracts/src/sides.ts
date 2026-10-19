import { z } from "zod";

/**
 * Sides (ADR 0027). One account, many sides: a side is membership in a world with its own feed
 * and composer. "Everyday" is the side everyone has. A post lives in exactly one side; the writer
 * may also share it to Everyday. A private side is invisible from outside: its posts, and the
 * side itself, are not listed to people who are not in it.
 */
export const sideIdSchema = z.string().regex(/^[a-z0-9-]{2,32}$/);
export type SideId = string;
export const EVERYDAY: SideId = "everyday";

export interface Side {
  id: SideId;
  name: string;
  tagline: string;
  /** Who runs it: the platform (everyday, house) or an organisation from the identity catalog. */
  kind: "everyday" | "house" | "org";
  /** `open`: anyone joins with a tap. `invite`: an organisation invite (chapter) lets you in. */
  entry: "open" | "invite";
  /** Posts and the side itself are seen only by members. */
  private: boolean;
  orgId?: string;
  /** Stage colour the app wears while this side is active. */
  accent: string;
  /** What the composer asks inside this side. */
  prompt: string;
}

export const sides: Side[] = [
  {
    id: EVERYDAY,
    name: "Everyday",
    tagline: "Your feed, for everyone who follows you",
    kind: "everyday",
    entry: "open",
    private: false,
    accent: "#1b1b1f",
    prompt: "What does your day look like?",
  },
  {
    id: "runners",
    name: "Runners",
    tagline: "Long runs, race days and the people you run with",
    kind: "house",
    entry: "open",
    private: false,
    accent: "#e07a1f",
    prompt: "How was the run?",
  },
  {
    id: "gamers",
    name: "Gamers",
    tagline: "Ranked nights, LAN weekends and the squad you queue with",
    kind: "house",
    entry: "open",
    private: false,
    accent: "#6b3df5",
    prompt: "What are you playing tonight?",
  },
  {
    id: "film-fest",
    name: "Film Festival crew",
    tagline: "Lembayung Film Festival: crew and jury only",
    kind: "org",
    entry: "invite",
    private: true,
    orgId: "film-fest",
    accent: "#2b59c3",
    prompt: "What's happening backstage?",
  },
];
export const sideById = (id: string) => sides.find((s) => s.id === id);

export const activeSideSchema = z.object({ side: sideIdSchema }).strict();
/** How a reader lays out their sides: one at a time (default) or all together in one feed. */
export const feedLayoutSchema = z.object({ layout: z.enum(["separate", "mixed"]) }).strict();
export type FeedLayout = z.infer<typeof feedLayoutSchema>["layout"];
export const shareInputSchema = z.object({ everyday: z.boolean() }).strict();

/** A plan post inside a side, as the side's home lists it: who is in and who came (ADR 0029). */
export interface SidePlan {
  postId: string;
  title: string;
  caption: string;
  ownerName: string;
  createdAt: string;
  count: number;
  cameCount: number;
  going: boolean;
  came: boolean;
}
/**
 * A side's home (ADR 0033): what a member, or someone deciding to join, sees first. People are
 * the ones the viewer may see; counts cover everyone. Private sides answer only to members.
 */
export interface SideHome {
  side: Side;
  member: boolean;
  /** When the viewer joined, for members. */
  since?: string;
  members: {
    count: number;
    /** Newest members first, at most eight, minus people the viewer cannot see. */
    people: {
      id: string;
      name: string;
      handle: string;
      initials: string;
      color: string;
      avatarAssetId?: string;
    }[];
  };
  /** The side's plans the viewer may open, newest first, at most three. */
  plans: SidePlan[];
  /** Posts in the side the viewer may open. */
  posts: number;
}

/** What the app needs to draw the side switcher and composer. Private sides appear only in `mine`. */
export interface SidesView {
  active: SideId;
  layout: FeedLayout;
  mine: Side[];
  /** Open sides you could join with a tap. */
  open: Side[];
}
