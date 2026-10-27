import type { MemoryCard } from "../../contracts/src/gatherings.js";
import type { PostTile, Timeline, TimelineItem } from "../../contracts/src/pages.js";
import type { Store } from "./database.js";
import type { NowService } from "./now.js";
import type { Publication, SocialService } from "./social.js";

/**
 * The fixed pages (ADR 0045): a person's posts as tiles, and their stories as a timeline of
 * days built from posts, "right now" entries and moments. Both read through the same audience
 * rules as the feed, so a guest, a follower and the owner each see their own version.
 */
export class PagesService {
  /** A moment is a post too; those belong to the moment, not the Posts page. */
  isMoment: (postId: string) => boolean = () => false;
  /** The memory cards this viewer may see on someone's page (GatheringDay.cards). */
  cards: (viewerId: string, ownerId: string) => MemoryCard[] = () => [];
  constructor(
    private readonly store: Store,
    private readonly social: SocialService,
    private readonly now: NowService,
  ) {}

  posts(viewerId: string, ownerId: string): PostTile[] {
    return this.store
      .all<Publication>("post")
      .filter((p) => p.ownerId === ownerId && !this.isMoment(p.id))
      .filter((p) => this.social.viewFilter(viewerId, p))
      .reverse()
      .map((p) => ({
        id: p.id,
        title: p.metadata.title,
        caption: p.metadata.caption,
        hasCover: !!p.metadata.coverAssetId,
        ...(p.metadata.coverAssetId ? { coverAssetId: p.metadata.coverAssetId } : {}),
        createdAt: p.createdAt,
      }));
  }

  timeline(viewerId: string, ownerId: string): Timeline {
    const posts = this.posts(viewerId, ownerId);
    const items: TimelineItem[] = posts.map((post) => ({ kind: "post", at: post.createdAt, post }));
    // A post already appears as a tile; its "posted" entry would say the same thing twice.
    for (const entry of this.now.archive(viewerId, ownerId).entries)
      if (entry.kind !== "posted") items.push({ kind: "now", at: entry.at, entry });
    // A moment has a day, not a time; noon keeps it on that day in every time zone.
    for (const card of this.cards(viewerId, ownerId))
      items.push({ kind: "moment", at: `${card.date}T12:00:00.000Z`, card });
    items.sort((a, b) => b.at.localeCompare(a.at));
    return { items, posts: posts.length };
  }
}
