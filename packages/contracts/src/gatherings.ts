import { z } from "zod";

/**
 * Moments as gatherings (ADR 0036): a wedding, a reunion, a birthday, held by its host, with an
 * invite page anyone opens from a link and an RSVP by phone number. Internally "gathering", so
 * the name does not collide with the older proof-locked pages (ADR 0011), now called milestones.
 */
export const gatheringKinds = ["wedding"] as const;
export type GatheringKind = (typeof gatheringKinds)[number];

const text = (max: number) => z.string().trim().max(max);
const rundownItemSchema = z
  .object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
    title: text(60).min(1),
  })
  .strict();
const vendorSchema = z.object({ role: text(40).min(1), name: text(60).min(1) }).strict();

export const gatheringInputSchema = z
  .object({
    kind: z.enum(gatheringKinds),
    /** The headline of the invite, such as the couple's names. */
    title: text(80).min(1),
    /** A line under it (the families, "together with their parents"). */
    hosts: text(160).default(""),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    place: text(120).min(1),
    address: text(240).default(""),
    note: text(600).default(""),
    rundown: z.array(rundownItemSchema).max(20).default([]),
    vendors: z.array(vendorSchema).max(20).default([]),
  })
  .strict();
export type GatheringInput = z.infer<typeof gatheringInputSchema>;

/** The answer a guest gives. The phone number is only used to recognise a second answer. */
export const rsvpInputSchema = z
  .object({
    name: text(60).min(1),
    phone: z.string().trim().min(6).max(24),
    attending: z.boolean(),
    guests: z.number().int().min(1).max(10).default(1),
    message: text(280).default(""),
  })
  .strict();
export type RsvpInput = z.infer<typeof rsvpInputSchema>;

export const gatheringPhases = ["upcoming", "live", "closed"] as const;
export type GatheringPhase = (typeof gatheringPhases)[number];

/** What anyone with the link sees. No guest names or counts: those are the host's. */
export interface GatheringInvite extends GatheringInput {
  id: string;
  hostName: string;
  createdAt: string;
  /** Before the day, the day until the album locks, and after (ADR 0039). */
  phase: GatheringPhase;
  /** The host's thank-you, shown on the same link once the moment is closed. */
  thanks: string;
  /** Whether the host picked a cover photo, served publicly for the memory card. */
  cover: boolean;
}
export interface GatheringRsvpView {
  name: string;
  /** The last three digits, so the host can tell two people with the same name apart. */
  phoneEnd: string;
  attending: boolean;
  guests: number;
  message: string;
  at: string;
  /** Whether the guest answered while signed in to Smudge. */
  member: boolean;
}
/** The host's view: the invite plus every answer, newest first. */
export interface GatheringGuestList {
  invite: GatheringInvite;
  /** `arrived` counts the people who came in through the door QR (ADR 0038). */
  totals: { attending: number; declined: number; guests: number; arrived: number };
  rsvps: GatheringRsvpView[];
}
export interface GatheringSummary {
  id: string;
  kind: GatheringKind;
  title: string;
  date: string;
  place: string;
  host: boolean;
}

/**
 * The moment group (ADR 0037). In `announce` mode only the host writes in the main chat, as for
 * a big wedding; in `open` mode every member does. Small groups always chat freely.
 */
export const gatheringModes = ["announce", "open"] as const;
export type GatheringMode = (typeof gatheringModes)[number];
export const gatheringModeInputSchema = z.object({ mode: z.enum(gatheringModes) }).strict();
export const gatheringMessageInputSchema = z
  .object({ text: text(2000).min(1), group: z.string().uuid().optional() })
  .strict();
export const smallGroupInputSchema = z
  .object({ name: text(60).min(1), members: z.array(z.string().min(1).max(64)).max(49) })
  .strict();
