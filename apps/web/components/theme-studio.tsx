"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { orgs, themeEvents, themeFonts } from "../../../packages/contracts/src/identity";
import type { OverlayPiece, ThemeFont } from "../../../packages/contracts/src/identity";
import {
  themeAnchors,
  themeLimits,
  themeSubmissionSchema,
} from "../../../packages/contracts/src/themes";
import type {
  ThemePieceInput,
  ThemeSubmissionInput,
  ThemeSubmissionView,
} from "../../../packages/contracts/src/themes";
import { api } from "./runtime";
import { DecorFrame } from "./post-decor";
import type { DecoratedPost } from "./post-decor";

/** A blank post wearing a theme: the same frame the feed and profile use. */
export function ThemeSample({
  name,
  accent,
  font,
  pieces,
}: {
  name: string;
  accent: string;
  font: ThemeFont;
  pieces: OverlayPiece[];
}) {
  const post = {
    id: "sample",
    decoration: { id: "sample", name, accent, font, tier: "market", creator: "", pieces },
  } as unknown as DecoratedPost;
  return (
    <DecorFrame post={post}>
      <div className="decoration-sample" style={{ background: accent }}>
        <span className={`theme-font-sample theme-font-${font}`}>{name || "Your theme"}</span>
      </div>
    </DecorFrame>
  );
}

const starter: ThemePieceInput = {
  anchor: "top-right",
  width: 140,
  height: 70,
  dx: -150,
  dy: -34,
  html: '<div class="tag" data-text="label">hello!</div>',
  css:
    ".tag{display:inline-block;margin:10px;padding:12px 18px;border-radius:999px;" +
    "background:#ff5a36;color:#fff;font:700 22px/1 system-ui,sans-serif;" +
    "transform:rotate(-6deg);animation:bob 2.4s ease-in-out infinite}" +
    "@keyframes bob{50%{transform:rotate(4deg) translateY(4px)}}",
};
const fresh = (): ThemeSubmissionInput => ({
  name: "",
  accent: "#ff5a36",
  font: "display",
  kind: "market",
  pieces: [{ ...starter }],
});
/** "pieces.0.html" reads as "Piece 1, HTML: " next to the problem. */
const where = (path: (string | number)[]) => {
  const [first, index, field] = path;
  if (first === "pieces" && typeof index === "number")
    return `Piece ${index + 1}${field ? `, ${field === "html" || field === "css" ? String(field).toUpperCase() : field}` : ""}: `;
  return "";
};
const statusText: Record<ThemeSubmissionView["status"], string> = {
  pending: "Waiting for review",
  approved: "In the market",
  rejected: "Not accepted",
  removed: "Taken down",
};

/**
 * Anyone designs a theme in their own HTML and CSS. It goes to review first; only approved themes
 * reach the market (ADR 0024).
 */
