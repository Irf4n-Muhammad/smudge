import type { MemoryCard } from "./gatherings.js";
import type { NowView } from "./now.js";

/**
 * The fixed pages every person has (ADR 0045). The landing page is theirs to make; Posts and
 * Stories are Smudge's, the same shape under every look, and the strip that leads to them is
 * drawn by the app, outside the page, so no page can lose it.
 */
export const fixedPages = ["posts", "stories"] as const;
export type FixedPage = (typeof fixedPages)[number];
export type PageTab = "page" | FixedPage;

/** One post on the Posts page: enough for a tile, the post itself opens by its id. */
export interface PostTile {
  id: string;
  title: string;
  caption: string;
  hasCover: boolean;
  coverAssetId?: string;
  createdAt: string;
}
/**
 * Stories are the days, read from what happened (ADR 0044's rule): posts, "right now" entries
 * and moments. Nothing is posted as a story; the viewer groups the items by local day.
 */
export type TimelineItem =
  | { kind: "post"; at: string; post: PostTile }
  | { kind: "now"; at: string; entry: NowView }
  | { kind: "moment"; at: string; card: MemoryCard };
export interface Timeline {
  items: TimelineItem[];
  /** How many posts the viewer may see, for the strip. */
  posts: number;
}
