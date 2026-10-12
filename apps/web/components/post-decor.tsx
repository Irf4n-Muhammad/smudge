"use client";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BadgeCheck, Maximize2 } from "lucide-react";
import type { PostView } from "../../../packages/contracts/src/experience";
import type { OverlayPiece, PostDecor, Sticker } from "../../../packages/contracts/src/identity";
import { api, Runtime } from "./runtime";
import { PageSheet } from "./page-sheet";

export type DecoratedPost = PostView & Partial<PostDecor>;

const place = (p: OverlayPiece): CSSProperties => {
  const style: CSSProperties = { width: p.width, height: p.height };
  if (p.anchor.startsWith("top")) style.top = p.dy;
  if (p.anchor.startsWith("bottom")) style.bottom = -p.dy - p.height;
  if (p.anchor === "top") style.left = `calc(50% + ${p.dx}px)`;
  if (p.anchor.endsWith("left")) style.left = p.dx;
  if (p.anchor.endsWith("right") || p.anchor === "right") style.right = -p.dx - p.width;
  if (p.anchor === "right") style.top = `calc(50% + ${p.dy}px)`;
  return style;
};

/**
 * Transparent decoration that clings to the post edges. The post itself keeps its standard
 * shape; pieces sit outside or over the border and never take clicks.
 */
export function DecorFrame({ post, children }: { post: DecoratedPost; children: ReactNode }) {
  const d = post.decoration;
  return (
    <div
      className={`decor-frame ${d ? "has-decor" : ""}`}
      style={d ? ({ "--decor-accent": d.accent } as CSSProperties) : undefined}
    >
      {children}
      {d?.pieces.map((p, i) => (
        <span
          key={i}
          className={`decor-piece decor-${p.anchor}`}
          style={place(p)}
          aria-hidden="true"
          // Pieces come from the trusted host catalog, never from post packages or users.
          dangerouslySetInnerHTML={{ __html: p.svg }}
        />
      ))}
    </div>
  );
}

export function DecorCredit({ post }: { post: DecoratedPost }) {
  const d = post.decoration;
  if (!d) return null;
  return (
    <p className="decor-credit">
      {d.tier === "seasonal" ? "Season decoration" : "Decoration"} <strong>{d.name}</strong> by @
      {d.creator}
      {d.sponsor ? ` · with ${d.sponsor}` : ""}
    </p>
  );
}

export function StickerGlyph({ sticker }: { sticker: Sticker }) {
  return sticker.svg ? (
    <span
      className="sticker-glyph"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: sticker.svg }}
    />
  ) : (
    <span className="sticker-text">{sticker.label}</span>
  );
}

/** One preset reaction per person. Text input and drawing are deliberately not offered. */
export function ReactionBar({
  post,
  notify,
  onChange,
}: {
  post: DecoratedPost;
  notify: (s: string) => void;
  onChange: () => Promise<void>;
}) {
  const r = post.reactions;
  if (!r) return null;
  return (
    <div className="reaction-bar" role="group" aria-label="React with a sticker">
      {r.options.map((o) => (
        <button
          key={o.id}
          className={`reaction ${r.mine === o.id ? "mine" : ""} ${o.svg ? "emote" : "text"}`}
          aria-pressed={r.mine === o.id}
          aria-label={`${r.mine === o.id ? "Remove" : "React with"} ${o.label}`}
          title={o.label}
          onClick={async () => {
            try {
              await api(`/posts/${post.id}/reactions`, { sticker: r.mine === o.id ? null : o.id });
              await onChange();
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          <StickerGlyph sticker={o} />
          {!post.hideCounts && (r.counts[o.id] ?? 0) > 0 && <span>{r.counts[o.id]}</span>}
        </button>
      ))}
    </div>
  );
}

export function MomentMark({ post }: { post: DecoratedPost }) {
  const m = post.moment;
  if (!m) return null;
  return (
    <span className={`moment-mark ${m.verified ? "verified" : ""}`}>
      {m.verified && <BadgeCheck size={13} />}
      {m.name}
      {m.verified && m.proof ? ` · ${m.proof}` : m.kind === "paper" ? "" : " · proof ended"}
      {m.audience === "circle" ? " · Close circle" : ""}
    </span>
  );
}

/** A moment shows as a cover in the feed and opens full screen, without leaving the app. */
export function MomentCover({ post, onOpen }: { post: DecoratedPost; onOpen: () => void }) {
  const cover = post.metadata.coverAssetId;
  return (
    <button className="moment-cover" onClick={onOpen} aria-label={`Open ${post.metadata.title}`}>
      {cover && <img src={`/api/assets/${cover}`} alt="" />}
      <span className="moment-cover-text">
        <small>
          {post.moment?.name}
          {post.moment?.verified ? " · Verified" : ""}
        </small>
        <strong>{post.metadata.title}</strong>
        <span className="moment-cover-open">Open</span>
      </span>
    </button>
  );
}

export function FullScreenPost({
  post,
  onClose,
  notify,
}: {
  post: DecoratedPost;
  onClose: () => void;
  notify?: (message: string) => void;
}) {
  const [height, setHeight] = useState(800);
  useEffect(() => {
    // Sheet gap on top (48), its bar (64) and the bottom margin (8).
    const update = () => setHeight(Math.max(420, window.innerHeight - 120));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <PageSheet
      title={post.metadata.title}
      site={`@${post.author.handle}`}
      made
      onClose={onClose}
      notify={notify}
    >
      <div className="fullscreen-post">
        <MomentMark post={post} />
        <Runtime target={post.id} height={height} />
      </div>
    </PageSheet>
  );
}

export function FullScreenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      className="action-button"
      aria-label="Open full screen"
      title="Open full screen"
      onClick={onOpen}
    >
      <Maximize2 size={18} />
    </button>
  );
}