export function ThemeStudio({
  notify,
  onSubmitted,
}: {
  notify: (s: string) => void;
  onSubmitted?: () => void;
}) {
  const [draft, setDraft] = useState<ThemeSubmissionInput>(fresh);
  const [mine, setMine] = useState<ThemeSubmissionView[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setMine(await api<ThemeSubmissionView[]>("/themes/submissions"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  const check = useMemo(() => themeSubmissionSchema.safeParse(draft), [draft]);
  const problem = check.success ? null : check.error.issues[0]!;
  const set = (patch: Partial<ThemeSubmissionInput>) => setDraft((d) => ({ ...d, ...patch }));
  const setPiece = (i: number, patch: Partial<ThemePieceInput>) =>
    setDraft((d) => ({ ...d, pieces: d.pieces.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const num = (value: string) => (value === "" || Number.isNaN(+value) ? 0 : Math.round(+value));
  async function submit() {
    if (!check.success) return;
    setBusy(true);
    try {
      await api("/themes/submissions", check.data);
      notify("Sent for review. It reaches the market once it is approved.");
      setDraft(fresh());
      await load();
      onSubmitted?.();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(id: string) {
    try {
      setMine(await api<ThemeSubmissionView[]>(`/themes/submissions/${id}`, undefined, "DELETE"));
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <section className="theme-studio identity-panel" aria-label="Make a theme">
      <span className="eyebrow">OPEN MARKET</span>
      <h2>Make a theme</h2>
      <p className="fineprint">
        Draw your theme with your own HTML and CSS: up to {themeLimits.pieces} pieces that hang on
        the edges of every post and profile of whoever wears it. Pieces stay within{" "}
        {themeLimits.maxSize}px and near an edge, so posts stay readable. They are shown as
        pictures: animations work, but scripts, links, outside images and web fonts do not. Smudge
        reviews every theme before it reaches the market.
      </p>
      <p className="fineprint">
        People who wear your theme can drag its pieces and change any text you mark with{" "}
        <code>data-text=&quot;name&quot;</code>, like the starter piece below does.
      </p>
      <div className="theme-studio-grid">
        <div className="theme-studio-form">
          <label>
            Name
            <input
              value={draft.name}
              maxLength={40}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <div className="theme-studio-row">
            <label>
              Kind
              <select
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as ThemeSubmissionInput["kind"];
                  const { eventId: _e, orgId: _o, ...rest } = draft;
                  setDraft({
                    ...rest,
                    kind,
                    ...(kind === "event" ? { eventId: themeEvents[0]!.id } : {}),
                    ...(kind === "members" ? { orgId: orgs[0]!.id } : {}),
                  });
                }}
              >
                <option value="market">Market</option>
                <option value="event">Event</option>
                <option value="members">Members</option>
              </select>
            </label>
            {draft.kind === "event" && (
              <label>
                Event
                <select value={draft.eventId} onChange={(e) => set({ eventId: e.target.value })}>
                  {themeEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.kind === "members" && (
              <label>
                Organisation
                <select value={draft.orgId} onChange={(e) => set({ orgId: e.target.value })}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="theme-studio-row">
            <label>
              Accent
              <input
                type="color"
                value={draft.accent}
                onChange={(e) => set({ accent: e.target.value })}
              />
            </label>
            <label>
              Typeface
              <select
                value={draft.font}
                onChange={(e) => set({ font: e.target.value as ThemeFont })}
              >
                {themeFonts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draft.pieces.map((p, i) => (
            <fieldset key={i} className="theme-piece-editor">
              <legend>Piece {i + 1}</legend>
              <div className="theme-studio-row">
                <label>
                  Edge
                  <select
                    value={p.anchor}
                    onChange={(e) =>
                      setPiece(i, { anchor: e.target.value as ThemePieceInput["anchor"] })
                    }
                  >
                    {themeAnchors.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                {(["width", "height", "dx", "dy"] as const).map((k) => (
                  <label key={k} className="theme-number">
                    {k}
                    <input
                      type="number"
                      value={p[k]}
                      onChange={(e) => setPiece(i, { [k]: num(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <label>
                HTML
                <textarea
                  rows={3}
                  spellCheck={false}
                  aria-label={`Piece ${i + 1} HTML`}
                  value={p.html}
                  onChange={(e) => setPiece(i, { html: e.target.value })}
                />
              </label>
              <label>
                CSS
                <textarea
                  rows={4}
                  spellCheck={false}
                  aria-label={`Piece ${i + 1} CSS`}
                  value={p.css}
                  onChange={(e) => setPiece(i, { css: e.target.value })}
                />
              </label>
              {draft.pieces.length > 1 && (
                <button
                  className="text-button"
                  onClick={() => set({ pieces: draft.pieces.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={13} /> Remove piece
                </button>
              )}
            </fieldset>
          ))}
          {draft.pieces.length < themeLimits.pieces && (
            <button
              className="quiet-button"
              onClick={() => set({ pieces: [...draft.pieces, { ...starter, dx: -150 }] })}
            >
              <Plus size={14} /> Add a piece
            </button>
          )}
        </div>
        <div className="theme-studio-preview" aria-label="Preview">
          <ThemeSample
            name={draft.name}
            accent={draft.accent}
            font={draft.font}
            pieces={draft.pieces}
          />
          {problem ? (
            <p className="theme-studio-problem" role="alert">
              {where(problem.path)}
              {problem.message}
            </p>
          ) : (
            <p className="fineprint">Looks good. Send it when you are happy with it.</p>
          )}
          <button
            className="primary"
            disabled={!check.success || busy}
            onClick={() => void submit()}
          >
            Send for review
          </button>
        </div>
      </div>
      {mine.length > 0 && (
        <section className="theme-mine" aria-label="Your designs">
          <h3>Your designs</h3>
          <ul>
            {mine.map((t) => (
              <li key={t.id} aria-label={`Design ${t.name}`}>
                <strong>{t.name}</strong>
                <span className={`theme-status theme-status-${t.status}`}>
                  {statusText[t.status]}
                </span>
                {t.note && <small>“{t.note}”</small>}
                {t.status !== "approved" && (
                  <button className="text-button" onClick={() => void withdraw(t.id)}>
                    {t.status === "pending" ? "Withdraw" : "Delete"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** The moderators' queue: preview, read the code, then approve, reject or take down. */
export function ThemeReviews({ notify }: { notify: (s: string) => void }) {
  const [items, setItems] = useState<ThemeSubmissionView[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      setItems(await api<ThemeSubmissionView[]>("/moderation/themes"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function decide(id: string, decision: "approve" | "reject" | "remove", done: string) {
    try {
      const note = notes[id]?.trim();
      await api(`/moderation/themes/${id}`, { decision, ...(note ? { note } : {}) });
      notify(done);
      await load();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const pending = items?.filter((t) => t.status === "pending") ?? [];
  const live = items?.filter((t) => t.status === "approved") ?? [];
  return (
    <section className="community-panel theme-reviews" aria-labelledby="theme-review-title">
      <header className="identity-head">
        <span className="eyebrow">CURATION</span>
        <h1 id="theme-review-title">Themes to review</h1>
      </header>
      {items && pending.length === 0 && <p className="fineprint">No themes waiting.</p>}
      <ul className="report-list">
        {[...pending, ...live].map((t) => {
          const event = t.eventId ? themeEvents.find((e) => e.id === t.eventId)?.name : null;
          const org = t.orgId ? orgs.find((o) => o.id === t.orgId)?.name : null;
          return (
            <li key={t.id} className="identity-panel report-item" aria-label={`Review ${t.name}`}>
              <div className="report-head">
                <span className="eyebrow">
                  {t.status === "pending" ? "WAITING" : "IN THE MARKET"} · {t.kind.toUpperCase()}
                </span>
                <strong>{t.name}</strong>
                <small>
                  by {t.creator.name} (@{t.creator.handle}){event ? ` · ${event}` : ""}
                  {org ? ` · ${org}` : ""}
                </small>
              </div>
              <div className="theme-review-sample">
                <ThemeSample name={t.name} accent={t.accent} font={t.font} pieces={t.pieces} />
              </div>
              <details>
                <summary>Code</summary>
                {t.pieces.map((p, i) => (
                  <pre key={i} className="theme-code">
                    {`/* piece ${i + 1}: ${p.anchor} ${p.width}×${p.height} at ${p.dx},${p.dy} */\n${p.html}\n\n${p.css}`}
                  </pre>
                ))}
              </details>
              <input
                className="theme-review-note"
                placeholder="Note to the designer (optional)"
                maxLength={200}
                value={notes[t.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
              />
              <div className="report-actions">
                {t.status === "pending" ? (
                  <>
                    <button
                      className="primary small"
                      onClick={() => void decide(t.id, "approve", "Approved. It is in the market.")}
                    >
                      Approve
                    </button>
                    <button
                      className="quiet-button"
                      onClick={() =>
                        void decide(t.id, "reject", "Rejected. The designer can see why.")
                      }
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <button
                    className="quiet-button"
                    onClick={() =>
                      void decide(t.id, "remove", "Taken down. Nobody wears it any more.")
                    }
                  >
                    Take down
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
