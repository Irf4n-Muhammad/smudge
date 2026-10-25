"use client";
import { useCallback, useEffect, useState } from "react";
import { Disc3, MapPin, MessageCircle, Sparkles, X } from "lucide-react";
import type { NowArchive, NowKind, NowView } from "../../../packages/contracts/src/now";
import { api } from "./runtime";

const kinds: { kind: NowKind; label: string; lead: string; hint: string }[] = [
  { kind: "listening", label: "Listening", lead: "Listening to", hint: "Song" },
  { kind: "doing", label: "Doing", lead: "Doing", hint: "What are you up to?" },
  { kind: "place", label: "Somewhere", lead: "At", hint: "Where are you?" },
  { kind: "thinking", label: "Thinking", lead: "Thinking", hint: "What's on your mind?" },
];
const icons = {
  listening: Disc3,
  doing: Sparkles,
  place: MapPin,
  thinking: MessageCircle,
} as const;

export function ago(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

function Entry({ entry, onRemove }: { entry: NowView; onRemove?: () => void }) {
  const Icon = icons[entry.kind];
  const lead = kinds.find((k) => k.kind === entry.kind)!.lead;
  return (
    <>
      <Icon size={15} aria-hidden="true" />
      <span className="now-text">
        <small>{lead}</small> <strong>{entry.text}</strong>
        {entry.by && <span className="now-by"> · {entry.by}</span>}
      </span>
      <time dateTime={entry.at}>{ago(entry.at)}</time>
      {onRemove && (
        <button className="icon-button" aria-label="Remove this entry" onClick={onRemove}>
          <X size={14} />
        </button>
      )}
    </>
  );
}

/**
 * "Lagi ngapain" (ADR 0041): on your own page, one tap notes what you are listening to, doing,
 * where you are or what you are thinking. The newest shows on top; everything stays as your
 * archive. Visitors see what the owner's privacy allows; guests through the public route.
 */
export function NowBar({
  ownerId,
  mine,
  guestHandle,
  onChanged,
}: {
  ownerId: string;
  mine: boolean;
  /** Set when there is no account looking: the page's share link. */
  guestHandle?: string;
  onChanged?: () => void;
}) {
  const [archive, setArchive] = useState<NowArchive | null>(null);
  const [picking, setPicking] = useState<NowKind | null>(null);
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<NowArchive>(
        guestHandle
          ? `/public/users/${encodeURIComponent(guestHandle)}/now`
          : `/users/${encodeURIComponent(ownerId)}/now`,
      ).then(setArchive, () => setArchive({ current: null, entries: [], total: 0 })),
    [ownerId, guestHandle],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    if (!picking || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/me/now", {
        kind: picking,
        text: text.trim(),
        ...(picking === "listening" && by.trim() ? { by: by.trim() } : {}),
      });
      setPicking(null);
      setText("");
      setBy("");
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api(`/me/now/${id}`, undefined, "DELETE");
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!archive) return null;
  if (!mine && !archive.current) return null;
  const current = archive.current;
  return (
    <section className="now-bar" aria-label={mine ? "Right now" : "What they're up to"}>
      {current ? (
        <p className="now-current">
          <Entry entry={current} />
        </p>
      ) : (
        <p className="now-current now-empty">
          <Sparkles size={15} aria-hidden="true" />
          <span className="now-text">
            <small>Right now</small> <strong>What are you up to? One tap.</strong>
          </span>
        </p>
      )}
      {mine && !picking && (
        <div className="now-chips" role="group" aria-label="Add to your now">
          {kinds.map((k) => {
            const Icon = icons[k.kind];
            return (
              <button key={k.kind} className="now-chip" onClick={() => setPicking(k.kind)}>
                <Icon size={14} aria-hidden="true" /> {k.label}
              </button>
            );
          })}
        </div>
      )}
      {mine && picking && (
        <form
          className="now-form"
          aria-label={kinds.find((k) => k.kind === picking)!.label}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            maxLength={80}
            value={text}
            placeholder={kinds.find((k) => k.kind === picking)!.hint}
            aria-label={kinds.find((k) => k.kind === picking)!.hint}
            onChange={(e) => setText(e.target.value)}
          />
          {picking === "listening" && (
            <input
              maxLength={50}
              value={by}
              placeholder="Artist"
              aria-label="Artist"
              onChange={(e) => setBy(e.target.value)}
            />
          )}
          <button className="primary small" disabled={busy || !text.trim()}>
            Save
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              setPicking(null);
              setText("");
              setBy("");
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {archive.total > 1 && (
        <button
          className="text-button now-archive-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide archive" : `Archive · ${archive.total}`}
        </button>
      )}
      {open && (
        <ol className="now-archive" aria-label="Archive">
          {archive.entries.map((entry, i) => {
            const day = dayOf(entry.at);
            const first = i === 0 || dayOf(archive.entries[i - 1]!.at) !== day;
            return (
              <li key={entry.id}>
                {first && <h3>{day}</h3>}
                <p>
                  <Entry entry={entry} onRemove={mine ? () => void remove(entry.id) : undefined} />
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
