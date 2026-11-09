"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Bookmark, Check, Maximize2, Shirt, X } from "lucide-react";
import {
  slots,
  type CatalogItem,
  type FitView,
  type MallPerson,
  type Slot,
} from "../../../packages/contracts/src/mall";
import { Avatar } from "./ui";
import { MallFigure } from "./mall-figure";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;
const face = (p: MallPerson) => ({ ...p, bio: "" });
type Board = Partial<Record<Slot, string>>;

/**
 * Shop: one piece per screen, swiped like a reel. Each piece says who already wears it in a fit,
 * and three taps sit on the side: try it on your figure in the corner, wish for it, buy it at
 * the shop.
 */
export function Shop({
  catalog,
  fits,
  board,
  onBoard,
  onWish,
  onShop,
  onFitsWith,
}: {
  catalog: CatalogItem[];
  fits: FitView[];
  board: Board;
  onBoard: (next: Board) => void;
  onWish: (item: CatalogItem) => void;
  onShop: (item: CatalogItem) => void;
  onFitsWith: (item: CatalogItem) => void;
}) {
  const [nearOnly, setNearOnly] = useState(false);
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
  const items = nearOnly ? catalog.filter((i) => i.near > 0) : catalog;
  return (
    <div className="mall-shop">
      <label className="mall-near-chip">
        <input type="checkbox" checked={nearOnly} onChange={(e) => setNearOnly(e.target.checked)} />
        Near me
      </label>
      <div className="mall-shop-list">
        {items.map((item) => {
          const wearing = board[item.slot] === item.id;
          const people = wearers.get(item.id) ?? [];
          return (
            <article
              key={item.id}
              className="mall-item"
              aria-label={`${item.name} from ${item.store.name}`}
            >
              <div className="mall-item-art">
                <MallFigure pieces={{ [item.slot]: item }} focus={item.slot} />
              </div>
              <div className="mall-item-info">
                <small>{item.store.name}</small>
                <h2>{item.name}</h2>
                <p>
                  <strong>{money(item.price)}</strong>
                  {item.near > 0 && (
                    <span className="mall-near"> · {item.near} to pick up near you</span>
                  )}
                </p>
                {people.length > 0 && (
                  <button className="mall-worn" onClick={() => onFitsWith(item)}>
                    <span className="mall-faces">
                      {people.slice(0, 3).map((p) => (
                        <Avatar key={p.id} user={face(p)} small />
                      ))}
                    </span>
                    In {people.length} {people.length === 1 ? "fit" : "fits"} by{" "}
                    {people[0]!.name.split(" ")[0]}
                    {people.length > 1 ? ` and ${people.length - 1} more` : ""}
                  </button>
                )}
              </div>
              <div className="mall-item-rail">
                <button
                  className={wearing ? "on" : ""}
                  aria-pressed={wearing}
                  aria-label={wearing ? `Take off ${item.name}` : `Try on ${item.name}`}
                  onClick={() => {
                    const next = { ...board };
                    if (wearing) delete next[item.slot];
                    else next[item.slot] = item.id;
                    onBoard(next);
                  }}
                >
                  {wearing ? <Check size={22} /> : <Shirt size={22} />}
                  <span>{wearing ? "Wearing" : "Try on"}</span>
                </button>
                <button
                  className={item.wished ? "on" : ""}
                  aria-pressed={item.wished}
                  aria-label={
                    item.wished ? `Remove ${item.name} from your wishlist` : `Wish for ${item.name}`
                  }
                  onClick={() => onWish(item)}
                >
                  <Bookmark size={22} />
                  <span>Wish</span>
                </button>
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
        {!items.length && <p className="mall-empty">Nothing to pick up near you yet.</p>}
      </div>
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
      <div className="fit-dock" aria-label="Your fit">
        <button
          className="fit-dock-figure"
          aria-label={`Open your fit, ${worn.length} ${worn.length === 1 ? "piece" : "pieces"}`}
          onClick={() => setOpen(true)}
        >
          <MallFigure pieces={pieces} />
          <Maximize2 size={13} className="fit-dock-grow" aria-hidden="true" />
        </button>
        {worn.length >= 2 ? (
          <button className="fit-dock-save" onClick={() => setOpen(true)}>
            Save
          </button>
        ) : (
          <small className="fit-dock-hint">{worn.length ? "Try one more" : "Try things on"}</small>
        )}
      </div>
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
              <MallFigure pieces={pieces} className="mall-figure fit-big-figure" />
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
