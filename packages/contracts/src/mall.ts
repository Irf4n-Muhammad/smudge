import { z } from "zod";

/** The parts of an outfit, drawn from top layer to bottom on the 2D figure. */
export const slots = ["outer", "top", "bottom", "shoes", "bag"] as const;
export type Slot = (typeof slots)[number];

/** Where people pick up what they buy. Stock is per city, so the Mall can say "3 left near you". */
export const cities = [
  "London",
  "Tokyo",
  "Seoul",
  "New York",
  "Lagos",
  "São Paulo",
  "Mumbai",
  "Jakarta",
] as const;
export type City = (typeof cities)[number];
export const citySchema = z.object({ city: z.enum(cities) }).strict();

/** One thing a shop sells. Checkout happens on the shop's own page, never in Smudge. */
export interface MallItem {
  id: string;
  storeId: string;
  name: string;
  slot: Slot;
  /** The piece alone on a plain background, for laying out a fit. */
  image: string;
  /** The piece worn, when the shop has such a picture: the backdrop of its Shop card. */
  photo?: string | undefined;
  /** In US cents; real shops would give local prices, the demo keeps one currency. */
  price: number;
  url: string;
  /** Pieces in stock per city, for picking up in a shop nearby. */
  stock: Partial<Record<City, number>>;
}
export interface MallStore {
  id: string;
  name: string;
  handle: string;
  color: string;
  initials: string;
}
export interface MallPerson {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string;
}
export interface CatalogItem extends MallItem {
  store: MallStore;
  /** Pieces in the viewer's city; 0 when there are none or the viewer chose no city. */
  near: number;
  wished: boolean;
}

export const fitSchema = z
  .object({
    title: z.string().trim().max(60).default(""),
    items: z.record(z.enum(slots), z.string().min(1).max(80)),
  })
  .strict()
  .refine((v) => Object.keys(v.items).length >= 2, "Pick at least two pieces");

/** A combination someone put together, the Mall's unit of content. */
export interface FitView {
  id: string;
  owner: MallPerson;
  title: string;
  city: City | null;
  items: CatalogItem[];
  total: number;
  likes: number;
  liked: boolean;
  createdAt: string;
  /** "Top fit in Tokyo, October 2026" or "Leading in Tokyo this month", from people's likes. */
  award?: string | undefined;
}

export const giftSchema = z
  .object({
    toId: z.string().min(1).max(80),
    itemId: z.string().min(1).max(80),
    note: z.string().trim().max(140).default(""),
    /** Start a pot friends chip into, instead of giving the whole voucher alone. */
    group: z.boolean().default(false),
    /** In US cents: what the starter puts into a group gift (or the whole price when alone). */
    amount: z.number().int().min(100).max(100_000).optional(),
  })
  .strict();
export const chipInSchema = z.object({ amount: z.number().int().min(100).max(100_000) }).strict();

/**
 * A digital voucher for one piece, given alone or by several friends together. The recipient
 * sees it only once it is complete, so a group gift stays a surprise while friends chip in.
 */
export interface GiftView {
  id: string;
  item: CatalogItem;
  to: MallPerson;
  from: MallPerson[];
  note: string;
  raised: number;
  goal: number;
  status: "open" | "given";
  /** A sandbox code to spend at the shop; only the recipient sees it. */
  code?: string | undefined;
  mine: number;
  createdAt: string;
}

export interface WishlistView {
  person: MallPerson;
  items: CatalogItem[];
  /** Group gifts friends opened for this person that you may join; never shown to the person. */
  pots: GiftView[];
}

/** A page of what the people you follow wish for, newest first, ten at a time. */
export const wishPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  /** Words from a person's name or handle, a piece or its shop. */
  q: z.string().trim().max(60).default(""),
});
/** One wish of one person, with the group gift open for it, if any. */
export interface WishView {
  person: MallPerson;
  item: CatalogItem;
  pot?: GiftView | undefined;
}
export interface WishPage {
  wishes: WishView[];
  page: number;
  pages: number;
  total: number;
}
