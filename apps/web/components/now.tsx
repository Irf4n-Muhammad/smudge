"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Cat,
  Disc3,
  HelpCircle,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Paintbrush,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { NowArchive, NowKind, NowSources, NowView } from "../../../packages/contracts/src/now";
import { api } from "./runtime";

export const nowIcons: Record<NowKind, typeof Disc3> = {
  listening: Disc3,
  doing: Sparkles,
  place: MapPin,
  thinking: MessageCircle,
  posted: ImageIcon,
  quiz: HelpCircle,
  fed: Cat,
  page: Paintbrush,
};
const leads: Record<NowKind, string> = {
  listening: "Listening to",
  doing: "",
  place: "At",
  thinking: "Thinking",
  posted: "Posted",
  quiz: "",
  fed: "",
  page: "",
};
const manual: { kind: NowKind; label: string; hint: string }[] = [
  { kind: "doing", label: "Doing", hint: "What are you up to?" },
  { kind: "place", label: "Somewhere", hint: "Where are you?" },
  { kind: "thinking", label: "Thinking", hint: "What's on your mind?" },
  { kind: "listening", label: "A song", hint: "Song" },
];

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

export function Entry({ entry, onRemove }: { entry: NowView; onRemove?: () => void }) {
  const Icon = nowIcons[entry.kind];
  const lead = leads[entry.kind];
  return (
    <>
      <Icon size={15} aria-hidden="true" />
      <span className="now-text">
        {lead && <small>{lead}</small>} <strong>{entry.text}</strong>
        {entry.by && <span className="now-by"> · {entry.by}</span>}
        {entry.source === "spotify" && <span className="now-source">Spotify</span>}
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
 * "Right now" (ADR 0041, reworked in ADR 0044): one line that mostly fills itself. The song comes
 * from Spotify once connected, posts and programs come from Smudge, and the owner can still note
 * a song with one tap or, behind a small +, type a line. Everything piles into the archive.
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
  const [sources, setSources] = useState<NowSources | null>(null);
  const [adding, setAdding] = useState(false);
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
    if (!mine) return;
    api<NowSources>("/me/now-sources").then(setSources, () => setSources(null));
  }, [load, mine]);
  useEffect(() => {
    if (!mine) return;
    const flag = new URLSearchParams(window.location.search).get("spotify");
    if (flag === "failed") setError("Spotify did not connect. Try again.");
  }, [mine]);
  async function add(input: { kind: NowKind; text: string; by?: string }) {
    setBusy(true);
    setError("");
    try {
      await api("/me/now", input);
      setPicking(null);
      setAdding(false);
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
  async function disconnect() {
    try {
      await api("/spotify", undefined, "DELETE");
      setSources((s) => (s ? { ...s, spotify: { ...s.spotify, connected: false } } : s));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!archive) return null;
  if (!mine && !archive.current) return null;
  const current = archive.current;
  const spotify = sources?.spotify;
  const songs = sources?.songs ?? [];
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
            <small>Right now</small>{" "}
            <strong>
              {spotify?.configured
                ? "Nothing yet. Connect Spotify and your song shows up by itself."
                : "Nothing yet. Post something, or tap a song below."}
            </strong>
          </span>
        </p>
      )}
      {mine && !adding && (
        <div className="now-row">
          {spotify?.configured && !spotify.connected && (
            <a className="now-chip now-spotify" href="/api/spotify/start">
              <Disc3 size={14} aria-hidden="true" /> Connect Spotify
            </a>
          )}
          {spotify?.connected && (
            <span className="now-chip now-spotify on">
              <Disc3 size={14} aria-hidden="true" /> Spotify on
              <button className="text-button" onClick={() => void disconnect()}>
                off
              </button>
            </span>
          )}
          {!spotify?.connected &&
            songs.map((song) => (
              <button
                key={`${song.text}|${song.by ?? ""}`}
                className="now-chip"
                title={song.by ? `${song.text} · ${song.by}` : song.text}
                onClick={() => void add({ kind: "listening", ...song })}
              >
                <Disc3 size={14} aria-hidden="true" /> {song.text}
              </button>
            ))}
          <button
            className="now-chip now-more"
            aria-label="Add a note"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} aria-hidden="true" /> Note
          </button>
        </div>
      )}
      {mine && adding && !picking && (
        <div className="now-row" role="group" aria-label="Add to your now">
          {manual.map((k) => {
            const Icon = nowIcons[k.kind];
            return (
              <button key={k.kind} className="now-chip" onClick={() => setPicking(k.kind)}>
                <Icon size={14} aria-hidden="true" /> {k.label}
              </button>
            );
          })}
          <button type="button" className="text-button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}
      {mine && adding && picking && (
        <form
          className="now-form"
          aria-label={manual.find((k) => k.kind === picking)!.label}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void add({
              kind: picking,
              text: text.trim(),
              ...(picking === "listening" && by.trim() ? { by: by.trim() } : {}),
            });
          }}
        >
          <input
            autoFocus
            maxLength={80}
            value={text}
            placeholder={manual.find((k) => k.kind === picking)!.hint}
            aria-label={manual.find((k) => k.kind === picking)!.hint}
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
            Back
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
                  <Entry
                    entry={entry}
                    onRemove={mine && !entry.source ? () => void remove(entry.id) : undefined}
                  />
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
