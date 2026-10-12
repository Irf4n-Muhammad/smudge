"use client";
import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { OverlayPiece, Sticker } from "../../../packages/contracts/src/identity";
import { api } from "./runtime";
import { DecorFrame, StickerGlyph } from "./post-decor";
import type { DecoratedPost } from "./post-decor";

type Item = {
  id: string;
  name: string;
  tier: "free" | "members" | "seasonal" | "sponsored";
  accent: string;
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
const tierLabel = {
  free: "Free",
  members: "Members only",
  seasonal: "Seasonal",
  sponsored: "Sponsored, free to use",
};

/** Decorations are free. Locks come from proof (members) or the calendar (seasons), never money. */
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
  if (!state) return <div className="empty-state">Loading decorations…</div>;
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
    <section className="decorations" aria-label="Decorations">
      <header className="identity-head">
        <span className="eyebrow">AROUND YOUR POSTS</span>
        <h1>Decorations</h1>
        <p>
          Your photo stays a normal post. Decorations cling to its edges and bring their own
          stickers for people to react with.
        </p>
      </header>
      {state.season ? (
        <div className="season-banner">
          It’s <strong>{state.season.name}</strong>. Everyone gets a {state.season.name} decoration
          by default; pick another one or turn it off for this season.
          <button className="text-button" onClick={() => void choose(null, "season")}>
            Not this season
          </button>
        </div>
      ) : (
        <p className="fineprint">
          No season right now. Halloween starts on 10-17; Hari Kemerdekaan (Indonesia) on 08-10.
        </p>
      )}
      <div className="decoration-grid">
        {state.items.map((d) => {
          const active = state.current.id === d.id;
          const sample = {
            id: d.id,
            decoration: { ...d, tier: d.tier },
          } as unknown as DecoratedPost;
          return (
            <article key={d.id} className={`decoration-card ${active ? "active" : ""}`}>
              <DecorFrame post={sample}>
                <div className="decoration-sample" style={{ background: d.accent }} />
              </DecorFrame>
              <div className="decoration-info">
                <strong>{d.name}</strong>
                <small>
                  {tierLabel[d.tier]}
                  {d.sponsor ? ` · ${d.sponsor}` : ""} · by @{d.creator}
                </small>
                <span className="decoration-emotes">
                  {d.emotes.map((e) => (
                    <StickerGlyph key={e.id} sticker={e} />
                  ))}
                </span>
                {active ? (
                  <span className="decoration-on">
                    In use{state.current.source === "season-default" ? " (season default)" : ""}
                  </span>
                ) : d.unlocked ? (
                  <button
                    className="quiet-button"
                    onClick={() =>
                      void choose(d.id, d.tier === "seasonal" || state.season ? "season" : "base")
                    }
                  >
                    Use{state.season ? " this season" : ""}
                  </button>
                ) : (
                  <span className="decoration-lock">
                    <Lock size={12} /> {d.reason}
                  </span>
                )}
                {d.unlocked && d.tier !== "seasonal" && state.season && !active && (
                  <button className="text-button" onClick={() => void choose(d.id, "base")}>
                    Keep after the season
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <button className="text-button" onClick={() => void choose(null, "base")}>
        Remove my everyday decoration
      </button>
      {earnings && earnings.decorations.length > 0 && (
        <section className="creator-earnings" aria-label="Creator earnings">
          <span className="eyebrow">YOUR DECORATIONS · SIMULATED</span>
          <h2>{fmt(earnings.estimate)} this month</h2>
          <p className="fineprint">
            {Math.round(earnings.creatorShare * 100)}% of a fixed {fmt(earnings.monthly)} ad pool is
            shared by how many people wear each decoration. New wearers count more than people who
            chose it long ago (30-day half-life), and automatic season defaults count half. No money
            moves in this demo.
          </p>
          <table>
            <thead>
              <tr>
                <th>Decoration</th>
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
