"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Globe, Monitor, Smartphone, Star, X } from "lucide-react";
import type { DraftView } from "../../../packages/contracts/src/experience";
import {
  buildImportedPage,
  importKinds,
  type ImportKind,
  type ImportedPage,
} from "../../../packages/core/src/site-import";
import { api } from "./runtime";
import { SmoothPreview } from "./easy-editor";

const kindNames: Record<ImportKind, { name: string; note: string }> = {
  article: { name: "Article", note: "Writing with photos in between" },
  shop: { name: "Shop", note: "Products and prices up front" },
  portfolio: { name: "Portfolio", note: "A wall of photos" },
};
const errors: Record<string, string> = {
  SITE_URL_INVALID: "That doesn't look like a website link.",
  SITE_NEEDS_HTTPS: "Use a secure link that starts with https://.",
  SITE_NOT_ALLOWED: "That address can't be imported.",
  SITE_NOT_FOUND: "We couldn't find that page. Check the link.",
  SITE_REFUSED: "That site didn't let us read the page.",
  SITE_UNREACHABLE: "We couldn't reach that site. Try again in a moment.",
  SITE_TOO_SLOW: "That site took too long to answer.",
  SITE_TOO_LARGE: "That page is too big to import.",
  SITE_NOT_A_PAGE: "That link isn't a web page.",
  SITE_TOO_MANY_REDIRECTS: "That link keeps redirecting. Try the final address.",
  SITE_EMPTY:
    "We couldn't find any text or photos there. The site may build its page with JavaScript.",
  UNAUTHENTICATED: "Sign in to import a website.",
  TOO_MANY_REQUESTS: "That's a lot of imports. Wait a few minutes and try again.",
  REVISION_CONFLICT: "This draft changed somewhere else. Close and import again.",
};
function friendly(e: unknown) {
  const code = String((e as Error).message ?? e).split(" (")[0]!;
  return errors[code] ?? (code === code.toUpperCase() ? "Something went wrong." : code);
}

/**
 * Website import: paste a link, Smudge reads the page once on the server and gives back text,
 * photos and products. This screen lets the person tidy that up and publish it as a post that
 * opens in the in-app pop-up.
 */
