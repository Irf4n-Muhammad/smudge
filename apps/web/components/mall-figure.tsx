import type { MallItem, Slot } from "../../../packages/contracts/src/mall";

type Piece = Pick<MallItem, "id" | "name" | "image" | "slot">;

/** A shop picture at the size it is shown, from the shop's own image server. */
export function sized(src: string, width: number) {
  try {
    const url = new URL(src);
    if (url.hostname === "cdn.shopify.com") url.searchParams.set("width", String(width));
    return url.href;
  } catch {
    return src;
  }
}

/** A piece's picture with the shop's backdrop lifted off, so every piece sits on one background. */
export const cut = (piece: { id: string }) =>
  `/api/mall/items/${encodeURIComponent(piece.id)}/cutout`;

/** Where each piece lies on a fit laid flat, in percent of the board: left, top, width, height. */
const spots: Record<Slot, [number, number, number, number]> = {
  outer: [3, 3, 45.5, 40],
  top: [51.5, 3, 45.5, 40],
  bottom: [3, 45, 45.5, 52],
  shoes: [51.5, 45, 45.5, 24],
  bag: [51.5, 71, 45.5, 26],
};
/** Without an outer layer, a finished fit centers its top. */
const topAlone: [number, number, number, number] = [27, 3, 46, 40];

/**
 * A fit laid flat as a grid of shop pictures: the outer layer and the top side by side, the
 * bottom under them, shoes and bag beside it. Empty places show what still fits there.
 */
export function MallFigure({
  pieces,
  className,
  hints = false,
}: {
  pieces: Partial<Record<Slot, Piece>>;
  className?: string;
  /** Marks the empty places, for your own fit in progress. */
  hints?: boolean;
}) {
  const label = Object.values(pieces)
    .map((p) => p!.name)
    .join(", ");
  const order: Slot[] = ["bag", "shoes", "bottom", "top", "outer"];
  return (
    <div
      className={`fit-board ${className ?? ""}`}
      role="img"
      aria-label={label ? `Outfit: ${label}` : "An empty outfit"}
    >
      {order.map((slot) => {
        const piece = pieces[slot];
        const [left, top, width, height] =
          slot === "top" && !pieces.outer && !hints ? topAlone : spots[slot];
        const style = {
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        };
        if (piece)
          return (
            <img
              key={slot}
              className={`fit-piece fit-${slot}`}
              src={cut(piece)}
              alt=""
              loading="lazy"
              style={style}
            />
          );
        if (!hints) return null;
        return (
          <span key={slot} className="fit-hole" style={style} aria-hidden="true">
            {slot}
          </span>
        );
      })}
    </div>
  );
}

/** A small picture of a piece, for lists of pieces. */
export function Swatch({ piece }: { piece: Piece }) {
  return <img className="mall-swatch" src={cut(piece)} alt="" loading="lazy" />;
}
