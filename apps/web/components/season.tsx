"use client";
import { useEffect, useRef, useState } from "react";
import { seasonKey as key } from "./season-script";

/**
 * Seasons dress the space around the feed, never the posts themselves. Paint is the everyday
 * look; Halloween takes over in October. A viewer's own pick is remembered on this device.
 */
export const seasons = ["paint", "halloween"] as const;
export type Season = (typeof seasons)[number];
const names: Record<Season, string> = { paint: "Paint", halloween: "Halloween" };

export function seasonFor(date: Date): Season {
  return date.getMonth() === 9 ? "halloween" : "paint";
}

function useSeason(): [Season, (s: Season) => void] {
  const [season, setSeason] = useState<Season>("paint");
  useEffect(() => {
    const now = document.documentElement.dataset.season;
    setSeason(now === "halloween" || now === "paint" ? now : seasonFor(new Date()));
    const sync = (e: Event) => setSeason((e as CustomEvent<Season>).detail);
    window.addEventListener("smudge-season", sync);
    return () => window.removeEventListener("smudge-season", sync);
  }, []);
  function change(next: Season) {
    document.documentElement.dataset.season = next;
    try {
      localStorage.setItem(key, next);
    } catch {}
    window.dispatchEvent(new CustomEvent("smudge-season", { detail: next }));
  }
  return [season, change];
}

/** The little chip in the feed heading: shows the season and switches to the next one. */
export function SeasonChip() {
  const [season, change] = useSeason();
  const next = seasons[(seasons.indexOf(season) + 1) % seasons.length]!;
  return (
    <button
      className="season-chip"
      aria-label={`Season: ${names[season]}. Switch to ${names[next]}`}
      title={`Switch to ${names[next]}`}
      onClick={() => change(next)}
    >
      <span aria-hidden="true">{season === "halloween" ? "🎃" : "🎨"}</span>
      {names[season]}
    </button>
  );
}

// A small seeded random, so the splatters land in the same places on every visit.
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function blob(cx: number, cy: number, r: number, rnd: () => number) {
  const points = 14;
  let d = "";
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (0.7 + rnd() * 0.45);
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  const drops = Array.from({ length: 5 }, (_, k) => {
    const a = rnd() * Math.PI * 2;
    const dist = r * (1.4 + rnd() * 0.9);
    return {
      cx: cx + Math.cos(a) * dist,
      cy: cy + Math.sin(a) * dist,
      r: 2 + (k % 3) * 1.6,
    };
  });
  return { d: d + "Z", drops };
}

/**
 * Paint splatters down both edges of the feed, behind the posts, so they show in the gaps and
 * margins. Halloween adds a web and a few bats around the heading.
 */
export function SeasonLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() =>
      setSize({ w: parent.clientWidth, h: parent.scrollHeight }),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const rnd = random(7);
  const splats: { d: string; drops: { cx: number; cy: number; r: number }[]; tone: number }[] = [];
  if (size.w > 0)
    // Start below the heading text and hug the very edges, where nothing is written.
    for (let y = 470, i = 0; y < size.h; y += 360 + rnd() * 260, i++) {
      const left = i % 2 === 0;
      const x = left ? -4 + rnd() * 14 : size.w + 4 - rnd() * 14;
      splats.push({ ...blob(x, y, 12 + rnd() * 16, rnd), tone: i % 4 });
    }
  return (
    <div className="season-layer" ref={ref} aria-hidden="true">
      <svg width={size.w} height={size.h}>
        {splats.map((s, i) => (
          <g key={i} className={`paint-${s.tone + 1}`}>
            <path d={s.d} />
            {s.drops.map((d, k) => (
              <circle key={k} cx={d.cx} cy={d.cy} r={d.r} />
            ))}
          </g>
        ))}
      </svg>
      <svg className="halloween-only web" viewBox="0 0 100 100" width="96" height="96">
        <g fill="none" strokeWidth="1.2">
          <path d="M100 0 L0 100 M100 0 L30 100 M100 0 L65 100 M100 0 L0 65 M100 0 L0 30" />
          {[22, 44, 66, 88].map((r) => (
            <path
              key={r}
              d={`M${100 - r} 0 Q ${100 - r * 0.8} ${r * 0.35} ${100 - r * 0.7} ${r * 0.7} Q ${100 - r * 0.35} ${r * 0.8} 100 ${r}`}
            />
          ))}
        </g>
      </svg>
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`halloween-only bat bat-${i}`} viewBox="0 0 64 28">
          <path d="M32 9c2-4 5-5 5-5s0 3-1 5c5-3 13-3 20 2-4 0-7 2-8 5-2-2-5-2-7 0-1-2-3-3-5-3h-8c-2 0-4 1-5 3-2-2-5-2-7 0-1-3-4-5-8-5 7-5 15-5 20-2-1-2-1-5-1-5s3 1 5 5z" />
        </svg>
      ))}
    </div>
  );
}
