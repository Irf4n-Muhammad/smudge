"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Copy,
  Globe,
  Image as ImageIcon,
  Layers,
  MessageCircle,
  Pencil,
} from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import type { PageTab } from "../../../packages/contracts/src/pages";
import { api } from "./runtime";
import { Avatar, Dialog } from "./ui";

export interface OwnSite {
  url: string;
  host: string;
  verified: boolean;
  verifiedAt: string | null;
  method: "file" | "dns" | null;
  token?: string;
  file?: string;
  dnsName?: string;
}
export type SiteStatus = "ok" | "refused" | "down" | "unknown";
export interface ProfileSite {
  site: OwnSite | null;
  status: SiteStatus | null;
}

const errors: Record<string, string> = {
  SITE_URL_INVALID: "That doesn't look like a website link.",
  SITE_NEEDS_HTTPS: "Use a secure link that starts with https://.",
  SITE_NOT_ALLOWED: "That address can't be used.",
  SITE_NOT_VERIFIED:
    "We couldn't find your code yet. Check it's there exactly as shown. DNS changes can take a while.",
  TOO_MANY_REQUESTS: "That's a lot of tries. Wait a few minutes and check again.",
  UNAUTHENTICATED: "Sign in to use your website.",
};
function friendly(e: unknown) {
  const code = String((e as Error).message ?? e).split(" (")[0]!;
  return errors[code] ?? (code === code.toUpperCase() ? "Something went wrong." : code);
}

/** Why an owner's site isn't showing, in words for the owner. */
export function siteProblem(status: SiteStatus | null, host: string) {
  if (status === "refused")
    return `${host} asks not to be shown inside other sites, so visitors see this profile instead. Allow Smudge in your site's frame-ancestors to fix it.`;
  if (status === "down")
    return `We couldn't reach ${host}, so visitors see this profile until it's back.`;
  return null;
}

/**
 * Setting up "my website is my profile": the link, then proof the domain is yours (a file on the
 * site or a DNS record), then it's live. Turning it off brings the Smudge profile back.
 */
