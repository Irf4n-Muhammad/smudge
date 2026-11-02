"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Clock, Lock, Megaphone, X } from "lucide-react";
import { api } from "./runtime";
import { signedInOrSignIn } from "./return-path";
import { OprecAdmin, OprecPublic, type OprecView } from "./oprec-panel";

type TermView = { id: string; label: string; from: number; to?: number; locked: boolean };
interface OrgView {
  id: string;
  name: string;
  kind: "campus" | "workplace" | "club" | "event";
  members: number;
  terms: TermView[];
  current: string | null;
  collections: { id: string; name: string; stamps: number }[];
}
type Manage = OrgView & { admins: { id: string; name: string; handle: string }[] };
const kinds = { campus: "Campus", workplace: "Workplace", club: "Club", event: "Event" };
const joinErrors: Record<string, string> = {
  INVITE_ALREADY_USED: "You already joined.",
  INVITE_EXHAUSTED: "This link is full. Ask the admin for a new one.",
  INVITE_INVALID: "This link doesn’t work anymore. Ask the admin for a new one.",
};

/**
 * An organisation's public face: anyone can open it without joining. Its admin sees the same
 * page with the parts only they run: terms and the handover to the next admin.
 */
export function OrgPage({ id }: { id: string }) {
  const [org, setOrg] = useState<OrgView | null | "missing">(null);
  const [manage, setManage] = useState<Manage | null>(null);
  const [note, setNote] = useState("");
  const [join, setJoin] = useState<{ code: string; label: string } | null>(null);
  const [rooms, setRooms] = useState<RoomTab[]>([]);
  const [oprec, setOprec] = useState<OprecView | null>(null);
  const load = useCallback(async () => {
    try {
      setOrg(await api<OrgView>(`/public/orgs/${encodeURIComponent(id)}`));
    } catch {
      setOrg("missing");
      return;
    }
    // Only the admin gets an answer here; everyone else just sees the public page.
    setManage(await api<Manage>(`/orgs/${encodeURIComponent(id)}/manage`).catch(() => null));
    setRooms(await api<RoomTab[]>(`/orgs/${encodeURIComponent(id)}/rooms`).catch(() => []));
    setOprec(
      (
        await api<{ oprec: OprecView | null }>(
          `/public/orgs/${encodeURIComponent(id)}/oprec`,
        ).catch(() => ({ oprec: null }))
      ).oprec,
    );
    const code = new URLSearchParams(window.location.search).get("join");
    if (code)
      setJoin(
        await api<{ label: string }>(
          `/public/orgs/${encodeURIComponent(id)}/join/${encodeURIComponent(code)}`,
        )
          .then(({ label }) => ({ code, label }))
          .catch(() => {
            setNote(joinErrors.INVITE_INVALID!);
            return null;
          }),
      );
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  if (org === "missing")
    return (
      <main className="org-page">
        <h1>This organisation isn’t on Smudge.</h1>
      </main>
    );
  if (!org) return <main className="org-page" aria-busy="true" />;
  return (
    <main className="org-page">
      <a className="org-brand" href="/">
        smudge.
      </a>
      <header className="org-hero">
        <span className="org-mark" aria-hidden="true">
          {org.name[0]}
        </span>
        <div>
          <h1>{org.name}</h1>
          <p>
            {kinds[org.kind]} · {org.members} {org.members === 1 ? "person" : "people"}
            {org.current && <> · term {org.current}</>}
          </p>
        </div>
      </header>
      {org.terms.length > 0 && (
        <section aria-label="Terms">
          <h2>Terms</h2>
          <ul className="org-terms">
            {org.terms.map((t) => (
              <li key={t.id} className={t.locked ? "locked" : "open"}>
                {t.label}
                {t.locked ? (
                  <Lock size={12} aria-label="locked" />
                ) : (
                  <span className="org-now">now</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {org.collections.length > 0 && (
        <section aria-label="Stamp collections">
          <h2>Stamps</h2>
          <ul className="org-list">
            {org.collections.map((c) => (
              <li key={c.id}>
                {c.name} · {c.stamps} stamps
              </li>
            ))}
          </ul>
        </section>
      )}
      {join && (
        <JoinPanel
          org={org}
          join={join}
          onJoined={async (label) => {
            window.history.replaceState(null, "", `/o/${encodeURIComponent(org.id)}`);
            setJoin(null);
            setNote(`You joined. “${label}” is on your page now.`);
            await load();
          }}
          notify={setNote}
        />
      )}
      {oprec && (
        <OprecPublic org={org} oprec={oprec} admin={!!manage} onDone={load} notify={setNote} />
      )}
      {rooms.length > 0 && <Room orgId={org.id} rooms={rooms} notify={setNote} />}
      {manage && <Admin org={manage} onDone={load} notify={setNote} />}
      {manage && <OprecAdmin orgId={org.id} oprec={oprec} onDone={load} notify={setNote} />}
      {note && (
        <p className="org-note" role="status">
          {note}
        </p>
      )}
    </main>
  );
}

function Admin({
  org,
  onDone,
  notify,
}: {
  org: Manage;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const year = new Date().getFullYear();
  const [label, setLabel] = useState(`${year}/${String(year + 1).slice(2)}`);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("Admin");
  const [link, setLink] = useState("");
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      notify(done);
      await onDone();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <section className="org-admin" aria-label="Manage">
      <h2>Manage</h2>
      <p className="org-hint">
        Only admins see this. Run by {org.admins.map((a) => `@${a.handle}`).join(", ")}.
      </p>
      <div className="org-form org-join-link">
        <button
          type="button"
          className="primary small"
          onClick={() =>
            void run(async () => {
              const { code } = await api<{ code: string }>(
                `/orgs/${encodeURIComponent(org.id)}/join-link`,
                {},
              );
              const url = `${window.location.origin}/o/${encodeURIComponent(org.id)}?join=${code}`;
              setLink(url);
              await navigator.clipboard?.writeText(url).catch(() => undefined);
            }, "Join link ready. Put it in your story or group chat.")
          }
        >
          Get join link
        </button>
        {link && (
          <input readOnly aria-label="Join link" value={link} onFocus={(e) => e.target.select()} />
        )}
      </div>
      <form
        className="org-form"
        onSubmit={(e) => {
          e.preventDefault();
          const [from] = label.match(/\d{4}/) ?? [String(year)];
          void run(
            () =>
              api(`/orgs/${encodeURIComponent(org.id)}/terms`, {
                label,
                from: Number(from),
                to: Number(from) + 1,
              }),
            `Term ${label} started. The last one is locked.`,
          );
        }}
      >
        <label>
          New term
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} />
        </label>
        <button className="primary small">Start term</button>
      </form>
      <form
        className="org-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !window.confirm(
              `Hand ${org.name} to @${handle.replace(/^@/, "")}? You stop being admin.`,
            )
          )
            return;
          void run(
            () => api(`/orgs/${encodeURIComponent(org.id)}/handover`, { handle, role }),
            `Handed over to @${handle.replace(/^@/, "")}. Your ${role} chapter is on your page.`,
          );
        }}
      >
        <label>
          Hand over to
          <input
            required
            placeholder="@handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </label>
        <label>
          Your role, for your chapter
          <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} />
        </label>
        <button className="primary small">Hand over</button>
      </form>
    </section>
  );
}

function JoinPanel({
  org,
  join,
  onJoined,
  notify,
}: {
  org: OrgView;
  join: { code: string; label: string };
  onJoined: (label: string) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="org-join" aria-label="Join">
      <h2>Join {org.name}</h2>
      <p>
        You’ll get <strong>{join.label}</strong> on your page, issued by {org.name}.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (!(await signedInOrSignIn())) return;
            const chapter = await api<{ label: string }>("/identity/invites/redeem", {
              code: join.code,
            });
            await onJoined(chapter.label);
          } catch (e) {
            const code = (e as Error).message.split(" ")[0]!;
            notify(joinErrors[code] ?? (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Join
      </button>
    </section>
  );
}

/** Start an organisation: a himpunan, a UKM or a fanbase. Whoever starts it runs it. */
export function CreateOrg() {
  const year = new Date().getFullYear();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"club" | "event">("club");
  const [term, setTerm] = useState(`${year}/${String(year + 1).slice(2)}`);
  const [note, setNote] = useState("");
  return (
    <main className="org-page">
      <a className="org-brand" href="/">
        smudge.
      </a>
      <h1>Start an organisation</h1>
      <p className="org-hint">
        You run it: terms, the join link, and the handover to whoever comes next.
      </p>
      <form
        className="org-form org-create"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const org = await api<{ id: string }>("/orgs", { name, kind, term });
            window.location.assign(`/o/${encodeURIComponent(org.id)}`);
          } catch (err) {
            const code = (err as Error).message.split(" ")[0];
            setNote(
              code === "UNAUTHENTICATED" || code === "SIGN_IN_REQUIRED"
                ? "Sign in first."
                : code === "TOO_MANY_ORGS"
                  ? "You already started three."
                  : (err as Error).message,
            );
          }
        }}
      >
        <label>
          Name
          <input
            required
            minLength={3}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as "club" | "event")}>
            <option value="club">Club, himpunan, fanbase</option>
            <option value="event">Event</option>
          </select>
        </label>
        <label>
          First term
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={20} />
        </label>
        <button className="primary">Start</button>
      </form>
      {note && (
        <p className="org-note" role="status">
          {note}
        </p>
      )}
    </main>
  );
}

