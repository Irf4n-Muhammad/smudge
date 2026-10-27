"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Image as ImageIcon, Layers, PanelTop, Pencil, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import type { User } from "../../../packages/contracts/src/experience";
import type { PageLook, ProfilePackage } from "../../../packages/contracts/src/profile";
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
const displayFonts: Record<PageLook["display"], string> = {
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
  hand: "var(--hand, inherit)",
  sans: "var(--ui, inherit)",
};
const labelFonts: Record<PageLook["label"], string> = {
  mono: "ui-monospace, Menlo, Consolas, monospace",
  sans: "var(--ui, inherit)",
};
/** Relative luminance of a #rrggbb colour, enough to pick dark or light ink for it. */
const lightness = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/**
 * A look's tokens as CSS variables (ADR 0049): the fixed pages and the strip read them, so the
 * three pages feel like one. A page without a look leaves the app's own colours in place.
 */
export function lookStyle(manifest: ProfilePackage["manifest"] | null | undefined): {
  className: string;
  style: CSSProperties | undefined;
} {
  const look = manifest?.schemaVersion === 2 ? manifest.look : undefined;
  if (!look) return { className: "", style: undefined };
  // Blocks without a picture take the tints in turn (ADR 0052), the accent alone without them;
  // each carries the ink that reads on it.
  const tints = look.tints?.length ? look.tints : [look.accent];
  const tintVars = Object.fromEntries(
    [0, 1, 2, 3].flatMap((i) => {
      const tint = tints[i % tints.length]!;
      return [
        [`--page-tint-${i + 1}`, tint],
        [`--page-tint-${i + 1}-ink`, lightness(tint) > 0.5 ? look.ground : look.ink],
      ];
    }),
  );
  return {
    className: "has-look",
    style: {
      ...tintVars,
      "--page-ground": look.ground,
      "--page-ink": look.ink,
      "--page-muted": look.muted,
      "--page-card": look.card,
      "--page-accent": look.accent,
      "--page-display": displayFonts[look.display],
      "--page-label": labelFonts[look.label],
      "--strip-bg": look.ink,
      "--strip-ink": look.ground,
      "--strip-on": look.ground,
      "--strip-on-ink": look.ink,
      "--strip-action-bg": look.accent,
      "--strip-action-ink": look.ground,
    } as CSSProperties,
  };
}
/**
 * The one action next to the tabs (ADR 0048): Edit for the owner, Follow for everyone else. It
 * sits in the thumb zone with the strip, so no page needs a button of its own for it.
 */
export type StripAction = {
  label: string;
  /** Only the pencil is drawn as an icon; a worded action shows its label. */
  icon?: "edit";
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
};
export function PageStrip({
  current,
  posts,
  href,
  onPick,
  action,
}: {
  current: PageTab;
  posts?: number;
  /** Guests get links (the share pages); members switch in place. */
  href?: (tab: PageTab) => string;
  onPick?: (tab: PageTab) => void;
  action?: StripAction;
}) {
  const body: ReactNode =
    action?.icon === "edit" ? <Pencil size={20} aria-hidden="true" /> : action?.label;
  return (
    <div className="page-strip">
      <nav className="page-strip-tabs" aria-label="Pages">
        {tabs.map(({ tab, label, icon: Icon }) => {
          const on = tab === current;
          const inner = (
            <>
              <Icon size={15} aria-hidden="true" />
              {label}
              {tab === "posts" && posts !== undefined && posts > 0 && <small>{posts}</small>}
            </>
          );
          return href ? (
            <a key={tab} href={href(tab)} aria-current={on ? "page" : undefined}>
              {inner}
            </a>
          ) : (
            <button key={tab} aria-current={on ? "page" : undefined} onClick={() => onPick?.(tab)}>
              {inner}
            </button>
          );
        })}
      </nav>
      {action &&
        (action.href ? (
          <a className="page-strip-action" href={action.href} aria-label={action.label}>
            {body}
          </a>
        ) : (
          <button
            className="page-strip-action"
            aria-label={action.label}
            aria-pressed={action.pressed}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {body}
          </button>
        ))}
    </div>
  );
}

/**
 * The head of a fixed page: who this is, with no counts of followers. Under a look (ADR 0049)
 * the page's own name is the big word and the person is the line under it, as on their landing.
 */
