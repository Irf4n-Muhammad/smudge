"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LogOut, Send, UserPlus, Users, X } from "lucide-react";
import { api } from "./runtime";
import { Avatar, Dialog, askConfirm } from "./ui";

export interface Person {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string;
}
export interface GroupSummary {
  id: string;
  name: string;
  owner: boolean;
  members: Person[];
  last: { text: string; fromMe: boolean; from: string; createdAt: string } | null;
  unread: number;
  updatedAt: string;
}
interface GroupThreadView {
  id: string;
  name: string;
  owner: boolean;
  members: Person[];
  messages: { id: string; fromMe: boolean; from: Person | null; text: string; createdAt: string }[];
}
const asUser = (p: Person) => ({ ...p, bio: "" });
const errorText = (e: unknown) => {
  const code = String((e as Error).message).split(" (")[0];
  return code === "MEMBER_NOT_ALLOWED"
    ? "You can add people who follow you or have written to you."
    : code === "GROUP_TOO_SMALL"
      ? "Pick at least two people."
      : code === "GROUP_FULL"
        ? "A group can have 32 people."
        : code === "TOO_MANY_MESSAGES"
          ? "Slow down a little."
          : "Something went wrong. Try again.";
};

/** Picks people you could message; a group starts with at least two of them. */
export function NewGroup({
  onClose,
  onCreated,
  notify,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  notify: (m: string) => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null),
    [name, setName] = useState(""),
    [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    void api<Person[]>("/groups/candidates").then(setPeople);
  }, []);
  return (
    <Dialog title="New group" onClose={onClose}>
      <form
        className="group-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const g = await api<{ id: string }>("/groups", { name, members: picked });
            onCreated(g.id);
          } catch (err) {
            notify(errorText(err));
          }
        }}
      >
        <label>
          Group name
          <input
            value={name}
            maxLength={60}
            placeholder="Weekend trip"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>People</legend>
          {people?.length === 0 && (
            <p className="fineprint">
              You can add people who follow you or have written to you. Nobody yet.
            </p>
          )}
          {people?.map((p) => (
            <label key={p.id} className="group-person">
              <input
                type="checkbox"
                checked={picked.includes(p.id)}
                onChange={(e) =>
                  setPicked((v) => (e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id)))
                }
              />
              <Avatar user={asUser(p)} small />
              <span>
                {p.name} <small>@{p.handle}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button className="primary" disabled={!name.trim() || picked.length < 2}>
          Create group
        </button>
      </form>
    </Dialog>
  );
}

export function GroupThread({
  id,
  meId,
  onBack,
  onChanged,
  notify,
}: {
  id: string;
  meId: string;
  onBack: () => void;
  onChanged: () => void;
  notify: (m: string) => void;
}) {
  const [thread, setThread] = useState<GroupThreadView | null>(null),
    [text, setText] = useState(""),
    [members, setMembers] = useState(false),
    [candidates, setCandidates] = useState<Person[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      setThread(await api<GroupThreadView>(`/groups/${encodeURIComponent(id)}`));
      onChanged();
    } catch {
      onBack();
    }
  }, [id, onBack, onChanged]);
  useEffect(() => {
    void load();
    // Like one-to-one messages, groups refresh by polling; there is no push channel yet.
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [thread?.messages.length]);
  useEffect(() => {
    if (members) void api<Person[]>("/groups/candidates").then(setCandidates);
  }, [members]);
  if (!thread) return null;
  const remove = async (userId: string, self: boolean) => {
    if (
      self &&
      !(await askConfirm(
        `Leave “${thread.name}”?`,
        "You stop getting its messages. Someone in the group can add you back.",
        "Leave group",
      ))
    )
      return;
    try {
      await api(
        `/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
        undefined,
        "DELETE",
      );
      if (self) return onBack();
      await load();
    } catch (e) {
      notify(errorText(e));
    }
  };
  return (
    <div className="thread group-thread" aria-label={`Group ${thread.name}`}>
      <header>
        <button
          className="icon-button thread-back"
          aria-label="Back to conversations"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
        <span className="group-icon" aria-hidden="true">
          <Users size={16} />
        </span>
        <strong>{thread.name}</strong>
        <button
          className="text-button"
          aria-expanded={members}
          onClick={() => setMembers((v) => !v)}
        >
          {thread.members.length} {thread.members.length === 1 ? "person" : "people"}
        </button>
      </header>
      {members && (
        <section className="group-members" aria-label="Group members">
          <ul>
            {thread.members.map((p) => (
              <li key={p.id}>
                <Avatar user={asUser(p)} small />
                <span>
                  {p.name} <small>@{p.handle}</small>
                </span>
                {thread.owner && p.id !== meId && (
                  <button
                    className="icon-button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => void remove(p.id, false)}
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {candidates.filter((c) => !thread.members.some((m) => m.id === c.id)).length > 0 && (
            <label className="group-add">
              <UserPlus size={15} />
              <select
                aria-label="Add someone"
                value=""
                onChange={async (e) => {
                  try {
                    await api(`/groups/${encodeURIComponent(id)}/members`, {
                      userId: e.target.value,
                    });
                    await load();
                  } catch (err) {
                    notify(errorText(err));
                  }
                }}
              >
                <option value="">Add someone…</option>
                {candidates
                  .filter((c) => !thread.members.some((m) => m.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (@{c.handle})
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button className="quiet-button" onClick={() => void remove(meId, true)}>
            <LogOut size={15} /> Leave group
          </button>
        </section>
      )}
      <div className="thread-messages">
        {thread.messages.length === 0 && (
          <p className="fineprint">Say hello to everyone in {thread.name}.</p>
        )}
        {thread.messages.map((m) => (
          <p key={m.id} className={m.fromMe ? "bubble mine" : "bubble"}>
            {!m.fromMe && <b className="bubble-from">{m.from?.name ?? "Someone"}</b>}
            {m.text}
          </p>
        ))}
        <div ref={end} />
      </div>
      <form
        className="thread-composer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          try {
            await api(`/groups/${encodeURIComponent(id)}/messages`, { text });
            setText("");
            await load();
          } catch (err) {
            notify(errorText(err));
          }
        }}
      >
        <input
          aria-label="Write a message"
          placeholder={`Message ${thread.name}`}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="primary" aria-label="Send message">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