type RoomTab = { id: string; label: string; locked: boolean };
type Who = { id: string; name: string; handle: string };
type RoomPostView = {
  id: string;
  kind: "announcement" | "message";
  text: string;
  createdAt: string;
  author: Who;
};
interface RoomView {
  term: RoomTab;
  admin: boolean;
  canPost: boolean;
  state: { id: string; kind: "schedule" | "decision" | "deadline"; text: string; when?: string }[];
  announcements: RoomPostView[];
  messages: RoomPostView[];
}
const stateIcon = { schedule: CalendarDays, decision: Check, deadline: Clock };
const stateName = { schedule: "Schedule", decision: "Decided", deadline: "Due" };
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * A term's room. What's true now sits on top (schedule, decisions, deadlines) for whoever
 * doesn't follow the talk; admins' announcements next; the conversation underneath. A past
 * term stays readable and takes no new posts.
 */
function Room({
  orgId,
  rooms,
  notify,
}: {
  orgId: string;
  rooms: RoomTab[];
  notify: (s: string) => void;
}) {
  const [termId, setTermId] = useState(rooms.find((r) => !r.locked)?.id ?? rooms[0]!.id);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [text, setText] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [stateKind, setStateKind] = useState<"schedule" | "decision" | "deadline">("schedule");
  const [stateText, setStateText] = useState("");
  const [stateWhen, setStateWhen] = useState("");
  const base = `/orgs/${encodeURIComponent(orgId)}/rooms/${encodeURIComponent(termId)}`;
  const load = useCallback(async () => {
    try {
      setRoom(await api<RoomView>(base));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [base, notify]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await load();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <section className="org-room" aria-label="Room">
      <div className="org-room-head">
        <h2>Room</h2>
        {rooms.length > 1 && (
          <div className="org-room-tabs" role="tablist" aria-label="Terms">
            {rooms.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === termId}
                className={r.id === termId ? "selected" : ""}
                onClick={() => setTermId(r.id)}
              >
                {r.label}
                {r.locked && <Lock size={11} aria-label="locked" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {room && (
        <>
          {room.term.locked && (
            <p className="org-hint">
              This term is locked. Everything stays readable; nothing new can be added.
            </p>
          )}
          <div className="org-room-state" aria-label="Now">
            {room.state.length === 0 && (
              <p className="org-hint">Nothing scheduled or decided yet.</p>
            )}
            {room.state.map((item) => {
              const Icon = stateIcon[item.kind];
              return (
                <div key={item.id} className={`org-state ${item.kind}`}>
                  <Icon size={14} aria-hidden="true" />
                  <span className="org-state-kind">{stateName[item.kind]}</span>
                  <span className="org-state-text">{item.text}</span>
                  {item.when && <span className="org-state-when">{shortDate(item.when)}</span>}
                  {room.admin && room.canPost && (
                    <button
                      className="org-state-remove"
                      aria-label={`Remove ${item.text}`}
                      onClick={() =>
                        void run(() => api(`${base}/state/${item.id}`, undefined, "DELETE"))
                      }
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            {room.admin && room.canPost && (
              <form
                className="org-form org-state-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api(`${base}/state`, {
                      kind: stateKind,
                      text: stateText,
                      ...(stateWhen ? { when: stateWhen } : {}),
                    });
                    setStateText("");
                    setStateWhen("");
                  });
                }}
              >
                <label>
                  Add to the top
                  <select
                    value={stateKind}
                    onChange={(e) => setStateKind(e.target.value as typeof stateKind)}
                  >
                    <option value="schedule">Schedule</option>
                    <option value="decision">Decision</option>
                    <option value="deadline">Deadline</option>
                  </select>
                </label>
                <label>
                  What
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={stateText}
                    onChange={(e) => setStateText(e.target.value)}
                  />
                </label>
                <label>
                  When
                  <input
                    type="date"
                    value={stateWhen}
                    onChange={(e) => setStateWhen(e.target.value)}
                  />
                </label>
                <button className="primary small">Add</button>
              </form>
            )}
          </div>
          {room.announcements.length > 0 && (
            <section className="org-announcements" aria-label="Announcements">
              {room.announcements.map((a) => (
                <article key={a.id} className="org-announcement">
                  <Megaphone size={14} aria-hidden="true" />
                  <div>
                    <p>{a.text}</p>
                    <small>
                      {a.author.name} · {time(a.createdAt)}
                    </small>
                  </div>
                </article>
              ))}
            </section>
          )}
          <ol className="org-messages" aria-label="Conversation">
            {room.messages.map((m) => (
              <li key={m.id}>
                <strong>{m.author.name}</strong> <small>{time(m.createdAt)}</small>
                <p>{m.text}</p>
              </li>
            ))}
            {room.messages.length === 0 && (
              <li className="org-hint">No one has said anything yet.</li>
            )}
          </ol>
          {room.canPost && (
            <form
              className="org-form org-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api(`${base}/posts`, { kind: announce ? "announcement" : "message", text });
                  setText("");
                  setAnnounce(false);
                });
              }}
            >
              <label>
                {announce ? "Announcement" : "Message"}
                <input
                  required
                  maxLength={1000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              {room.admin && (
                <label className="org-check">
                  <input
                    type="checkbox"
                    checked={announce}
                    onChange={(e) => setAnnounce(e.target.checked)}
                  />
                  Announce
                </label>
              )}
              <button className="primary small">Send</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
