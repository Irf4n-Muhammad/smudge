import { randomUUID, randomBytes } from "node:crypto";
import {
  chipInSchema,
  citySchema,
  fitSchema,
  giftSchema,
  type CatalogItem,
  type City,
  type FitView,
  type GiftView,
  type MallItem,
  type MallPerson,
  type MallStore,
  type Slot,
  type WishlistView,
} from "../../contracts/src/mall.js";
import type { User } from "../../contracts/src/experience.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface Fit {
  id: string;
  ownerId: string;
  title: string;
  items: Partial<Record<Slot, string>>;
  city: City | null;
  createdAt: string;
}
interface FitLike {
  fitId: string;
  userId: string;
  at: string;
}
interface Wish {
  userId: string;
  itemId: string;
  at: string;
}
interface Gift {
  id: string;
  toId: string;
  itemId: string;
  note: string;
  goal: number;
  chips: { userId: string; amount: number; at: string }[];
  status: "open" | "given";
  code?: string;
  createdAt: string;
}

/** An account must be this old before its likes count toward awards, so fresh bots don't. */
const LIKE_AGE = 7 * 86_400_000;
/** A fit needs this many counted likes to win or lead its city. */
const AWARD_LIKES = 2;
const month = (at: string | number | Date) => new Date(at).toISOString().slice(0, 7);
const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The Mall: shops' pieces put together by people into fits. Saving a piece puts it on your
 * wishlist, friends turn a wish into a voucher (alone or chipping in together), and each city
 * gets its own monthly top fit from people's likes, so there is never one global leaderboard.
 */
export class MallService {
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  /** Whether the viewer may see a person; the server installs the privacy rules. */
  peopleFilter: (viewerId: string, userId: string) => boolean = () => true;

