"use client";
import { useEffect } from "react";
import type { CSSProperties } from "react";

const glows = ["#ff3d6e", "#ffcc00", "#2b59ff", "#19c37d", "#8a5cff", "#ff7a1a", "#00c2ff"];

/** The colour a post lights the room with: its stage colour, or one picked from its id. */
export function glowFor(id: string, stage?: { background: string; nightBackground: string }) {
  if (stage) return { "--glow": stage.background, "--glow-night": stage.nightBackground };
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const c = glows[h % glows.length]!;
  return { "--glow": c, "--glow-night": c } as CSSProperties;
}

/** A soft light behind the feed that takes the colour of the post nearest the middle of the screen. */
export function AmbientLight({ watch }: { watch: string }) {
  useEffect(() => {
    const root = document.documentElement;
    const seen = new Map<Element, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.intersectionRatio);
        let best: Element | null = null,
          ratio = 0;
        seen.forEach((r, el) => {
          if (r > ratio) [best, ratio] = [el, r];
        });
        if (!best) return;
        const style = getComputedStyle(best);
        const night = root.dataset.theme === "dark";
        const c = style.getPropertyValue(night ? "--glow-night" : "--glow").trim();
        if (c) root.style.setProperty("--ambient", c);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-30% 0px -30% 0px" },
    );
    document.querySelectorAll(".post-list > .post-card").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [watch]);
  return <div className="ambient-light" aria-hidden="true" />;
}
