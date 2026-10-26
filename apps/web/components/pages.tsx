"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon, Layers, PanelTop } from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import type {
  PageTab,
  PostTile,
  Timeline,
  TimelineItem,
} from "../../../packages/contracts/src/pages";
import { Entry } from "./now";
import { api } from "./runtime";
import { Avatar } from "./ui";

/**
 * The fixed pages (ADR 0045). The landing page is the person's own program; Posts and Stories
 * are Smudge's, the same under every look. The strip below is drawn by the app, outside the
 * page's iframe, so it is always there: a page may colour it, never drop it.
 */
const tabs: { tab: PageTab; label: string; icon: typeof PanelTop }[] = [
  { tab: "page", label: "Page", icon: PanelTop },
  { tab: "posts", label: "Posts", icon: ImageIcon },
  { tab: "stories", label: "Stories", icon: Layers },
];
export function PageStrip({
  current,
  posts,
  href,
  onPick,
}: {
  current: PageTab;
  posts?: number;
  /** Guests get links (the share pages); members switch in place. */
  href?: (tab: PageTab) => string;
  onPick?: (tab: PageTab) => void;
}) {
  return (
    <nav className="page-strip" aria-label="Pages">
      {tabs.map(({ tab, label, icon: Icon }) => {
        const on = tab === current;
        const body = (
          <>
            <Icon size={15} aria-hidden="true" />
            {label}
            {tab === "posts" && posts !== undefined && posts > 0 && <small>{posts}</small>}
          </>
        );
        return href ? (
          <a key={tab} href={href(tab)} aria-current={on ? "page" : undefined}>
            {body}
          </a>
        ) : (
          <button key={tab} aria-current={on ? "page" : undefined} onClick={() => onPick?.(tab)}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}

/** The head of a fixed page: who this is, with no counts of followers. */
export function PageHead({ user, page }: { user: User; page: "posts" | "stories" }) {
  return (
    <header className="page-head">
      <Avatar user={user} />
      <div>
        <h1>{user.name}</h1>
        <small>
          @{user.handle} · {page === "posts" ? "Posts" : "Stories"}
        </small>
        {user.bio && <p>{user.bio}</p>}
      </div>
    </header>
  );
}

/**
 * Posts as a collage, not a three-column grid: one big tile with two small ones beside it, then
 * two wide ones, and the big tile changes side each round. Fixed patterns keep it tidy whatever
 * the count; a look can tilt or recolour the tiles, not reflow them.
 */
const spans = [
  { col: 4, row: 2 },
  { col: 2, row: 1 },
  { col: 2, row: 1 },
  { col: 3, row: 1 },
  { col: 3, row: 1 },
];
export function PostsCollage({
  posts,
  cover,
  onOpen,
  href,
  empty,
}: {
  posts: PostTile[];
  cover: (post: PostTile) => string;
  onOpen?: (post: PostTile) => void;
  href?: (post: PostTile) => string;
  empty: string;
}) {
  if (!posts.length) return <p className="page-empty">{empty}</p>;
  return (
    <ul className="collage" aria-label="Posts">
      {posts.map((post, i) => {
        const span = spans[i % spans.length]!;
        const mirrored = Math.floor(i / spans.length) % 2 === 1 && i % spans.length === 0;
        const style = {
          gridColumn: mirrored ? `3 / span ${span.col}` : `span ${span.col}`,
          gridRow: `span ${span.row}`,
        };
        const body = (
          <>
            {post.hasCover ? (
              <img src={cover(post)} alt="" loading="lazy" />
            ) : (
              <span className="collage-blank">{post.title}</span>
            )}
            <span className="collage-cap">{post.title}</span>
          </>
        );
        return (
          <li key={post.id} style={style}>
            {href ? (
              <a href={href(post)}>{body}</a>
            ) : (
              <button onClick={() => onOpen?.(post)}>{body}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const dayLabel = (iso: string, today = new Date()) => {
  const day = new Date(iso);
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) /
      86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
};
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Stories are the days: what was posted, what was playing, where they were, which moments
 * they came to. Read from the archive, never typed, and kept for as long as the account is.
 */
export function Stories({
  path,
  cover,
  onOpenPost,
  postHref,
  empty,
}: {
  /** API path of the timeline, member or public. */
  path: string;
  cover: (post: PostTile) => string;
  onOpenPost?: (post: PostTile) => void;
  postHref?: (post: PostTile) => string;
  empty: string;
}) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  useEffect(() => {
    api<Timeline>(path).then(setTimeline, () => setTimeline({ items: [], posts: 0 }));
  }, [path]);
  if (!timeline) return <p className="page-empty" aria-busy="true" />;
  if (!timeline.items.length) return <p className="page-empty">{empty}</p>;
  const days: { key: string; label: string; items: TimelineItem[] }[] = [];
  for (const item of timeline.items) {
    const key = dayKey(item.at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(item.at), items: [item] });
  }
  return (
    <ol className="stories" aria-label="Stories">
      {days.map((day) => (
        <li key={day.key} className="story-day">
          <h2>{day.label}</h2>
          <ul>
            {day.items.map((item) => {
              if (item.kind === "post")
                return (
                  <li key={`post:${item.post.id}`} className="story-post">
                    {postHref ? (
                      <a href={postHref(item.post)}>
                        <StoryTile post={item.post} cover={cover} />
                      </a>
                    ) : (
                      <button onClick={() => onOpenPost?.(item.post)}>
                        <StoryTile post={item.post} cover={cover} />
                      </button>
                    )}
                  </li>
                );
              if (item.kind === "moment")
                return (
                  <li key={`moment:${item.card.gatheringId}`} className="story-moment">
                    <a href={`/m/${encodeURIComponent(item.card.gatheringId)}`}>
                      {item.card.cover && (
                        <img
                          src={`/api/public/gatherings/${encodeURIComponent(item.card.gatheringId)}/cover`}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <span>
                        <strong>{item.card.title}</strong>
                        <small>
                          {item.card.place} · {item.card.people} came
                        </small>
                      </span>
                    </a>
                  </li>
                );
              return (
                <li key={`now:${item.entry.id}`} className="story-now">
                  <Entry entry={item.entry} />
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
function StoryTile({ post, cover }: { post: PostTile; cover: (post: PostTile) => string }) {
  return (
    <>
      {post.hasCover ? (
        <img src={cover(post)} alt="" loading="lazy" />
      ) : (
        <span className="collage-blank">{post.title}</span>
      )}
      <span className="story-cap">{post.title}</span>
    </>
  );
}