  private get store() {
    return this.social.store;
  }
  private person(id: string): MallPerson | null {
    const u = this.store.get<User>("user", id);
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      handle: u.handle,
      initials: u.initials,
      color: u.color,
      ...(u.avatarAssetId ? { avatarAssetId: u.avatarAssetId } : {}),
    };
  }
  private visiblePerson(viewerId: string, id: string) {
    if (id !== viewerId && !this.peopleFilter(viewerId, id)) return null;
    return this.person(id);
  }

  cityOf(userId: string): City | null {
    return this.store.get<{ city: City }>("mall-city", userId)?.city ?? null;
  }
  setCity(actor: Actor, input: unknown) {
    const me = this.social.actor(actor);
    const { city } = citySchema.parse(input);
    this.store.transaction(() => this.store.put("mall-city", me, { city }));
    return { city };
  }

  private items() {
    return new Map(this.store.all<MallItem>("mall-item").map((i) => [i.id, i]));
  }
  private stores(items: Iterable<MallItem>) {
    const out = new Map<string, MallStore>();
    for (const i of items)
      if (!out.has(i.storeId)) {
        const u = this.store.get<User>("user", i.storeId);
        if (u)
          out.set(i.storeId, {
            id: u.id,
            name: u.name,
            handle: u.handle,
            color: u.color,
            initials: u.initials,
          });
      }
    return out;
  }
  private wishes(userId: string) {
    return new Set(
      this.store
        .all<Wish>("wish")
        .filter((w) => w.userId === userId)
        .map((w) => w.itemId),
    );
  }
  private catalogItems(viewerId: string, items: MallItem[]): CatalogItem[] {
    const city = this.cityOf(viewerId);
    const stores = this.stores(items);
    const wished = this.wishes(viewerId);
    return items.flatMap((i) => {
      const store = stores.get(i.storeId);
      if (!store) return [];
      return [{ ...i, store, near: city ? (i.stock[city] ?? 0) : 0, wished: wished.has(i.id) }];
    });
  }

  /** Every piece, the ones you can pick up in your city first. */
  catalog(actor: Actor): CatalogItem[] {
    const me = this.social.actor(actor);
    return this.catalogItems(me, [...this.items().values()]).sort(
      (a, b) => Number(b.near > 0) - Number(a.near > 0) || a.name.localeCompare(b.name),
    );
  }

  saveFit(actor: Actor, input: unknown): FitView {
    const me = this.social.actor(actor);
    const { title, items } = fitSchema.parse(input);
    const known = this.items();
    for (const [slot, id] of Object.entries(items))
      if (known.get(id)?.slot !== slot) throw new AppError("UNKNOWN_PIECE");
    const fit: Fit = {
      id: randomUUID(),
      ownerId: me,
      title,
      items,
      city: this.cityOf(me),
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("fit", fit.id, fit));
    return this.fitViews(me, [fit])[0]!;
  }
  removeFit(actor: Actor, fitId: string) {
    const me = this.social.actor(actor);
    const fit = this.store.get<Fit>("fit", fitId);
    if (!fit || fit.ownerId !== me) throw new AppError("NOT_FOUND", 404);
    this.store.transaction(() => {
      this.store.remove("fit", fitId);
      for (const l of this.store.all<FitLike>("fit-like"))
        if (l.fitId === fitId) this.store.remove("fit-like", `${fitId}:${l.userId}`);
    });
    return { ok: true };
  }

  likeFit(actor: Actor, fitId: string) {
    const me = this.social.actor(actor);
    const fit = this.store.get<Fit>("fit", fitId);
    if (!fit || !this.visiblePerson(me, fit.ownerId)) throw new AppError("NOT_FOUND", 404);
    const key = `${fitId}:${me}`;
    const liked = !this.store.get("fit-like", key);
    this.store.transaction(() => {
      if (liked)
        this.store.put("fit-like", key, {
          fitId,
          userId: me,
          at: this.now().toISOString(),
        } satisfies FitLike);
      else this.store.remove("fit-like", key);
    });
    return { liked };
  }

  /** Whether a like comes from an account old enough to count toward awards. */
  private counts(userId: string) {
    const cred = this.store.get<{ createdAt: string }>("credential", userId);
    // Demo people have no credential; real accounts count after a week.
    if (!cred) return true;
    return this.now().getTime() - Date.parse(cred.createdAt) >= LIKE_AGE;
  }

  /** The top fit of each city for a month: most counted likes given that month. */
  awards(forMonth = month(this.now())) {
    const fits = new Map(this.store.all<Fit>("fit").map((f) => [f.id, f]));
    const tally = new Map<string, number>();
    for (const l of this.store.all<FitLike>("fit-like")) {
      const fit = fits.get(l.fitId);
      if (!fit?.city || month(l.at) !== forMonth || l.userId === fit.ownerId) continue;
      if (!this.counts(l.userId)) continue;
      tally.set(l.fitId, (tally.get(l.fitId) ?? 0) + 1);
    }
    const best = new Map<City, { fitId: string; likes: number }>();
    for (const [fitId, likes] of tally) {
      const city = fits.get(fitId)!.city!;
      const now = best.get(city);
      if (likes >= AWARD_LIKES && (!now || likes > now.likes)) best.set(city, { fitId, likes });
    }
    return best;
  }

  private fitViews(viewerId: string, fits: Fit[]): FitView[] {
    const items = this.items();
    const likes = this.store.all<FitLike>("fit-like");
    const thisMonth = month(this.now());
    const last = new Date(this.now());
    last.setUTCDate(1);
    last.setUTCMonth(last.getUTCMonth() - 1);
    const lastMonth = month(last);
    const leading = this.awards(thisMonth);
    const won = this.awards(lastMonth);
    const label = (fit: Fit) => {
      if (!fit.city) return undefined;
      if (won.get(fit.city)?.fitId === fit.id)
        return `Top fit in ${fit.city}, ${monthName(lastMonth)}`;
      if (leading.get(fit.city)?.fitId === fit.id) return `Leading in ${fit.city} this month`;
      return undefined;
    };
    return fits.flatMap((fit) => {
      const owner = this.visiblePerson(viewerId, fit.ownerId);
      if (!owner) return [];
      const pieces = this.catalogItems(
        viewerId,
        Object.values(fit.items).flatMap((id) => (items.has(id!) ? [items.get(id!)!] : [])),
      );
      if (pieces.length < 2) return [];
      const mine = likes.filter((l) => l.fitId === fit.id);
      return [
        {
          id: fit.id,
          owner,
          title: fit.title,
          city: fit.city,
          items: pieces,
          total: pieces.reduce((n, p) => n + p.price, 0),
          likes: mine.length,
          liked: mine.some((l) => l.userId === viewerId),
          createdAt: fit.createdAt,
          award: label(fit),
        },
      ];
    });
  }

  /**
   * Fits to scroll: people you follow first, then people in your city, then everyone else;
   * newest first within each. Your own fits sit with the people you follow.
   */
  fits(actor: Actor, ownerId?: string): FitView[] {
    const me = this.social.actor(actor);
    const following = new Set(this.social.following(actor));
    const city = this.cityOf(me);
    const rank = (f: Fit) =>
      f.ownerId === me || following.has(f.ownerId) ? 0 : city && f.city === city ? 1 : 2;
    const all = this.store
      .all<Fit>("fit")
      .filter((f) => !ownerId || f.ownerId === ownerId)
      .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
    return this.fitViews(me, all);
  }

  wish(actor: Actor, itemId: string) {
    const me = this.social.actor(actor);
    if (!this.store.get("mall-item", itemId)) throw new AppError("NOT_FOUND", 404);
    const key = `${me}:${itemId}`;
    const wished = !this.store.get("wish", key);
    this.store.transaction(() => {
      if (wished)
        this.store.put("wish", key, {
          userId: me,
          itemId,
          at: this.now().toISOString(),
        } satisfies Wish);
      else this.store.remove("wish", key);
    });
    return { wished };
  }

  /** A person's wishlist, newest first, with the group gifts friends opened for it. */
  wishlist(actor: Actor, userId: string): WishlistView {
    const me = this.social.actor(actor);
    const person = this.visiblePerson(me, userId);
    if (!person) throw new AppError("NOT_FOUND", 404);
    const items = this.items();
    const wished = this.store
      .all<Wish>("wish")
      .filter((w) => w.userId === userId && items.has(w.itemId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((w) => items.get(w.itemId)!);
    const pots =
      userId === me
        ? []
        : this.store
            .all<Gift>("mall-gift")
            .filter((g) => g.toId === userId && g.status === "open")
            .flatMap((g) => this.giftViews(me, [g]));
    return { person, items: this.catalogItems(me, wished), pots };
  }

  /** Friends you follow who wished for something, the ones with the newest wishes first. */
  friendsWishing(actor: Actor): WishlistView[] {
    const me = this.social.actor(actor);
    const following = new Set(this.social.following(actor));
    const latest = new Map<string, string>();
    for (const w of this.store.all<Wish>("wish"))
      if (following.has(w.userId) && w.at > (latest.get(w.userId) ?? ""))
        latest.set(w.userId, w.at);
    return [...latest.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .flatMap(([id]) => (this.visiblePerson(me, id) ? [this.wishlist(actor, id)] : []));
  }

  private giftViews(viewerId: string, gifts: Gift[]): GiftView[] {
    const items = this.items();
    return gifts.flatMap((g) => {
      const item = items.get(g.itemId);
      const to = this.person(g.toId);
      if (!item || !to) return [];
      const [catalog] = this.catalogItems(viewerId, [item]);
      if (!catalog) return [];
      const givers = [...new Set(g.chips.map((c) => c.userId))];
      const from = givers.flatMap((id) => {
        const p = this.visiblePerson(viewerId, id);
        return p ? [p] : [];
      });
      return [
        {
          id: g.id,
          item: catalog,
          to,
          from,
          note: g.note,
          raised: g.chips.reduce((n, c) => n + c.amount, 0),
          goal: g.goal,
          status: g.status,
          ...(g.code && viewerId === g.toId ? { code: g.code } : {}),
          mine: g.chips.filter((c) => c.userId === viewerId).reduce((n, c) => n + c.amount, 0),
          createdAt: g.createdAt,
        },
      ];
    });
  }

  /** Sandbox vouchers: a made-up code, no money moves until a payment partner is connected. */
  private complete(g: Gift): Gift {
    const raised = g.chips.reduce((n, c) => n + c.amount, 0);
    if (raised < g.goal) return g;
    const code = `SMUDGE-${randomBytes(4).toString("hex").toUpperCase()}`;
    return { ...g, status: "given", code };
  }

  give(actor: Actor, input: unknown): GiftView {
    const me = this.social.actor(actor);
    const { toId, itemId, note, group, amount } = giftSchema.parse(input);
    if (toId === me) throw new AppError("GIFT_TO_SELF");
    if (!this.visiblePerson(me, toId)) throw new AppError("NOT_FOUND", 404);
    this.social.relationGuard(me, toId);
    const item = this.store.get<MallItem>("mall-item", itemId);
    if (!item) throw new AppError("NOT_FOUND", 404);
    const at = this.now().toISOString();
    const first = group ? Math.min(amount ?? 0, item.price) : item.price;
    const gift = this.complete({
      id: randomUUID(),
      toId,
      itemId,
      note,
      goal: item.price,
      chips: first ? [{ userId: me, amount: first, at }] : [],
      status: "open",
      createdAt: at,
    });
    this.store.transaction(() => {
      this.store.put("mall-gift", gift.id, gift);
      if (gift.status === "given")
        this.social.emit({ type: "voucher", actorId: me, targetId: toId });
    });
    return this.giftViews(me, [gift])[0]!;
  }

  chipIn(actor: Actor, giftId: string, input: unknown): GiftView {
    const me = this.social.actor(actor);
    const { amount } = chipInSchema.parse(input);
    const gift = this.store.get<Gift>("mall-gift", giftId);
    if (!gift || gift.toId === me || !this.visiblePerson(me, gift.toId))
      throw new AppError("NOT_FOUND", 404);
    if (gift.status !== "open") throw new AppError("GIFT_COMPLETE", 409);
    const raised = gift.chips.reduce((n, c) => n + c.amount, 0);
    const next = this.complete({
      ...gift,
      chips: [
        ...gift.chips,
        { userId: me, amount: Math.min(amount, gift.goal - raised), at: this.now().toISOString() },
      ],
    });
    this.store.transaction(() => {
      this.store.put("mall-gift", giftId, next);
      if (next.status === "given")
        for (const id of new Set(next.chips.map((c) => c.userId)))
          this.social.emit({ type: "voucher", actorId: id, targetId: next.toId });
    });
    return this.giftViews(me, [next])[0]!;
  }

  /** Vouchers you received (complete only) and gifts you are part of. */
  gifts(actor: Actor) {
    const me = this.social.actor(actor);
    const all = this.store
      .all<Gift>("mall-gift")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      received: this.giftViews(
        me,
        all.filter((g) => g.toId === me && g.status === "given"),
      ),
      given: this.giftViews(
        me,
        all.filter((g) => g.chips.some((c) => c.userId === me)),
      ),
    };
  }

  /** Runs inside the account-deletion transaction. */
  erase(userId: string) {
    const s = this.store;
    s.remove("mall-city", userId);
    for (const f of s.all<Fit>("fit")) if (f.ownerId === userId) s.remove("fit", f.id);
    for (const l of s.all<FitLike>("fit-like"))
      if (l.userId === userId || !s.get("fit", l.fitId))
        s.remove("fit-like", `${l.fitId}:${l.userId}`);
    for (const w of s.all<Wish>("wish"))
      if (w.userId === userId) s.remove("wish", `${w.userId}:${w.itemId}`);
    for (const g of s.all<Gift>("mall-gift"))
      if (g.toId === userId) s.remove("mall-gift", g.id);
      else if (g.chips.some((c) => c.userId === userId))
        s.put("mall-gift", g.id, { ...g, chips: g.chips.filter((c) => c.userId !== userId) });
  }
}
