import { randomUUID } from "node:crypto";
import type { User } from "../../contracts/src/experience.js";
import { groupInputSchema, messageInputSchema } from "../../contracts/src/community.js";
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

interface Group {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: string;
}
interface GroupMessage {
  id: string;
  groupId: string;
  from: string;
  text: string;
  createdAt: string;
}
const maxMembers = 32;

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
    if (this.sentRecently(me) >= 30) throw new AppError("TOO_MANY_MESSAGES", 429);
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
    return {
      count:
        this.conversations(actor).reduce((n, c) => n + c.unread, 0) +
        this.groups(actor).reduce((n, g) => n + g.unread, 0),
    };
  }

  // Groups -------------------------------------------------------------------------------
  /**
   * Group chats. You can only add people you could message one to one (they follow you or
   * wrote to you), so nobody is pulled into a group by a stranger. Messages from people you
   * blocked, or who are suspended or deleted, are left out of what you see.
   */
  private group(me: string, id: string) {
    const group = this.store.get<Group>("group", id);
    if (!group || !group.members.includes(me)) throw new AppError("NOT_FOUND", 404);
    return group;
  }
  private addable(me: string, userId: string) {
    if (!this.canMessage(me, userId)) throw new AppError("MEMBER_NOT_ALLOWED", 403, { userId });
  }
  private sentRecently(me: string) {
    const since = this.now().getTime() - 60_000;
    return (
      this.all(me).filter((m) => m.from === me && Date.parse(m.createdAt) > since).length +
      this.store
        .all<GroupMessage>("group-message")
        .filter((m) => m.from === me && Date.parse(m.createdAt) > since).length
    );
  }
  createGroup(actor: Actor, input: unknown) {
    const me = this.social.actor(actor);
    const { name, members } = groupInputSchema.parse(input);
    const others = [...new Set(members)].filter((id) => id !== me);
    if (others.length < 2) throw new AppError("GROUP_TOO_SMALL");
    if (others.length + 1 > maxMembers) throw new AppError("GROUP_FULL", 409);
    for (const id of others) this.addable(me, id);
    const group: Group = {
      id: randomUUID(),
      name,
      ownerId: me,
      members: [me, ...others],
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("group", group.id, group);
      this.store.put("group-read", `${group.id}:${me}`, { at: group.createdAt });
    });
    return this.groupView(me, group);
  }
  /** People you may add to a group: the ones you could message directly. */
  groupCandidates(actor: Actor) {
    const me = this.social.actor(actor);
    return this.social
      .users()
      .filter((u) => this.canMessage(me, u.id))
      .map((u) => publicUser(u)!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  private readGroupAt(groupId: string, me: string) {
    return this.store.get<{ at: string }>("group-read", `${groupId}:${me}`)?.at ?? "";
  }
  private visibleMessages(me: string, groupId: string) {
    return this.store
      .all<GroupMessage>("group-message")
      .filter((m) => m.groupId === groupId && this.community.canSeeUser(me, m.from));
  }
  private groupView(me: string, group: Group) {
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    return {
      id: group.id,
      name: group.name,
      owner: group.ownerId === me,
      members: group.members
        .filter((id) => this.community.canSeeUser(me, id) && !this.community.isDeleted(id))
        .map((id) => publicUser(users.get(id))!),
    };
  }
  groups(actor: Actor) {
    const me = this.social.actor(actor);
    return this.store
      .all<Group>("group")
      .filter((g) => g.members.includes(me))
      .map((g) => {
        const messages = this.visibleMessages(me, g.id);
        const last = messages.at(-1);
        const read = this.readGroupAt(g.id, me);
        const users = new Map(this.social.users().map((u) => [u.id, u]));
        return {
          ...this.groupView(me, g),
          last: last
            ? {
                text: last.text,
                fromMe: last.from === me,
                from: users.get(last.from)?.name ?? "Someone",
                createdAt: last.createdAt,
              }
            : null,
          unread: messages.filter((m) => m.from !== me && m.createdAt > read).length,
          updatedAt: last?.createdAt ?? g.createdAt,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  /** Reading a group marks it read. */
  groupThread(actor: Actor, id: string) {
    const me = this.social.actor(actor);
    const group = this.group(me, id);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const messages = this.visibleMessages(me, id).slice(-200);
    const last = messages.at(-1);
    if (last && last.createdAt > this.readGroupAt(id, me))
      this.store.transaction(() =>
        this.store.put("group-read", `${id}:${me}`, { at: last.createdAt }),
      );
    return {
      ...this.groupView(me, group),
      messages: messages.map((m) => ({
        id: m.id,
        fromMe: m.from === me,
        from: publicUser(users.get(m.from)),
        text: m.text,
        createdAt: m.createdAt,
      })),
    };
  }
  sendToGroup(actor: Actor, id: string, input: unknown) {
    const me = this.social.actor(actor);
    const group = this.group(me, id);
    const { text } = messageInputSchema.parse(input);
    if (this.sentRecently(me) >= 30) throw new AppError("TOO_MANY_MESSAGES", 429);
    const message: GroupMessage = {
      id: randomUUID(),
      groupId: group.id,
      from: me,
      text,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("group-message", message.id, message);
      this.store.put("group-read", `${group.id}:${me}`, { at: message.createdAt });
    });
    return { id: message.id };
  }
  /** Any member may add people they could message; the group's creator may rename it. */
  addMember(actor: Actor, id: string, userId: string) {
    const me = this.social.actor(actor);
    const group = this.group(me, id);
    if (group.members.includes(userId)) return this.groupView(me, group);
    if (group.members.length >= maxMembers) throw new AppError("GROUP_FULL", 409);
    this.addable(me, userId);
    const next = { ...group, members: [...group.members, userId] };
    this.store.transaction(() => this.store.put("group", id, next));
    return this.groupView(me, next);
  }
  /** Leaving is always allowed; only the creator removes others. The last one out ends it. */
  removeMember(actor: Actor, id: string, userId: string) {
    const me = this.social.actor(actor);
    const group = this.group(me, id);
    if (userId !== me && group.ownerId !== me) throw new AppError("FORBIDDEN", 403);
    if (!group.members.includes(userId)) throw new AppError("NOT_FOUND", 404);
    const members = group.members.filter((m) => m !== userId);
    this.store.transaction(() => {
      this.store.remove("group-read", `${id}:${userId}`);
      if (!members.length) {
        this.store.remove("group", id);
        for (const m of this.store.all<GroupMessage>("group-message"))
          if (m.groupId === id) this.store.remove("group-message", m.id);
        return;
      }
      // A group whose creator left passes to the longest-standing member.
      this.store.put("group", id, {
        ...group,
        members,
        ownerId: group.ownerId === userId ? members[0]! : group.ownerId,
      });
    });
    return { left: userId === me };
  }
  renameGroup(actor: Actor, id: string, name: unknown) {
    const me = this.social.actor(actor);
    const group = this.group(me, id);
    if (group.ownerId !== me) throw new AppError("FORBIDDEN", 403);
    const next = { ...group, name: groupInputSchema.shape.name.parse(name) };
    this.store.transaction(() => this.store.put("group", id, next));
    return this.groupView(me, next);
  }
  /** Called inside the account-deletion transaction: their group messages and seats go. */
  erase(userId: string) {
    for (const m of this.store.all<GroupMessage>("group-message"))
      if (m.from === userId) this.store.remove("group-message", m.id);
    for (const g of this.store.all<Group>("group")) {
      if (!g.members.includes(userId)) continue;
      const members = g.members.filter((m) => m !== userId);
      this.store.remove("group-read", `${g.id}:${userId}`);
      if (!members.length) this.store.remove("group", g.id);
      else
        this.store.put("group", g.id, {
          ...g,
          members,
          ownerId: g.ownerId === userId ? members[0]! : g.ownerId,
        });
    }
  }
}