export function PageHead({
  user,
  page,
  look,
  posts,
}: {
  user: User;
  page: "posts" | "stories";
  look?: boolean;
  /** How many posts there are, for the line under "Posts" (ADR 0052). */
  posts?: number;
}) {
  const name = page === "posts" ? "Posts" : "Stories";
  const line =
    page === "posts"
      ? `${user.name} · ${posts === undefined ? `@${user.handle}` : posts === 0 ? "no posts yet" : `${posts} ${posts === 1 ? "post" : "posts"}`}`
      : `${user.name}'s days, read from posts and moments`;
  return (
    <header className="page-head">
      {!look && <Avatar user={user} />}
      <div>
        <h1>{look ? name : user.name}</h1>
        <small>{look ? line : `@${user.handle} · ${name}`}</small>
        {user.bio && !look && <p>{user.bio}</p>}
      </div>
    </header>
  );
}

/**
 * Posts as a collage, not a three-column grid (ADR 0052's pattern): one big tile with two small
 * ones beside it, two wide ones, then a small one with the big tile on the other side, and
 * round again. Fixed patterns keep it tidy whatever the count; a look can tilt or recolour the
 * tiles, not reflow them.
 */
const spans = [
  { col: 4, row: 2 },
  { col: 2, row: 1 },
  { col: 2, row: 1 },
  { col: 3, row: 1 },
  { col: 3, row: 1 },
  { col: 2, row: 1 },
  { col: 4, row: 2, right: true },
  { col: 2, row: 1 },
];
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export function PostsCollage({
  posts,
  cover,
  onOpen,
  href,
  empty,
  onCreate,
}: {
  posts: PostTile[];
  cover: (post: PostTile) => string;
  onOpen?: (post: PostTile) => void;
  href?: (post: PostTile) => string;
  empty: string;
  /** The owner's way to the composer; with it, the empty collage is an invitation (ADR 0051). */
  onCreate?: (() => void) | undefined;
}) {
  if (!posts.length)
    return (
      <div className="collage collage-empty" role="status">
        <p className="collage-ghost collage-ghost-big">
          <span>{empty}</span>
          {onCreate && (
            <button className="collage-first" onClick={onCreate}>
              <Plus size={16} aria-hidden="true" /> Write your first post
            </button>
          )}
        </p>
        <span className="collage-ghost" aria-hidden="true" />
        <span className="collage-ghost" aria-hidden="true" />
        <span className="collage-ghost collage-ghost-wide" aria-hidden="true" />
        <span className="collage-ghost collage-ghost-wide" aria-hidden="true" />
      </div>
    );
  return (
    <ul className="collage" aria-label="Posts">
      {posts.map((post, i) => {
        const span = spans[i % spans.length]!;
        const style = {
          gridColumn: span.right ? `3 / span ${span.col}` : `span ${span.col}`,
          gridRow: `span ${span.row}`,
        };
        const body = (
          <>
            {post.hasCover ? (
              <img src={cover(post)} alt="" loading="lazy" />
            ) : (
              <span className="collage-blank" aria-hidden="true" />
            )}
            <span className="collage-cap">
              <strong>{post.title}</strong>
              {span.row > 1 && <small>{shortDate(post.createdAt)}</small>}
            </span>
          </>
        );
        return (
          <li key={post.id} style={style} className={span.row > 1 ? "collage-big" : undefined}>
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
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
              const at = <time dateTime={item.at}>{clock(item.at)}</time>;
              if (item.kind === "post")
                return (
                  <li key={`post:${item.post.id}`} className="story-post">
                    {at}
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
                    {at}
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
                  {at}
                  <span className="story-entry">
                    <Entry entry={item.entry} />
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
/** A post in the day: its cover small on the left, its title beside it, as one line of the day. */
function StoryTile({ post, cover }: { post: PostTile; cover: (post: PostTile) => string }) {
  return (
    <>
      {post.hasCover ? (
        <img src={cover(post)} alt="" loading="lazy" />
      ) : (
        <span className="story-blank" aria-hidden="true" />
      )}
      <span className="story-cap">
        <strong>{post.title}</strong>
        <small>Post{post.caption ? ` · ${post.caption}` : ""}</small>
      </span>
    </>
  );
}
