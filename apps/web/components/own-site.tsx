"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Copy,
  Download,
  Globe,
  MessageCircle,
  X,
} from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import { api } from "./runtime";
import { Avatar } from "./ui";
import { siteKindLabels } from "./types";

type SiteKind = keyof typeof siteKindLabels;

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
    "We couldn't find the file yet. Check it opens at the address above, then try again.",
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
    return `${host} asks not to be shown inside other sites, so visitors see this profile instead.`;
  if (status === "down")
    return `We couldn't reach ${host}, so visitors see this profile until it's back.`;
  return null;
}

/**
 * "My website is my profile", in the same full-screen style as picking a vibe: the link, proof the
 * domain is yours (a file to download and upload, or a DNS record), then it's live.
 */
export function OwnSiteSetup({
  onClose,
  onChanged,
  onSmudgeEditor,
}: {
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  /** Back to the vibes, for people who'd rather have a Smudge profile. */
  onSmudgeEditor?: () => void;
}) {
  const [site, setSite] = useState<OwnSite | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [editingLink, setEditingLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dns, setDns] = useState(false);
  const [kind, setKind] = useState<SiteKind | null>(null);
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
  useEffect(() => {
    if (!site?.verified) return;
    api<{ kind: SiteKind | null }>("/me/site-kind").then(
      (r) => setKind(r.kind),
      () => undefined,
    );
  }, [site?.verified]);
  const declare = (next: SiteKind | null) =>
    run(async () => {
      const r = await api<{ kind: SiteKind | null }>("/me/site-kind", { kind: next });
      setKind(r.kind);
      setMessage(
        r.kind
          ? `Your posts now show ${siteKindLabels[r.kind]}. Each one needs a link or something to do.`
          : "You post as a person again.",
      );
    });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
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
      setEditingLink(false);
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
  function download(token: string) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`${token}\n`], { type: "text/plain" }));
    link.download = "smudge-verification.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  const step = !site || editingLink ? 1 : site.verified ? 3 : 2;
  const proofPath = site?.file ? site.file.replace(/^https?:\/\/[^/]+/, "") : "";
  return (
    <div className="easy-editor easy-pick own-site-setup" role="dialog" aria-label="Use my website">
      <header className="easy-pick-top">
        <span className="easy-logo">smudge</span>
        <span className="easy-steps" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? "on" : ""} />
          ))}
        </span>
        <button className="easy-close" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </header>
      {site === undefined ? (
        <p className="easy-loading">Opening…</p>
      ) : step === 1 ? (
        <>
          <h1 className="easy-title">
            Use your <em>website,</em>
          </h1>
          <p className="easy-sub">
            Your profile shows your own site. Smudge&apos;s bar stays on top, so people can still
            follow you, see your posts and message you.
          </p>
          <form
            className="own-site-body"
            id="own-site-link"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="easy-input">
              <span>Your website</span>
              <input
                placeholder="yourname.com"
                inputMode="url"
                autoComplete="url"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            {onSmudgeEditor && !site && (
              <button type="button" className="own-site-quiet" onClick={onSmudgeEditor}>
                No website? Pick a Smudge vibe instead
              </button>
            )}
          </form>
          {message && (
            <p className="easy-message" role="status">
              {message}
            </p>
          )}
          <footer className="easy-pick-actions">
            {editingLink && (
              <button
                type="button"
                className="easy-dice"
                aria-label="Back"
                onClick={() => {
                  setEditingLink(false);
                  setUrl(site?.url ?? "");
                }}
              >
                <ArrowLeft />
              </button>
            )}
            <button
              className="easy-go"
              type="submit"
              form="own-site-link"
              disabled={busy || !url.trim()}
            >
              Continue <ArrowRight />
            </button>
          </footer>
        </>
      ) : step === 2 ? (
        <>
          <h1 className="easy-title">
            Show it&apos;s <em>yours,</em>
          </h1>
          <p className="easy-sub">
            So nobody can put your site on their profile. This takes a minute, once.
          </p>
          <div className="own-site-body">
            <p className="own-site-for">
              <Globe size={16} aria-hidden="true" /> <strong>{site!.host}</strong>
              <button className="own-site-quiet" onClick={() => setEditingLink(true)}>
                Change
              </button>
            </p>
            {!dns ? (
              <ol className="own-site-steps" aria-label="Upload a file">
                <li>
                  <span>Download this small file.</span>
                  <button className="own-site-chip" onClick={() => download(site!.token!)}>
                    <Download size={15} aria-hidden="true" /> smudge-verification.txt
                  </button>
                </li>
                <li>
                  <span>Put it on your site so it opens here:</span>
                  <code className="own-site-path">
                    {site!.host}
                    <b>{proofPath}</b>
                  </code>
                </li>
                <li>
                  <span>Come back and tap Check.</span>
                </li>
              </ol>
            ) : (
              <ol className="own-site-steps" aria-label="Add a DNS record">
                <li>
                  <span>Where you bought {site!.host}, add a TXT record named</span>
                  <button className="own-site-chip mono" onClick={() => void copy(site!.dnsName!)}>
                    {site!.dnsName} <Copy size={14} aria-hidden="true" />
                  </button>
                </li>
                <li>
                  <span>with this value:</span>
                  <button
                    className="own-site-chip mono"
                    aria-label="Copy code"
                    onClick={() => void copy(site!.token!)}
                  >
                    <span aria-label="Your code">{site!.token}</span>{" "}
                    <Copy size={14} aria-hidden="true" />
                  </button>
                </li>
                <li>
                  <span>Tap Check. New records can take up to an hour to show.</span>
                </li>
              </ol>
            )}
            <button className="own-site-quiet" onClick={() => setDns((v) => !v)}>
              {dns ? "Upload a file instead" : "Can't upload files? Use a DNS record instead"}
            </button>
            <button className="own-site-quiet" disabled={busy} onClick={() => void stop()}>
              Cancel and keep my Smudge profile
            </button>
          </div>
          {message && (
            <p className="easy-message" role="status">
              {message}
            </p>
          )}
          <footer className="easy-pick-actions">
            <button className="easy-go" disabled={busy} onClick={() => void verify()}>
              {busy ? "Checking…" : "Check"} <Check />
            </button>
          </footer>
        </>
      ) : (
        <>
          <h1 className="easy-title">
            It&apos;s <em>live.</em>
          </h1>
          <p className="easy-sub">
            Your profile now shows <strong>{site!.host}</strong>, with a{" "}
            <BadgeCheck size={15} aria-hidden="true" className="own-site-inline-check" /> next to
            it. If your site is down, visitors see your Smudge profile instead.
          </p>
          <div className="own-site-body">
            <p className="own-site-for">
              <Globe size={16} aria-hidden="true" /> <strong>{site!.url}</strong>
              <button className="own-site-quiet" onClick={() => setEditingLink(true)}>
                Change
              </button>
            </p>
            <div className="site-kind-pick" role="radiogroup" aria-label="This account is">
              <span>This account is</span>
              {([null, "brand", "media", "place"] as const).map((k) => (
                <button
                  key={k ?? "person"}
                  role="radio"
                  aria-checked={kind === k}
                  className={kind === k ? "own-site-chip on" : "own-site-chip"}
                  disabled={busy}
                  onClick={() => kind !== k && void declare(k)}
                >
                  {k ? siteKindLabels[k] : "A person"}
                </button>
              ))}
            </div>
            {onSmudgeEditor && (
              <button className="own-site-quiet" onClick={onSmudgeEditor}>
                Edit the Smudge profile shown when my site is down
              </button>
            )}
            <button className="own-site-quiet danger" disabled={busy} onClick={() => void stop()}>
              Stop using my website
            </button>
          </div>
          {message && (
            <p className="easy-message" role="status">
              {message}
            </p>
          )}
          <footer className="easy-pick-actions">
            <button className="easy-go" onClick={onClose}>
              See my profile <ArrowRight />
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * The top of a profile that is the person's own website: one slim row saying whose site it is,
 * with the site filling everything under it. Posts, Stories and Follow live in the page strip at
 * the bottom, as on every profile.
 */
export function OwnSiteProfile({
  owner,
  site,
  mine,
  onBack,
  onMessage,
  more,
}: {
  owner: User;
  site: OwnSite;
  mine: boolean;
  onBack: () => void;
  onMessage?: () => void;
  more?: ReactNode;
}) {
  return (
    <section className="own-site-profile" aria-label={`${owner.name}'s website`}>
      <header className="own-site-bar">
        <button className="own-site-icon own-site-back" aria-label="Back to feed" onClick={onBack}>
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <Avatar user={owner} small />
        <div className="own-site-who">
          <strong>{owner.name}</strong>
          <span className="own-site-verified" title={`${owner.name} proved ${site.host} is theirs`}>
            <BadgeCheck size={13} aria-hidden="true" />
            <span className="sr-only">Verified website </span>
            {site.host}
          </span>
        </div>
        {!mine && onMessage && (
          <button className="own-site-icon" aria-label="Message" onClick={onMessage}>
            <MessageCircle size={19} aria-hidden="true" />
          </button>
        )}
        <a
          className="own-site-icon"
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open website in browser"
          title="Open in browser"
        >
          <ArrowUpRight size={19} aria-hidden="true" />
        </a>
        {more && (
          <details className="profile-more">
            <summary aria-label="More options">☰</summary>
            <div className="profile-more-menu profile-control-actions">{more}</div>
          </details>
        )}
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
