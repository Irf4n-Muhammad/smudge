import { useId } from "react";
import type { MallItem, Slot } from "../../../packages/contracts/src/mall";

type Piece = Pick<MallItem, "id" | "color" | "pattern" | "name">;

/** A pattern fill for striped or checked pieces, drawn in a darker tone of the piece. */
function Fill({ id, piece }: { id: string; piece: Piece }) {
  if (!piece.pattern) return null;
  const line = "rgba(20,24,40,.55)";
  return (
    <pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill={piece.color} />
      {piece.pattern === "stripe" ? (
        <rect y="7" width="12" height="3" fill={line} />
      ) : (
        <>
          <rect x="5" width="3" height="12" fill={line} opacity=".7" />
          <rect y="5" width="12" height="3" fill={line} opacity=".7" />
        </>
      )}
    </pattern>
  );
}

/**
 * The 2D figure an outfit is tried on: a plain mannequin, each chosen piece drawn over it in
 * its colour, layered bottom to outer. Pieces left empty show the mannequin underneath.
 */
export function MallFigure({
  pieces,
  className,
}: {
  pieces: Partial<Record<Slot, Piece>>;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const fill = (slot: Slot) => {
    const p = pieces[slot];
    if (!p) return "none";
    return p.pattern ? `url(#${uid}-${slot})` : p.color;
  };
  const skirt = pieces.bottom && /skirt/i.test(pieces.bottom.name);
  const label = Object.values(pieces)
    .map((p) => p!.name)
    .join(", ");
  return (
    <svg
      className={className ?? "mall-figure"}
      viewBox="0 0 200 360"
      role="img"
      aria-label={label ? `Outfit: ${label}` : "An empty figure"}
    >
      <defs>
        {(Object.keys(pieces) as Slot[]).map((slot) => (
          <Fill key={slot} id={`${uid}-${slot}`} piece={pieces[slot]!} />
        ))}
      </defs>
      <g className="mall-mannequin">
        <circle cx="100" cy="38" r="22" />
        <rect x="92" y="56" width="16" height="16" rx="6" />
        <path d="M64 78 Q100 66 136 78 L140 190 L60 190 Z" />
        <path d="M64 80 L46 170 L56 172 L72 100 Z M136 80 L154 170 L144 172 L128 100 Z" />
        <path d="M66 188 L98 188 L96 312 L76 312 Z M102 188 L134 188 L124 312 L104 312 Z" />
      </g>
      {pieces.bottom &&
        (skirt ? (
          <path d="M66 184 L134 184 L148 258 L52 258 Z" fill={fill("bottom")} />
        ) : (
          <path
            d="M64 184 L136 184 L128 314 L104 314 L100 214 L96 314 L72 314 Z"
            fill={fill("bottom")}
          />
        ))}
      {pieces.shoes && (
        <g fill={fill("shoes")} stroke="rgba(0,0,0,.25)" strokeWidth="1.5">
          <path d="M70 310 h28 v10 q0 8 -8 8 h-26 q-6 0 -4 -8 z" />
          <path d="M102 310 h28 l6 10 q2 8 -4 8 h-26 q-4 0 -4 -6 z" />
        </g>
      )}
      {pieces.top && (
        <path
          d="M64 76 Q100 64 136 76 L160 128 L142 136 L134 116 L136 196 L64 196 L66 116 L58 136 L40 128 Z"
          fill={fill("top")}
          stroke="rgba(0,0,0,.18)"
          strokeWidth="1.5"
        />
      )}
      {pieces.outer && (
        <g fill={fill("outer")} stroke="rgba(0,0,0,.25)" strokeWidth="1.5">
          <path d="M62 76 Q80 70 94 72 L92 214 L58 210 L60 120 L52 180 L38 176 Z" />
          <path d="M138 76 Q120 70 106 72 L108 214 L142 210 L140 120 L148 180 L162 176 Z" />
        </g>
      )}
      {pieces.bag && (
        <g>
          <path d="M70 78 L150 196" stroke={pieces.bag.color} strokeWidth="5" fill="none" />
          <rect
            x="134"
            y="186"
            width="38"
            height="32"
            rx="6"
            fill={fill("bag")}
            stroke="rgba(0,0,0,.25)"
            strokeWidth="1.5"
          />
        </g>
      )}
    </svg>
  );
}

/** A small square of a piece's colour or pattern, for lists of pieces. */
export function Swatch({ piece }: { piece: Piece }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg className="mall-swatch" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <Fill id={`${uid}-s`} piece={piece} />
      </defs>
      <rect
        width="24"
        height="24"
        rx="6"
        fill={piece.pattern ? `url(#${uid}-s)` : piece.color}
        stroke="rgba(0,0,0,.15)"
      />
    </svg>
  );
}
