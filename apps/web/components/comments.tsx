"use client";
import { MentionText } from "./mention-text";

export interface CommentItem {
  id: string;
  text: string;
  parentId?: string | undefined;
  author: { id: string; name: string; handle: string } | null;
}

/**
 * Top-level comments with their replies beneath. A reply whose comment is not shown (its author
 * is hidden from this viewer) is left out too, so it never appears without its context.
 */
export function CommentList({
  comments,
  known,
  onOpen,
  canDelete,
  onReply,
  onDelete,
}: {
  comments: CommentItem[];
  known: (handle: string) => boolean;
  onOpen?: (handle: string) => void;
  canDelete?: (c: CommentItem) => boolean;
  onReply?: (c: CommentItem) => void;
  onDelete?: (c: CommentItem) => void;
}) {
  const top = comments.filter((c) => !c.parentId);
  const one = (c: CommentItem, reply: boolean) => (
    <div key={c.id} className={reply ? "comment reply" : "comment"}>
      <p>
        <strong>{c.author?.name ?? "Someone"}</strong>{" "}
        <MentionText text={c.text} known={known} {...(onOpen ? { onOpen } : {})} />
      </p>
      {(onReply || (onDelete && canDelete?.(c))) && (
        <div className="comment-actions">
          {onReply && (
            <button
              type="button"
              aria-label={`Reply to ${c.author?.name ?? "comment"}`}
              onClick={() => onReply(c)}
            >
              Reply
            </button>
          )}
          {onDelete && canDelete?.(c) && (
            <button
              type="button"
              aria-label={`Delete comment by ${c.author?.name ?? "someone"}`}
              onClick={() => onDelete(c)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
  return (
    <>
      {top.map((c) => (
        <div key={c.id} className="comment-thread">
          {one(c, false)}
          {comments.filter((r) => r.parentId === c.id).map((r) => one(r, true))}
        </div>
      ))}
    </>
  );
}