export interface GatheringPerson {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string;
}
export interface SmallGroupView {
  id: string;
  name: string;
  memberIds: string[];
}
/** What a member sees: the invite pinned on top, who is in, and the small groups they are in. */
export interface GatheringSpace {
  invite: GatheringInvite;
  /** The viewer's own id, so a chat can tell their messages apart. */
  me: string;
  role: "host" | "member";
  mode: GatheringMode;
  members: GatheringPerson[];
  groups: SmallGroupView[];
  /** Members who came in through the door QR (ADR 0038). */
  arrived: string[];
}
export interface GatheringMessageView {
  id: string;
  from: GatheringPerson;
  text: string;
  at: string;
}

/**
 * The day itself (ADR 0038). The host's phone shows a QR that changes every 30 seconds; a guest
 * who scans it trades the code for a pass, and signing in with the pass records that they came.
 */
export const doorCodeInputSchema = z.object({ code: z.string().trim().min(4).max(40) }).strict();
export const checkinInputSchema = z.object({ pass: z.string().trim().min(10).max(200) }).strict();
/** What the host's door screen shows: the current code, and how many people came in. */
export interface GatheringDoor {
  code: string;
  /** The path the QR opens, without the origin, which only the browser knows. */
  path: string;
  rotatesInMs: number;
  arrived: number;
}

/** The live album: photos sorted into chapters by the rundown, and the guests' wishes. */
export const albumTagInputSchema = z
  .object({ userId: z.string().min(1).max(64), on: z.boolean() })
  .strict();
export const photographerInputSchema = albumTagInputSchema;
export const photoLikeInputSchema = z.object({ on: z.boolean() }).strict();
export const wishInputSchema = z.object({ text: text(280).min(1) }).strict();
/** A local time at the venue, "YYYY-MM-DDTHH:MM", as a camera writes it. */
export const localTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);
export interface AlbumPhoto {
  id: string;
  by: GatheringPerson;
  takenAt: string;
  width: number;
  height: number;
  /** Taken by someone the host named as a photographer: credited and shown first. */
  photographer: boolean;
  tagged: string[];
  liked: boolean;
  /** Only the person who posted the photo sees how many liked it. */
  likes?: number;
  /** Yours, of you, or from someone in one of your small groups. */
  forYou: boolean;
  mine: boolean;
}
export interface AlbumChapter {
  /** Before the day, one rundown item (or the whole day when there is no rundown), after it. */
  kind: "before" | "day" | "after";
  /** The rundown item's title and time; empty for before and after. */
  title: string;
  time?: string;
  photos: AlbumPhoto[];
}
export interface GatheringWishView {
  from: GatheringPerson;
  text: string;
  at: string;
}
export interface GatheringAlbum {
  chapters: AlbumChapter[];
  wishes: GatheringWishView[];
  photographers: string[];
  count: number;
  /** After the day the album locks (ADR 0039): no new photos, tags or wishes. */
  phase: GatheringPhase;
  /** The date the album locks on its own, at the end of that day at the venue. */
  locksAfter: string;
  thanks: string;
  coverId?: string;
  /** Your memory card for this moment, if you came: shown on your profile or hidden. */
  card?: "shown" | "hidden";
}

/**
 * Closing the moment (ADR 0039). The host writes the thank-you, picks the cover, orders photos
 * and may lock the album before it locks on its own.
 */
export const closingInputSchema = z
  .object({ thanks: text(600).optional(), lock: z.literal(true).optional() })
  .strict();
export const coverInputSchema = z.object({ photoId: z.string().uuid().nullable() }).strict();
export const photoMoveInputSchema = z.object({ direction: z.enum(["up", "down"]) }).strict();
export const cardInputSchema = z.object({ shown: z.boolean() }).strict();
/** A moment you came to, as it shows on your profile. */
export interface MemoryCard {
  gatheringId: string;
  kind: GatheringKind;
  title: string;
  date: string;
  place: string;
  cover: boolean;
  /** How many people came in through the door. */
  people: number;
  host: boolean;
}
