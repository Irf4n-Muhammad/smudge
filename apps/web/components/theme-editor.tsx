"use client";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import type { User } from "../../../packages/contracts/src/experience";
import type { OverlayPiece, ThemeFont } from "../../../packages/contracts/src/identity";
import {
  pieceDepth,
  textSlots,
  themeBand,
  themeLimits,
  themeTextMax,
} from "../../../packages/contracts/src/themes";
import { Avatar } from "./ui";
import { place, themeStyle } from "./post-decor";
import type { DecoratedPost } from "./post-decor";
import { PieceArt } from "./theme-piece";

export type ThemeEdit = { pieces: { dx: number; dy: number }[]; texts: Record<string, string> };
export type ThemeLook = {
  id: string;
  name: string;
  accent: string;
  font: ThemeFont;
  creator: string;
  pieces: OverlayPiece[];
};

/** The theme's pieces with someone's edit applied, the same way the server applies it. */
export function withEdit(pieces: OverlayPiece[], edit: ThemeEdit | null): OverlayPiece[] {
  if (!edit) return pieces;
  return pieces.map((p, i) => {
    const moved = edit.pieces.length === pieces.length ? { ...p, ...edit.pieces[i]! } : p;
    if (!("html" in moved)) return moved;
    const texts = Object.fromEntries(
      Object.entries(edit.texts)
        .filter(([key]) => key.startsWith(`${i}.`))
        .map(([key, text]) => [key.slice(2), text]),
    );
    return Object.keys(texts).length ? { ...moved, texts } : moved;
  });
}

function Piece({ p }: { p: OverlayPiece }) {
  return "svg" in p ? (
    // Only catalog pieces carry svg: trusted host data, never from users.
    <span className="theme-edit-art" dangerouslySetInnerHTML={{ __html: p.svg }} />
  ) : (
    <PieceArt html={p.html} css={p.css} width={p.width} height={p.height} texts={p.texts} />
  );
}

/**
 * A pretend post by the viewer, wearing the theme: their name in the theme's face, the accent
 * ring, and the pieces. `children` replaces the pieces when the editor draws its own.
 */
export function ThemeStage({
  look,
  me,
  pieces,
  children,
}: {
  look: ThemeLook;
  me: User | undefined;
  pieces: OverlayPiece[];
  children?: ReactNode;
}) {
  const decoration = { ...look, tier: "market", pieces } as DecoratedPost["decoration"];
  return (
    <div className="theme-stage" style={themeStyle(decoration)}>
      <div className="theme-stage-card">
        <div className="theme-stage-head">
          {me && <Avatar user={me} small />}
          <strong>{me?.name ?? "You"}</strong>
        </div>
        <div className="theme-stage-body" style={{ background: look.accent }} />
        <p className="decor-credit">
          Theme <strong>{look.name}</strong> · by @{look.creator}
        </p>
      </div>
      {children ??
        pieces.map((p, i) => (
          <span
            key={i}
            className={`decor-piece decor-${p.anchor}`}
            style={place(p)}
            aria-hidden="true"
          >
            <Piece p={p} />
          </span>
        ))}
    </div>
  );
}

