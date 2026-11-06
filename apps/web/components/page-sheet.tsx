"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Lock, Send, X } from "lucide-react";
import { api } from "./runtime";

/**
 * The in-app page sheet: a large pop-up with a visible gap above it, so the feed stays in view
 * and nobody feels they left Smudge. The top bar is always Smudge's own, whatever the page is.
 */
export function PageSheet({
  title,
  site,
  made,
  href,
  onClose,
  notify,
  children,
}: {
  title: string;
  /** What the address line shows: a host for outside pages, the author for Smudge pages. */
  site: string;
  /** True when the page was built in Smudge and runs in Smudge's own sandbox. */
  made: boolean;
  /** Outside pages only: where "Open in browser" goes. */
  href?: string;
  onClose: () => void;
  notify?: (message: string) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
    };
  }, [onClose]);
  async function share() {
    const link = href ?? window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      notify?.("Link copied. Send it to a friend.");
    } catch {
      notify?.(link);
    }
  }
  // Portalled to the body: post cards create stacking contexts that would trap a fixed layer.
  return createPortal(
    <div className="page-sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="page-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="page-sheet-bar">
          <span className="page-sheet-grab" aria-hidden="true" />
          <div className="page-sheet-site">
            {/* An outside page leads with its site, like a browser's address bar. */}
            <strong>{href ? site : title}</strong>
            <small>
              {made ? (
                <span className="made-tag">Made in Smudge</span>
              ) : (
                <Lock size={11} aria-hidden="true" />
              )}
              <span>{href ? pathOf(href, site, title) : site}</span>
            </small>
          </div>
          {href && (
            <a
              className="page-sheet-button"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in browser"
              title="Open in browser"
            >
              <ArrowUpRight size={17} />
            </a>
          )}
          <button className="page-sheet-button" aria-label="Share" onClick={() => void share()}>
            <Send size={17} />
          </button>
          <button
            className="page-sheet-button close"
            aria-label="Close page"
            onClick={onClose}
            autoFocus
          >
            <X size={17} />
          </button>
        </header>
        <div className="page-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * An outside https page inside the sheet, isolated from Smudge's own origin and session. Sites
 * that refuse to be shown inside other sites get a plain way out instead of a blank frame.
 */
export function OutsidePage({ url, title }: { url: string; title: string }) {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let gone = false;
    api<{ frameable: boolean | null }>(`/frame-check?url=${encodeURIComponent(url)}`)
      .then((r) => !gone && setRefused(r.frameable === false))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [url]);
  if (refused)
    return (
      <div className="outside-refused">
        <strong>{hostOf(url)} doesn’t open inside apps.</strong>
        <p>The site asks to be opened on its own. It opens in a new tab and Smudge stays here.</p>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open {hostOf(url)} <ArrowUpRight size={15} />
        </a>
      </div>
    );
  return (
    <iframe
      className="outside-page"
      src={url}
      title={title}
      referrerPolicy="no-referrer"
      // No allow-top-navigation: the page can't take over Smudge. Popups open a real tab.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

/** The address line under the site: the page's path, or the post's title for a site's home. */
function pathOf(href: string, site: string, title: string) {
  const rest = href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return rest === site ? title : rest;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
