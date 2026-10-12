"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { OutsidePage, PageSheet } from "./page-sheet";
import { FullScreenPost } from "./post-decor";
import type { DecoratedPost } from "./post-decor";

/**
 * The button a creator can put under a post. Without a URL it opens the post itself full size in
 * the in-app sheet; with one it opens that https page there. Used in the feed and on profiles.
 */
export function PostLink({
  post,
  notify,
  onOpenSelf,
}: {
  post: DecoratedPost;
  notify?: (message: string) => void;
  /** The feed opens its own full-screen view; elsewhere the sheet is opened here. */
  onOpenSelf?: () => void;
}) {
  const [outside, setOutside] = useState(false),
    [self, setSelf] = useState(false);
  const link = post.metadata.link;
  if (!link) return null;
  return (
    <>
      <div className="post-link">
        <div>
          <strong>{post.metadata.title}</strong>
          <small>
            {link.url
              ? `Opens ${hostOf(link.url)} right here in Smudge`
              : "Opens right here in Smudge"}
          </small>
        </div>
        <button
          className="post-link-go"
          onClick={() => (link.url ? setOutside(true) : onOpenSelf ? onOpenSelf() : setSelf(true))}
        >
          {link.label}
          {link.url && <ArrowUpRight size={15} />}
        </button>
      </div>
      {self && <FullScreenPost post={post} notify={notify} onClose={() => setSelf(false)} />}
      {outside && link.url && (
        <PageSheet
          title={post.metadata.title}
          site={hostOf(link.url)}
          made={false}
          href={link.url}
          notify={notify}
          onClose={() => setOutside(false)}
        >
          <OutsidePage url={link.url} title={post.metadata.title} />
        </PageSheet>
      )}
    </>
  );
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
