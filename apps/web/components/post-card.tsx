"use client";
import { useEffect, useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import {
  MoreHorizontal,
  Share2,
  Copy,
  Flag,
  Heart,
  MessageCircle,
  Layers,
  Bookmark,
  ArrowDown,
  ArrowUpRight,
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
import { Avatar, askConfirm } from "./ui";
import { PostLink } from "./post-link";
import { labels } from "./types";
import type { Boot } from "./types";
import {
  DecorCredit,
  DecorFrame,
  FullScreenButton,
  FullScreenPost,
  MomentCover,
  GatheringMark,
  MomentMark,
  ReactionBar,
  themeStyle,
} from "./post-decor";
import type { DecoratedPost } from "./post-decor";
import { glowFor } from "./gallery";
import { FriendAnswers } from "./friend-answers";
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
  onFormat,
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
  /** Opens the page that gathers every version of a format, by its original post. */
  onFormat?: (rootId: string) => void;
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
    [reporting, setReporting] = useState(false),
    /** Bumps when you answer inside the post, so the answers line under it catches up. */
    [answered, setAnswered] = useState(0);
  const takesAnswers = (post.manifest.capabilities as string[]).includes("answers.write");
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
    if (
      !(await askConfirm(
        "Delete this post?",
        `“${post.metadata.title}” goes away for good, with its likes and comments.`,
        "Delete post",
      ))
    )
      return;
    try {
      await api(`/posts/${post.id}`, undefined, "DELETE");
      notify("Post deleted. Its draft is still in your studio.");
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function removeComment(c: CommentItem) {
    if (!(await askConfirm("Delete this comment?", "Replies to it go too.", "Delete comment")))
      return;
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
      className={`post-card ${stage ? "world-stage" : "classic-post"} ${post.decoration ? "themed" : ""}`}
      style={
        {
          ...glowFor(post.id, stage),
          ...themeStyle(post.decoration),
          ...(stage && {
            "--scene-bg": stage.background,
            "--scene-ink": stage.ink,
            "--scene-night": stage.nightBackground,
            "--scene-night-ink": stage.nightInk,
          }),
        } as CSSProperties
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
              {post.side && (
                <span
                  className={post.shared ? "side-tag shared" : "side-tag"}
                  style={{ "--side-accent": post.side.accent } as CSSProperties}
                >
                  {post.side.name}
                </span>
              )}
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
                {mine && post.side && (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      try {
                        await api(`/posts/${post.id}/share`, { everyday: !post.shared });
                        await onRefresh();
                        notify(
                          post.shared
                            ? `Back to ${post.side!.name} only.`
                            : "Now also in Everyday, for everyone who follows you.",
                        );
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <Share2 size={14} />
                    {post.shared ? `Only in ${post.side.name}` : "Also show in Everyday"}
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
                      if ((await toggleBlock(post.author, notify, () => void onRefresh())) !== null)
                        await onRefresh();
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
      <div className="world-window">
        <DecorFrame post={post}>
          {moment ? (
            <MomentCover post={post} onOpen={() => setFull(true)} />
          ) : (
            <Runtime
              target={post.id}
              version={post.revision}
              height={stage?.height ?? (post.metadata.format === "scrapbook" ? 510 : 460)}
              onSkip={onSkip}
              onAnswer={() => setAnswered((n) => n + 1)}
              clip
            />
          )}
        </DecorFrame>
        {!moment && !stage && (
          <>
            <button
              className="world-enter"
              aria-label={`Enter world: ${post.metadata.title}`}
              onClick={() => setFull(true)}
            >
              <em>Enter world</em>
              <span>
                <ArrowUpRight size={16} />
              </span>
            </button>
          </>
        )}
      </div>
      <PostLink post={post} notify={notify} onOpenSelf={() => setFull(true)} />
      {full && (
        <FullScreenPost
          post={post}
          notify={notify}
          onClose={() => {
            setFull(false);
            setAnswered((n) => n + 1);
          }}
        />
      )}
      <div className="post-body">
        {moment && (
          <div className="moment-line">
            <MomentMark post={post} />
          </div>
        )}
        {post.metadata.gathering && (
          <div className="moment-line">
            <GatheringMark post={post} />
          </div>
        )}
        {takesAnswers && <FriendAnswers postId={post.id} version={answered} />}
        {onFormat && <FormatMark post={post} onOpen={onFormat} />}
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

/** Where a post sits in its format: "Version 3 of Rina's format", or how many versions it has. */
function FormatMark({ post, onOpen }: { post: DecoratedPost; onOpen: (rootId: string) => void }) {
  const remix = post.remix;
  if (!remix && !post.versions) return null;
  const label = remix
    ? `Version ${remix.index} of ${remix.root ? `${remix.root.author.name}’s “${remix.root.title}”` : "a format"}`
    : `${post.versions} ${post.versions === 1 ? "version" : "versions"} of this format`;
  return (
    <div className="moment-line">
      <button
        className="moment-mark gathering-mark format-mark"
        onClick={() => onOpen(remix?.rootId ?? post.id)}
      >
        <Layers size={13} /> {label}
      </button>
    </div>
  );
}
