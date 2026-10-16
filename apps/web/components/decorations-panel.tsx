"use client";
import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { OverlayPiece, Sticker, ThemeFont } from "../../../packages/contracts/src/identity";
import { api } from "./runtime";
import { DecorFrame, StickerGlyph } from "./post-decor";
import type { DecoratedPost } from "./post-decor";

type Item = {
  id: string;
  name: string;
  tier: "market" | "members" | "event";
  accent: string;
  font: ThemeFont;
  event: string | null;
  seasonal: boolean;
  sponsor?: string;
  creator: string;
  emotes: Sticker[];
  pieces: OverlayPiece[];
  unlocked: boolean;
  reason: string | null;
};
type State = {
  current: { id: string | null; source: string };
  season: { id: string; name: string; key: string } | null;
  country: string | null;
  items: Item[];
};
type Earnings = {
  currency: string;
  monthly: number;
  creatorShare: number;
  creatorPot: number;
  decorations: { id: string; name: string; adopters: number; weight: number; estimate: number }[];
  estimate: number;
};
const groups = [
  {
    tier: "event",
    title: "Events",
    note: "Smudge picks the events. Anyone can design for one; it opens when you can prove it.",
  },
  { tier: "members", title: "Members", note: "Open with proven membership of the organisation." },
  {
    tier: "market",
    title: "Market",
    note: "Anyone can wear these. No event or membership needed.",
  },
] as const;

/**
 * Themes are free in this prototype. Locks come from proof (members, trips) or the calendar
 * (seasons), never money. Internally they are still called decorations (ADR 0022).
 */
export function DecorationsPanel({
  notify,
  onChanged,
}: {
  notify: (s: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<State | null>(null),
    [earnings, setEarnings] = useState<Earnings | null>(null);
  const load = useCallback(async () => {
    try {
      setState(await api<State>("/decorations"));
      setEarnings(await api<Earnings>("/creator/earnings"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!state) return <div className="empty-state">Loading themes…</div>;
  async function choose(decorationId: string | null, scope: "base" | "season") {
    try {
      setState(await api<State>("/decorations/choose", { decorationId, scope }));
      await onChanged();
      setEarnings(await api<Earnings>("/creator/earnings"));
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const fmt = (n: number) => `${earnings?.currency ?? ""} ${n.toLocaleString("en-US")}`;
  return (
    <section className="decorations" aria-label="Themes">
      <header className="identity-head">
        <span className="eyebrow">YOUR LOOK, EVERYWHERE</span>
        <h1>Themes</h1>
        <p>
          A theme is how you show up: on your profile and around every post of yours in the feed.
          Your post stays readable; the theme dresses its edges, its frame and the stickers people
          react with.
        </p>
      </header>
      {state.season ? (
        <div className="season-banner">
          It’s <strong>{state.season.name}</strong>. Everyone wears a {state.season.name} theme by
          default; pick another one or turn it off for this season.
          <button className="text-button" onClick={() => void choose(null, "season")}>
            Not this season
          </button>
        </div>
      ) : (
        <p className="fineprint">
          No season right now. Halloween starts on 10-17; Hari Kemerdekaan (Indonesia) on 08-10.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.tier} className="theme-group" aria-label={`${g.title} themes`}>
          <h2>{g.title}</h2>
          <p className="fineprint">{g.note}</p>
          <div className="decoration-grid">
            {state.items
              .filter((d) => d.tier === g.tier)
              .map((d) => {
                const active = state.current.id === d.id;
                const sample = { id: d.id, decoration: d } as unknown as DecoratedPost;
                return (
                  <article
                    key={d.id}
                    aria-label={`Theme ${d.name}`}
                    className={`decoration-card ${active ? "active" : ""}`}
                  >
                    <DecorFrame post={sample}>
                      <div className="decoration-sample" style={{ background: d.accent }}>
                        <span className={`theme-font-sample theme-font-${d.font}`}>{d.name}</span>
                      </div>
                    </DecorFrame>
                    <div className="decoration-info">
                      <strong>{d.name}</strong>
                      <small>
                        {d.event ? `${d.event} · ` : ""}
                        {d.sponsor ? `with ${d.sponsor} · ` : ""}by @{d.creator}
                      </small>
                      <span className="decoration-emotes">
                        {d.emotes.map((e) => (
                          <StickerGlyph key={e.id} sticker={e} />
                        ))}
                      </span>
                      {active ? (
                        <span className="decoration-on">
                          Wearing it
                          {state.current.source === "season-default" ? " (season default)" : ""}
                        </span>
                      ) : d.unlocked ? (
                        <button
                          className="quiet-button"
                          onClick={() =>
                            void choose(d.id, d.seasonal || state.season ? "season" : "base")
                          }
                        >
                          Wear{state.season ? " this season" : ""}
                        </button>
                      ) : (
                        <span className="decoration-lock">
                          <Lock size={12} /> {d.reason}
                        </span>
                      )}
                      {d.unlocked && !d.seasonal && state.season && !active && (
                        <button className="text-button" onClick={() => void choose(d.id, "base")}>
                          Keep after the season
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
      <button className="text-button" onClick={() => void choose(null, "base")}>
        Take off my everyday theme
      </button>
      {earnings && earnings.decorations.length > 0 && (
        <section className="creator-earnings" aria-label="Creator earnings">
          <span className="eyebrow">YOUR THEMES · SIMULATED</span>
          <h2>{fmt(earnings.estimate)} this month</h2>
          <p className="fineprint">
            {Math.round(earnings.creatorShare * 100)}% of a fixed {fmt(earnings.monthly)} ad pool is
            shared by how many people wear each theme. New wearers count more than people who chose
            it long ago (30-day half-life), and automatic season defaults count half. No money moves
            in this demo.
          </p>
          <table>
            <thead>
              <tr>
                <th>Theme</th>
                <th>Wearing it</th>
                <th>Weight</th>
                <th>Estimate</th>
              </tr>
            </thead>
            <tbody>
              {earnings.decorations.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.adopters}</td>
                  <td>{d.weight}</td>
                  <td>{fmt(d.estimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
