import { z } from "zod";

export const reportInputSchema = z
  .object({ reason: z.enum(["spam", "harassment", "nudity", "violence", "fake", "other"]) })
  .strict();
export const moderationActionSchema = z
  .object({
    target: z.enum(["post", "profile", "wall-note"]),
    id: z.string().min(1).max(100),
    action: z.enum(["remove", "restore", "dismiss"]),
  })
  .strict();
export const suspendSchema = z
  .object({ suspended: z.boolean(), note: z.string().trim().max(300).optional() })
  .strict();
export const peopleQuerySchema = z.string().trim().toLowerCase().min(1).max(60);
export const messageInputSchema = z
  .object({ text: z.string().trim().min(1, "MESSAGE_EMPTY").max(2000) })
  .strict();
export const deleteAccountSchema = z
  .object({
    password: z.string().max(200).optional(),
    /** Accounts without a password confirm by typing their handle. */
    handle: z.string().trim().toLowerCase().max(24).optional(),
  })
  .strict();

export type NotificationType =
  | "follow"
  | "like"
  | "comment"
  | "reaction"
  | "partner-request"
  | "post-removed";

export interface PersonView {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string | undefined;
  bio: string;
  followers: number;
  following: boolean;
  followsYou: boolean;
  mutuals?: number | undefined;
}