/** The text each slot shows before anyone changes it. */
function originals(pieces: OverlayPiece[]) {
  const found: { key: string; piece: number; name: string; text: string }[] = [];
  pieces.forEach((p, i) => {
    if (!("html" in p)) return;
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${p.html}`, "text/html");
    for (const name of textSlots(p.html)) {
      const el = Array.from(doc.querySelectorAll("[data-text]")).find(
        (e) => e.getAttribute("data-text")?.toLowerCase() === name,
      );
      found.push({ key: `${i}.${name}`, piece: i, name, text: el?.textContent?.trim() ?? "" });
    }
  });
  return found;
}

/**
 * Make a theme your own: drag its pieces (or move them with the arrow keys) and rewrite the text
 * its designer left open. Pieces cannot leave the edge band, so posts stay readable (ADR 0025).
 */
export function ThemeEditor({
  look,
  me,
  edit,
  onSave,
  onReset,
}: {
  look: ThemeLook;
  me: User | undefined;
  edit: ThemeEdit | null;
  onSave: (edit: ThemeEdit) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [pos, setPos] = useState(() =>
    look.pieces.map((p, i) => ({
      dx: edit?.pieces[i]?.dx ?? p.dx,
      dy: edit?.pieces[i]?.dy ?? p.dy,
    })),
  );
  const slots = useMemo(() => originals(look.pieces), [look.pieces]);
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.map((s) => [s.key, edit?.texts[s.key] ?? s.text])),
  );
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ i: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const fits = (i: number, at: { dx: number; dy: number }) =>
    Math.abs(at.dx) <= themeLimits.maxOffset &&
    Math.abs(at.dy) <= themeLimits.maxOffset &&
    pieceDepth({ ...look.pieces[i]!, ...at }) <= themeBand;
  /** Moves as far as the rules allow, sliding along an axis instead of sticking. */
  const moveTo = (i: number, at: { dx: number; dy: number }) =>
    setPos((all) => {
      const now = all[i]!;
      const next = [at, { dx: at.dx, dy: now.dy }, { dx: now.dx, dy: at.dy }].find((c) =>
        fits(i, c),
      );
      return next ? all.map((p, j) => (j === i ? next : p)) : all;
    });
  const pieces = withEdit(look.pieces, {
    pieces: pos,
    texts: Object.fromEntries(Object.entries(texts).filter(([, t]) => t.trim())),
  });
  const down = (i: number) => (e: PointerEvent<HTMLSpanElement>) => {
    // Otherwise the browser starts dragging the piece's image itself and cancels the pointer.
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { i, x: e.clientX, y: e.clientY, ...pos[i]! };
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    moveTo(d.i, {
      dx: Math.round(d.dx + e.clientX - d.x),
      dy: Math.round(d.dy + e.clientY - d.y),
    });
  };
  const keys = (i: number) => (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 20 : 4;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];
    if (!delta) return;
    e.preventDefault();
    moveTo(i, { dx: pos[i]!.dx + delta[0]!, dy: pos[i]!.dy + delta[1]! });
  };
  async function save() {
    setBusy(true);
    try {
      const changed = Object.fromEntries(
        slots
          .filter((s) => texts[s.key]?.trim() && texts[s.key]!.trim() !== s.text)
          .map((s) => [s.key, texts[s.key]!.trim()]),
      );
      await onSave({ pieces: pos, texts: changed });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="theme-editor">
      <p className="fineprint">
        Drag the pieces where you like them. They stay near the edges so your posts stay easy to
        read. Only you get this version.
      </p>
      <ThemeStage look={look} me={me} pieces={pieces}>
        {pieces.map((p, i) => (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Move piece ${i + 1}`}
            className={`decor-piece decor-${p.anchor} theme-edit-piece`}
            style={{ ...place(p), touchAction: "none" } as CSSProperties}
            onPointerDown={down(i)}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={keys(i)}
          >
            <Piece p={p} />
          </span>
        ))}
      </ThemeStage>
      {slots.length > 0 && (
        <div className="theme-edit-texts">
          {slots.map((s) => (
            <label key={s.key}>
              {slots.filter((o) => o.name === s.name).length > 1
                ? `Text on piece ${s.piece + 1}`
                : "Text"}{" "}
              <small>({s.name})</small>
              <input
                value={texts[s.key] ?? ""}
                maxLength={themeTextMax}
                onChange={(e) => setTexts((t) => ({ ...t, [s.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}
      <div className="theme-edit-actions">
        <button className="primary" disabled={busy} onClick={() => void save()}>
          Save my version
        </button>
        <button className="text-button" disabled={busy} onClick={() => void onReset()}>
          Back to the original
        </button>
      </div>
    </div>
  );
}
