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
export interface OverlayPiece {
  anchor: Anchor;
  /** CSS pixels. The piece's top-left sits at the anchor corner plus (dx, dy), so it may extend
   * outside the post. */
  width: number;
  height: number;
  dx: number;
  dy: number;
  svg: string;
}
export type DecorationTier = "free" | "members" | "seasonal" | "sponsored";
export interface Decoration {
  id: string;
  name: string;
  creatorId: string;
  tier: DecorationTier;
  accent: string;
  /** Members tier: verified membership in this org unlocks it. */
  orgId?: string;
  /** Seasonal tier: only usable while this season is active for the user. */
  seasonId?: string;
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
export const decorations: Decoration[] = [
  {
    id: "cat-peek",
    name: "Cat peek",
    creatorId: "maya",
    tier: "free",
    accent: "#e8913f",
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
    tier: "free",
    accent: "#3f8f4e",
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
    tier: "sponsored",
    sponsor: "Senja Kolektif",
    accent: "#d0458f",
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
    tier: "seasonal",
    seasonId: "halloween",
    accent: "#e8742a",
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
    tier: "seasonal",
    seasonId: "halloween",
    accent: "#241a2e",
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
    tier: "seasonal",
    seasonId: "id-independence",
    accent: "#d7262e",
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
    tier: "seasonal",
    seasonId: "new-year",
    accent: "#f2b632",
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
