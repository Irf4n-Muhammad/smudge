import { z } from "zod";

/**
 * "Who you are, proven": verified life chapters, proof-locked moment templates, edge
 * decorations, preset reactions and seasonal themes. Catalog entries below are trusted host
 * data shipped with the app. Nothing here is accepted from a client or a post package.
 */

export const countries = {
  ID: "Indonesia",
  SG: "Singapore",
  MY: "Malaysia",
  TH: "Thailand",
  JP: "Japan",
  KR: "South Korea",
  AU: "Australia",
  FR: "France",
  NL: "Netherlands",
  GB: "United Kingdom",
  TR: "Türkiye",
  SA: "Saudi Arabia",
  US: "United States",
  CA: "Canada",
} as const;
export type CountryCode = keyof typeof countries;
export const countrySchema = z.enum(Object.keys(countries) as [CountryCode, ...CountryCode[]]);

/**
 * Coarse [south, west, north, east] boxes. Smaller boxes are checked first so that, for example,
 * Singapore wins over Malaysia. Borders are approximate: this is evidence for a demo, not a
 * geocoder, and a photo location can be edited by its owner.
 */
export const countryBoxes: Record<CountryCode, [number, number, number, number]> = {
  SG: [1.15, 103.6, 1.48, 104.1],
  NL: [50.75, 3.3, 53.6, 7.25],
  KR: [33.1, 124.6, 38.65, 131.0],
  GB: [49.9, -8.2, 60.9, 1.8],
  MY: [0.85, 99.6, 7.4, 119.3],
  TH: [5.6, 97.3, 20.5, 105.7],
  FR: [42.3, -4.8, 51.1, 8.2],
  JP: [24.0, 122.9, 45.6, 145.9],
  TR: [35.8, 25.6, 42.2, 44.9],
  SA: [16.3, 34.5, 32.2, 55.7],
  ID: [-11.1, 95.0, 6.1, 141.1],
  AU: [-43.7, 112.9, -10.6, 153.7],
  US: [24.4, -125.0, 49.4, -66.9],
  CA: [41.7, -141.0, 83.2, -52.6],
};

/**
 * Places inside a country that a trip can prove on their own, because for most of our users the
 * country is home and the trip is to a place in it. Each is a few coarse [south, west, north, east]
 * boxes with the same caveats as `countryBoxes`; Bali's west box also catches the very tip of
 * eastern Java.
 */
export const places = {
  bali: {
    name: "Bali",
    country: "ID",
    boxes: [
      [-8.85, 114.6, -8.05, 115.72],
      [-8.35, 114.42, -8.05, 114.6],
    ],
  },
} as const satisfies Record<
  string,
  { name: string; country: CountryCode; boxes: readonly (readonly number[])[] }
>;
export type PlaceId = keyof typeof places;

export type OrgKind = "campus" | "workplace" | "club" | "event";
export interface Org {
  id: string;
  name: string;
  kind: OrgKind;
  /** Email domains that prove membership. Clubs and events issue invites instead. */
  domains: string[];
  /** Demo accounts allowed to issue invites. A real deployment needs verified org admins. */
  admins: string[];
}
export const orgs: Org[] = [
  {
    id: "lembayung",
    name: "Lembayung University",
    kind: "campus",
    domains: ["student.lembayung.edu", "lembayung.edu"],
    admins: ["leo"],
  },
  {
    id: "kopi-nusantara",
    name: "Kopi Nusantara Co.",
    kind: "workplace",
    domains: ["kopinusantara.co"],
    admins: [],
  },
  { id: "teater-senja", name: "Teater Senja", kind: "club", domains: [], admins: ["maya"] },
  {
    id: "film-fest",
    name: "Lembayung Film Festival",
    kind: "event",
    domains: [],
    admins: ["leo"],
  },
];
export const orgById = (id: string) => orgs.find((o) => o.id === id);

export const chapterKinds = ["education", "work", "member", "title", "travel", "together"] as const;
export type ChapterKind = (typeof chapterKinds)[number];
export const audienceSchema = z.enum(["circle", "public"]);
export type Audience = z.infer<typeof audienceSchema>;

export interface Chapter {
  id: string;
  ownerId: string;
  kind: ChapterKind;
  label: string;
  orgId?: string;
  country?: CountryCode;
  /** A travel chapter for a place inside `country`, such as Bali. It also proves the country. */
  place?: PlaceId;
  partnerId?: string;
  link?: string;
  from?: number | undefined;
  to?: number | "now" | undefined;
  method: "email" | "invite" | "partner" | "photo-location";
  audience: Audience;
  createdAt: string;
}

const year = z.number().int().min(1950).max(2100);
export const periodSchema = z
  .object({ from: year.optional(), to: z.union([year, z.literal("now")]).optional() })
  .strict();
