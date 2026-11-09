"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Award, Bookmark, Gift, Heart, MapPin, Shirt, Users } from "lucide-react";
import {
  cities,
  type CatalogItem,
  type City,
  type FitView,
  type GiftView,
  type MallPerson,
  type Slot,
  type WishlistView,
} from "../../../packages/contracts/src/mall";
import { api } from "./runtime";
import { Avatar } from "./ui";
import { MallFigure, Swatch, sized } from "./mall-figure";
import { OutsidePage, PageSheet } from "./page-sheet";
import { hostOf } from "./post-link";
import { DropsList } from "./fans";
import { FitDock, Shop } from "./mall-shop";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;
const face = (p: MallPerson) => ({ ...p, bio: "" });
type Segment = "shop" | "fits" | "wishlists" | "drops";

/**
 * The Mall tab: fits people put together from shops' pieces, scrolled one at a time; a board to
 * make your own; and wishlists, where friends turn a wish into a voucher, alone or together.
 * Buying happens on the shop's page, opened inside Smudge.
 */
export function MallPage({
  meId,
  notify,
  onOpenUser,
}: {
  meId: string;
  notify: (message: string) => void;
  onOpenUser: (id: string) => void;
}) {
  const [segment, setSegment] = useState<Segment>("shop");
  // Fits that wear one piece, when you came from that piece in Shop.
  const [fitsWith, setFitsWith] = useState<CatalogItem | null>(null);
  const [data, setData] = useState<{
    city: City | null;
    catalog: CatalogItem[];
    fits: FitView[];
  } | null>(null);
  const [board, setBoard] = useState<Partial<Record<Slot, string>>>({});
  const [shop, setShop] = useState<CatalogItem | null>(null);
  const load = useCallback(
    () =>
      api<{ city: City | null; catalog: CatalogItem[]; fits: FitView[] }>("/mall").then(
        setData,
        (e: Error) => notify(e.message),
      ),
    [notify],
  );
  useEffect(() => {
    void load();
  }, [load, meId]);
  async function setCity(city: City) {
    await api("/mall/city", { city });
    await load();
  }
  async function wish(item: CatalogItem) {
    const r = await api<{ wished: boolean }>(`/mall/items/${item.id}/wish`, {});
    notify(r.wished ? `${item.name} is on your wishlist.` : `${item.name} left your wishlist.`);
    await load();
  }
  function tryOn(fit: FitView) {
    setBoard(Object.fromEntries(fit.items.map((i) => [i.slot, i.id])));
    setSegment("shop");
    notify(`You're wearing ${fit.owner.name.split(" ")[0]}'s fit. Swap pieces as you scroll.`);
  }
  async function saveFit(title: string) {
    await api("/mall/fits", { title, items: board });
    notify("Your fit is saved and in the Mall.");
    setBoard({});
    setFitsWith(null);
    setSegment("fits");
    await load();
  }
  return (
    <section className="mall" aria-label="Mall">
      <header className="mall-top">
        <h1>Mall</h1>
        <div className="mall-segments" role="tablist" aria-label="Mall sections">
          {(
            [
              ["shop", "Shop"],
              ["fits", "Fits"],
              ["wishlists", "Wishlists"],
              ["drops", "Drops"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={segment === key}
              onClick={() => {
                setSegment(key);
                setFitsWith(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <label className="mall-city">
            <MapPin size={14} aria-hidden="true" />
            <select
              aria-label="Your city"
              value={data.city ?? ""}
              onChange={(e) => void setCity(e.target.value as City)}
            >
              {!data.city && <option value="">Pick your city</option>}
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
      </header>
      {!data ? (
        <p className="mall-empty">Opening the Mall…</p>
      ) : segment === "shop" ? (
        <Shop
          catalog={data.catalog}
          fits={data.fits}
          board={board}
          onBoard={setBoard}
          onWish={wish}
          onShop={setShop}
          onFitsWith={(item) => {
            setFitsWith(item);
            setSegment("fits");
          }}
          onTryFit={tryOn}
        />
      ) : segment === "fits" ? (
        <Fits
          fits={
            fitsWith
              ? data.fits.filter((f) => f.items.some((i) => i.id === fitsWith.id))
              : data.fits
          }
          only={fitsWith}
          onAll={() => setFitsWith(null)}
          meId={meId}
          onLike={async (fit) => {
            await api(`/mall/fits/${fit.id}/like`, {});
            await load();
          }}
          onTry={tryOn}
          onWish={wish}
          onShop={setShop}
          onOpenUser={onOpenUser}
          onMake={() => setSegment("shop")}
        />
      ) : segment === "drops" ? (
        <DropsList key={meId} notify={notify} />
      ) : (
        <Wishlists meId={meId} notify={notify} onWish={wish} onShop={setShop} />
      )}
      {data && (segment === "shop" || segment === "fits") && (
        <FitDock
          catalog={data.catalog}
          board={board}
          onBoard={setBoard}
          onSave={saveFit}
          notify={notify}
        />
      )}
      {shop && (
        <PageSheet
          title={shop.name}
          site={hostOf(shop.url)}
          made={false}
          href={shop.url}
          notify={notify}
          onClose={() => setShop(null)}
        >
          <OutsidePage url={shop.url} title={shop.name} />
        </PageSheet>
      )}
    </section>
  );
}

function PieceRow({
  item,
  onWish,
  onShop,
}: {
  item: CatalogItem;
  onWish: (item: CatalogItem) => void;
  onShop: (item: CatalogItem) => void;
}) {
  return (
    <li className="mall-piece">
      <Swatch piece={item} />
      <span className="mall-piece-text">
        <strong>{item.name}</strong>
        <small>
          {item.store.name} · {money(item.price)}
          {item.near > 0 && <span className="mall-near"> · {item.near} near you</span>}
        </small>
      </span>
      <button
        className={item.wished ? "mall-icon on" : "mall-icon"}
        aria-label={
          item.wished ? `Remove ${item.name} from your wishlist` : `Wish for ${item.name}`
        }
        aria-pressed={item.wished}
        onClick={() => onWish(item)}
      >
        <Bookmark size={16} />
      </button>
      <button
        className="mall-icon"
        aria-label={`Buy ${item.name} at ${item.store.name}`}
        onClick={() => onShop(item)}
      >
        <ArrowUpRight size={16} />
      </button>
    </li>
  );
}

function Fits({
  fits,
  only,
  onAll,
  meId,
  onLike,
  onTry,
  onWish,
  onShop,
  onOpenUser,
  onMake,
}: {
  fits: FitView[];
  only: CatalogItem | null;
  onAll: () => void;
  meId: string;
  onLike: (fit: FitView) => void;
  onTry: (fit: FitView) => void;
  onWish: (item: CatalogItem) => void;
  onShop: (item: CatalogItem) => void;
  onOpenUser: (id: string) => void;
  onMake: () => void;
}) {
  if (!fits.length)
    return (
      <div className="mall-empty">
        <p>No fits yet. Try pieces on as you scroll the shops.</p>
        <button className="easy-go" onClick={onMake}>
          Go shopping
        </button>
      </div>
    );
  return (
    <div className="mall-fits">
      {only && (
        <p className="mall-filter">
          Fits wearing <strong>{only.name}</strong>
          <button className="text-button" onClick={onAll}>
            Show all fits
          </button>
        </p>
      )}
      {fits.map((fit) => (
        <article
          key={fit.id}
          className="mall-fit"
          aria-label={`${fit.title || "A fit"} by ${fit.owner.name}`}
        >
          <div className="mall-fit-stage">
            <MallFigure pieces={Object.fromEntries(fit.items.map((i) => [i.slot, i]))} />
            {fit.award && (
              <span className="mall-award">
                <Award size={14} aria-hidden="true" /> {fit.award}
              </span>
            )}
          </div>
          <div className="mall-fit-side">
            <button className="mall-owner" onClick={() => onOpenUser(fit.owner.id)}>
              <Avatar user={face(fit.owner)} small />
              <span>
                <strong>{fit.owner.id === meId ? "You" : fit.owner.name}</strong>
                {fit.city && <small>{fit.city}</small>}
              </span>
            </button>
            {fit.title && <h2>{fit.title}</h2>}
            <ul className="mall-pieces">
              {fit.items.map((item) => (
                <PieceRow key={item.id} item={item} onWish={onWish} onShop={onShop} />
              ))}
            </ul>
            <p className="mall-total">All of it: {money(fit.total)}</p>
            <div className="mall-fit-actions">
              <button
                className={fit.liked ? "mall-like on" : "mall-like"}
                aria-pressed={fit.liked}
                aria-label={fit.liked ? "Unlike this fit" : "Like this fit"}
                onClick={() => onLike(fit)}
              >
                <Heart size={17} /> {fit.likes}
              </button>
              <button className="mall-try" onClick={() => onTry(fit)}>
                <Shirt size={16} /> Try it, change it
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Wishlists({
  meId,
  notify,
  onWish,
  onShop,
}: {
  meId: string;
  notify: (message: string) => void;
  onWish: (item: CatalogItem) => void;
  onShop: (item: CatalogItem) => void;
}) {
  const [lists, setLists] = useState<{ mine: WishlistView; friends: WishlistView[] } | null>(null);
  const [gifts, setGifts] = useState<{ received: GiftView[]; given: GiftView[] } | null>(null);
  const [giving, setGiving] = useState<{ person: MallPerson; item: CatalogItem } | null>(null);
  const load = useCallback(async () => {
    const [l, g] = await Promise.all([
      api<{ mine: WishlistView; friends: WishlistView[] }>("/mall/wishlists"),
      api<{ received: GiftView[]; given: GiftView[] }>("/mall/gifts"),
    ]);
    setLists(l);
    setGifts(g);
  }, []);
  useEffect(() => {
    void load().catch((e: Error) => notify(e.message));
  }, [load, meId, notify]);
  if (!lists || !gifts) return <p className="mall-empty">Opening wishlists…</p>;
  return (
    <div className="mall-wishlists">
      {gifts.received.length > 0 && (
        <section className="mall-card" aria-label="Your vouchers">
          <h2>
            <Gift size={18} aria-hidden="true" /> For you
          </h2>
          {gifts.received.map((g) => (
            <div key={g.id} className="mall-voucher">
              <Swatch piece={g.item} />
              <span>
                <strong>{g.item.name}</strong>
                <small>
                  From {g.from.map((p) => p.name).join(", ")}
                  {g.note && <> · “{g.note}”</>}
                </small>
              </span>
              <code>{g.code}</code>
            </div>
          ))}
          <p className="mall-fine">
            Show the code at the shop or enter it on its page. Test codes for now.
          </p>
        </section>
      )}
      {lists.friends.map((list) => (
        <section
          key={list.person.id}
          className="wish-friend"
          aria-label={`${list.person.name}'s wishlist`}
        >
          <h2 className="wish-head">
            <Avatar user={face(list.person)} />
            <span>
              {list.person.name.split(" ")[0]} wishes for
              <small>
                {list.items.length} {list.items.length === 1 ? "piece" : "pieces"}
                {list.pots.length > 0 && " · a group gift is open"}
              </small>
            </span>
          </h2>
          <ul className="wish-row">
            {list.items.map((item) => {
              const pot = list.pots.find((p) => p.item.id === item.id);
              return (
                <li key={item.id} className={pot ? "wish-tile pot" : "wish-tile"}>
                  <img
                    className={`wish-art ${item.slot}`}
                    src={sized(item.image, 500)}
                    alt=""
                    loading="lazy"
                  />
                  <small>{item.store.name}</small>
                  <strong>{item.name}</strong>
                  {pot ? (
                    <span
                      className="mall-pot"
                      aria-label={`${money(pot.raised)} of ${money(pot.goal)} raised`}
                    >
                      <span className="mall-pot-bar">
                        <span
                          style={{ width: `${Math.min(100, (pot.raised / pot.goal) * 100)}%` }}
                        />
                      </span>
                      <small>
                        <span className="mall-faces">
                          {pot.from.slice(0, 3).map((p) => (
                            <Avatar key={p.id} user={face(p)} small />
                          ))}
                        </span>
                        {money(pot.raised)} of {money(pot.goal)} from{" "}
                        {pot.from.map((p) => p.name).join(", ")}
                      </small>
                    </span>
                  ) : (
                    <span className="wish-price">{money(item.price)}</span>
                  )}
                  {pot ? (
                    <ChipIn
                      pot={pot}
                      onDone={async (amount) => {
                        const r = await api<GiftView>(`/mall/gifts/${pot.id}/chip-in`, { amount });
                        notify(
                          r.status === "given"
                            ? `Done. ${list.person.name} gets the ${item.name}.`
                            : `You put in ${money(amount)}.`,
                        );
                        await load();
                      }}
                    />
                  ) : (
                    <button
                      className="mall-give"
                      onClick={() => setGiving({ person: list.person, item })}
                    >
                      <Gift size={15} /> Give
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="mall-card" aria-label="Your wishlist">
        <h2>
          <Bookmark size={18} aria-hidden="true" /> Your wishlist
        </h2>
        {lists.mine.items.length ? (
          <ul className="mall-pieces">
            {lists.mine.items.map((item) => (
              <PieceRow
                key={item.id}
                item={item}
                onWish={async (i) => {
                  await onWish(i);
                  await load();
                }}
                onShop={onShop}
              />
            ))}
          </ul>
        ) : (
          <p className="mall-fine">
            Tap the bookmark on any piece. Friends see your wishlist and can give you one.
          </p>
        )}
      </section>
      {giving && (
        <GiveDialog
          person={giving.person}
          item={giving.item}
          onClose={() => setGiving(null)}
          onGive={async (body) => {
            const r = await api<GiftView>("/mall/gifts", {
              toId: giving.person.id,
              itemId: giving.item.id,
              ...body,
            });
            notify(
              r.status === "given"
                ? `${giving.person.name} gets the ${giving.item.name}.`
                : `Group gift started. Friends of ${giving.person.name} can chip in.`,
            );
            setGiving(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ChipIn({ pot, onDone }: { pot: GiftView; onDone: (amount: number) => Promise<void> }) {
  const left = pot.goal - pot.raised;
  const [busy, setBusy] = useState(false);
  const amount = Math.min(left, 2000);
  return (
    <button
      className="mall-give"
      disabled={busy || left <= 0}
      onClick={() => {
        setBusy(true);
        void onDone(amount).finally(() => setBusy(false));
      }}
    >
      <Users size={15} /> Chip in {money(amount)}
    </button>
  );
}

function GiveDialog({
  person,
  item,
  onClose,
  onGive,
}: {
  person: MallPerson;
  item: CatalogItem;
  onClose: () => void;
  onGive: (body: { note: string; group: boolean; amount?: number }) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [group, setGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = Math.min(item.price, 2000);
  return (
    <div className="mall-dialog-backdrop" onClick={onClose}>
      <div
        className="mall-dialog"
        role="dialog"
        aria-label={`Give ${person.name} the ${item.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <img className="mall-gift-img" src={sized(item.image, 400)} alt="" />
        <h2>
          {item.name} for {person.name}
        </h2>
        <p className="mall-fine">
          A voucher for {money(item.price)} at {item.store.name}. They pick it up or order it there.
        </p>
        <div className="mall-choice" role="radiogroup" aria-label="How to give">
          <button role="radio" aria-checked={!group} onClick={() => setGroup(false)}>
            Just from me, {money(item.price)}
          </button>
          <button role="radio" aria-checked={group} onClick={() => setGroup(true)}>
            Together with friends, I start with {money(start)}
          </button>
        </div>
        <input
          aria-label="A note"
          placeholder="A note (optional)"
          maxLength={140}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="mall-fine">Test mode: no money moves yet.</p>
        <footer>
          <button className="own-site-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="easy-go"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onGive({ note, group, ...(group ? { amount: start } : {}) }).finally(() =>
                setBusy(false),
              );
            }}
          >
            {group ? "Start the group gift" : "Give it"}
          </button>
        </footer>
      </div>
    </div>
  );
}
