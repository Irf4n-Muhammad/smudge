import { z } from "zod";
import type { Actor } from "./index.js";
import type { CommunityService } from "./community.js";
import { queueMail } from "./mail.js";
import type { SocialService } from "./social.js";

const MINUTE = 60_000;
/** Something read in the app within this time is not worth an email. */
const QUIET = 10 * MINUTE;
/** At most one activity email per person in this window. */
const SPACING = 6 * 60 * MINUTE;

interface Credential {
  userId: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}
interface Message {
  from: string;
  to: string;
  createdAt: string;
}
export interface EmailPrefs {
  activity: boolean;
}
const prefsSchema = z.object({ activity: z.boolean() }).strict();

function line(n: { type: string; actor: { name: string } | null; post: { title: string } | null }) {
  const who = n.actor?.name ?? "Someone";
  const title = n.post ? `“${n.post.title}”` : "your post";
  switch (n.type) {
    case "follow":
      return `${who} started following you.`;
    case "follow-request":
      return `${who} asked to follow you.`;
    case "follow-accepted":
      return `${who} accepted your follow request.`;
    case "like":
      return `${who} liked ${title}.`;
    case "comment":
      return `${who} commented on ${title}.`;
    case "reply":
      return `${who} replied to your comment.`;
    case "mention":
      return `${who} mentioned you.`;
    case "reaction":
      return `${who} left a sticker on ${title}.`;
    case "partner-request":
      return `${who} wants to add you as their partner.`;
    default:
      return null;
  }
}

/**
 * Brings people back: one short email about what happened while they were away. Nothing is sent
 * for activity they already saw in the app, for unconfirmed addresses, or when they turned it off.
 */
export class ActivityDigest {
  constructor(
    private readonly social: SocialService,
    private readonly community: CommunityService,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  prefs(actor: Actor): EmailPrefs {
    const userId = this.social.actor(actor);
    return this.store.get<EmailPrefs>("email-prefs", userId) ?? { activity: true };
  }
  setPrefs(actor: Actor, input: unknown): EmailPrefs {
    const userId = this.social.actor(actor);
    const prefs = prefsSchema.parse(input);
    this.store.transaction(() => this.store.put("email-prefs", userId, prefs));
    return prefs;
  }
  /** Queues the emails that are due. Safe to call as often as you like. */
  run() {
    const now = this.now().getTime();
    let sent = 0;
    for (const credential of this.store.all<Credential>("credential")) {
      const userId = credential.userId;
      if (!credential.emailVerified || this.community.isDeleted(userId)) continue;
      if (this.store.get<EmailPrefs>("email-prefs", userId)?.activity === false) continue;
      const last = this.store.get<{ at: string }>("digest", userId)?.at ?? credential.createdAt;
      if (Date.parse(last) > now - SPACING) continue;
      const fresh = (iso: string) => iso > last && Date.parse(iso) <= now - QUIET;
      const items = this.community
        .notifications({ userId })
        .filter((n) => !n.read && fresh(n.createdAt))
        .map(line)
        .filter((l): l is string => !!l);
      const senders = new Set(
        this.store
          .all<Message>("message")
          .filter(
            (m) =>
              m.to === userId && fresh(m.createdAt) && this.community.canSeeUser(userId, m.from),
          )
          .map((m) => m.from),
      );
      if (!items.length && !senders.size) continue;
      const user = this.social.users().find((u) => u.id === userId);
      if (!user) continue;
      const names = [...senders].map((id) => this.social.users().find((u) => u.id === id)?.name);
      const lines = [
        ...(senders.size
          ? [
              `New messages from ${names.filter(Boolean).slice(0, 3).join(", ")}${senders.size > 3 ? " and others" : ""}.`,
            ]
          : []),
        ...items.slice(0, 6),
        ...(items.length > 6 ? [`…and ${items.length - 6} more.`] : []),
      ];
      const count = items.length + (senders.size ? 1 : 0);
      this.store.transaction(() => {
        queueMail(
          this.store,
          {
            userId,
            to: credential.email,
            subject: senders.size
              ? "You have new messages on Smudge"
              : `${count} new thing${count === 1 ? "" : "s"} on Smudge`,
            body: `Hi ${user.name},\n\nWhile you were away:\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\nSee it on Smudge: ${this.appUrl}\n\nYou get at most one of these every few hours. Turn them off under Account settings on Smudge.`,
          },
          new Date(now),
        );
        this.store.put("digest", userId, { at: new Date(now).toISOString() });
      });
      sent++;
    }
    return { sent };
  }
}