export const emailStartSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(160) })
  .strict();
export const emailConfirmSchema = z
  .object({
    challengeId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
    role: z.string().trim().min(2).max(60),
    period: periodSchema.default({}),
    audience: audienceSchema.default("circle"),
  })
  .strict();
export const inviteCreateSchema = z
  .object({
    orgId: z.string().max(40),
    kind: z.enum(["member", "title"]),
    label: z.string().trim().min(2).max(80),
    period: periodSchema.default({}),
    uses: z.number().int().min(1).max(500).default(1),
  })
  .strict();
export const inviteRedeemSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{10}$/),
    audience: audienceSchema.default("circle"),
  })
  .strict();
export const partnerRequestSchema = z
  .object({ partnerId: z.string().max(40), label: z.enum(["Together", "Married"]) })
  .strict();
export const travelProofSchema = z
  .object({ assetId: z.string().uuid(), audience: audienceSchema.default("circle") })
  .strict();
export const birthdaySchema = z
  .object({ birthday: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/) })
  .strict();
export const chapterAudienceSchema = z.object({ audience: audienceSchema }).strict();
export const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._]{3,24}$/),
  })
  .strict();

/** Preset reactions. Visitors can only choose from these; there is no free text or drawing. */
export interface Sticker {
  id: string;
  label: string;
  /** Trusted inline SVG for emotes; text stickers render their label. */
  svg?: string;
}
const s = (body: string, box = "0 0 24 24") =>
  `<svg viewBox="${box}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
export const stickers: Sticker[] = [
  {
    id: "heart",
    label: "Love",
    svg: s(
      '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="#e0245e"/>',
    ),
  },
  {
    id: "spark",
    label: "Spark",
    svg: s('<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z" fill="#f2b632"/>'),
  },
  {
    id: "paw",
    label: "Paw",
    svg: s(
      '<ellipse cx="12" cy="15" rx="5" ry="4.2" fill="#e8913f"/><circle cx="6" cy="9.5" r="2.2" fill="#e8913f"/><circle cx="10" cy="6.5" r="2.2" fill="#e8913f"/><circle cx="14" cy="6.5" r="2.2" fill="#e8913f"/><circle cx="18" cy="9.5" r="2.2" fill="#e8913f"/>',
    ),
  },
  {
    id: "fish",
    label: "Fish",
    svg: s(
      '<path d="M3 12c4-6 12-6 15 0-3 6-11 6-15 0Zm15 0 4-4v8Z" fill="#5a8fc9"/><circle cx="8" cy="11" r="1.3" fill="#fff"/>',
    ),
  },
  {
    id: "leaf",
    label: "Leaf",
    svg: s('<path d="M3 12C8 4 18 3 22 12 18 20 8 20 3 12Z" fill="#3f8f4e"/>'),
  },
  {
    id: "flower",
    label: "Flower",
    svg: s(
      [0, 72, 144, 216, 288]
        .map((a) => `<ellipse rx="4" ry="7" cy="-6" transform="rotate(${a})" fill="#f6a7b8"/>`)
        .join("") + '<circle r="3.5" fill="#f2c94c"/>',
      "-12 -12 24 24",
    ),
  },
  {
    id: "star",
    label: "Star",
    svg: s(
      '<path d="M0 -10L2.5 -2.5L10 0L2.5 2.5L0 10L-2.5 2.5L-10 0L-2.5 -2.5Z" fill="#d0458f"/>',
      "-11 -11 22 22",
    ),
  },
  {
    id: "note",
    label: "Music",
    svg: s(
      '<path d="M9 17V5l11-2v12" fill="none" stroke="#7a4ad0" stroke-width="2"/><circle cx="6.5" cy="17" r="3" fill="#7a4ad0"/><circle cx="17.5" cy="15" r="3" fill="#7a4ad0"/>',
    ),
  },
  {
    id: "cap",
    label: "Grad cap",
    svg: s(
      '<path d="M2 9l10-5 10 5-10 5Z" fill="#3b1c4a"/><path d="M6 11v5c3 2 9 2 12 0v-5" fill="none" stroke="#3b1c4a" stroke-width="2"/>',
    ),
  },
  {
    id: "mask",
    label: "Theatre",
    svg: s(
      '<path d="M4 4h16v7a8 8 0 0 1-16 0Z" fill="#b8323a"/><circle cx="9" cy="9" r="1.5" fill="#fff"/><circle cx="15" cy="9" r="1.5" fill="#fff"/><path d="M8.5 13.5q3.5 3 7 0" stroke="#fff" stroke-width="1.6" fill="none"/>',
    ),
  },
  {
    id: "pumpkin",
    label: "Pumpkin",
    svg: s(
      '<ellipse cx="12" cy="14" rx="9" ry="7" fill="#e8742a"/><path d="M12 7V3" stroke="#3f6b2e" stroke-width="2"/><path d="M8 13l2-2 2 2M12 13l2-2 2 2M8 17q4 2 8 0" stroke="#3a1f0f" stroke-width="1.4" fill="none"/>',
    ),
  },
  {
    id: "ghost",
    label: "Ghost",
    svg: s(
      '<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.3 2-2.2-2Z" fill="#f4f1ea" stroke="#444" stroke-width="1"/><circle cx="9.5" cy="11" r="1.3" fill="#222"/><circle cx="14.5" cy="11" r="1.3" fill="#222"/>',
    ),
  },
  {
    id: "flag-id",
    label: "Merah putih",
    svg: s(
      '<path d="M5 3v18" stroke="#555" stroke-width="1.6"/><rect x="6" y="4" width="13" height="5" fill="#d7262e"/><rect x="6" y="9" width="13" height="5" fill="#fff" stroke="#ddd" stroke-width=".5"/>',
    ),
  },
  {
    id: "firework",
    label: "Firework",
    svg: s(
      [0, 45, 90, 135, 180, 225, 270, 315]
        .map(
          (a) =>
            `<path d="M0 -3V-10" stroke="#f2b632" stroke-width="1.8" stroke-linecap="round" transform="rotate(${a})"/>`,
        )
        .join(""),
      "-12 -12 24 24",
    ),
  },
  { id: "congrats", label: "Congrats" },
  { id: "proud", label: "So proud" },
  { id: "finally", label: "Finally!" },
  { id: "graduate", label: "Graduate" },
  { id: "last-coffee", label: "Last coffee" },
  { id: "welcome", label: "Welcome aboard" },
  { id: "go-get-em", label: "Go get 'em" },
  { id: "hbd", label: "Happy birthday" },
  { id: "cake", label: "Cake for me?" },
  { id: "jealous", label: "Jealous" },
  { id: "take-me", label: "Take me next time" },
  { id: "cute", label: "Too cute" },
  { id: "forever", label: "Forever" },
  { id: "legend", label: "Legend" },
  { id: "bravo", label: "Bravo" },
  { id: "good-read", label: "Good read" },
  { id: "saved-it", label: "Saved it" },
];
export const stickerById = (id: string) => stickers.find((x) => x.id === id);
export const defaultEmotes = ["heart", "spark"];

export type Anchor = "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom-left";
interface PieceBox {
  anchor: Anchor;
  /** CSS pixels. The piece's top-left sits at the anchor corner plus (dx, dy), so it may extend
   * outside the post. */
  width: number;
  height: number;
  dx: number;
  dy: number;
}
/**
 * Catalog pieces carry trusted SVG markup. Community pieces carry a designer's own HTML and CSS,
 * which the app only ever draws as an image (ADR 0024), never as markup in the page.
 */
export type OverlayPiece = PieceBox &
  (
    | { svg: string }
    | {
        html: string;
        css: string;
        /** The wearer's own words for the designer's `data-text` slots (ADR 0025). */
        texts?: Record<string, string>;
      }
  );
/**
 * A theme is one look for a person: their profile and every post of theme in the feed wear it.
 * - event: the Smudge team decides which events exist (a season, a proven trip); anyone may
 *   design for one, and the design is labelled with its event and only opens with it.
 * - members: proven membership in an organisation opens it.
 * - market: anyone can wear it, with no event or membership behind it.
 * A sponsor is an optional label on any kind.
 */
export type DecorationTier = "market" | "members" | "event";
/** Faces the web app already loads; a theme picks one for the frame around each post. */
export const themeFonts = ["ui", "serif", "hand", "display", "spray"] as const;
export type ThemeFont = (typeof themeFonts)[number];
export type ThemeEvent =
  | { id: string; name: string; kind: "season"; seasonId: string }
  | { id: string; name: string; kind: "trip"; country: CountryCode; place?: PlaceId };
export const themeEvents: ThemeEvent[] = [
  { id: "halloween", name: "Halloween", kind: "season", seasonId: "halloween" },
  { id: "id-independence", name: "Hari Kemerdekaan", kind: "season", seasonId: "id-independence" },
  { id: "new-year", name: "New Year", kind: "season", seasonId: "new-year" },
  { id: "trip-france", name: "Trip to France", kind: "trip", country: "FR" },
  { id: "trip-japan", name: "Trip to Japan", kind: "trip", country: "JP" },
  { id: "trip-korea", name: "Trip to South Korea", kind: "trip", country: "KR" },
  { id: "trip-thailand", name: "Trip to Thailand", kind: "trip", country: "TH" },
  { id: "trip-bali", name: "Trip to Bali", kind: "trip", country: "ID", place: "bali" },
];
export const themeEventById = (id: string) => themeEvents.find((e) => e.id === id);
export interface Decoration {
  id: string;
  name: string;
  creatorId: string;
  tier: DecorationTier;
  accent: string;
  font: ThemeFont;
  /** Members tier: verified membership in this org unlocks it. */
  orgId?: string;
  /** Event tier: the event that opens it. */
  eventId?: string;
  sponsor?: string;
  emotes: string[];
  pieces: OverlayPiece[];
}
const leaf = (x: number, y: number, r: number, k: number) =>
  `<path transform="translate(${x} ${y}) rotate(${r}) scale(${k})" d="M0 0C6 -8 18 -9 26 0C18 9 6 8 0 0Z" fill="#3f8f4e"/>`;
const pennants = (colors: string[]) =>
  `<path d="M0 10Q85 46 170 4" fill="none" stroke="#333" stroke-width="2"/>` +
  [18, 48, 80, 112, 144]
    .map(
      (x, i) =>
        `<path d="M${x - 12} ${[15, 25, 28, 24, 15][i]}L${x + 12} ${[15, 25, 28, 24, 15][i]}L${x} ${[45, 55, 58, 54, 45][i]}Z" fill="${colors[i % colors.length]}"/>`,
    )
    .join("");
const bat = (x: number, y: number, k: number) =>
  `<path transform="translate(${x} ${y}) scale(${k})" d="M0 0q-6-8-16-6 5 3 4 8-5-3-10 0 6 2 8 8 6-6 14-4 8-2 14 4 2-6 8-8-5-3-10 0-1-5 4-8-10-2-16 6Z" fill="#241a2e"/>`;
const blossom = (x: number, y: number, k = 1) =>
  `<g transform="translate(${x} ${y}) scale(${k})">` +
  [0, 72, 144, 216, 288]
    .map((a) => `<ellipse cy="-4.5" rx="3" ry="4.5" fill="#f8bbd0" transform="rotate(${a})"/>`)
    .join("") +
  `<circle r="1.6" fill="#d6457a"/></g>`;
const frangipani = (x: number, y: number, k = 1) =>
  `<g transform="translate(${x} ${y}) scale(${k})">` +
  [0, 72, 144, 216, 288]
    .map(
      (a) =>
        `<ellipse cy="-10" rx="6.5" ry="10" fill="#fffdf5" stroke="#f1d29a" transform="rotate(${a})"/>`,
    )
    .join("") +
  `<circle r="5" fill="#ffc93c"/></g>`;
export const decorations: Decoration[] = [
  {
    id: "cat-peek",
    name: "Cat peek",
    creatorId: "maya",
    tier: "market",
    accent: "#e8913f",
    font: "hand",
    emotes: ["paw", "fish"],
    pieces: [
      {
        anchor: "top-right",
        width: 92,
        height: 70,
        dx: -132,
        dy: -46,
        svg: s(
          '<path d="M-30 -10L-26 -42L-8 -26ZM30 -10L26 -42L8 -26Z" fill="#e8913f"/><ellipse cx="0" cy="0" rx="36" ry="30" fill="#e8913f"/><ellipse cx="-13" cy="-2" rx="5" ry="6.5" fill="#1d1d1d"/><ellipse cx="13" cy="-2" rx="5" ry="6.5" fill="#1d1d1d"/><path d="M-3 7L3 7L0 10Z" fill="#f6a7b8"/>',
          "-46 -46 92 70",
        ),
      },
      {
        anchor: "bottom-right",
        width: 70,
        height: 120,
        dx: -42,
        dy: -106,
        svg: s(
          '<path d="M8 118C10 80 54 86 50 50C47 24 22 26 30 8" fill="none" stroke="#e8913f" stroke-width="11" stroke-linecap="round"/>',
          "0 0 70 120",
        ),
      },
    ],
  },
  {
    id: "vines",
    name: "Vines",
    creatorId: "ines",
    tier: "market",
    accent: "#3f8f4e",
    font: "serif",
    emotes: ["leaf", "flower"],
    pieces: [
      {
        anchor: "top-left",
        width: 120,
        height: 300,
        dx: -14,
        dy: -18,
        svg: s(
          '<path d="M20 300C30 240 6 200 22 150C36 100 8 70 26 40C38 20 70 12 110 8" fill="none" stroke="#2b6b38" stroke-width="3.5" stroke-linecap="round"/>' +
            leaf(26, 260, -60, 1.1) +
            leaf(18, 210, 200, 1) +
            leaf(24, 160, -40, 1.2) +
            leaf(26, 100, 200, 1.1) +
            leaf(46, 34, -30, 1) +
            leaf(80, 16, 150, 1),
          "0 0 120 300",
        ),
      },
    ],
  },
  {
    id: "stage-lights",
    name: "Stage lights",
    creatorId: "leo",
    tier: "market",
    sponsor: "Senja Kolektif",
    accent: "#d0458f",
    font: "display",
    emotes: ["star", "note"],
    pieces: [
      {
        anchor: "top-left",
        width: 34,
        height: 34,
        dx: 4,
        dy: -14,
        svg: s(
          '<rect x="5" y="4" width="24" height="18" rx="4" fill="#222"/><circle cx="17" cy="13" r="6" fill="#ffd27a"/>',
          "0 0 34 34",
        ),
      },
      {
        anchor: "top-right",
        width: 34,
        height: 34,
        dx: -38,
        dy: -14,
        svg: s(
          '<rect x="5" y="4" width="24" height="18" rx="4" fill="#222"/><circle cx="17" cy="13" r="6" fill="#ffd27a"/>',
          "0 0 34 34",
        ),
      },
    ],
  },
  {
    id: "lembayung-pennants",
    name: "Lembayung pennants",
    creatorId: "leo",
    tier: "members",
    orgId: "lembayung",
    accent: "#3b1c4a",
    font: "serif",
    emotes: ["cap", "spark"],
    pieces: [
      {
        anchor: "top-right",
        width: 170,
        height: 92,
        dx: -164,
        dy: -22,
        svg: s(pennants(["#3b1c4a", "#e9b44c"]), "0 0 170 92"),
      },
    ],
  },
  {
    id: "teater-curtain",
    name: "Teater Senja curtain",
    creatorId: "maya",
    tier: "members",
    orgId: "teater-senja",
    accent: "#b8323a",
    font: "serif",
    emotes: ["mask", "star"],
    pieces: [
      {
        anchor: "top-left",
        width: 70,
        height: 160,
        dx: -10,
        dy: -12,
        svg: s(
          '<path d="M0 0H70Q40 60 46 160H0Z" fill="#b8323a"/><path d="M10 0Q20 80 14 160M28 0Q36 70 30 160" stroke="#8d2229" stroke-width="3" fill="none"/>',
          "0 0 70 160",
        ),
      },
      {
        anchor: "top-right",
        width: 70,
        height: 160,
        dx: -60,
        dy: -12,
        svg: s(
          '<path d="M70 0H0Q30 60 24 160H70Z" fill="#b8323a"/><path d="M60 0Q50 80 56 160M42 0Q34 70 40 160" stroke="#8d2229" stroke-width="3" fill="none"/>',
          "0 0 70 160",
        ),
      },
    ],
  },
  {
    id: "pumpkin-night",
    name: "Pumpkin night",
    creatorId: "maya",
    tier: "event",
    eventId: "halloween",
    accent: "#e8742a",
    font: "spray",
    emotes: ["pumpkin", "ghost"],
    pieces: [
      {
        anchor: "bottom-left",
        width: 64,
        height: 56,
        dx: -12,
        dy: -40,
        svg: s(
          '<ellipse cx="32" cy="34" rx="28" ry="21" fill="#e8742a"/><path d="M32 13V3" stroke="#3f6b2e" stroke-width="4"/><path d="M20 30l5-6 5 6M34 30l5-6 5 6M20 42q12 7 24 0" stroke="#3a1f0f" stroke-width="3" fill="none"/>',
          "0 0 64 56",
        ),
      },
    ],
  },
  {
    id: "bats",
    name: "Bats",
    creatorId: "leo",
    tier: "event",
    eventId: "halloween",
    accent: "#241a2e",
    font: "spray",
    emotes: ["ghost", "pumpkin"],
    pieces: [
      {
        anchor: "top-right",
        width: 140,
        height: 70,
        dx: -130,
        dy: -34,
        svg: s(bat(30, 30, 1) + bat(80, 14, 0.8) + bat(118, 40, 0.65), "0 0 140 70"),
      },
    ],
  },
  {
    id: "merah-putih",
    name: "Merah putih",
    creatorId: "ines",
    tier: "event",
    eventId: "id-independence",
    accent: "#d7262e",
    font: "display",
    emotes: ["flag-id", "spark"],
    pieces: [
      {
        anchor: "top-right",
        width: 170,
        height: 92,
        dx: -164,
        dy: -22,
        svg: s(pennants(["#d7262e", "#ffffff"]), "0 0 170 92"),
      },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks",
    creatorId: "leo",
    tier: "event",
    eventId: "new-year",
    accent: "#f2b632",
    font: "display",
    emotes: ["firework", "spark"],
    pieces: [
      {
        anchor: "top-left",
        width: 60,
        height: 60,
        dx: -16,
        dy: -24,
        svg: stickers.find((x) => x.id === "firework")!.svg!,
      },
      {
        anchor: "top-right",
        width: 44,
        height: 44,
        dx: -30,
        dy: -18,
        svg: stickers.find((x) => x.id === "firework")!.svg!,
      },
    ],
  },
  {
    id: "paris",
    name: "Paris",
    creatorId: "ines",
    tier: "event",
    eventId: "trip-france",
    accent: "#1f3a5f",
    font: "serif",
    emotes: ["jealous", "take-me"],
    pieces: [
      {
        anchor: "top-left",
        width: 170,
        height: 92,
        dx: 6,
        dy: -50,
        svg: s(pennants(["#1f3a5f", "#ffffff", "#d7262e"]), "0 0 170 92"),
      },
      {
        anchor: "top-right",
        width: 56,
        height: 120,
        dx: -230,
        dy: -108,
        svg: s(
          '<g fill="#1f3a5f"><path d="M34 0h2l1 14h-4z"/><path d="M32 14h6l3 40h-12z"/><rect x="26" y="52" width="18" height="4" rx="1"/><path d="M29 56h12l5 34h-22z"/><rect x="20" y="88" width="30" height="5" rx="1"/><path d="M22 93h26l14 57h-12q-15-26-30 0h-12z"/></g>',
          "0 0 70 150",
        ),
      },
    ],
  },
  {
    id: "bonjour-postcard",
    name: "Bonjour postcard",
    creatorId: "maya",
    tier: "event",
    eventId: "trip-france",
    accent: "#c8553d",
    font: "hand",
    emotes: ["take-me", "heart"],
    pieces: [
      {
        anchor: "top-right",
        width: 60,
        height: 72,
        dx: -222,
        dy: -50,
        svg: s(
          '<g transform="rotate(6 30 36)"><rect x="3" y="3" width="54" height="66" fill="#fffaf0" stroke="#c8553d" stroke-width="3" stroke-dasharray="4 3"/><rect x="10" y="10" width="40" height="40" fill="#c8553d"/><path d="M14 44l10-14 8 9 6-6 8 11z" fill="#fffaf0"/><text x="30" y="62" font-size="8" text-anchor="middle" fill="#c8553d" font-family="Georgia">FRANCE</text></g>',
          "0 0 60 72",
        ),
      },
      {
        anchor: "bottom-left",
        width: 112,
        height: 68,
        dx: -10,
        dy: -22,
        svg: s(
          '<g fill="none" stroke="#3b3b3b" stroke-width="2" opacity=".65"><circle cx="34" cy="34" r="26"/><path d="M60 22q8-6 16 0t16 0t16 0M60 34q8-6 16 0t16 0t16 0M60 46q8-6 16 0t16 0t16 0"/></g><text x="34" y="38" font-size="10" text-anchor="middle" fill="#3b3b3b" opacity=".7" font-family="Georgia">PARIS</text>',
          "0 0 112 68",
        ),
      },
    ],
  },
  {
    id: "sakura-gate",
    name: "Sakura gate",
    creatorId: "maya",
    tier: "event",
    eventId: "trip-japan",
    accent: "#d6457a",
    font: "serif",
    emotes: ["jealous", "take-me"],
    pieces: [
      {
        anchor: "top-left",
        width: 96,
        height: 66,
        dx: -16,
        dy: -58,
        svg: s(
          '<g fill="#c62828"><path d="M2 8Q60 -2 118 8L116 17Q60 8 4 17Z"/><rect x="16" y="25" width="88" height="7"/><rect x="28" y="16" width="9" height="64"/><rect x="83" y="16" width="9" height="64"/><rect x="56" y="16" width="8" height="10"/></g>',
          "0 0 120 82",
        ),
      },
      {
        anchor: "top-right",
        width: 150,
        height: 60,
        dx: -150,
        dy: -28,
        svg: s(
          '<path d="M150 6Q104 8 74 26T6 42" fill="none" stroke="#5d4037" stroke-width="3" stroke-linecap="round"/><path d="M96 14q-6 10-20 14" fill="none" stroke="#5d4037" stroke-width="2"/>' +
            [
              [140, 8, 1.2],
              [118, 10, 1],
              [96, 18, 1.3],
              [76, 28, 1],
              [54, 34, 1.2],
              [30, 40, 1],
              [12, 44, 1.1],
              [84, 40, 0.9],
            ]
              .map(([x, y, k]) => blossom(x!, y!, k))
              .join(""),
          "0 0 150 60",
        ),
      },
      {
        anchor: "bottom-right",
        width: 80,
        height: 44,
        dx: -84,
        dy: -26,
        svg: s(
          [
            [12, 30, 20],
            [34, 14, -30],
            [52, 32, 60],
            [70, 18, 10],
          ]
            .map(
              ([x, y, r]) =>
                `<ellipse cx="${x}" cy="${y}" rx="4" ry="6" fill="#f8bbd0" transform="rotate(${r} ${x} ${y})"/>`,
            )
            .join(""),
          "0 0 80 44",
        ),
      },
    ],
  },
  {
    id: "seoul-night",
    name: "Seoul night",
    creatorId: "leo",
    tier: "event",
    eventId: "trip-korea",
    accent: "#2b59c3",
    font: "display",
    emotes: ["jealous", "take-me"],
    pieces: [
      {
        anchor: "top-left",
        width: 44,
        height: 110,
        dx: -14,
        dy: -100,
        svg: s(
          '<rect x="21" y="0" width="2" height="26" fill="#22325a"/><ellipse cx="22" cy="32" rx="10" ry="6" fill="#22325a"/><rect x="16" y="36" width="12" height="5" fill="#22325a"/><path d="M19 41h6l3 69h-12z" fill="#22325a"/><circle cx="18" cy="32" r="1.3" fill="#ffd54f"/><circle cx="22" cy="32" r="1.3" fill="#ffd54f"/><circle cx="26" cy="32" r="1.3" fill="#ffd54f"/><circle cx="22" cy="2" r="2" fill="#e53935"/>',
          "0 0 44 110",
        ),
      },
      {
        anchor: "top-right",
        width: 160,
        height: 40,
        dx: -170,
        dy: -32,
        svg: s(
          '<path d="M0 28Q24 6 80 8Q136 6 160 28L148 28Q134 16 80 18Q26 16 12 28Z" fill="#2b2b2b"/><path d="M14 30h132v6H14z" fill="#b23a48"/>' +
            [30, 50, 70, 90, 110, 130]
              .map((x) => `<path d="M${x} 12v14" stroke="#555" stroke-width="2"/>`)
              .join(""),
          "0 0 160 40",
        ),
      },
    ],
  },
  {
    id: "tuk-tuk",
    name: "Tuk-tuk",
    creatorId: "maya",
    tier: "event",
    eventId: "trip-thailand",
    accent: "#e07a1f",
    font: "hand",
    emotes: ["take-me", "heart"],
    pieces: [
      {
        anchor: "top-right",
        width: 170,
        height: 92,
        dx: -176,
        dy: -50,
        svg: s(pennants(["#a51931", "#f4f5f8", "#2d2a4a"]), "0 0 170 92"),
      },
      {
        anchor: "bottom-right",
        width: 110,
        height: 64,
        dx: -92,
        dy: -12,
        svg: s(
          '<rect x="20" y="4" width="80" height="9" rx="3" fill="#1e6f5c"/><rect x="24" y="13" width="3" height="24" fill="#444"/><path d="M92 13l16 24H92z" fill="#f6c26b"/><path d="M14 36H100Q112 36 114 50V56H8V44Q8 36 14 36Z" fill="#e07a1f"/><circle cx="28" cy="58" r="9" fill="#222"/><circle cx="28" cy="58" r="3" fill="#ccc"/><circle cx="98" cy="58" r="9" fill="#222"/><circle cx="98" cy="58" r="3" fill="#ccc"/>',
          "0 0 120 70",
        ),
      },
    ],
  },
  {
    id: "bali-frangipani",
    name: "Bali frangipani",
    creatorId: "leo",
    tier: "event",
    eventId: "trip-bali",
    accent: "#0f8b8d",
    font: "hand",
    emotes: ["jealous", "take-me", "flower"],
    pieces: [
      {
        anchor: "top-left",
        width: 90,
        height: 80,
        dx: -18,
        dy: -72,
        svg: s(
          '<g fill="#8a5a44"><path d="M4 90V54h5V42h6V30h6V18h6V6h8l9-4v88z"/><path d="M96 90V54h-5V42h-6V30h-6V18h-6V6h-8l-9-4v88z"/></g><g fill="#5e3b2c"><rect x="4" y="60" width="40" height="3"/><rect x="56" y="60" width="40" height="3"/><rect x="15" y="36" width="29" height="3"/><rect x="56" y="36" width="29" height="3"/></g>',
          "0 0 100 90",
        ),
      },
      {
        anchor: "top-right",
        width: 70,
        height: 56,
        dx: -52,
        dy: -28,
        svg: s(frangipani(22, 24) + frangipani(52, 34, 0.75), "0 0 70 56"),
      },
    ],
  },
];
export const decorationById = (id: string) => decorations.find((d) => d.id === id);

export interface Season {
  id: string;
  name: string;
  /** null means everyone; otherwise the user's country must match. */
  country: CountryCode | null;
  start: string;
  end: string;
  defaultDecorationId: string;
}
/** MM-DD windows, inclusive; a window may wrap past the year end. Lunar holidays need a calendar. */
export const seasons: Season[] = [
  {
    id: "halloween",
    name: "Halloween",
    country: null,
    start: "10-17",
    end: "10-31",
    defaultDecorationId: "pumpkin-night",
  },
  {
    id: "id-independence",
    name: "Hari Kemerdekaan",
    country: "ID",
    start: "08-10",
    end: "08-18",
    defaultDecorationId: "merah-putih",
  },
  {
    id: "new-year",
    name: "New Year",
    country: null,
    start: "12-30",
    end: "01-02",
    defaultDecorationId: "fireworks",
  },
];
export const decorationChoiceSchema = z
  .object({
    decorationId: z.string().max(40).nullable(),
    scope: z.enum(["base", "season"]),
  })
  .strict();
export const countryChoiceSchema = z.object({ country: countrySchema }).strict();

export const momentKinds = [
  "graduation",
  "new-job",
  "birthday",
  "trip",
  "together",
  "milestone",
  "paper",
] as const;
export type MomentKind = (typeof momentKinds)[number];
export interface MomentTemplate {
  kind: MomentKind;
  name: string;
  /** Plain-language rule shown when the template is locked. */
  rule: string;
  chapterKinds: ChapterKind[];
  stickers: string[];
}
export const momentTemplates: MomentTemplate[] = [
  {
    kind: "graduation",
    name: "Graduation",
    rule: "Verify a campus email first.",
    chapterKinds: ["education"],
    stickers: ["congrats", "proud", "finally", "graduate", "last-coffee"],
  },
  {
    kind: "new-job",
    name: "New job",
    rule: "Verify a work email first.",
    chapterKinds: ["work"],
    stickers: ["welcome", "go-get-em", "proud", "congrats"],
  },
  {
    kind: "birthday",
    name: "Birthday",
    rule: "Only opens on your birthday.",
    chapterKinds: [],
    stickers: ["hbd", "cake", "heart", "spark"],
  },
  {
    kind: "trip",
    name: "Trip",
    rule: "Prove the country with a photo taken there.",
    chapterKinds: ["travel"],
    stickers: ["jealous", "take-me", "spark", "heart"],
  },
  {
    kind: "together",
    name: "Together",
    rule: "Your partner has to confirm from their own account.",
    chapterKinds: ["together"],
    stickers: ["cute", "forever", "heart", "congrats"],
  },
  {
    kind: "milestone",
    name: "Who you are",
    rule: "Needs a chapter issued by a club, event or organisation.",
    chapterKinds: ["member", "title"],
    stickers: ["legend", "bravo", "proud", "spark"],
  },
  {
    kind: "paper",
    name: "Paper or portfolio",
    rule: "Open to everyone.",
    chapterKinds: [],
    stickers: ["good-read", "saved-it", "spark", "bravo"],
  },
];
export const momentTemplate = (kind: MomentKind) => momentTemplates.find((t) => t.kind === kind)!;

const section = z
  .object({
    heading: z.string().trim().min(1).max(60),
    text: z.string().trim().max(500).default(""),
    assetId: z.string().uuid().optional(),
    note: z.string().trim().max(40).default(""),
  })
  .strict();
export const momentInputSchema = z
  .object({
    kind: z.enum(momentKinds),
    chapterId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(60),
    story: z.string().trim().max(600).default(""),
    coverAssetId: z.string().uuid().optional(),
    sections: z.array(section).max(3).default([]),
    thanks: z.string().trim().max(200).default(""),
    paper: z
      .object({
        title: z.string().trim().min(1).max(140),
        abstract: z.string().trim().max(1200).default(""),
        body: z.string().trim().max(20000).default(""),
        link: z.string().url().max(300).optional(),
      })
      .strict()
      .optional(),
    audience: audienceSchema.default("circle"),
  })
  .strict();
export type MomentInput = z.infer<typeof momentInputSchema>;
export const reactionSchema = z.object({ sticker: z.string().max(40).nullable() }).strict();

/** Feed annotations computed by the identity service, never stored in a post package. */
export interface PostDecor {
  decoration?: {
    id: string;
    name: string;
    accent: string;
    creator: string;
    tier: DecorationTier;
    font: ThemeFont;
    /** Event themes say which event opened them, e.g. "Trip to France". */
    event?: string;
    sponsor?: string;
    pieces: OverlayPiece[];
  };
  moment?: {
    kind: MomentKind;
    name: string;
    audience: Audience;
    proof: string | null;
    verified: boolean;
  };
  reactions: { options: Sticker[]; counts: Record<string, number>; mine: string | null };
  hideCounts: boolean;
}
