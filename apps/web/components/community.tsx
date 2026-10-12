"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Bell,
  Flag,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import type { PersonView } from "../../../packages/contracts/src/community";
import { api } from "./runtime";
import { Avatar, Dialog } from "./ui";

type Small = Pick<User, "id" | "name" | "handle" | "initials" | "color" | "avatarAssetId">;
const asUser = (u: Small): User => ({ bio: "", ...u }) as User;
const errorText: Record<string, string> = {
  MESSAGE_NOT_ALLOWED: "You can message someone once they follow you or write to you first.",
  NOT_AVAILABLE: "This account is not available.",
  TOO_MANY_MESSAGES: "Slow down a little and try again in a minute.",
};
const friendly = (e: unknown) => {
  const code = (e as Error).message.split(" ")[0]!;
  return errorText[code] ?? (e as Error).message;
};
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Reporting and blocking ----------------------------------------------------------------
const reasons = [
  ["spam", "Spam or scam"],
  ["harassment", "Bullying or harassment"],
  ["nudity", "Nudity or sexual content"],
  ["violence", "Violence or dangerous acts"],
  ["fake", "Pretending to be someone else"],
  ["other", "Something else"],
] as const;

export function ReportDialog({
  postId,
  title,
  onClose,
  notify,
}: {
  postId: string;
  title: string;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const [reason, setReason] = useState<string>("spam");
  return (
    <Dialog title="Report this post" onClose={onClose}>
      <form
        className="identity-form report-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/posts/${postId}/report`, { reason });
            notify("Thanks. A moderator will review this post.");
            onClose();
          } catch (err) {
            notify(friendly(err));
          }
        }}
      >
        <p className="fineprint">“{title}”. The author is not told who reported it.</p>
        <fieldset className="report-reasons">
          <legend>What is wrong with it?</legend>
          {reasons.map(([id, label]) => (
            <label key={id} className="report-reason">
              <input
                type="radio"
                name="reason"
                value={id}
                checked={reason === id}
                onChange={() => setReason(id)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <button className="primary">
          <Flag size={15} /> Send report
        </button>
      </form>
    </Dialog>
  );
}

export async function toggleBlock(user: Small, notify: (m: string) => void) {
  try {
    const { blocked } = await api<{ blocked: boolean }>(`/users/${user.id}/block`, {});
    notify(
      blocked
        ? `Blocked @${user.handle}. You will not see each other.`
        : `Unblocked @${user.handle}.`,
    );
    return blocked;
  } catch (e) {
    notify(friendly(e));
    return null;
  }
}

// People ---------------------------------------------------------------------------------
function PersonRow({
  person,
  notify,
  onChanged,
  onMessage,
  onOpen,
}: {
  person: PersonView;
  notify: (m: string) => void;
  onChanged: () => void;
  onMessage: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <li className="member">
      <button className="person-main" onClick={() => onOpen(person.id)}>
        <Avatar user={asUser(person)} />
        <span>
          <strong>{person.name}</strong>
          <small>
            @{person.handle} · {person.followers} follower{person.followers === 1 ? "" : "s"}
            {person.followsYou ? " · Follows you" : ""}
            {person.mutuals ? ` · ${person.mutuals} you know follow` : ""}
          </small>
        </span>
      </button>
      <div className="person-actions">
        <button
          className={person.following ? "quiet-button" : "primary small"}
          aria-label={`${person.following ? "Unfollow" : "Follow"} ${person.name}`}
          onClick={async () => {
            try {
              await api(`/users/${person.id}/follow`, {});
              onChanged();
            } catch (e) {
              notify(friendly(e));
            }
          }}
        >
          {person.following ? <UserCheck size={15} /> : <UserPlus size={15} />}
          {person.following ? "Following" : "Follow"}
        </button>
        <button
          className="icon-button"
          aria-label={`Message ${person.name}`}
          title="Message"
          onClick={() => onMessage(person.id)}
        >
          <MessageCircle size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={`Block ${person.name}`}
          title="Block"
          onClick={async () => {
            if ((await toggleBlock(person, notify)) !== null) onChanged();
          }}
        >
          <Ban size={16} />
        </button>
      </div>
    </li>
  );
}

export function PeoplePanel({
  notify,
  onMessage,
  onOpen,
  onFollowChanged,
}: {
  notify: (m: string) => void;
  onMessage: (id: string) => void;
  onOpen: (id: string) => void;
  onFollowChanged: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<PersonView[] | null>(null),
    [suggested, setSuggested] = useState<PersonView[]>([]);
  const load = useCallback(async () => {
    try {
      setSuggested(await api<PersonView[]>("/people/suggested"));
      setResults(
        query.trim() ? await api<PersonView[]>(`/people?q=${encodeURIComponent(query)}`) : null,
      );
    } catch (e) {
      notify(friendly(e));
    }
  }, [query, notify]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);
  const changed = () => {
    void load();
    void onFollowChanged();
  };
  const row = (p: PersonView) => (
    <PersonRow
      key={p.id}
      person={p}
      notify={notify}
      onChanged={changed}
      onMessage={onMessage}
      onOpen={onOpen}
    />
  );
  return (
    <section className="community-panel" aria-labelledby="people-title">
      <header className="identity-head">
        <span className="eyebrow">PEOPLE</span>
        <h1 id="people-title">Find people</h1>
      </header>
      <label className="people-search">
        <Search size={17} />
        <input
          aria-label="Search people"
          placeholder="Name or @handle"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {results && (
        <div>
          <h2 className="panel-title">Results</h2>
          {results.length ? (
            <ul className="person-list">{results.map(row)}</ul>
          ) : (
            <p className="fineprint">Nobody matches “{query}”.</p>
          )}
        </div>
      )}
      <div>
        <h2 className="panel-title">Suggested for you</h2>
        {suggested.length ? (
          <ul className="person-list">{suggested.map(row)}</ul>
        ) : (
          <p className="fineprint">No suggestions yet. Search for friends by name.</p>
        )}
      </div>
    </section>
  );
}

// Notifications --------------------------------------------------------------------------
interface NotificationView {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  actor: Small | null;
  post: { id: string; title: string } | null;
}
function describe(n: NotificationView) {
  const title = n.post ? `“${n.post.title}”` : "your post";
  switch (n.type) {
    case "follow":
      return "started following you.";
    case "like":
      return `liked ${title}.`;
    case "comment":
      return `commented on ${title}.`;
    case "reply":
      return `replied to your comment on ${n.post ? title : "a post"}.`;
    case "mention":
      return `mentioned you on ${n.post ? title : "a post"}.`;
    case "reaction":
      return `left a sticker on ${title}.`;
    case "partner-request":
      return "wants to add you as their partner. Confirm it on Who you are.";
    case "post-removed":
      return `Your post ${title} was removed for breaking the community rules.`;
    default:
      return "did something.";
  }
}
export function NotificationsPanel({
  onOpenUser,
  onOpenPost,
  onRead,
}: {
  onOpenUser: (id: string) => void;
  onOpenPost?: (id: string) => void;
  onRead: () => void;
}) {
  const [items, setItems] = useState<NotificationView[] | null>(null);
  useEffect(() => {
    void (async () => {
      setItems(await api<NotificationView[]>("/notifications"));
      await api("/notifications/read", {});
      onRead();
    })();
  }, [onRead]);
  return (
    <section className="community-panel" aria-labelledby="notifications-title">
      <header className="identity-head">
        <span className="eyebrow">ACTIVITY</span>
        <h1 id="notifications-title">Notifications</h1>
      </header>
      {items && items.length === 0 && (
        <p className="fineprint">
          <Bell size={14} /> Nothing yet. Follows, likes, comments and stickers show up here.
        </p>
      )}
      <ul className="notification-list">
        {items?.map((n) => (
          <li key={n.id} className={n.read ? "notification" : "notification unread"}>
            {n.actor ? (
              <button
                className="avatar-button"
                aria-label={`Open ${n.actor.name}`}
                onClick={() => onOpenUser(n.actor!.id)}
              >
                <Avatar user={asUser(n.actor)} small />
              </button>
            ) : (
              <ShieldCheck size={22} />
            )}
            <p>
              {n.actor && <strong>{n.actor.name} </strong>}
              {describe(n)}
              {n.post && onOpenPost && n.type !== "post-removed" && (
                <>
                  {" "}
                  <button className="link-button" onClick={() => onOpenPost(n.post!.id)}>
                    View post
                  </button>
                </>
              )}
            </p>
            <time dateTime={n.createdAt}>{ago(n.createdAt)}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Messages -------------------------------------------------------------------------------
interface Conversation {
  user: Small;
  last: { text: string; fromMe: boolean; createdAt: string };
  unread: number;
  canReply: boolean;
}
interface Thread {
  user: Small;
  canMessage: boolean;
  messages: { id: string; fromMe: boolean; text: string; createdAt: string }[];
}
export function MessagesPanel({
  initialUser,
  notify,
  onRead,
}: {
  initialUser: string | null;
  notify: (m: string) => void;
  onRead: () => void;
}) {
  const [list, setList] = useState<Conversation[]>([]),
    [open, setOpen] = useState<string | null>(initialUser),
    [thread, setThread] = useState<Thread | null>(null),
    [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const loadList = useCallback(async () => setList(await api<Conversation[]>("/messages")), []);
  const loadThread = useCallback(async () => {
    if (!open) return setThread(null);
    try {
      setThread(await api<Thread>(`/messages/${encodeURIComponent(open)}`));
      onRead();
    } catch (e) {
      notify(friendly(e));
      setOpen(null);
    }
  }, [open, notify, onRead]);
  useEffect(() => {
    void loadList();
    void loadThread();
    // New messages arrive by polling; there is no push channel yet.
    const timer = setInterval(() => {
      void loadList();
      void loadThread();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadList, loadThread]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [thread?.messages.length]);
  return (
    <section
      className={`community-panel messages ${open ? "has-thread" : ""}`}
      aria-labelledby="messages-title"
    >
      <header className="identity-head">
        <span className="eyebrow">PRIVATE</span>
        <h1 id="messages-title">Messages</h1>
      </header>
      <div className="messages-layout">
        <ul className="conversation-list" aria-label="Conversations">
          {list.length === 0 && (
            <li className="fineprint">
              No messages yet. Open Find people and tap the message icon next to someone who follows
              you.
            </li>
          )}
          {list.map((c) => (
            <li key={c.user.id}>
              <button
                className={open === c.user.id ? "conversation active" : "conversation"}
                onClick={() => setOpen(c.user.id)}
              >
                <Avatar user={asUser(c.user)} small />
                <span>
                  <strong>{c.user.name}</strong>
                  <small>
                    {c.last.fromMe ? "You: " : ""}
                    {c.last.text}
                  </small>
                </span>
                {c.unread > 0 && (
                  <span className="badge" aria-label={`${c.unread} unread`}>
                    {c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {thread && (
          <div className="thread" aria-label={`Conversation with ${thread.user.name}`}>
            <header>
              <button
                className="icon-button thread-back"
                aria-label="Back to conversations"
                onClick={() => setOpen(null)}
              >
                <ArrowLeft size={18} />
              </button>
              <Avatar user={asUser(thread.user)} small />
              <strong>{thread.user.name}</strong>
              <small>@{thread.user.handle}</small>
            </header>
            <div className="thread-messages">
              {thread.messages.length === 0 && (
                <p className="fineprint">Say hello to {thread.user.name}.</p>
              )}
              {thread.messages.map((m) => (
                <p key={m.id} className={m.fromMe ? "bubble mine" : "bubble"}>
                  {m.text}
                  <time dateTime={m.createdAt}>{ago(m.createdAt)}</time>
                </p>
              ))}
              <div ref={end} />
            </div>
            {thread.canMessage ? (
              <form
                className="thread-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  try {
                    await api(`/messages/${encodeURIComponent(thread.user.id)}`, { text });
                    setText("");
                    await loadThread();
                    await loadList();
                  } catch (err) {
                    notify(friendly(err));
                  }
                }}
              >
                <input
                  aria-label="Write a message"
                  placeholder="Write a message"
                  maxLength={2000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="primary" aria-label="Send message">
                  <Send size={16} />
                </button>
              </form>
            ) : (
              <p className="fineprint">
                You can message @{thread.user.handle} once they follow you or write to you first.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Moderation -----------------------------------------------------------------------------
interface ReportItem {
  target: "post" | "profile" | "wall-note";
  id: string;
  title: string;
  caption: string;
  owner: Small | null;
  ownerSuspended: boolean;
  removed: boolean;
  count: number;
  reasons: Record<string, number>;
  latest: string;
}
export function ModerationPanel({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await api<ReportItem[]>("/moderation/reports"));
    } catch (e) {
      notify(friendly(e));
    }
  }, [notify]);
  useEffect(() => void load(), [load]);
  const act = async (path: string, body: unknown, message: string) => {
    try {
      await api(path, body);
      notify(message);
      await load();
    } catch (e) {
      notify(friendly(e));
    }
  };
  return (
    <section className="community-panel" aria-labelledby="moderation-title">
      <header className="identity-head">
        <span className="eyebrow">MODERATION</span>
        <h1 id="moderation-title">Reports</h1>
      </header>
      {items && items.length === 0 && <p className="fineprint">No open reports. All clear.</p>}
      <ul className="report-list">
        {items?.map((r) => (
          <li key={`${r.target}:${r.id}`} className="identity-panel report-item">
            <div className="report-head">
              <span className="eyebrow">
                {r.target === "post" ? "POST" : r.target === "wall-note" ? "WALL NOTE" : "PROFILE"}
              </span>
              <strong>{r.title}</strong>
              {r.owner && (
                <small>
                  by {r.owner.name} (@{r.owner.handle}){r.ownerSuspended ? " · suspended" : ""}
                </small>
              )}
            </div>
            {r.caption && <p className="fineprint">{r.caption}</p>}
            <p className="report-reasons-line">
              {r.count} report{r.count === 1 ? "" : "s"}:{" "}
              {Object.entries(r.reasons)
                .map(([k, n]) => `${k} ×${n}`)
                .join(", ")}
            </p>
            <div className="report-actions">
              {r.target === "post" && (
                <button
                  className="primary small"
                  onClick={() =>
                    act(
                      "/moderation/actions",
                      { target: "post", id: r.id, action: "remove" },
                      "Post removed. The author was notified.",
                    )
                  }
                >
                  Remove post
                </button>
              )}
              {r.target === "wall-note" && (
                <button
                  className="primary small"
                  onClick={() =>
                    act(
                      "/moderation/actions",
                      { target: "wall-note", id: r.id, action: "remove" },
                      "Note taken off the wall.",
                    )
                  }
                >
                  Remove note
                </button>
              )}
              <button
                className="quiet-button"
                onClick={() =>
                  act(
                    "/moderation/actions",
                    { target: r.target, id: r.id, action: "dismiss" },
                    "Reports dismissed.",
                  )
                }
              >
                Dismiss
              </button>
              {r.owner && (
                <button
                  className="text-button"
                  onClick={() =>
                    act(
                      `/moderation/users/${r.owner!.id}/suspend`,
                      { suspended: !r.ownerSuspended },
                      r.ownerSuspended ? "Account restored." : "Account suspended and signed out.",
                    )
                  }
                >
                  {r.ownerSuspended ? "Lift suspension" : "Suspend account"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Account extras -------------------------------------------------------------------------
export function BlockedList({ notify }: { notify: (m: string) => void }) {
  const [people, setPeople] = useState<PersonView[]>([]);
  const load = useCallback(async () => setPeople(await api<PersonView[]>("/blocks")), []);
  useEffect(() => void load(), [load]);
  return (
    <div className="identity-panel">
      <h2>
        <Ban size={18} /> Blocked accounts
      </h2>
      {people.length === 0 ? (
        <p className="fineprint">You have not blocked anyone.</p>
      ) : (
        <ul className="person-list">
          {people.map((p) => (
            <li key={p.id} className="member">
              <span className="person-main">
                <Avatar user={asUser(p)} small />
                <span>
                  <strong>{p.name}</strong>
                  <small>@{p.handle}</small>
                </span>
              </span>
              <button
                className="quiet-button"
                onClick={async () => {
                  await toggleBlock(p, notify);
                  await load();
                }}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DeleteAccount({
  hasPassword,
  handle,
  onDeleted,
}: {
  hasPassword: boolean;
  handle: string;
  onDeleted: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="identity-panel danger-zone">
      <h2>Delete account</h2>
      <p className="fineprint">
        Removes your sign-in, followers, follows, chapters, stickers and messages, and hides your
        posts from everyone. This cannot be undone.
      </p>
      {!open ? (
        <button className="text-button danger" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      ) : (
        <form
          className="identity-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/account/delete", hasPassword ? { password: value } : { handle: value });
              await onDeleted();
            } catch (err) {
              setError(
                (err as Error).message.startsWith("LOGIN_INCORRECT")
                  ? "That password is not right."
                  : (err as Error).message.startsWith("CONFIRMATION_MISMATCH")
                    ? "Type your handle exactly."
                    : (err as Error).message,
              );
            }
          }}
        >
          <label>
            {hasPassword ? "Your password" : `Type your handle (${handle}) to confirm`}
            <input
              required
              type={hasPassword ? "password" : "text"}
              autoComplete={hasPassword ? "current-password" : "off"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary danger">Delete forever</button>
        </form>
      )}
    </div>
  );
}
