import { z } from "zod";

/**
 * Tickets for an organisation's event, released in waves. A presale opens first for the people
 * who hold enough of the organisation's stamps (they kept coming), then its own people and any
 * stamp holder, then, if the admin says so, everyone. A price makes them paid tickets.
 */
export const ticketSetupSchema = z
  .object({
    when: z.string().datetime(),
    place: z.string().trim().min(2).max(80),
    capacity: z.number().int().min(1).max(5000),
    /** When the organisation's own people, and anyone holding one of its stamps, can claim. */
    firstWave: z.string().datetime(),
    /** When everyone else can. Left out, the event stays with the waves before. */
    everyone: z.string().datetime().optional(),
    /** The earliest wave: people holding at least this many of the organisation's stamps. */
    presale: z
      .object({ opens: z.string().datetime(), minStamps: z.number().int().min(1).max(50) })
      .strict()
      .optional(),
    /** In the currency's smallest unit (cents). Left out or 0, the tickets are free. */
    price: z.number().int().min(0).max(100_000_00).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict()
  .refine((t) => !t.everyone || t.everyone >= t.firstWave, {
    message: "Everyone can't come before the first wave.",
    path: ["everyone"],
  })
  .refine((t) => !t.presale || t.presale.opens <= t.firstWave, {
    message: "The presale comes before the first wave.",
    path: ["presale"],
  });
export const ticketDoorSchema = z.object({ code: z.string().regex(/^[\w-]{8}$/) }).strict();
/** A paid ticket is held for a few minutes while its buyer pays. */
export type TicketStatus = "going" | "waiting" | "held";
export interface EventTickets {
  orgId: string;
  stampId: string;
  when: string;
  place: string;
  capacity: number;
  firstWave: string;
  everyone?: string | undefined;
  presale?: { opens: string; minStamps: number } | undefined;
  price?: number | undefined;
  currency?: string | undefined;
  secret: string;
  /** The Hunt: spots hidden around the venue, each with its own printed QR. */
  hunt?: string[] | undefined;
}
export interface Ticket {
  orgId: string;
  stampId: string;
  userId: string;
  status: TicketStatus;
  at: string;
  heldUntil?: string | undefined;
  paid?: { amount: number; currency: string; ref: string } | undefined;
  arrivedAt?: string | undefined;
}
/** Two people at the same event scan each other's QR: they met there. */
export const swapSchema = z
  .object({ from: z.string().min(1).max(64), code: z.string().regex(/^[\w-]{8}$/) })
  .strict();
export interface Meeting {
  orgId: string;
  stampId: string;
  people: [string, string];
  at: string;
}
export const huntSetupSchema = z
  .object({ spots: z.array(z.string().trim().min(2).max(40)).min(2).max(12) })
  .strict();
export const huntFindSchema = z
  .object({ spot: z.number().int().min(0).max(11), code: z.string().regex(/^[\w-]{8}$/) })
  .strict();

/** Ready-made starts: a society runs by terms, a creator by seasons of fans, a company by teams. */
export const orgTemplates = ["society", "creator", "company"] as const;
export type OrgTemplate = (typeof orgTemplates)[number];

/** Room moderation: slow mode, muting, reports. */
export const slowModes = [0, 30, 60, 300] as const;
export type SlowMode = (typeof slowModes)[number];
export const roomSlowSchema = z
  .object({
    seconds: z.number().refine((n): n is SlowMode => (slowModes as readonly number[]).includes(n)),
  })
  .strict();
export const roomMuteSchema = z
  .object({ userId: z.string().min(1).max(64), muted: z.boolean() })
  .strict();
export const reportReasons = ["spam", "harassment", "other"] as const;
export const roomReportSchema = z.object({ reason: z.enum(reportReasons) }).strict();
export interface RoomSettings {
  slow: SlowMode;
  muted: string[];
}
export interface RoomReport {
  postId: string;
  termId: string;
  userId: string;
  reason: (typeof reportReasons)[number];
  at: string;
}

/** What a term left behind, made when it locks and never changed after. */
export interface Yearbook {
  termId: string;
  label: string;
  from: number;
  to?: number | undefined;
  madeAt: string;
  people: { id: string; name: string; handle: string; role: string }[];
  counts: { messages: number; announcements: number; decisions: number; scheduled: number };
  decisions: string[];
  firstWord: { name: string; text: string } | null;
  lastNote: { name: string; text: string } | null;
  crew: { event: string; people: number }[];
}
