"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  PanelTop,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { User } from "../../../packages/contracts/src/experience";
import type { PageLook, ProfilePackage } from "../../../packages/contracts/src/profile";
import type {
  PageTab,
  PostTile,
  Timeline,
  TimelineItem,
} from "../../../packages/contracts/src/pages";
import { leads, nowIcons } from "./now";
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
  // The darker of the ground and the ink reads on a light tint, the lighter on a dark one, so a
  // cream look like the Track's gets dark words on its lime, not cream ones.
  const [dark, light] =
    lightness(look.ground) < lightness(look.ink)
      ? [look.ground, look.ink]
      : [look.ink, look.ground];
  const tintVars = Object.fromEntries(
    [0, 1, 2, 3].flatMap((i) => {
      const tint = tints[i % tints.length]!;
      return [
        [`--page-tint-${i + 1}`, tint],
        [`--page-tint-${i + 1}-ink`, lightness(tint) > 0.5 ? dark : light],
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
  // Under a look the page's name is set big with a second voice under it, as the
  // landing sets the name with the rest of it in italic.
  const voice = page === "posts" ? "all of them" : "day by day";
  const line =
    page === "posts"
      ? `${user.name} · ${posts === undefined ? `@${user.handle}` : posts === 0 ? "no posts yet" : `${posts} ${posts === 1 ? "post" : "posts"}`}`
      : `${user.name}'s days, read from posts and moments`;
  return (
    <header className="page-head">
      {!look && <Avatar user={user} />}
      <div>
        <h1>
          {look ? (
            <>
              {name} <em>{voice}</em>
            </>
          ) : (
            user.name
          )}
        </h1>
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
      {/* Newest first, whatever order the feed ranked them in, so the numbers count from the
          latest post. */}
      {[...posts]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((post, i) => {
          const span = spans[i % spans.length]!;
          const style = {
            gridColumn: span.right ? `3 / span ${span.col}` : `span ${span.col}`,
            gridRow: `span ${span.row}`,
          };
          const shape = span.row > 1 ? "collage-big" : span.col === 3 ? "collage-wide" : "";
          const body = (
            <>
              {post.hasCover ? (
                <img src={cover(post)} alt="" loading="lazy" />
              ) : (
                <span className="collage-blank" aria-hidden="true" />
              )}
              {/* The post's place on the wall, counted from the newest. */}
              <span className="collage-no" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="collage-cap">
                <strong>{post.title}</strong>
                <small>{shortDate(post.createdAt)}</small>
              </span>
            </>
          );
          return (
            <li key={post.id} style={style} className={shape || undefined}>
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

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** A day's name and, for today and yesterday, the date beside it. */
const dayLabel = (iso: string, today = new Date()) => {
  const day = new Date(iso);
  const diff = Math.round((startOfDay(today) - startOfDay(day)) / 86_400_000);
  const date = day.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
  if (diff === 0) return { name: "Today", date };
  if (diff === 1) return { name: "Yesterday", date };
  return { name: day.toLocaleDateString(undefined, { weekday: "short" }), date };
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
const itemKey = (item: TimelineItem) =>
  item.kind === "post"
    ? `post:${item.post.id}`
    : item.kind === "moment"
      ? `moment:${item.card.gatheringId}`
      : `now:${item.entry.id}`;
const momentCover = (id: string) => `/api/public/gatherings/${encodeURIComponent(id)}/cover`;

/** What a story says, whatever it was read from: a picture, a title and the line under it. */
function storyFace(item: TimelineItem, cover: (post: PostTile) => string) {
  if (item.kind === "post")
    return {
      image: item.post.hasCover ? cover(item.post) : undefined,
      title: item.post.title,
      line: item.post.caption,
    };
  if (item.kind === "moment")
    return {
      image: item.card.cover ? momentCover(item.card.gatheringId) : undefined,
      title: item.card.title,
      line: `${item.card.place} · ${item.card.people} came`,
    };
  const lead = leads[item.entry.kind];
  return {
    image: undefined,
    title: item.entry.text,
    line: [lead, item.entry.by].filter(Boolean).join(" · "),
  };
}

type Day = { key: string; name: string; date: string; items: TimelineItem[] };

/**
 * Stories are the days: what was posted, what was playing, where they were, which moments
 * they came to. Read from the archive, never typed, and kept for as long as the account is.
 * Each day is a shelf of upright stories, newest first; a story opens full screen and the
 * viewer runs on through the days from there.
 */
export function Stories({
  path,
  who,
  cover,
  onOpenPost,
  postHref,
  empty,
}: {
  /** API path of the timeline, member or public. */
  path: string;
  /** Whose days these are, for the head of the full-screen story. */
  who?: string;
  cover: (post: PostTile) => string;
  onOpenPost?: (post: PostTile) => void;
  postHref?: (post: PostTile) => string;
  empty: string;
}) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    api<Timeline>(path).then(setTimeline, () => setTimeline({ items: [], posts: 0 }));
  }, [path]);
  if (!timeline) return <p className="page-empty" aria-busy="true" />;
  if (!timeline.items.length) return <p className="page-empty">{empty}</p>;
  const days: Day[] = [];
  for (const item of timeline.items) {
    const key = dayKey(item.at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, ...dayLabel(item.at), items: [item] });
  }
  // The viewer walks the stories in the order the shelves show them.
  const flat = days.flatMap((day) => day.items.map((item) => ({ item, day })));
  let n = 0;
  return (
    <>
      <ol className="stories" aria-label="Stories">
        {days.map((day) => (
          <li key={day.key} className="story-day">
            <h2>
              <span className="story-day-name">{day.name}</span>
              <span className="story-day-date">{day.date}</span>
              <span className="story-day-count">{day.items.length}</span>
            </h2>
            <ul className="story-shelf">
              {day.items.map((item) => {
                const index = n++;
                const face = storyFace(item, cover);
                const Icon = item.kind === "now" ? nowIcons[item.entry.kind] : null;
                return (
                  <li key={itemKey(item)} className={`story-tile story-${item.kind}`}>
                    <button
                      aria-label={`${face.title}, ${day.name} at ${clock(item.at)}`}
                      onClick={() => setOpen(index)}
                    >
                      {face.image ? (
                        <img src={face.image} alt="" loading="lazy" />
                      ) : (
                        <span className="story-blank" aria-hidden="true" />
                      )}
                      <time dateTime={item.at}>{clock(item.at)}</time>
                      <span className="story-cap">
                        {Icon && <Icon size={16} aria-hidden="true" />}
                        <strong>{face.title}</strong>
                        {face.line && <small>{face.line}</small>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      {open !== null && flat[open] && (
        <StoryViewer
          stories={flat}
          index={open}
          who={who}
          cover={cover}
          onMove={setOpen}
          onClose={() => setOpen(null)}
          onOpenPost={onOpenPost}
          postHref={postHref}
        />
      )}
    </>
  );
}

const storyMs = 6000;
/**
 * One story full screen: the day's progress along the top, a tap on the right or left half to
 * go on or back, the title as a block of paint. It runs on by itself unless the person asked
 * for less motion; the last story closes it.
 */
function StoryViewer({
  stories,
  index,
  who,
  cover,
  onMove,
  onClose,
  onOpenPost,
  postHref,
}: {
  stories: { item: TimelineItem; day: Day }[];
  index: number;
  who?: string | undefined;
  cover: (post: PostTile) => string;
  onMove: (index: number) => void;
  onClose: () => void;
  onOpenPost?: ((post: PostTile) => void) | undefined;
  postHref?: ((post: PostTile) => string) | undefined;
}) {
  const { item, day } = stories[index]!;
  const face = storyFace(item, cover);
  const [still, setStill] = useState(false);
  const next = () => (index + 1 < stories.length ? onMove(index + 1) : onClose());
  const back = () => onMove(Math.max(0, index - 1));
  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });
  const inDay = day.items.indexOf(item);
  // The story's own tint behind it, the next one for the block its title is set on.
  const tint = (index % 4) + 1;
  const sticker = (tint % 4) + 1;
  const Icon = item.kind === "now" ? nowIcons[item.entry.kind] : null;
  return (
    <div
      className="story-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Story: ${face.title}`}
      style={
        {
          "--story-tint": `var(--page-tint-${tint}, var(--accent, #6b5cff))`,
          "--story-sticker": `var(--page-tint-${sticker}, var(--accent, #6b5cff))`,
          "--story-sticker-ink": `var(--page-tint-${sticker}-ink, #fff)`,
        } as CSSProperties
      }
    >
      {face.image ? (
        <img className="story-viewer-bg" src={face.image} alt="" />
      ) : (
        <span className="story-viewer-bg story-viewer-blank" aria-hidden="true" />
      )}
      <div className="story-viewer-bars" aria-hidden="true">
        {day.items.map((it, i) => (
          <i key={itemKey(it)} className={i < inDay ? "done" : i === inDay ? "on" : undefined}>
            {i === inDay && (
              <b
                key={index}
                className={still ? "still" : undefined}
                style={{ animationDuration: `${storyMs}ms` }}
                onAnimationEnd={next}
              />
            )}
          </i>
        ))}
      </div>
      <header className="story-viewer-head">
        {who && <span className="story-viewer-mark">{who.slice(0, 1)}</span>}
        <span>
          {who && <strong>{who}</strong>}
          <small>
            {day.name} · {clock(item.at)}
          </small>
        </span>
        <button className="story-viewer-close" aria-label="Close story" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <button className="story-viewer-zone back" aria-label="Previous story" onClick={back}>
        <ChevronLeft size={28} aria-hidden="true" />
      </button>
      <button className="story-viewer-zone next" aria-label="Next story" onClick={next}>
        <ChevronRight size={28} aria-hidden="true" />
      </button>
      <div className="story-viewer-say">
        <p className="story-viewer-title">
          {Icon && <Icon size={22} aria-hidden="true" />}
          {face.title}
        </p>
        {face.line && <p className="story-viewer-line">{face.line}</p>}
      </div>
      {item.kind === "post" &&
        (postHref ? (
          <a className="story-viewer-go" href={postHref(item.post)}>
            Open post <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ) : (
          onOpenPost && (
            <button
              className="story-viewer-go"
              onClick={() => {
                onClose();
                onOpenPost(item.post);
              }}
            >
              Open post <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          )
        ))}
      {item.kind === "moment" && (
        <a className="story-viewer-go" href={`/m/${encodeURIComponent(item.card.gatheringId)}`}>
          Open moment <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
