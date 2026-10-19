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
export const privacyInputSchema = z.object({ private: z.boolean() }).strict();
export const groupInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    members: z.array(z.string().min(1).max(80)).min(2).max(31),
  })
  .strict();
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
  | "reply"
  | "mention"
  | "partner-request"
  | "follow-request"
  | "follow-accepted"
  | "gift"
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
  /** You asked to follow this private account and are waiting. */
  requested: boolean;
  private: boolean;
  followsYou: boolean;
  /** They follow you or wrote to you first, so a message from you can reach them. */
  canMessage: boolean;
  mutuals?: number | undefined;
}
