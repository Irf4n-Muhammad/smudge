import { z } from "zod";

/** Free tickets for an organisation's event, released in waves: its own people first. */
export const ticketSetupSchema = z
  .object({
    when: z.string().datetime(),
    place: z.string().trim().min(2).max(80),
    capacity: z.number().int().min(1).max(5000),
    /** When the organisation's own people, and anyone holding one of its stamps, can claim. */
    firstWave: z.string().datetime(),
    /** When everyone else can. Left out, the event stays with the first wave. */
    everyone: z.string().datetime().optional(),
  })
  .strict()
  .refine((t) => !t.everyone || t.everyone >= t.firstWave, {
    message: "Everyone can't come before the first wave.",
    path: ["everyone"],
  });
export const ticketDoorSchema = z.object({ code: z.string().regex(/^[\w-]{8}$/) }).strict();
export type TicketStatus = "going" | "waiting";
export interface EventTickets {
  orgId: string;
  stampId: string;
  when: string;
  place: string;
  capacity: number;
  firstWave: string;
  everyone?: string | undefined;
  secret: string;
}
export interface Ticket {
  orgId: string;
  stampId: string;
  userId: string;
  status: TicketStatus;
  at: string;
  arrivedAt?: string | undefined;
}

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
