"use client";
import { Fragment } from "react";

/** Same shape the server notifies for (see mentionedHandles in packages/core/src/social.ts). */
const mention = /(^|[^a-z0-9._@])@([a-z0-9._]{3,24})/gi;

/**
 * Plain text with @handles turned into profile links. Only handles in `known` become links, so a
 * stray "@" never points at a page that does not exist. Without `onOpen` the link is a share link.
 */
export function MentionText({
  text,
  known,
  onOpen,
}: {
  text: string;
  known: (handle: string) => boolean;
  onOpen?: (handle: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(mention)) {
    const handle = match[2]!.replace(/\.+$/, "");
    if (!known(handle.toLowerCase())) continue;
    const start = match.index! + match[1]!.length;
    parts.push(text.slice(last, start));
    parts.push(
      <a
        key={start}
        className="mention"
        href={`/u/${encodeURIComponent(handle.toLowerCase())}`}
        onClick={
          onOpen
            ? (e) => {
                e.preventDefault();
                onOpen(handle.toLowerCase());
              }
            : undefined
        }
      >
        @{handle}
      </a>,
    );
    last = start + handle.length + 1;
  }
  parts.push(text.slice(last));
  return (
    <>{parts.map((p, i) => (typeof p === "string" ? <Fragment key={`t${i}`}>{p}</Fragment> : p))}</>
  );
}
