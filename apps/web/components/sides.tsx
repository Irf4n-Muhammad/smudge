"use client";
import { useState } from "react";
import { Check, Layers2, Plus } from "lucide-react";
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
          <span className="side-dot" />
          {s.name}
          {s.private && <span className="side-lock" title="Members only" />}
        </button>
      ))}
      <button className="side-chip side-more" onClick={onManage} aria-label="Join or leave sides">
        <Plus size={14} /> Sides
      </button>
    </nav>
  );
}

/** Join an open side, leave one, or lay your sides out together. */
export function SidesDialog({
  sides,
  onChange,
  onClose,
  notify,
}: {
  sides: SidesView;
  onChange: (next: SidesView) => Promise<void>;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState("");
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
    <Dialog title="Your sides" onClose={onClose}>
      <p className="fineprint sides-intro">
        One account, many sides. Each side has its own feed and its own posts. What you post in a
        side stays there unless you share it to Everyday.
      </p>
      <div className="side-list">
        {sides.mine.map((s) =>
          row(
            s,
            s.id === EVERYDAY ? (
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
            ),
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
    </Dialog>
  );
}
