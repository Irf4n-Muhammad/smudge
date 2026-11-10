"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Store, Trash2 } from "lucide-react";
import {
  cities,
  slots,
  type City,
  type MallItem,
  type ShopProduct,
  type ShopView,
  type Slot,
} from "../../../packages/contracts/src/mall";
import { api } from "./runtime";
import { Sheet } from "./fans-seller";
import { hostOf } from "./post-link";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;
const slotNames: Record<Slot, string> = {
  top: "Top",
  bottom: "Bottom",
  outer: "Outer",
  shoes: "Shoes",
  bag: "Bag",
};

/**
 * For an account whose proven website is a brand: bring its own pieces into the Mall from that
 * website, say how many can be picked up in a city, and take pieces out again.
 */
export function ShopCorner({
  city,
  notify,
  onChange,
}: {
  city: City | null;
  notify: (message: string) => void;
  onChange: () => void;
}) {
  const [shop, setShop] = useState<ShopView | null>(null);
  const [sheet, setSheet] = useState<"bring" | "pieces" | null>(null);
  const load = useCallback(
    () => api<ShopView>("/mall/shop").then(setShop, (e: Error) => notify(e.message)),
    [notify],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!shop?.allowed || !shop.site) return null;
  const host = hostOf(shop.site);
  const changed = (items: MallItem[]) => {
    setShop({ ...shop, items });
    onChange();
  };
  return (
    <div className="seller-bar" role="region" aria-label="Your shop">
      <span>
        <strong>
          <Store size={15} aria-hidden="true" /> Your shop
        </strong>
        <p>
          {shop.items.length
            ? `${shop.items.length} of your pieces are in the Mall, read from ${host}.`
            : `Bring your pieces into the Mall from ${host}.`}
        </p>
      </span>
      {shop.items.length > 0 && (
        <button className="mall-try" onClick={() => setSheet("pieces")}>
          Your pieces
        </button>
      )}
      <button className="drop-claim" onClick={() => setSheet("bring")}>
        <Plus size={15} aria-hidden="true" /> Bring pieces
      </button>
      {sheet === "bring" && (
        <BringSheet
          host={host}
          notify={notify}
          onClose={() => setSheet(null)}
          onDone={(items) => {
            setSheet(null);
            changed(items);
          }}
        />
      )}
      {sheet === "pieces" && (
        <PiecesSheet
          items={shop.items}
          city={city}
          notify={notify}
          onClose={() => setSheet(null)}
          onChange={changed}
        />
      )}
    </div>
  );
}

function BringSheet({
  host,
  notify,
  onClose,
  onDone,
}: {
  host: string;
  notify: (message: string) => void;
  onClose: () => void;
  onDone: (items: MallItem[]) => void;
}) {
  const [found, setFound] = useState<ShopProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState<Record<string, Slot>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ShopProduct[]>("/mall/shop/products").then(setFound, () => setFailed(true));
  }, []);
  const chosen = Object.entries(picks);
  return (
    <Sheet label={`Bring pieces from ${host}`} onClose={onClose}>
      {failed ? (
        <p className="mall-fine">
          We couldn&apos;t read a product list at {host}/products.json. Shops on Shopify publish one
          by default; other shop systems aren&apos;t read yet.
        </p>
      ) : !found ? (
        <p className="mall-fine">Reading {host}…</p>
      ) : !found.length ? (
        <p className="mall-fine">No products with a picture and a price were found on {host}.</p>
      ) : (
        <>
          <p className="mall-fine">
            Names, pictures, prices and links come straight from your website. Tick what should be
            in the Mall, and fix where on an outfit each one goes.
          </p>
          <ul className="shop-products">
            {found.map((p) => (
              <li key={p.key}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Bring ${p.name}`}
                    checked={p.key in picks}
                    onChange={(e) =>
                      setPicks((old) => {
                        const next = { ...old };
                        if (e.target.checked) next[p.key] = p.slot;
                        else delete next[p.key];
                        return next;
                      })
                    }
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {money(p.price)}
                      {p.added && " · already in the Mall"}
                    </small>
                  </span>
                </label>
                <select
                  aria-label={`Where ${p.name} goes`}
                  value={picks[p.key] ?? p.slot}
                  onChange={(e) => setPicks((old) => ({ ...old, [p.key]: e.target.value as Slot }))}
                >
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {slotNames[s]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <button
            className="drop-claim"
            disabled={busy || !chosen.length || chosen.length > 50}
            onClick={async () => {
              setBusy(true);
              try {
                const items = await api<MallItem[]>("/mall/shop/import", {
                  picks: chosen.map(([key, slot]) => ({ key, slot })),
                });
                notify(
                  `${chosen.length} ${chosen.length === 1 ? "piece is" : "pieces are"} in the Mall.`,
                );
                onDone(items);
              } catch (e) {
                notify((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {chosen.length > 50
              ? "Up to 50 at a time"
              : chosen.length
                ? `Bring ${chosen.length} into the Mall`
                : "Tick the pieces to bring"}
          </button>
        </>
      )}
    </Sheet>
  );
}

function PiecesSheet({
  items,
  city,
  notify,
  onClose,
  onChange,
}: {
  items: MallItem[];
  city: City | null;
  notify: (message: string) => void;
  onClose: () => void;
  onChange: (items: MallItem[]) => void;
}) {
  const [where, setWhere] = useState<City>(city ?? cities[0]);
  const fail = (e: Error) => notify(e.message);
  return (
    <Sheet label="Your pieces in the Mall" onClose={onClose}>
      <label className="shop-where">
        How many can be picked up in
        <select
          aria-label="City for pick-up counts"
          value={where}
          onChange={(e) => setWhere(e.target.value as City)}
        >
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {!items.length && <p className="mall-fine">Nothing here now.</p>}
      <ul className="shop-products">
        {items.map((i) => (
          <li key={i.id}>
            <label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.image} alt="" loading="lazy" />
              <span>
                <strong>{i.name}</strong>
                <small>
                  {money(i.price)} · {slotNames[i.slot]}
                </small>
              </span>
            </label>
            <input
              key={`${i.id}:${where}`}
              type="number"
              min={0}
              max={9999}
              aria-label={`${i.name} in ${where}`}
              defaultValue={i.stock[where] ?? 0}
              onBlur={(e) => {
                const count = Math.max(0, Math.min(9999, Math.round(Number(e.target.value) || 0)));
                if (count === (i.stock[where] ?? 0)) return;
                api<MallItem[]>(`/mall/shop/items/${encodeURIComponent(i.id)}/stock`, {
                  city: where,
                  count,
                }).then(onChange, fail);
              }}
            />
            <button
              className="shop-remove"
              aria-label={`Take ${i.name} out of the Mall`}
              onClick={() =>
                api<MallItem[]>(
                  `/mall/shop/items/${encodeURIComponent(i.id)}`,
                  undefined,
                  "DELETE",
                ).then(onChange, fail)
              }
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
