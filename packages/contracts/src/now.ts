import { z } from "zod";

/**
 * What you are doing right now, kept as your archive (ADR 0041). Most of it is read, not typed
 * (ADR 0044): a song from Spotify, a post, a quiz taken, a cat fed. The first four kinds are the
 * ones a person may still note by hand.
 */
export const manualKinds = ["listening", "doing", "place", "thinking"] as const;
export const nowKinds = [...manualKinds, "posted", "quiz", "fed", "page"] as const;
export type NowKind = (typeof nowKinds)[number];
export const nowInputSchema = z
  .object({
    kind: z.enum(manualKinds),
    text: z.string().trim().min(1).max(80),
    /** The artist, for a song. */
    by: z.string().trim().max(50).optional(),
  })
  .strict();
export type NowInput = z.infer<typeof nowInputSchema>;
export interface NowView {
  id: string;
  kind: NowKind;
  text: string;
  by?: string;
  at: string;
  /** Read from somewhere ("spotify", "smudge") rather than typed; cannot be removed by hand. */
  source?: string;
}
/** The songs a person can note with one tap: their own again, and what friends had on. */
export interface SongPick {
  text: string;
  by?: string;
}
/** Where the owner's song comes from, for the owner's own page controls. */
export interface NowSources {
  spotify: { configured: boolean; connected: boolean };
  songs: SongPick[];
}
export interface NowArchive {
  /** The newest entry, whatever its age; the viewer sees how old it is. */
  current: NowView | null;
  /** Newest first, at most a few hundred. */
  entries: NowView[];
  total: number;
}
/** What a page's program reads about its owner's now: enough for a "now doing" and "on repeat". */
export interface NowLive {
  current: NowView | null;
  listening: NowView | null;
  recent: NowView[];
}

/** Five answers make a page in about a minute: a line, a vibe, a colour, a song, what you're doing. */
export const setupInputSchema = z
  .object({
    bio: z.string().trim().max(300),
    vibe: z.string().regex(/^[a-z]{1,12}$/),
    colour: z
      .string()
      .regex(/^[a-z]{1,12}$/)
      .optional(),
    song: z
      .object({ title: z.string().trim().max(50), artist: z.string().trim().max(50) })
      .strict()
      .optional(),
    doing: z.string().trim().max(80).optional(),
  })
  .strict();
export type SetupInput = z.infer<typeof setupInputSchema>;
/** One person you follow and the latest thing they noted, for the row above the feed. */
export interface FriendNow {
  user: {
    id: string;
    name: string;
    handle: string;
    initials: string;
    color: string;
    avatarAssetId?: string;
  };
  entry: NowView;
}
/** A friend's page, live, for the home-screen widget: who, what now, what is playing. */
export interface NowWidget {
  user: {
    id: string;
    name: string;
    handle: string;
    initials: string;
    color: string;
    avatarAssetId?: string;
    bio: string;
  };
  current: NowView | null;
  listening: NowView | null;
  total: number;
}
