import { z } from "zod";

/**
 * A creator's fan room: a paid (or free) membership with its own notes, and drops that open
 * first for the room's fans and for people holding the creator's chosen stamps, the proven fans.
 */
export const fanRoomSchema = z
  .object({
    title: z.string().trim().min(2).max(60),
    perks: z.string().trim().max(200).default(""),
    /** Per month, in US cents; 0 makes the room free. */
    price: z.number().int().min(0).max(10_000),
    /** An organisation whose stamps prove someone is a fan: they get the first wave of drops. */
    stampOrgId: z.string().min(1).max(80).nullable().default(null),
  })
  .strict();
export const fanNoteSchema = z.object({ text: z.string().trim().min(1).max(500) }).strict();
export const dropSchema = z
  .object({
    title: z.string().trim().min(2).max(60),
    note: z.string().trim().max(200).default(""),
    /** In US cents; 0 makes it free to claim. */
    price: z.number().int().min(0).max(100_000),
    quantity: z.number().int().min(1).max(10_000),
    /** When fans and stamp holders can claim (the presale). */
    opens: z.string().datetime(),
    /** When everyone else can. Left out, the drop stays with fans and stamp holders. */
    everyone: z.string().datetime().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#222222"),
    /** A picture of the thing; without one the card shows the colour. */
    image: z.string().url().startsWith("https://").max(500).optional(),
  })
  .strict()
  .refine((d) => !d.everyone || d.everyone >= d.opens, {
    message: "Everyone can't come before the fans.",
    path: ["everyone"],
  });

export interface FanPerson {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string;
}
export interface FanNote {
  id: string;
  author: FanPerson;
  /** The creator's own notes stand out in the room. */
  byOwner: boolean;
  /** Holds one of the creator's stamps. */
  proven: boolean;
  text: string;
  createdAt: string;
}
export interface DropView {
  id: string;
  owner: FanPerson;
  title: string;
  note: string;
  price: number;
  quantity: number;
  left: number;
  color: string;
  image?: string | undefined;
  opens: string;
  everyone?: string | undefined;
  /** When the viewer can claim: the presale if they are a fan or hold a stamp, else everyone. */
  opensForYou: string | null;
  /** Which wave is the viewer's. */
  wave: "fans" | "everyone" | null;
  /** Set once the viewer claimed: a sandbox code to collect it with. */
  code?: string | undefined;
  claimed: number;
}
export interface FanRoomView {
  owner: FanPerson;
  title: string;
  perks: string;
  price: number;
  stampOrg: { id: string; name: string } | null;
  fans: number;
  /** Fans the viewer follows, for "Maya is in". */
  friends: FanPerson[];
  member: boolean;
  /** Holds one of the creator's chosen stamps. */
  proven: boolean;
  until?: string | undefined;
  mine: boolean;
  /** Only for fans and the creator. */
  notes: FanNote[];
  drops: DropView[];
}
