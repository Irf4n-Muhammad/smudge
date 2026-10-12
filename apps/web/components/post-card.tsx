"use client";
import { useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import {
  MoreHorizontal,
  Copy,
  Flag,
  Heart,
  MessageCircle,
  Layers,
  Bookmark,
  ArrowDown,
  Ban,
} from "lucide-react";
import { ReportDialog, toggleBlock } from "./community";
import { api, Runtime } from "./runtime";
import { Avatar } from "./ui";
import { PostLink } from "./post-link";
import { labels } from "./types";
import type { Boot } from "./types";
import {
  DecorCredit,
  DecorFrame,
  FullScreenButton,
  FullScreenPost,
  MomentCover,
  MomentMark,
  ReactionBar,
} from "./post-decor";
import type { DecoratedPost } from "./post-decor";
export function PostCard({
  post,
  boot,
  onRefresh,
  notify,
  onFollow,
  onProfile,
  onReuse,
  onSkip,
}: {
  post: DecoratedPost;
  boot: Boot;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
  onFollow: () => void;
  onProfile: () => void;
  onReuse: () => void;
  onSkip: () => void;
}) {
  const stage = post.manifest.schemaVersion === 2 ? post.manifest.stage : undefined;
  const [commentsOpen, setCommentsOpen] = useState(false),
    [comments, setComments] = useState<{ id: string; userId: string; text: string }[]>([]),
    [comment, setComment] = useState(""),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [full, setFull] = useState(false),
    [reporting, setReporting] = useState(false);
  const moment = post.moment;
  const action = async (kind: string) => {
    try {
      await api(`/posts/${post.id}/${kind}`, {});
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  async function openComments() {
    try {
      setComments(await api(`/posts/${post.id}/comments`));
      setCommentsOpen((v) => !v);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api(`/posts/${post.id}/comments`, { text: comment });
      setComment("");
      setComments(await api(`/posts/${post.id}/comments`));
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`post-card ${stage ? "world-stage" : "classic-post"}`}
      style={
        stage
          ? ({
              "--scene-bg": stage.background,
              "--scene-ink": stage.ink,
              "--scene-night": stage.nightBackground,
              "--scene-night-ink": stage.nightInk,
            } as CSSProperties)
          : undefined
      }
      tabIndex={-1}
      aria-label={`${post.metadata.title} by ${post.author.name}`}
    >
      <header className="post-header">
        <button className="author" onClick={onProfile}>
          <Avatar user={post.author} />
          <span>
            <strong>
              {post.author.name}
              <span className="author-dot">·</span>
              <small>@{post.author.handle}</small>
            </strong>
            <span>
              {moment ? moment.name : labels[post.metadata.format]}
              <span className="meta-dot">·</span>
              {new Date(post.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          </span>
        </button>
        <div className="post-header-actions">
          {post.ownerId !== boot.actor.userId && !boot.following.includes(post.ownerId) && (
            <button className="text-button" onClick={onFollow}>
              Follow
            </button>
          )}
          <div className="post-menu-wrap">
            <button
              className="icon-button"
              aria-label={`Options for ${post.metadata.title}`}
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <MoreHorizontal size={21} />
            </button>
            {menu && (
              <div className="post-menu">
                {!moment && (
                  <button
                    onClick={() => {
                      setMenu(false);
                      onReuse();
                    }}
                  >
                    <Copy size={14} />
                    Use this format
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenu(false);
                    setReporting(true);
                  }}
                >
                  <Flag size={14} />
                  Report post
                </button>
                {post.ownerId !== boot.actor.userId && (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      if ((await toggleBlock(post.author, notify)) !== null) await onRefresh();
                    }}
                  >
                    <Ban size={14} />
                    Block @{post.author.handle}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <DecorFrame post={post}>
        {moment ? (
          <MomentCover post={post} onOpen={() => setFull(true)} />
        ) : (
          <Runtime
            target={post.id}
            height={stage?.height ?? (post.metadata.format === "scrapbook" ? 510 : 460)}
            onSkip={onSkip}
          />
        )}
      </DecorFrame>
      <PostLink post={post} notify={notify} onOpenSelf={() => setFull(true)} />
      {full && <FullScreenPost post={post} notify={notify} onClose={() => setFull(false)} />}
      <div className="post-body">
        {moment && (
          <div className="moment-line">
            <MomentMark post={post} />
          </div>
        )}
        <ReactionBar post={post} notify={notify} onChange={onRefresh} />
        <div className="post-actions">
          <div>
            {/* Moments carry no public like counter: they are for the people who care. */}
            {!moment && (
              <button
                className={post.liked ? "action-button liked" : "action-button"}
                aria-label={post.liked ? "Unlike post" : "Like post"}
                aria-pressed={post.liked}
                onClick={() => void action("like")}
              >
                <Heart size={21} fill={post.liked ? "currentColor" : "none"} />
                <span>{post.likes}</span>
              </button>
            )}
            <button
              className="action-button"
              aria-label="Open comments"
              aria-expanded={commentsOpen}
              onClick={() => void openComments()}
            >
              <MessageCircle size={20} />
              <span>{post.comments}</span>
            </button>
            {!moment && (
              <button
                className="action-button reuse-action"
                aria-label="Use format"
                title="Use format"
                onClick={onReuse}
              >
                <Layers size={18} />
                <span>Use format</span>
              </button>
            )}
            <FullScreenButton onOpen={() => setFull(true)} />
          </div>
          <button
            className={post.saved ? "action-button saved" : "action-button"}
            aria-label={post.saved ? "Unsave post" : "Save post"}
            aria-pressed={post.saved}
            onClick={() => void action("save")}
          >
            <Bookmark size={21} fill={post.saved ? "currentColor" : "none"} />
          </button>
        </div>
        <p className="post-caption">
          <strong>{post.author.handle}</strong> {post.metadata.caption}
        </p>
        <DecorCredit post={post} />
        <div className="post-bottom">
          <span className={`format-tag ${post.metadata.format}`}>
            <span>✧</span>
            {moment ? moment.name : labels[post.metadata.format]}
          </span>
          <button className="skip-post" onClick={onSkip}>
            Next story <ArrowDown size={12} />
          </button>
        </div>
        {commentsOpen && (
          <section className="comments" aria-label="Comments">
            {comments.length === 0 && <p className="fineprint">Start a little conversation.</p>}
            {comments.map((c) => (
              <p key={c.id}>
                <strong>{boot.users.find((u) => u.id === c.userId)?.name ?? "Someone"}</strong>{" "}
                {c.text}
              </p>
            ))}
            <form onSubmit={submit}>
              <input
                aria-label="Write a comment"
                placeholder="Leave a little thought…"
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button disabled={busy || !comment.trim()} className="text-button">
                Post
              </button>
            </form>
          </section>
        )}
      </div>
      {reporting && (
        <ReportDialog
          postId={post.id}
          title={post.metadata.title}
          onClose={() => setReporting(false)}
          notify={notify}
        />
      )}
    </article>
  );
}
