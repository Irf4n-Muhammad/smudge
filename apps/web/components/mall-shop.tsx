"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  Maximize2,
  Search,
  Shirt,
  X,
} from "lucide-react";
import {
  slots,
  type CatalogItem,
  type FitView,
  type MallPerson,
  type Slot,
} from "../../../packages/contracts/src/mall";
import { Avatar } from "./ui";
import { MallFigure, sized } from "./mall-figure";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;
const face = (p: MallPerson) => ({ ...p, bio: "" });
type Board = Partial<Record<Slot, string>>;

const kinds: [Slot | "all", string][] = [
  ["all", "All"],
  ["top", "Tops"],
  ["bottom", "Bottoms"],
  ["outer", "Outer"],
  ["shoes", "Shoes"],
  ["bag", "Bags"],
];

/**
 * Shop: a grid to look for something, a reel to drift through. The grid opens first, filtered by
 * kind, words and what is near; tapping a piece opens the reel at it, one piece per screen, through
 * the same pieces. Each piece says who already wears it in a fit, and both views try it on your
 * figure in the corner.
 */
export function Shop({
  catalog,
  fits,
  board,
  onBoard,
  onWish,
  onShop,
  onFitsWith,
  onTryFit,
}: {
  catalog: CatalogItem[];
  fits: FitView[];
  board: Board;
  onBoard: (next: Board) => void;
  onWish: (item: CatalogItem) => void;
  onShop: (item: CatalogItem) => void;
  onFitsWith: (item: CatalogItem) => void;
  onTryFit: (fit: FitView) => void;
}) {
  const [nearOnly, setNearOnly] = useState(false);
  const [kind, setKind] = useState<Slot | "all">("all");
  const [query, setQuery] = useState("");
  const [reelAt, setReelAt] = useState<string | null>(null);
  const reel = useRef<HTMLDivElement>(null);
  // Who wears each piece, from the fits the viewer can see.
  const wearers = useMemo(() => {
    const out = new Map<string, MallPerson[]>();
    for (const fit of fits)
      for (const item of fit.items) {
        const list = out.get(item.id) ?? [];
        if (!list.some((p) => p.id === fit.owner.id)) list.push(fit.owner);
        out.set(item.id, list);
      }
    return out;
  }, [fits]);
  const words = query.trim().toLowerCase();
  const items = catalog.filter(
    (i) =>
      (!nearOnly || i.near > 0) &&
      (kind === "all" || i.slot === kind) &&
      (!words || `${i.name} ${i.store.name}`.toLowerCase().includes(words)),
  );
  // The reel opens at the piece you tapped.
  useLayoutEffect(() => {
    const list = reel.current;
    const at = reelAt && list?.querySelector<HTMLElement>(`[data-piece="${reelAt}"]`);
    if (list && at) list.scrollTop = at.offsetTop;
  }, [reelAt]);
  const toggle = (item: CatalogItem) => {
    const next = { ...board };
    if (board[item.slot] === item.id) delete next[item.slot];
    else next[item.slot] = item.id;
    onBoard(next);
  };
  const worn = (item: CatalogItem) => {
    const people = wearers.get(item.id) ?? [];
    if (!people.length) return null;
    return (
      <>
        <span className="mall-faces">
          {people.slice(0, 3).map((p) => (
            <Avatar key={p.id} user={face(p)} small />
          ))}
        </span>
        In {people.length} {people.length === 1 ? "fit" : "fits"} by {people[0]!.name.split(" ")[0]}
        {people.length > 1 ? ` and ${people.length - 1} more` : ""}
      </>
    );
  };
  // On a grid card, who wears it sits on the picture: faces first, then a first name.
  const faces = (item: CatalogItem) => {
    const people = wearers.get(item.id) ?? [];
    if (!people.length) return null;
    const first = people[0]!.name.split(" ")[0];
    return (
      <button
        className="mall-card-people"
        aria-label={`In ${people.length} ${people.length === 1 ? "fit" : "fits"} by ${first}${people.length > 1 ? ` and ${people.length - 1} more` : ""}`}
        onClick={() => onFitsWith(item)}
      >
        <span className="mall-faces">
          {people.slice(0, 3).map((p) => (
            <Avatar key={p.id} user={face(p)} small />
          ))}
        </span>
        {first}
        {people.length > 1 ? ` +${people.length - 1}` : ""}
      </button>
    );
  };
  // Fits by people slip in between pieces, those that wear something you are looking at.
  const shown = new Set(items.map((i) => i.id));
  const fitsHere = fits.filter((f) => f.items.some((i) => shown.has(i.id)));
  const fitCard = (fit: FitView) => (
    <article
      key={fit.id}
      className="mall-grid-fit"
      aria-label={`Fit: ${fit.title || "A fit"} by ${fit.owner.name}`}
    >
      <MallFigure pieces={Object.fromEntries(fit.items.map((i) => [i.slot, i]))} />
      <div className="mall-grid-fit-side">
        <span className="mall-grid-fit-owner">
          <Avatar user={face(fit.owner)} small />
          <strong>{fit.owner.name.split(" ")[0]}</strong>
          {fit.city && <small>{fit.city}</small>}
        </span>
        {fit.title && <h3>{fit.title}</h3>}
        {fit.award && <small className="mall-grid-fit-award">{fit.award}</small>}
        <small>
          {fit.items.length} pieces · {money(fit.total)} · {fit.likes}{" "}
          {fit.likes === 1 ? "like" : "likes"}
        </small>
        <button className="mall-try" onClick={() => onTryFit(fit)}>
          <Shirt size={16} /> Try it, change it
        </button>
      </div>
      <ul className="mall-grid-fit-pieces">
        {fit.items.map((i) => (
          <li key={i.id}>
            <img src={sized(i.image, 160)} alt="" loading="lazy" />
            <span>
              <small>{i.store.name}</small>
              {i.name}
            </span>
            <strong>{money(i.price)}</strong>
          </li>
        ))}
      </ul>
    </article>
  );
  const tryOn = (item: CatalogItem, size: number) => {
    const wearing = board[item.slot] === item.id;
    return (
      <button
        className={wearing ? "on" : ""}
        aria-pressed={wearing}
        aria-label={wearing ? `Take off ${item.name}` : `Try on ${item.name}`}
        onClick={() => toggle(item)}
      >
        {wearing ? <Check size={size} /> : <Shirt size={size} />}
        <span>{wearing ? "Wearing" : "Try on"}</span>
      </button>
    );
  };
  const wish = (item: CatalogItem, size: number) => (
    <button
      className={item.wished ? "on" : ""}
      aria-pressed={item.wished}
      aria-label={item.wished ? `Remove ${item.name} from your wishlist` : `Wish for ${item.name}`}
      onClick={() => onWish(item)}
    >
      <Bookmark size={size} />
      <span>Wish</span>
    </button>
  );

  if (reelAt)
    return (
      <div className="mall-shop">
        <button className="mall-reel-back" onClick={() => setReelAt(null)}>
          <ArrowLeft size={16} /> All pieces
        </button>
        <div className="mall-shop-list" ref={reel}>
          {items.map((item) => {
            const people = worn(item);
            return (
              <article
                key={item.id}
                data-piece={item.id}
                className={item.photo ? "mall-item worn" : "mall-item"}
                aria-label={`${item.name} from ${item.store.name}`}
              >
                {/* Worn when the shop has such a picture, else the piece alone, large. */}
                <img
                  className="mall-item-art"
                  src={sized(item.photo ?? item.image, 900)}
                  alt=""
                  loading="lazy"
                />
                <div className="mall-item-info">
                  <small>{item.store.name}</small>
                  <h2>{item.name}</h2>
                  <p>
                    <strong>{money(item.price)}</strong>
                    {item.near > 0 && (
                      <span className="mall-near"> · {item.near} to pick up near you</span>
                    )}
                  </p>
                  {people && (
                    <button className="mall-worn" onClick={() => onFitsWith(item)}>
                      {people}
                    </button>
                  )}
                </div>
                <div className="mall-item-rail">
                  {tryOn(item, 22)}
                  {wish(item, 22)}
                  <button
                    aria-label={`Buy ${item.name} at ${item.store.name}`}
                    onClick={() => onShop(item)}
                  >
                    <ArrowUpRight size={22} />
                    <span>Buy</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="mall-browse">
      <div className="mall-browse-bar">
        <label className="mall-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search the shop"
            placeholder="Search: chino, runner, Everlane…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="mall-kinds" role="group" aria-label="Kind of piece">
          {kinds.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={kind === value}
              className={kind === value ? "on" : ""}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
          <label className={nearOnly ? "mall-near-toggle on" : "mall-near-toggle"}>
            <input
              type="checkbox"
              checked={nearOnly}
              onChange={(e) => setNearOnly(e.target.checked)}
            />
            Near me
          </label>
        </div>
      </div>
      <div className="mall-grid">
        {items.flatMap((item, n) => {
          const card = (
            <article
              key={item.id}
              className="mall-card"
              aria-label={`${item.name} from ${item.store.name}`}
            >
              <div className="mall-card-media">
                <button
                  className={`mall-card-open ${item.slot}`}
                  aria-label={`Open ${item.name}`}
                  onClick={() => setReelAt(item.id)}
                >
                  <img src={sized(item.image, 500)} alt="" loading="lazy" />
                </button>
                <div className="mall-card-acts">{tryOn(item, 16)}</div>
                {faces(item)}
              </div>
              <small>{item.store.name}</small>
              <strong>{item.name}</strong>
              <span className="mall-card-price">
                {money(item.price)}
                {item.near > 0 && <span className="mall-near"> · {item.near} near you</span>}
              </span>
            </article>
          );
          // A fit after every eighth piece: a full row on two or four columns.
          const fit = (n + 1) % 8 === 0 ? fitsHere[(n + 1) / 8 - 1] : undefined;
          return fit ? [card, fitCard(fit)] : [card];
        })}
      </div>
      {!items.length && <p className="mall-empty">Nothing matches yet. Try fewer filters.</p>}
    </div>
  );
}

/**
 * Your figure in the corner: everything you tried on, worn together. Tap it to see it large,
 * take pieces off, name the fit and save it.
 */
export function FitDock({
  catalog,
  board,
  onBoard,
  onSave,
  notify,
}: {
  catalog: CatalogItem[];
  board: Board;
  onBoard: (next: Board) => void;
  onSave: (title: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const worn = slots.flatMap((slot) => {
    const item = board[slot] ? byId.get(board[slot]!) : undefined;
    return item ? [item] : [];
  });
  const pieces = Object.fromEntries(worn.map((i) => [i.slot, i])) as Partial<
    Record<Slot, CatalogItem>
  >;
  const total = worn.reduce((n, i) => n + i.price, 0);
  const save = () => {
    setBusy(true);
    onSave(title.trim())
      .then(() => {
        setTitle("");
        setOpen(false);
      })
      .catch((e: Error) => notify(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      {!worn.length ? (
        // Nothing tried on yet: a small pill, out of the way of the pieces.
        <button
          className="fit-dock fit-dock-pill"
          aria-label="Open your fit, 0 pieces"
          onClick={() => setOpen(true)}
        >
          <Shirt size={16} aria-hidden="true" /> Your fit
        </button>
      ) : (
        <div className="fit-dock" aria-label="Your fit">
          <button
            className="fit-dock-figure"
            aria-label={`Open your fit, ${worn.length} ${worn.length === 1 ? "piece" : "pieces"}`}
            onClick={() => setOpen(true)}
          >
            <MallFigure pieces={pieces} hints />
            <Maximize2 size={13} className="fit-dock-grow" aria-hidden="true" />
          </button>
          {worn.length >= 2 ? (
            <button className="fit-dock-save" onClick={() => setOpen(true)}>
              Save
            </button>
          ) : (
            <small className="fit-dock-hint">Try one more</small>
          )}
        </div>
      )}
      {open &&
        createPortal(
          <div className="mall-dialog-backdrop" onClick={() => setOpen(false)}>
            <div
              className="mall-dialog fit-big"
              role="dialog"
              aria-label="Your fit"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="fan-close" aria-label="Close" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
              <MallFigure pieces={pieces} className="fit-big-figure" hints />
              {worn.length ? (
                <ul className="fit-big-pieces">
                  {worn.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.store.name} · {money(item.price)}
                        </small>
                      </span>
                      <button
                        className="mall-icon"
                        aria-label={`Take off ${item.name}`}
                        onClick={() => {
                          const next = { ...board };
                          delete next[item.slot];
                          onBoard(next);
                        }}
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mall-fine">Scroll the shop and tap Try on. Pieces land here.</p>
              )}
              {worn.length > 0 && <p className="mall-total">Together: {money(total)}</p>}
              <input
                aria-label="Name your fit"
                placeholder="Name it (optional): Sunday trail, first date…"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <footer>
                <button
                  className="own-site-quiet"
                  onClick={() => onBoard({})}
                  disabled={!worn.length}
                >
                  Start over
                </button>
                <button className="easy-go" disabled={busy || worn.length < 2} onClick={save}>
                  Save this fit
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