export function SiteImport({
  onClose,
  onPublished,
}: {
  onClose: () => void;
  onPublished: () => Promise<void>;
}) {
  const [step, setStep] = useState<"link" | "edit">("link");
  const [url, setUrl] = useState("");
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState<ImportedPage | null>(null);
  const [found, setFound] = useState<{ words: number; photos: number; products: number } | null>(
    null,
  );
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const [device, setDevice] = useState<"phone" | "pc">("phone");
  const draftRef = useRef<DraftView | null>(null);
  const latest = useRef<ImportedPage | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [frameHeight, setFrameHeight] = useState(720);
  useEffect(() => {
    if (window.matchMedia("(min-width: 900px)").matches) setDevice("pc");
    // The preview fits the screen under the bar, leaving room for the phone/computer switch.
    setFrameHeight(Math.max(480, window.innerHeight - 190));
  }, []);

  async function read() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{
        page: ImportedPage;
        found: { words: number; photos: number; products: number };
      }>("/imports", { url: url.trim(), permission: true });
      const built = buildImportedPage(result.page);
      const d = await api<DraftView>("/drafts", built);
      draftRef.current = d;
      latest.current = result.page;
      setDraft(d);
      setPage(result.page);
      setFound(result.found);
      setStep("edit");
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const save = useCallback(() => {
    clearTimeout(timer.current);
    setSaving("saving");
    queue.current = queue.current.then(async () => {
      const current = draftRef.current;
      const p = latest.current;
      if (!current || !p) return;
      try {
        const built = buildImportedPage(p);
        const next = await api<DraftView>(
          `/drafts/${current.id}`,
          { revision: current.revision, ...built },
          "PUT",
        );
        draftRef.current = next;
        setDraft(next);
        setSaving("saved");
      } catch (e) {
        setSaving("error");
        setMessage(friendly(e));
      }
    });
    return queue.current;
  }, []);
  function change(next: ImportedPage, now = false) {
    setPage(next);
    latest.current = next;
    // Wait for a title before saving: an empty one would be refused.
    if (!next.title.trim()) return setSaving("error");
    setSaving("saving");
    clearTimeout(timer.current);
    if (now) void save();
    else timer.current = setTimeout(() => void save(), 700);
  }
  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      await save();
      const d = draftRef.current!;
      await api(`/drafts/${d.id}/publish`, { revision: d.revision });
      await onPublished();
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === "link")
    return (
      <div
        className="easy-editor site-import import-link"
        role="dialog"
        aria-label="Import a website"
      >
        <header className="import-top">
          <span className="easy-logo">smudge</span>
          <button className="easy-close" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="import-hero">
          <span className="import-globe" aria-hidden="true">
            <Globe />
          </span>
          <h1>
            Bring your <em>website</em> in.
          </h1>
          <p>
            Paste a link. We read the page once, keep the words, photos and prices, and turn it into
            a Smudge page that opens right inside the app.
          </p>
        </div>
        <form
          className="import-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && permission && !busy) void read();
          }}
        >
          <label className="easy-input">
            Website link
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://yourshop.com"
              value={url}
              maxLength={500}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </label>
          <label className="import-check">
            <input
              type="checkbox"
              checked={permission}
              onChange={(e) => setPermission(e.target.checked)}
            />
            <span>This is my site, or I have permission to copy it.</span>
          </label>
          {message && (
            <p className="easy-message" role="alert">
              {message}
            </p>
          )}
          <button className="easy-go" disabled={busy || !url.trim() || !permission}>
            {busy ? "Reading the site…" : "Import"} {!busy && <ArrowRight />}
          </button>
          <p className="easy-note">
            Scripts, trackers and forms never come along. Pages that only appear with JavaScript may
            come through thin; you can fill in the rest.
          </p>
        </form>
      </div>
    );

  const p = page!;
  const coverOrFirst = (images: ImportedPage["images"], cover: string | null) =>
    cover && images.some((i) => i.assetId === cover) ? cover : (images[0]?.assetId ?? null);
  return (
    <div
      className="easy-editor site-import import-edit"
      role="dialog"
      aria-label="Edit your imported page"
    >
      <header className="easy-bar">
        <button onClick={onClose}>Cancel</button>
        <div>
          <strong>Imported from {p.source.host}</strong>
          <small role="status">
            {saving === "saving"
              ? "Saving…"
              : saving === "error"
                ? "Not saved"
                : "Draft saved · only you see it"}
          </small>
        </div>
        <button className="easy-publish" disabled={busy} onClick={() => void publish()}>
          Publish
        </button>
      </header>
      <div className="import-body">
        <div className="import-stage">
          <div className={`easy-frame ${device}`}>
            {draft && (
              <SmoothPreview
                kind="post"
                draft={{ id: draft.id, revision: draft.revision }}
                height={frameHeight}
                heights={{}}
                editing={false}
                onEdit={() => {}}
              />
            )}
          </div>
          <div className="easy-more">
            <button
              aria-label={device === "phone" ? "Show on a computer" : "Show on a phone"}
              title={device === "phone" ? "Show on a computer" : "Show on a phone"}
              onClick={() => setDevice((d) => (d === "phone" ? "pc" : "phone"))}
            >
              {device === "phone" ? <Monitor /> : <Smartphone />}
            </button>
          </div>
        </div>
        <section className="import-panel" aria-label="Your page">
          {found && (
            <p className="import-found">
              We found {found.words} words, {found.photos} photos
              {found.products ? ` and ${found.products} products` : ""}.
            </p>
          )}
          {message && (
            <p className="easy-message" role="status">
              {message}
            </p>
          )}
          <div className="easy-chips-row" role="radiogroup" aria-label="Looks like">
            {importKinds.map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={p.kind === k}
                title={kindNames[k].note}
                onClick={() => change({ ...p, kind: k }, true)}
              >
                {kindNames[k].name}
              </button>
            ))}
          </div>
          <label className="easy-input">
            Title
            <input
              value={p.title}
              maxLength={100}
              onChange={(e) => change({ ...p, title: e.target.value })}
            />
          </label>
          <label className="easy-input">
            Intro
            <textarea
              rows={3}
              maxLength={400}
              value={p.intro}
              onChange={(e) => change({ ...p, intro: e.target.value })}
            />
          </label>
          {p.images.length > 0 && (
            <div className="import-photos">
              <h2>
                Photos <small>tap ★ for the cover</small>
              </h2>
              <ul>
                {p.images.map((img, i) => (
                  <li key={img.assetId} className={p.cover === img.assetId ? "cover" : ""}>
                    <img src={`/api/assets/${img.assetId}`} alt={img.alt || `Photo ${i + 1}`} />
                    <button
                      className="import-star"
                      aria-label={`Use photo ${i + 1} as the cover`}
                      aria-pressed={p.cover === img.assetId}
                      onClick={() => change({ ...p, cover: img.assetId }, true)}
                    >
                      <Star />
                    </button>
                    <button
                      className="import-x"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => {
                        const images = p.images.filter((x) => x.assetId !== img.assetId);
                        change(
                          {
                            ...p,
                            images,
                            cover: coverOrFirst(images, p.cover),
                            products: p.products.map((pr) =>
                              pr.assetId === img.assetId ? { ...pr, assetId: null } : pr,
                            ),
                          },
                          true,
                        );
                      }}
                    >
                      <X />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.kind === "shop" && (
            <div className="import-products">
              <h2>Products</h2>
              {p.products.length === 0 && (
                <p className="easy-note">No prices found on that page.</p>
              )}
              {p.products.map((pr, i) => (
                <div key={i} className="import-product">
                  <input
                    aria-label={`Product ${i + 1} name`}
                    value={pr.name}
                    maxLength={80}
                    onChange={(e) =>
                      change({
                        ...p,
                        products: p.products.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`Product ${i + 1} price`}
                    value={pr.price}
                    maxLength={30}
                    onChange={(e) =>
                      change({
                        ...p,
                        products: p.products.map((x, j) =>
                          j === i ? { ...x, price: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    aria-label={`Remove ${pr.name || `product ${i + 1}`}`}
                    onClick={() =>
                      change({ ...p, products: p.products.filter((_, j) => j !== i) }, true)
                    }
                  >
                    <X />
                  </button>
                </div>
              ))}
            </div>
          )}
          <details className="import-text">
            <summary>
              Text <small>{p.blocks.length} parts</small>
            </summary>
            {p.blocks.map((b, i) => (
              <div key={i} className="import-block">
                <textarea
                  aria-label={`Text part ${i + 1}`}
                  rows={b.type === "h" ? 1 : 3}
                  maxLength={600}
                  className={`block-${b.type}`}
                  value={b.text}
                  onChange={(e) =>
                    change({
                      ...p,
                      blocks: p.blocks.map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                  onBlur={() =>
                    // An emptied part is dropped rather than refused.
                    p.blocks.some((x) => !x.text.trim()) &&
                    change({ ...p, blocks: p.blocks.filter((x) => x.text.trim()) }, true)
                  }
                />
                <button
                  aria-label={`Remove text part ${i + 1}`}
                  onClick={() => change({ ...p, blocks: p.blocks.filter((_, j) => j !== i) }, true)}
                >
                  <X />
                </button>
              </div>
            ))}
          </details>
          <p className="easy-note">
            Visitors see “Imported from {p.source.host}” at the bottom, with a link to the original.
          </p>
        </section>
      </div>
    </div>
  );
}
