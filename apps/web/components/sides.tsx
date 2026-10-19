"use client";
import { useEffect, useState } from "react";
import { Check, Download, ImageIcon, Layers2, Link2, Plus, Share2 } from "lucide-react";
import type { Side, SidesView } from "../../../packages/contracts/src/sides";
import { EVERYDAY } from "../../../packages/contracts/src/sides";
import { api } from "./runtime";
import { Dialog } from "./ui";

/**
 * The row of sides above the feed (ADR 0027). One tap switches the whole app to that side: its
 * feed, its composer, its colour. Private sides only appear here for their members.
 */
export function SidesBar({
  sides,
  onSwitch,
  onManage,
}: {
  sides: SidesView;
  onSwitch: (side: string) => void;
  onManage: () => void;
}) {
  return (
    <nav className="sides-bar" aria-label="Your sides">
      {sides.mine.map((s) => (
        <button
          key={s.id}
          className={s.id === sides.active ? "side-chip active" : "side-chip"}
          aria-pressed={s.id === sides.active}
          style={{ "--side-accent": s.accent } as React.CSSProperties}
          onClick={() => onSwitch(s.id)}
        >
          <span className="side-face" aria-hidden="true">
            {s.name[0]}
          </span>
          <span className="side-name">
            {s.name}
            {s.private && <span className="side-lock" title="Members only" />}
          </span>
        </button>
      ))}
      <button className="side-chip side-more" onClick={onManage} aria-label="Join or leave sides">
        <span className="side-face" aria-hidden="true">
          <Plus size={18} />
        </span>
        <span className="side-name">Sides</span>
      </button>
    </nav>
  );
}

/** The Sides tab: join an open side, leave one, draw a card, or lay your sides out together. */
export function SidesPage({
  sides,
  onChange,
  notify,
}: {
  sides: SidesView;
  onChange: (next: SidesView) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [card, setCard] = useState<Side | null>(null);
  async function run(key: string, call: () => Promise<SidesView>, done?: string) {
    setBusy(key);
    try {
      await onChange(await call());
      if (done) notify(done);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const row = (s: Side, action: React.ReactNode) => (
    <div
      key={s.id}
      className="side-row"
      style={{ "--side-accent": s.accent } as React.CSSProperties}
    >
      <span className="side-dot" />
      <div>
        <strong>
          {s.name}
          {s.private && <small className="side-private">members only</small>}
        </strong>
        <small>{s.tagline}</small>
      </div>
      {action}
    </div>
  );
  return (
    <section className="sides-page" aria-label="Your sides">
      {card && <ShareCardDialog side={card} notify={notify} onClose={() => setCard(null)} />}
      <h1>Your sides</h1>
      <p className="fineprint sides-intro">
        One account, many sides. Each side has its own feed and its own posts. What you post in a
        side stays there unless you share it to Everyday.
      </p>
      <div className="side-list">
        {sides.mine.map((s) =>
          row(
            s,
            <span className="side-actions">
              <button
                className="quiet-button"
                aria-label={`Share card for ${s.name}`}
                title="Share card"
                onClick={() => setCard(s)}
              >
                <ImageIcon size={14} /> Card
              </button>
              {s.id === EVERYDAY ? (
                <span className="side-kept">
                  <Check size={14} /> Always
                </span>
              ) : (
                <button
                  className="quiet-button"
                  disabled={busy === s.id}
                  onClick={() =>
                    void run(
                      s.id,
                      () => api<SidesView>(`/sides/${s.id}/leave`, {}),
                      `You left ${s.name}.`,
                    )
                  }
                >
                  Leave
                </button>
              )}
            </span>,
          ),
        )}
      </div>
      {sides.open.length > 0 && (
        <>
          <h3 className="side-heading">Open to join</h3>
          <div className="side-list">
            {sides.open.map((s) =>
              row(
                s,
                <button
                  className="primary small"
                  disabled={busy === s.id}
                  onClick={() =>
                    void run(
                      s.id,
                      () => api<SidesView>(`/sides/${s.id}/join`, {}),
                      `You're in ${s.name}.`,
                    )
                  }
                >
                  Join
                </button>,
              ),
            )}
          </div>
        </>
      )}
      <p className="fineprint">
        Some sides open with an invite from the organisation behind them, under{" "}
        <strong>Who you are</strong>.
      </p>
      <label className="side-layout">
        <input
          type="checkbox"
          checked={sides.layout === "mixed"}
          disabled={busy === "layout"}
          onChange={(e) =>
            void run("layout", () =>
              api<SidesView>("/sides/layout", { layout: e.target.checked ? "mixed" : "separate" }),
            )
          }
        />
        <Layers2 size={16} />
        <span>
          <strong>Show all my sides together</strong>
          <small>One feed with everything you're in. Off, each side is its own feed.</small>
        </span>
      </label>
    </section>
  );
}

/**
 * Your share card (ADR 0030): one picture of you in a side, made to be sent out of Smudge. The
 * server draws it as SVG; the browser turns it into a PNG here, so nothing is uploaded anywhere.
 */
export function ShareCardDialog({
  side,
  notify,
  onClose,
}: {
  side: Side;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const response = await fetch(`/api/me/card?side=${encodeURIComponent(side.id)}`);
        if (!response.ok) throw new Error("The card could not be made.");
        const text = await response.text();
        const data = await api<{ path: string }>(
          `/me/card/data?side=${encodeURIComponent(side.id)}`,
        );
        if (gone) return;
        setSvg(text);
        setPath(data.path);
        setCanShare(typeof navigator.share === "function");
      } catch (e) {
        notify((e as Error).message);
      }
    })();
    return () => {
      gone = true;
    };
  }, [side.id, notify]);
  const link = path ? new URL(path, window.location.origin).href : "";
  async function png() {
    const blob = new Blob([svg ?? ""], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("The card could not be drawn."));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      canvas.getContext("2d")!.drawImage(image, 0, 0, 1080, 1350);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("The card could not be saved."))),
          "image/png",
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const blob = await png();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `smudge-${side.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      const file = new File([await png()], `smudge-${side.id}.png`, { type: "image/png" });
      const data = { files: [file], text: `${side.name} on Smudge: ${link}` };
      if (navigator.canShare?.(data)) await navigator.share(data);
      else await navigator.share({ text: `${side.name} on Smudge`, url: link });
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      notify("Link copied.");
    } catch {
      notify(link);
    }
  }
  return (
    <Dialog title="Share card" onClose={onClose}>
      <p className="fineprint sides-intro">
        A picture of you in {side.name}, for a chat group or a story. Whoever taps the link lands
        {side.private || side.id === EVERYDAY
          ? " on your page."
          : ` on your page, inside ${side.name}.`}
      </p>
      <div
        className="share-card-preview"
        style={{ "--side-accent": side.accent } as React.CSSProperties}
      >
        {svg ? (
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            alt={`Your ${side.name} card`}
          />
        ) : (
          <span className="share-card-wait">Drawing your card…</span>
        )}
      </div>
      <div className="share-card-actions">
        <button className="primary" disabled={!svg || busy} onClick={() => void save()}>
          <Download size={15} /> Save image
        </button>
        {canShare && (
          <button className="quiet-button" disabled={!svg || busy} onClick={() => void share()}>
            <Share2 size={15} /> Share
          </button>
        )}
        <button className="quiet-button" disabled={!link} onClick={() => void copy()}>
          <Link2 size={15} /> Copy link
        </button>
      </div>
      {link && <p className="fineprint share-card-link">{link}</p>}
    </Dialog>
  );
}