export function OwnSiteSetup({
  onClose,
  onChanged,
  onSmudgeEditor,
}: {
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  /** Opens the easy editor, for the Smudge profile shown when the site is down. */
  onSmudgeEditor?: () => void;
}) {
  const [site, setSite] = useState<OwnSite | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [way, setWay] = useState<"file" | "dns">("file");
  useEffect(() => {
    api<{ site: OwnSite | null }>("/me/site").then(
      (r) => {
        setSite(r.site);
        setUrl(r.site?.url ?? "");
      },
      (e) => {
        setSite(null);
        setMessage(friendly(e));
      },
    );
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  const save = () =>
    run(async () => {
      const r = await api<{ site: OwnSite }>("/me/site", { url });
      setSite(r.site);
      setUrl(r.site.url);
      if (r.site.verified) await onChanged();
    });
  const verify = () =>
    run(async () => {
      const r = await api<{ site: OwnSite }>("/me/site/verify", {});
      setSite(r.site);
      await onChanged();
    });
  const stop = () =>
    run(async () => {
      await api("/me/site", undefined, "DELETE");
      setSite(null);
      setUrl("");
      await onChanged();
    });
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied.");
    } catch {
      setMessage(text);
    }
  }
  return (
    <Dialog title="Use my website" onClose={onClose}>
      <div className="own-site-setup">
        <p className="own-site-lead">
          Your profile shows your own website, with Smudge&apos;s bar on top so people can still
          follow you, see your posts and message you.
        </p>
        {site === undefined ? (
          <p className="fineprint">Opening…</p>
        ) : (
          <>
            <form
              className="own-site-link"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                <span>Your website</span>
                <input
                  aria-label="Your website"
                  placeholder="https://yourname.com"
                  inputMode="url"
                  autoComplete="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <button
                className={site ? "quiet-button" : "primary"}
                disabled={busy || !url.trim() || url.trim() === site?.url}
              >
                {site ? "Change" : "Next"}
              </button>
            </form>
            {site && !site.verified && (
              <section className="own-site-proof" aria-label="Prove it's yours">
                <h3>Prove {site.host} is yours</h3>
                <p>Add this code one of two ways, then check. It stays private to you.</p>
                <div className="own-site-ways" role="tablist" aria-label="How to prove it">
                  <button role="tab" aria-selected={way === "file"} onClick={() => setWay("file")}>
                    Upload a file
                  </button>
                  <button role="tab" aria-selected={way === "dns"} onClick={() => setWay("dns")}>
                    Add a DNS record
                  </button>
                </div>
                {way === "file" ? (
                  <ol>
                    <li>Make a text file that contains only the code below.</li>
                    <li>
                      Put it on your site so it opens at <code>{site.file}</code>
                    </li>
                  </ol>
                ) : (
                  <ol>
                    <li>
                      At your domain provider, add a <strong>TXT</strong> record named{" "}
                      <code>{site.dnsName}</code>
                    </li>
                    <li>Set its value to the code below. It can take a while to show up.</li>
                  </ol>
                )}
                <div className="own-site-token">
                  <code aria-label="Your code">{site.token}</code>
                  <button
                    className="quiet-button"
                    aria-label="Copy code"
                    onClick={() => void copy(site.token ?? "")}
                  >
                    <Copy size={14} aria-hidden="true" /> Copy
                  </button>
                </div>
                <button className="primary" disabled={busy} onClick={() => void verify()}>
                  {busy ? "Checking…" : "Check now"}
                </button>
              </section>
            )}
            {site?.verified && (
              <section className="own-site-live" aria-label="Your website profile">
                <p>
                  <BadgeCheck size={16} aria-hidden="true" /> <strong>{site.host}</strong> is
                  verified. Your profile shows it now.
                </p>
                <p className="fineprint">
                  If it&apos;s down or won&apos;t open inside apps, visitors see your Smudge profile
                  instead.
                </p>
                <div className="own-site-actions">
                  {onSmudgeEditor && (
                    <button className="quiet-button" onClick={onSmudgeEditor}>
                      Edit my Smudge profile
                    </button>
                  )}
                  <button className="quiet-button" disabled={busy} onClick={() => void stop()}>
                    Stop using my website
                  </button>
                </div>
              </section>
            )}
            {site && !site.verified && (
              <button className="text-button" disabled={busy} onClick={() => void stop()}>
                Never mind, keep my Smudge profile
              </button>
            )}
          </>
        )}
        {message && (
          <p className="own-site-message" role="status">
            {message}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * A profile that is the person's own website: Smudge's bar stays on top, and the site fills the
 * rest, isolated from Smudge's origin and unable to navigate Smudge away.
 */
export function OwnSiteProfile({
  owner,
  site,
  mine,
  posts,
  followLabel,
  following,
  busy,
  onBack,
  onPage,
  onFollow,
  onMessage,
  onEdit,
  onChapters,
  chapters,
  more,
}: {
  owner: User;
  site: OwnSite;
  mine: boolean;
  posts: number;
  followLabel: string;
  following: boolean;
  busy: boolean;
  onBack: () => void;
  onPage: (tab: PageTab) => void;
  onFollow: () => void;
  onMessage?: () => void;
  onEdit: () => void;
  onChapters: () => void;
  chapters: number;
  more?: ReactNode;
}) {
  return (
    <section className="own-site-profile" aria-label={`${owner.name}'s website`}>
      <header className="own-site-bar">
        <button className="own-site-icon own-site-back" aria-label="Back to feed" onClick={onBack}>
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <div className="own-site-who">
          <Avatar user={owner} small />
          <span>
            <strong>{owner.name}</strong>
            <small>
              <span
                className="own-site-verified"
                title={`${owner.name} proved ${site.host} is theirs`}
              >
                <BadgeCheck size={12} aria-hidden="true" />
                <span className="sr-only">Verified website </span>
                {site.host}
              </span>
              {chapters > 0 && (
                <button className="chapter-chip" onClick={onChapters}>
                  <BadgeCheck size={11} aria-hidden="true" /> {chapters}
                  <span className="sr-only"> proven chapters</span>
                </button>
              )}
            </small>
          </span>
        </div>
        <nav className="own-site-tabs" aria-label="Pages">
          <button aria-current="page">
            <Globe size={15} aria-hidden="true" /> Website
          </button>
          <button onClick={() => onPage("posts")}>
            <ImageIcon size={15} aria-hidden="true" /> Posts{posts > 0 && <small>{posts}</small>}
          </button>
          <button onClick={() => onPage("stories")}>
            <Layers size={15} aria-hidden="true" /> Stories
          </button>
        </nav>
        <div className="own-site-actions">
          {mine ? (
            <button className="own-site-primary" onClick={onEdit}>
              <Pencil size={15} aria-hidden="true" /> Edit profile
            </button>
          ) : (
            <>
              <button
                className={`own-site-primary ${following ? "is-on" : ""}`}
                aria-pressed={following}
                disabled={busy}
                onClick={onFollow}
              >
                {followLabel}
              </button>
              {onMessage && (
                <button className="own-site-icon" aria-label="Message" onClick={onMessage}>
                  <MessageCircle size={18} aria-hidden="true" />
                </button>
              )}
            </>
          )}
          <a
            className="own-site-icon"
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open website in browser"
            title="Open in browser"
          >
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          {more && (
            <details className="profile-more">
              <summary aria-label="More options">☰</summary>
              <div className="profile-more-menu profile-control-actions">{more}</div>
            </details>
          )}
        </div>
      </header>
      <iframe
        className="own-site-frame"
        src={site.url}
        title={`${site.host}, ${owner.name}'s website`}
        referrerPolicy="no-referrer"
        // No allow-top-navigation: the site can't take over Smudge. Popups open a real tab.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </section>
  );
}
