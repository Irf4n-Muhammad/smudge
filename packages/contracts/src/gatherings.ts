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

/** What anyone with the link sees. No guest names or counts: those are the host's. */
export interface GatheringInvite extends GatheringInput {
  id: string;
  hostName: string;
  createdAt: string;
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
  totals: { attending: number; declined: number; guests: number };
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
