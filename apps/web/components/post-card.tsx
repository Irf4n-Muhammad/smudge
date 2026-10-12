"use client";
import { useEffect, useState } from "react";
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
  Link2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { CommentList } from "./comments";
import type { CommentItem } from "./comments";
import { MentionText } from "./mention-text";
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
  onEdit,
  onUser,
  openComments: startOpen = false,
}: {
  post: DecoratedPost;
  boot: Boot;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
  onFollow: () => void;
  onProfile: () => void;
  onReuse: () => void;
  onSkip: () => void;
  /** Owner only: open this post's draft in the editor it was made with. */
  onEdit?: () => void;
  /** Opens a profile from an @mention. */
  onUser?: (userId: string) => void;
  /** Show comments from the start (a post opened from a notification or link). */
  openComments?: boolean;
}) {
  const stage = post.manifest.schemaVersion === 2 ? post.manifest.stage : undefined;
  const [commentsOpen, setCommentsOpen] = useState(false),
    [comments, setComments] = useState<CommentItem[]>([]),
    [comment, setComment] = useState(""),
    [replyTo, setReplyTo] = useState<CommentItem | null>(null),
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
  const mine = post.ownerId === boot.actor.userId;
  const userByHandle = (handle: string) => boot.users.find((u) => u.handle === handle);
  async function loadComments() {
    const list = await api<{ id: string; userId: string; text: string; parentId?: string }[]>(
      `/posts/${post.id}/comments`,
    );
    setComments(
      list.map((c) => {
        const u = boot.users.find((x) => x.id === c.userId);
        return {
          id: c.id,
          text: c.text,
          parentId: c.parentId,
          author: u ? { id: u.id, name: u.name, handle: u.handle } : null,
        };
      }),
    );
  }
  async function openComments() {
    try {
      await loadComments();
      setCommentsOpen((v) => !v);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  useEffect(() => {
    if (startOpen) void openComments();
    // Opening once on arrival; later toggles are the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function copyLink() {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Link copied. Anyone with it can see this post.");
    } catch {
      notify(url);
    }
  }
  async function remove() {
    if (!window.confirm(`Delete “${post.metadata.title}”? Likes and comments go with it.`)) return;
    try {
      await api(`/posts/${post.id}`, undefined, "DELETE");
      notify("Post deleted. Its draft is still in your studio.");
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function removeComment(c: CommentItem) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api(`/comments/${c.id}`, undefined, "DELETE");
      await loadComments();
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api(`/posts/${post.id}/comments`, {
        text: comment,
        ...(replyTo ? { parentId: replyTo.id } : {}),
      });
      setComment("");
      setReplyTo(null);
      await loadComments();
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
              {post.editedAt && (
                <>
                  <span className="meta-dot">·</span>
                  <span title={new Date(post.editedAt).toLocaleString()}>Edited</span>
                </>
              )}
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
                {mine && !moment && onEdit && (
                  <button
                    onClick={() => {
                      setMenu(false);
                      onEdit();
                    }}
                  >
                    <Pencil size={14} />
                    Edit post
                  </button>
                )}
                {!moment && (
                  <button
                    onClick={() => {
                      setMenu(false);
                      void copyLink();
                    }}
                  >
                    <Link2 size={14} />
                    Copy link
                  </button>
                )}
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
                {mine ? (
                  <button
                    className="danger"
                    onClick={() => {
                      setMenu(false);
                      void remove();
                    }}
                  >
                    <Trash2 size={14} />
                    Delete post
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMenu(false);
                      setReporting(true);
                    }}
                  >
                    <Flag size={14} />
                    Report post
                  </button>
                )}
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
            version={post.revision}
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
          <strong>{post.author.handle}</strong>{" "}
          <MentionText
            text={post.metadata.caption}
            known={(h) => !!userByHandle(h)}
            onOpen={(h) => onUser?.(userByHandle(h)!.id)}
          />
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
            <CommentList
              comments={comments}
              known={(h) => !!userByHandle(h)}
              onOpen={(h) => onUser?.(userByHandle(h)!.id)}
              onReply={(c) => {
                setReplyTo(c);
                if (c.author && c.author.id !== boot.actor.userId && !comment.trim())
                  setComment(`@${c.author.handle} `);
              }}
              canDelete={(c) => mine || c.author?.id === boot.actor.userId}
              onDelete={(c) => void removeComment(c)}
            />
            {replyTo && (
              <div className="replying-to">
                Replying to {replyTo.author?.name ?? "a comment"}
                <button
                  type="button"
                  aria-label="Cancel reply"
                  onClick={() => {
                    setReplyTo(null);
                    if (comment.trim() === `@${replyTo.author?.handle}`) setComment("");
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <form onSubmit={submit}>
              <input
                aria-label={replyTo ? "Write a reply" : "Write a comment"}
                placeholder={replyTo ? "Write a reply…" : "Leave a little thought…"}
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
