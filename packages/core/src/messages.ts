import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import { messageInputSchema } from "../../contracts/src/community.js";
import type { Actor } from "./index.js";
import type { CommunityService } from "./community.js";
import { publicUser } from "./community.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface Message {
  id: string;
  conversation: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
}

const conversationId = (a: string, b: string) => [a, b].sort().join(":");

/**
 * Private one-to-one messages. To keep strangers out of inboxes, you can start a conversation
 * only with someone who follows you; once they have written to you, either side may reply.
 * Blocks, suspensions and deletion close the conversation for both sides.
 */
export class MessageService {
  constructor(
    private readonly social: SocialService,
    private readonly community: CommunityService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private get store() {
    return this.social.store;
  }
  private all(me: string) {
    return this.store.all<Message>("message").filter((m) => m.from === me || m.to === me);
  }
  canMessage(me: string, other: string) {
    if (me === other || !this.store.get("user", other)) return false;
    if (!this.community.canSeeUser(me, other) || this.community.isDeleted(other)) return false;
    const followsMe = !!this.store.get("follow", `${other}:${me}`);
    const wroteToMe = this.store
      .all<Message>("message")
      .some((m) => m.from === other && m.to === me);
    return followsMe || wroteToMe;
  }
  send(actor: Actor, to: string, input: unknown) {
    const me = this.social.actor(actor);
    const { text } = messageInputSchema.parse(input);
    if (!this.canMessage(me, to)) throw new AppError("MESSAGE_NOT_ALLOWED", 403);
    const recent = this.all(me).filter(
      (m) => m.from === me && Date.parse(m.createdAt) > this.now().getTime() - 60_000,
    );
    if (recent.length >= 30) throw new AppError("TOO_MANY_MESSAGES", 429);
    const message: Message = {
      id: randomUUID(),
      conversation: conversationId(me, to),
      from: me,
      to,
      text,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("message", message.id, message);
      this.store.put("message-read", `${message.conversation}:${me}`, { at: message.createdAt });
    });
    return message;
  }
  private readAt(conversation: string, me: string) {
    return this.store.get<{ at: string }>("message-read", `${conversation}:${me}`)?.at ?? "";
  }
  conversations(actor: Actor) {
    const me = this.social.actor(actor);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const latest = new Map<string, Message>();
    for (const m of this.all(me)) latest.set(m.conversation, m);
    return [...latest.values()]
      .map((last) => {
        const other = last.from === me ? last.to : last.from;
        if (!this.community.canSeeUser(me, other)) return null;
        const read = this.readAt(last.conversation, me);
        return {
          user: publicUser(users.get(other) as User),
          last: { text: last.text, fromMe: last.from === me, createdAt: last.createdAt },
          unread: this.all(me).filter(
            (m) => m.conversation === last.conversation && m.to === me && m.createdAt > read,
          ).length,
          canReply: this.canMessage(me, other),
        };
      })
      .filter((c) => c !== null)
      .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }
  /** Reading a thread marks it read. */
  thread(actor: Actor, other: string) {
    const me = this.social.actor(actor);
    const user = this.store.get<User>("user", other);
    if (!user || !this.community.canSeeUser(me, other)) throw new AppError("NOT_FOUND", 404);
    const conversation = conversationId(me, other);
    const messages = this.all(me)
      .filter((m) => m.conversation === conversation)
      .slice(-200);
    const last = messages.at(-1);
    if (last && last.createdAt > this.readAt(conversation, me))
      this.store.transaction(() =>
        this.store.put("message-read", `${conversation}:${me}`, { at: last.createdAt }),
      );
    return {
      user: publicUser(user),
      canMessage: this.canMessage(me, other),
      messages: messages.map((m) => ({
        id: m.id,
        fromMe: m.from === me,
        text: m.text,
        createdAt: m.createdAt,
      })),
    };
  }
  unread(actor: Actor) {
    return { count: this.conversations(actor).reduce((n, c) => n + c.unread, 0) };
  }
}
