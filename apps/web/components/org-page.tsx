"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  Library,
  Lock,
  Megaphone,
  Pencil,
  Send,
  ShieldCheck,
  Stamp,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "./runtime";
import { signedInOrSignIn } from "./return-path";
import { OprecAdmin, OprecPublic, type OprecView } from "./oprec-panel";
import { Avatar, Dialog } from "./ui";
import {
  CalendarLink,
  DoorOverlay,
  TicketSetup,
  TicketsSection,
  YearbookCard,
  dayTime,
  plain,
  type TicketView,
} from "./org-tools";
import { findWhen } from "../../../packages/contracts/src/when";
import type { Yearbook } from "../../../packages/contracts/src/org-rooms";
import type { User } from "../../../packages/contracts/src/experience";
import type {
  OrgLook,
  OrgLookName,
  OrgPost,
  OrgVisibility,
} from "../../../packages/contracts/src/identity";

type TermView = { id: string; label: string; from: number; to?: number; locked: boolean };
type Person = Pick<User, "id" | "name" | "handle" | "initials" | "color" | "avatarAssetId">;
interface OrgView {
  id: string;
  name: string;
  kind: "campus" | "workplace" | "club" | "event";
  members: number;
  since: number | null;
  company: { termId: string; people: (Person & { role: string })[] }[];
  terms: TermView[];
  current: string | null;
  collections: { id: string; name: string; stamps: number }[];
  visibility: OrgVisibility;
  posts: { id: string; text: string; at: string }[];
  /** Each title's line: who held it, numbered from the first. */
  lines: { role: string; holders: (Person & { n: number; from?: number })[] }[];
  look: OrgLook;
}
type Manage = OrgView & { admins: { id: string; name: string; handle: string }[] };
const visibilityNote: Record<OrgVisibility, string> = {
  public: "Anyone can find the page now.",
  link: "Only people with the link will find the page.",
  private: "The page is hidden. Only your own people see it, and join links still work.",
};
const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${tail}`;
};
const kinds = { campus: "Campus", workplace: "Workplace", club: "Club", event: "Event" };
const joinErrors: Record<string, string> = {
  INVITE_ALREADY_USED: "You already joined.",
  INVITE_EXHAUSTED: "This link is full. Ask the admin for a new one.",
  INVITE_INVALID: "This link doesn’t work anymore. Ask the admin for a new one.",
};

/** Each starting look brings its own words; the organisation can rename the two that matter most. */
const looks: Record<
  OrgLookName,
  {
    name: string;
    fits: string;
    inside: string;
    company: string;
    next: string;
    open: string;
    sheet: string;
  }
> = {
  playbill: {
    name: "Playbill",
    fits: "Theatre, choir, film",
    inside: "Backstage",
    company: "The company",
    next: "NEXT UP",
    open: "Open the call sheet",
    sheet: "Call sheet",
  },
  matchday: {
    name: "Matchday",
    fits: "Clubs, teams, supporters",
    inside: "Dressing room",
    company: "The squad",
    next: "NEXT FIXTURE",
    open: "Open the team sheet",
    sheet: "Team sheet",
  },
  noticeboard: {
    name: "Noticeboard",
    fits: "Societies, committees, BEM",
    inside: "Secretariat",
    company: "The committee",
    next: "COMING UP",
    open: "Open the agenda",
    sheet: "Agenda",
  },
};
type Words = (typeof looks)[OrgLookName];
const wordsOf = (look: OrgLook): Words => ({
  ...looks[look.look],
  ...(look.inside ? { inside: look.inside } : {}),
  ...(look.company ? { company: look.company } : {}),
});

type Tool = "sheet" | "posts" | "crew" | "archive" | "reports";
type RoomTab = { id: string; label: string; locked: boolean };
type RoomPostView = {
  id: string;
  kind: "announcement" | "message";
  text: string;
  createdAt: string;
  author: { id: string; name: string; handle: string };
};
type StateItem = {
  id: string;
  kind: "schedule" | "decision" | "deadline";
  text: string;
  when?: string;
};
interface RoomView {
  term: RoomTab;
  you: Person & { role: string | null };
  people: number;
  admin: boolean;
  canPost: boolean;
  state: StateItem[];
  announcements: RoomPostView[];
  talk: boolean;
  messages: RoomPostView[];
  /** Only for the people of a finished term: their circle, or a name to start one. */
  circle:
    | { name: null }
    | { name: string; groupId: string; people: number; joined: boolean; startedBy: string }
    | null;
  slow: number;
  muted: boolean;
  /** Admins only: reported messages, and who can't talk for now. */
  reports?: { post: RoomPostView; count: number; reasons: string[] }[];
  mutedPeople?: { id: string; name: string; handle: string }[];
  yearbook: Yearbook | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (d: string) =>
  Math.round((Date.parse(`${d}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / 86_400_000);
const sheetDate = (d: string) => {
  const n = daysUntil(d);
  if (n === 0) return "TODAY";
  if (n === 1) return "TMRW";
  const date = new Date(`${d}T00:00:00`);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  return n > 0 && n < 7 ? weekday : `${weekday} ${date.getDate()}`;
};
const clock = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
/** The phone's own day for a moment in time, "YYYY-MM-DD". */
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Enough of a user for an avatar. */
const asUser = (p: Person): User => ({ bio: "", ...p });
const firstName = (name: string) => name.split(" ")[0];
/** The next dated thing on the call sheet, today or later. */
const nextUp = (state: StateItem[]) =>
  state
    .filter((s) => s.kind !== "decision" && s.when && daysUntil(s.when) >= 0)
    .sort((a, b) => a.when!.localeCompare(b.when!))[0];

/**
 * An organisation's page, shaped like every Smudge page: the page itself for anyone (a playbill:
 * what's next, the open recruitment, the company each season), and Backstage, one more tab for
 * the people in it. Admins edit from "Edit page".
 */
export function OrgPage({ id }: { id: string }) {
  const [org, setOrg] = useState<OrgView | null | "missing">(null);
  const [manage, setManage] = useState<Manage | null>(null);
  const [note, setNote] = useState("");
  const [join, setJoin] = useState<{ code: string; label: string } | null>(null);
  const [rooms, setRooms] = useState<RoomTab[]>([]);
  const [termId, setTermId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [oprec, setOprec] = useState<OprecView | null>(null);
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [tab, setTab] = useState<"page" | "backstage">("page");
  const [editing, setEditing] = useState(false);
  const load = useCallback(async () => {
    const code = new URLSearchParams(window.location.search).get("join");
    try {
      const page = await api<OrgView & { tickets: TicketView[] }>(
        `/public/orgs/${encodeURIComponent(id)}${code ? `?join=${encodeURIComponent(code)}` : ""}`,
      );
      setOrg(page);
      setTickets(page.tickets ?? []);
    } catch {
      setOrg("missing");
      return;
    }
    // Only the admin gets an answer here; everyone else just sees the public page.
    setManage(await api<Manage>(`/orgs/${encodeURIComponent(id)}/manage`).catch(() => null));
    const mine = await api<RoomTab[]>(`/orgs/${encodeURIComponent(id)}/rooms`).catch(() => []);
    setRooms(mine);
    setTermId((t) =>
      t && mine.some((r) => r.id === t)
        ? t
        : ((mine.find((r) => !r.locked) ?? mine[0])?.id ?? null),
    );
    setOprec(
      (
        await api<{ oprec: OprecView | null }>(
          `/public/orgs/${encodeURIComponent(id)}/oprec`,
        ).catch(() => ({ oprec: null }))
      ).oprec,
    );
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
  const loadRoom = useCallback(async () => {
    if (!termId) return setRoom(null);
    try {
      setRoom(
        await api<RoomView>(`/orgs/${encodeURIComponent(id)}/rooms/${encodeURIComponent(termId)}`),
      );
    } catch (e) {
      setNote((e as Error).message);
    }
  }, [id, termId]);
  useEffect(() => {
    void load();
  }, [load]);
  // Someone scanned the door QR: their own ticket lets them in.
  useEffect(() => {
    const door = new URLSearchParams(window.location.search).get("door");
    const [stamp, code] = door?.split(".") ?? [];
    if (!stamp || !code) return;
    void (async () => {
      if (!(await signedInOrSignIn())) return;
      window.history.replaceState(null, "", `/o/${encodeURIComponent(id)}`);
      try {
        const t = await api<TicketView>(
          `/orgs/${encodeURIComponent(id)}/events/${encodeURIComponent(stamp)}/arrive`,
          { code },
        );
        setNote(`You’re in. Enjoy ${t.name}.`);
        await load();
      } catch (e) {
        setNote(plain(e));
      }
    })();
  }, [id, load]);
  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(""), 6000);
    return () => window.clearTimeout(t);
  }, [note]);
  if (org === "missing")
    return (
      <main className="op">
        <h1 className="op-missing">This organisation isn’t on Smudge.</h1>
      </main>
    );
  if (!org) return <main className="op" aria-busy="true" />;
  const backstage = rooms.length > 0 && tab === "backstage";
  const words = wordsOf(org.look);
  return (
    <main
      className="op"
      data-look={org.look.look}
      style={
        org.look.accent ? ({ "--op-gold": org.look.accent } as React.CSSProperties) : undefined
      }
    >
      <nav className="op-top">
        <a className="op-round" href="/" aria-label="Back to Smudge">
          <ArrowLeft size={16} />
        </a>
        {manage && (
          <button className="op-edit" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit page
          </button>
        )}
      </nav>
      {backstage && room ? (
        <Backstage
          org={org}
          words={words}
          rooms={rooms}
          room={room}
          tickets={tickets}
          onTerm={setTermId}
          reload={loadRoom}
          refresh={load}
          notify={setNote}
        />
      ) : (
        <PlayPage
          org={org}
          words={words}
          next={room && !room.term.locked ? nextUp(room.state) : undefined}
          onNext={() => setTab("backstage")}
          oprecSlot={
            <>
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
              <TicketsSection orgId={org.id} tickets={tickets} onChange={load} notify={setNote} />
              {oprec && (
                <OprecPublic
                  org={org}
                  oprec={oprec}
                  admin={!!manage}
                  onDone={load}
                  notify={setNote}
                />
              )}
            </>
          }
        />
      )}
      {rooms.length > 0 && (
        <div className="op-dock" role="tablist" aria-label={org.name}>
          <button role="tab" aria-selected={!backstage} onClick={() => setTab("page")}>
            Page
          </button>
          <button role="tab" aria-selected={backstage} onClick={() => setTab("backstage")}>
            {words.inside}
          </button>
        </div>
      )}
      {editing && manage && (
        <Dialog title={`Edit ${org.name}`} onClose={() => setEditing(false)} wide>
          <div className="op-editor">
            <LookEditor org={manage} onDone={load} notify={setNote} />
            <Admin org={manage} onDone={load} notify={setNote} />
            <OprecAdmin orgId={org.id} oprec={oprec} onDone={load} notify={setNote} />
          </div>
        </Dialog>
      )}
      {note && (
        <p className="op-note" role="status">
          {note}
        </p>
      )}
    </main>
  );
}

/** The page anyone sees: a playbill of the organisation. */
function PlayPage({
  org,
  words,
  next,
  onNext,
  oprecSlot,
}: {
  org: OrgView;
  words: Words;
  next?: StateItem | undefined;
  onNext: () => void;
  oprecSlot: React.ReactNode;
}) {
  const [season, setSeason] = useState(
    org.terms.find((t) => !t.locked)?.id ?? org.terms[0]?.id ?? null,
  );
  const company = org.company.find((c) => c.termId === season)?.people ?? [];
  const big = org.name.length > 22 ? "long" : org.name.length > 12 ? "mid" : "";
  return (
    <>
      <header className="op-hero">
        <div className="op-curtain" aria-hidden="true" />
        <div className="op-hero-text">
          <span className="op-kick">
            SMUDGE / {org.name.toUpperCase()}
            {org.since ? ` · EST. ${org.since}` : ""}
          </span>
          <h1 className={big}>{org.name}</h1>
          <em>
            {kinds[org.kind]}
            {org.current ? `, season ${org.current}` : ""}
          </em>
          <p className="op-tags">
            <span>
              {org.terms.length} {org.terms.length === 1 ? "season" : "seasons"}
            </span>
            <span>
              {org.members} {org.members === 1 ? "person" : "people"}
            </span>
          </p>
        </div>
      </header>
      <div className="op-body">
        {next && (
          <button className="op-ticket" onClick={onNext}>
            <span className="op-ticket-l">
              <small>
                {words.next} · {org.current ?? ""}
              </small>
              <b>{next.text}</b>
              <span>{words.open}</span>
            </span>
            <span className="op-ticket-r">
              <b>{daysUntil(next.when!)}</b>
              <small>{daysUntil(next.when!) === 1 ? "DAY" : "DAYS"}</small>
            </span>
          </button>
        )}
        {oprecSlot}
        {org.terms.length > 0 && (
          <section className="op-bill" aria-label="Terms">
            <h2>{words.company}</h2>
            <ul className="org-terms" role="tablist" aria-label="Seasons">
              {org.terms.map((t) => (
                <li key={t.id} className={t.locked ? "locked" : "open"}>
                  <button
                    role="tab"
                    aria-selected={t.id === season}
                    onClick={() => setSeason(t.id)}
                  >
                    {t.label}
                    {t.locked ? (
                      <Lock size={10} aria-label="locked" />
                    ) : (
                      <span className="org-now">now</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {company.length === 0 ? (
              <p className="op-quiet">No one has put this season on their page yet.</p>
            ) : (
              <ul className="op-cast">
                {company.map((p) => (
                  <li key={p.id}>
                    <a href={`/u/${encodeURIComponent(p.handle)}`}>
                      <Avatar user={asUser(p)} small />
                      <span>{p.name}</span>
                    </a>
                    <em>{p.role}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {org.posts.length > 0 && (
          <section className="op-bill" aria-label="Updates">
            <h2>Updates</h2>
            <ul className="op-updates">
              {org.posts.map((p) => (
                <li key={p.id}>
                  <small>{clock(p.at).toUpperCase()}</small>
                  <p>{p.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {org.lines.length > 0 && (
          <section className="op-bill" aria-label="Lines">
            <h2>The line</h2>
            <Lines lines={org.lines} />
          </section>
        )}
        {org.collections.length > 0 && (
          <section className="op-bill" aria-label="Stamp collections">
            <h2>Stamps</h2>
            <ul className="op-cast">
              {org.collections.map((c) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <em>
                    {c.stamps} {c.stamps === 1 ? "stamp" : "stamps"}
                  </em>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * Backstage: the term's room for the people in it, as a call sheet. What's true now on top, the
 * last word from the committee pinned, and the talk folded into one line that opens full screen.
 */
function Backstage({
  org,
  words,
  rooms,
  room,
  tickets,
  onTerm,
  reload,
  refresh,
  notify,
}: {
  org: OrgView;
  words: Words;
  rooms: RoomTab[];
  room: RoomView;
  tickets: TicketView[];
  onTerm: (id: string) => void;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [talk, setTalk] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [adding, setAdding] = useState(false);
  const [stateKind, setStateKind] = useState<StateItem["kind"]>("schedule");
  const [stateText, setStateText] = useState("");
  const [stateWhen, setStateWhen] = useState("");
  const sheet = useRef<HTMLElement>(null);
  const base = `/orgs/${encodeURIComponent(org.id)}/rooms/${encodeURIComponent(room.term.id)}`;
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await reload();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const calls = room.state.filter((s) => s.kind !== "decision");
  const decided = room.state.filter((s) => s.kind === "decision");
  const next = nextUp(room.state);
  const [pinned, ...earlier] = room.announcements;
  const last = room.messages[room.messages.length - 1];
  const edit = room.admin && room.canPost;
  const reports = room.reports?.length ?? 0;
  const tools: [Tool, string, LucideIcon][] = [
    ["sheet", words.sheet, CalendarDays],
    ["posts", "Posts", Megaphone],
    ...(room.admin ? [["crew", "Events", Stamp] as [Tool, string, LucideIcon]] : []),
    ["archive", "Archive", Library],
    ...(room.admin && room.canPost
      ? [
          ["reports", reports ? `Reports ${reports}` : "Room", ShieldCheck] as [
            Tool,
            string,
            LucideIcon,
          ],
        ]
      : []),
  ];
  // The star is whatever comes first: a ticketed event or the next thing on the sheet.
  const upcoming = room.term.locked ? [] : tickets.filter((t) => !t.over);
  const event =
    upcoming[0] && (!next || localDay(upcoming[0].when) <= next.when!) ? upcoming[0] : undefined;
  const openTool = (key: Tool) => setTool((t) => (t === key ? null : key));
  return (
    <section className="op-back" aria-label="Room">
      <header className="op-back-head">
        <span className="op-kick">
          {org.name.toUpperCase()} · {words.inside.toUpperCase()}
        </span>
        <h1>{words.inside}</h1>
        <div className="op-you">
          <Avatar user={asUser(room.you)} />
          <div>
            <b>{room.you.name}</b>
            <small>{room.you.role ?? "In the company"}</small>
          </div>
          <label className="op-term">
            <span className="sr-only">Term</span>
            <select value={room.term.id} onChange={(e) => onTerm(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                  {r.locked ? " · locked" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {room.term.locked && (
          <p className="op-quiet">
            This term is locked. Everything stays readable; nothing new can be added.
          </p>
        )}
      </header>
      {event ? (
        <div className="op-star-wrap">
          <button className="op-star" onClick={() => setTool(room.admin ? "crew" : "sheet")}>
            <small>EVENT · {dayTime(event.when).toUpperCase()}</small>
            <b>{event.name}</b>
            <span>
              {event.mine?.status === "going"
                ? "You’re going"
                : event.left > 0
                  ? `${event.left} free tickets left`
                  : "Full"}
              {` · ${event.place}`}
            </span>
          </button>
          <CalendarLink title={event.name} start={event.when} place={event.place} />
        </div>
      ) : room.term.locked ? null : next ? (
        <div className="op-star-wrap">
          <button className="op-star" onClick={() => setTool("sheet")}>
            <small>
              {words.next} · {sheetDate(next.when!)}
            </small>
            <b>{next.text}</b>
            <span>
              {daysUntil(next.when!) === 0
                ? "Today"
                : `In ${daysUntil(next.when!)} ${daysUntil(next.when!) === 1 ? "day" : "days"}`}
            </span>
          </button>
          <CalendarLink title={next.text} start={next.when!} allDay />
        </div>
      ) : pinned ? (
        <button className="op-star" onClick={() => setTool("sheet")}>
          <small>PINNED · {firstName(pinned.author.name)?.toUpperCase()}</small>
          <b>{pinned.text}</b>
        </button>
      ) : (
        <p className="op-star empty">
          Nothing coming up yet.
          {edit ? ` Put the next thing on the ${words.sheet.toLowerCase()}.` : ""}
        </p>
      )}
      <nav className="op-tools" aria-label="Tools">
        {tools.map(([key, label, Icon]) => (
          <button key={key} aria-pressed={tool === key} onClick={() => openTool(key)}>
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      {room.talk ? (
        <button className="op-talk-line" onClick={() => setTalk(true)}>
          <span className="op-talk-who">{last ? last.author.name[0] : "…"}</span>
          <span className="op-talk-text">
            <b>Talk</b>
            <span>
              {last
                ? `${firstName(last.author.name)}: ${last.text}`
                : "No one has said anything yet."}
            </span>
          </span>
          {room.messages.length > 0 && <u>{room.messages.length}</u>}
        </button>
      ) : (
        <p className="op-talk-shut">
          <Lock size={13} aria-hidden="true" /> The talk stays with the people of {room.term.label}.
        </p>
      )}
      {tool === "sheet" && (
        <>
          {pinned && (
            <section className="op-pin org-announcements" aria-label="Announcements">
              <article className="org-announcement">
                <small>PINNED · {firstName(pinned.author.name)?.toUpperCase()}</small>
                <p>{pinned.text}</p>
              </article>
              {earlier.length > 0 && (
                <details>
                  <summary>
                    {earlier.length} earlier {earlier.length === 1 ? "note" : "notes"}
                  </summary>
                  {earlier.map((a) => (
                    <article key={a.id} className="org-announcement">
                      <p>{a.text}</p>
                      <small>
                        {a.author.name} · {clock(a.createdAt)}
                      </small>
                    </article>
                  ))}
                </details>
              )}
            </section>
          )}
          <section className="op-sheet" aria-label={words.sheet} ref={sheet}>
            <div className="op-sheet-head">
              <b>{words.sheet}</b>
              <small>{room.term.label}</small>
            </div>
            {calls.length === 0 && decided.length === 0 && upcoming.length === 0 && (
              <p className="op-sheet-empty">Nothing scheduled or decided yet.</p>
            )}
            {calls.map((item) => (
              <div key={item.id} className={`op-row org-state ${item.kind}`}>
                <time>{item.when ? sheetDate(item.when) : "SOON"}</time>
                <div>
                  <b>{item.text}</b>
                  {item.kind === "deadline" && <small>Due</small>}
                </div>
                {edit && (
                  <button
                    className="op-remove"
                    aria-label={`Remove ${item.text}`}
                    onClick={() =>
                      void run(() => api(`${base}/state/${item.id}`, undefined, "DELETE"))
                    }
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {upcoming.map((t) => (
              <div key={t.id} className="op-row org-state event">
                <time>{sheetDate(localDay(t.when))}</time>
                <div>
                  <b>{t.name}</b>
                  <small>
                    Event · {t.place} ·{" "}
                    {new Date(t.when).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </div>
            ))}
            {edit &&
              (adding ? (
                <form
                  className="op-add"
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
                      setAdding(false);
                    });
                  }}
                >
                  <label>
                    Kind
                    <select
                      value={stateKind}
                      onChange={(e) => setStateKind(e.target.value as StateItem["kind"])}
                    >
                      <option value="schedule">Schedule</option>
                      <option value="deadline">Deadline</option>
                      <option value="decision">Decision</option>
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
                  <button className="op-ink">Add</button>
                </form>
              ) : (
                <button className="op-add-open" onClick={() => setAdding(true)}>
                  + Add to the {words.sheet.toLowerCase()}
                </button>
              ))}
          </section>
          {decided.length > 0 && (
            <div className="op-duo">
              {decided.map((d) => (
                <div key={d.id} className="op-card org-state decision">
                  <small>DECIDED</small>
                  <b>{d.text}</b>
                  {edit && (
                    <button
                      className="op-remove"
                      aria-label={`Remove ${d.text}`}
                      onClick={() =>
                        void run(() => api(`${base}/state/${d.id}`, undefined, "DELETE"))
                      }
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {tool === "posts" && <OrgPosts org={org} notify={notify} />}
      {tool === "crew" && room.admin && <CrewStamps org={org} notify={notify} refresh={refresh} />}
      {tool === "reports" && room.admin && (
        <RoomCare room={room} base={base} reload={reload} notify={notify} />
      )}
      {room.yearbook && <YearbookCard book={room.yearbook} />}
      {tool === "archive" && <Archive org={org} words={words} />}
      {room.circle && (
        <AfterTerm
          org={org}
          term={room.term}
          circle={room.circle}
          base={base}
          reload={reload}
          notify={notify}
        />
      )}
      {talk && (
        <Talk
          words={words}
          room={room}
          base={base}
          next={next}
          reload={reload}
          notify={notify}
          onClose={(toSheet) => {
            setTalk(false);
            if (toSheet) setTool("sheet");
            if (toSheet)
              window.setTimeout(
                () => sheet.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                50,
              );
          }}
        />
      )}
    </section>
  );
}

/**
 * A term is over. The organisation moves on to its next committee, but the people who were there
 * may keep talking as a circle of their own, outside the organisation. Nobody is put in it.
 */
function AfterTerm({
  org,
  term,
  circle,
  base,
  reload,
  notify,
}: {
  org: OrgView;
  term: RoomTab;
  circle: NonNullable<RoomView["circle"]>;
  base: string;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(`${org.name} ${term.label}`.slice(0, 60));
  const [busy, setBusy] = useState(false);
  const go = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      const { groupId } = await api<{ groupId: string }>(path, body);
      await reload();
      return groupId;
    } catch (e) {
      notify((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const open = (groupId: string) => `/?group=${encodeURIComponent(groupId)}`;
  return (
    <section className="op-after" aria-label="After this term">
      <small>{term.label} IS OVER</small>
      {circle.name === null ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await go(`${base}/circle`, { name });
            if (id) notify("Your circle is open. The others can join from here.");
          }}
        >
          <b>Keep talking as a circle?</b>
          <p>
            {org.name} moves on to its next committee. You and the others from {term.label} can
            carry on in a group of your own. The organisation and its next admins won’t see it.
          </p>
          <label>
            <span className="sr-only">Circle name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </label>
          <button className="op-ink" disabled={busy}>
            Start the circle
          </button>
        </form>
      ) : (
        <>
          <b>{circle.name}</b>
          <p>
            {circle.joined
              ? `Your circle from ${term.label}. ${circle.people} ${circle.people === 1 ? "person" : "people"} in it.`
              : `${firstName(circle.startedBy)} kept ${term.label} going as a circle. ${circle.people} ${circle.people === 1 ? "person has" : "people have"} joined.`}
          </p>
          {circle.joined ? (
            <a className="op-ink" href={open(circle.groupId)}>
              Open in Messages
            </a>
          ) : (
            <button
              className="op-ink"
              disabled={busy}
              onClick={async () => {
                const id = await go(`${base}/circle/join`, {});
                if (id) window.location.href = open(id);
              }}
            >
              Join the circle
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The talk, full screen. Leaving is always one move away: the back button, the phone's own back,
 * Escape, a swipe in from the left edge, or the call-sheet strip on top.
 */
function Talk({
  words,
  room,
  base,
  next,
  reload,
  notify,
  onClose,
}: {
  words: Words;
  room: RoomView;
  base: string;
  next?: StateItem | undefined;
  reload: () => Promise<void>;
  notify: (s: string) => void;
  onClose: (toSheet?: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      setActing(null);
      notify(done);
      await reload();
    } catch (e) {
      notify(plain(e));
    }
  };
  const end = useRef<HTMLLIElement>(null);
  const swipe = useRef<number | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // The phone's back button closes the talk instead of leaving the page.
    window.history.pushState({ talk: true }, "");
    const onPop = () => close.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [room.messages.length]);
  const leave = (toSheet?: boolean) => {
    close.current = () => onClose(toSheet);
    window.history.back();
  };
  return (
    <div
      className="op-talk"
      role="dialog"
      aria-label="Talk"
      onTouchStart={(e) => {
        const x = e.touches[0]!.clientX;
        swipe.current = x < 28 ? x : null;
      }}
      onTouchEnd={(e) => {
        if (swipe.current !== null && e.changedTouches[0]!.clientX - swipe.current > 70) leave();
        swipe.current = null;
      }}
    >
      <header className="op-talk-head">
        <button className="op-back-btn" onClick={() => leave()}>
          <ChevronLeft size={15} /> {words.inside}
        </button>
        <small>
          {room.term.label} · {room.people} {room.people === 1 ? "PERSON" : "PEOPLE"}
        </small>
      </header>
      <h2>Talk</h2>
      {next && (
        <button className="op-strip" onClick={() => leave(true)}>
          <b>{sheetDate(next.when!)}</b>
          <span>{next.text}</span>
          <i>{words.sheet} ↑</i>
        </button>
      )}
      <ol className="op-msgs org-messages" aria-label="Conversation">
        {room.messages.map((m) => {
          const mine = m.author.id === room.you.id;
          const day = room.admin && room.canPost ? findWhen(m.text, new Date()) : null;
          const onSheet = room.state.some((i) => i.text === m.text.slice(0, 200));
          return (
            <li key={m.id} className={mine ? "me" : ""}>
              {!mine && (
                <strong>
                  {m.author.name} <small>{clock(m.createdAt)}</small>
                </strong>
              )}
              <p
                role="button"
                tabIndex={0}
                aria-expanded={acting === m.id}
                onClick={() => setActing((a) => (a === m.id ? null : m.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setActing((a) => (a === m.id ? null : m.id));
                }}
              >
                {m.text}
              </p>
              {day && !onSheet && (
                <button
                  className="op-chip"
                  onClick={() =>
                    void act(
                      () =>
                        api(`${base}/state`, {
                          kind: "schedule",
                          text: m.text.slice(0, 200),
                          when: day,
                        }),
                      `On the ${words.sheet.toLowerCase()} for ${sheetDate(day).toLowerCase()}.`,
                    )
                  }
                >
                  + Add to the {words.sheet.toLowerCase()}, {sheetDate(day).toLowerCase()}?
                </button>
              )}
              {acting === m.id && room.canPost && (
                <div className="op-msg-actions" role="group" aria-label="Message actions">
                  {mine || room.admin ? (
                    <button
                      onClick={() =>
                        void act(
                          () => api(`${base}/posts/${m.id}`, undefined, "DELETE"),
                          mine ? "Message deleted." : "Message taken down.",
                        )
                      }
                    >
                      {mine ? "Delete" : "Take down"}
                    </button>
                  ) : null}
                  {!mine && !room.admin && (
                    <>
                      <button
                        onClick={() =>
                          void act(
                            () => api(`${base}/posts/${m.id}/report`, { reason: "spam" }),
                            "Reported. The admins will take a look.",
                          )
                        }
                      >
                        Report spam
                      </button>
                      <button
                        onClick={() =>
                          void act(
                            () => api(`${base}/posts/${m.id}/report`, { reason: "harassment" }),
                            "Reported. The admins will take a look.",
                          )
                        }
                      >
                        Report harassment
                      </button>
                      <button
                        onClick={() =>
                          void act(
                            () => api(`/users/${encodeURIComponent(m.author.id)}/block`, {}),
                            `You won’t see ${firstName(m.author.name)} anymore. Undo it in Settings.`,
                          )
                        }
                      >
                        Block {firstName(m.author.name)}
                      </button>
                    </>
                  )}
                  {!mine && room.admin && (
                    <button
                      onClick={() =>
                        void act(
                          () => api(`${base}/mute`, { userId: m.author.id, muted: true }),
                          `${firstName(m.author.name)} can read but not talk for now.`,
                        )
                      }
                    >
                      Pause {firstName(m.author.name)}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {room.messages.length === 0 && <li className="op-quiet">No one has said anything yet.</li>}
        <li ref={end} aria-hidden="true" />
      </ol>
      {room.canPost && room.muted && !room.admin && (
        <p className="op-talk-shut">An admin paused your messages here. You can still read.</p>
      )}
      {room.canPost && !(room.muted && !room.admin) && (
        <form
          className="op-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              try {
                await api(`${base}/posts`, { kind: announce ? "announcement" : "message", text });
                setText("");
                setAnnounce(false);
                await reload();
              } catch (err) {
                notify(plain(err));
              }
            })();
          }}
        >
          {room.admin && (
            <label className="op-pin-toggle">
              <input
                type="checkbox"
                checked={announce}
                onChange={(e) => setAnnounce(e.target.checked)}
              />
              Pin as announcement
            </label>
          )}
          <div>
            <label className="sr-only" htmlFor="op-say">
              {announce ? "Announcement" : "Message"}
            </label>
            <input
              id="op-say"
              required
              maxLength={1000}
              value={text}
              placeholder={
                announce
                  ? "Pin a note for everyone"
                  : room.slow && !room.admin
                    ? `Slow mode: one message every ${room.slow < 60 ? `${room.slow}s` : `${room.slow / 60} min`}`
                    : "Say something to the company"
              }
              onChange={(e) => setText(e.target.value)}
            />
            <button className="op-send" aria-label="Send">
              <Send size={16} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Posts written together: anyone in the term drafts, an admin sends it out as the organisation. */
function OrgPosts({ org, notify }: { org: OrgView; notify: (s: string) => void }) {
  type PostView = OrgPost & { author: { id: string; name: string; handle: string } };
  const [view, setView] = useState<{
    admin: boolean;
    pending: PostView[];
    published: PostView[];
  } | null>(null);
  const [text, setText] = useState("");
  const base = `/orgs/${encodeURIComponent(org.id)}/posts`;
  const load = useCallback(async () => {
    try {
      setView(await api(base));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [base, notify]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      notify(done);
      await load();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (!view) return null;
  return (
    <section className="op-panel" aria-label="Posts">
      <div className="op-panel-head">
        <b>Posts as {org.name}</b>
        <small>{view.admin ? "You can send these out" : "An admin sends it out"}</small>
      </div>
      <form
        className="op-panel-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () => {
              await api(base, { text });
              setText("");
            },
            view.admin ? "Posted on the page." : "Sent to the admins for a look.",
          );
        }}
      >
        <label className="sr-only" htmlFor="op-draft">
          Draft
        </label>
        <textarea
          id="op-draft"
          required
          minLength={2}
          maxLength={1000}
          rows={3}
          value={text}
          placeholder={`Write something for ${org.name}'s page`}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="op-ink">{view.admin ? "Post" : "Send for approval"}</button>
      </form>
      {view.pending.length > 0 && (
        <ul className="op-list" aria-label="Waiting">
          {view.pending.map((p) => (
            <li key={p.id}>
              <small>WAITING · {firstName(p.author.name).toUpperCase()}</small>
              <p>{p.text}</p>
              {view.admin && (
                <div className="op-list-actions">
                  <button
                    className="op-ink"
                    onClick={() =>
                      void run(
                        () => api(`${base}/${p.id}/review`, { approve: true }),
                        "Posted on the page.",
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="op-plain"
                    onClick={() =>
                      void run(
                        () => api(`${base}/${p.id}/review`, { approve: false }),
                        "Declined. It stays off the page.",
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.published.length > 0 && (
        <ul className="op-list" aria-label="Posted">
          {view.published.map((p) => (
            <li key={p.id}>
              <small>
                POSTED · {clock(p.reviewedAt ?? p.createdAt).toUpperCase()} · BY{" "}
                {firstName(p.author.name).toUpperCase()}
              </small>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Keeping the talk decent: what people reported, slow mode, and who is paused. */
function RoomCare({
  room,
  base,
  reload,
  notify,
}: {
  room: RoomView;
  base: string;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      notify(done);
      await reload();
    } catch (e) {
      notify(plain(e));
    }
  };
  const reports = room.reports ?? [];
  const paused = room.mutedPeople ?? [];
  return (
    <section className="op-panel" aria-label="Room care">
      <div className="op-panel-head">
        <b>The room</b>
        <small>Only admins see this</small>
      </div>
      <label className="op-visibility">
        Slow mode
        <select
          value={room.slow}
          onChange={(e) =>
            void act(
              () => api(`${base}/slow`, { seconds: Number(e.target.value) }, "PUT"),
              Number(e.target.value) ? "Slow mode is on." : "Slow mode is off.",
            )
          }
        >
          <option value={0}>Off</option>
          <option value={30}>One message every 30 seconds</option>
          <option value={60}>One message a minute</option>
          <option value={300}>One message every 5 minutes</option>
        </select>
      </label>
      {reports.length === 0 ? (
        <p className="op-quiet op-dark">
          No reports. Tap a message in Talk to report or take it down.
        </p>
      ) : (
        <ul className="op-list" aria-label="Reports">
          {reports.map((r) => (
            <li key={r.post.id}>
              <small>
                {r.count} {r.count === 1 ? "REPORT" : "REPORTS"} ·{" "}
                {r.reasons.join(", ").toUpperCase()} · {r.post.author.name.toUpperCase()}
              </small>
              <p>{r.post.text}</p>
              <div className="op-list-actions">
                <button
                  className="op-ink"
                  onClick={() =>
                    void act(
                      () => api(`${base}/posts/${r.post.id}`, undefined, "DELETE"),
                      "Message taken down.",
                    )
                  }
                >
                  Take down
                </button>
                <button
                  className="op-plain"
                  onClick={() =>
                    void act(() => api(`${base}/posts/${r.post.id}/dismiss`, {}), "It stays up.")
                  }
                >
                  Keep it
                </button>
                <button
                  className="op-plain"
                  onClick={() =>
                    void act(
                      () => api(`${base}/mute`, { userId: r.post.author.id, muted: true }),
                      `${firstName(r.post.author.name)} can read but not talk for now.`,
                    )
                  }
                >
                  Pause {firstName(r.post.author.name)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {paused.length > 0 && (
        <ul className="op-list" aria-label="Paused">
          {paused.map((p) => (
            <li key={p.id}>
              <small>PAUSED</small>
              <p>{p.name}</p>
              <button
                className="op-plain"
                onClick={() =>
                  void act(
                    () => api(`${base}/mute`, { userId: p.id, muted: false }),
                    `${firstName(p.name)} can talk again.`,
                  )
                }
              >
                Let them talk
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EventRow = { id: string; name: string; crew: number; tickets: TicketView | null };
/** Events: free tickets for guests, and a crew stamp for the people who made it happen. */
function CrewStamps({
  org,
  notify,
  refresh,
}: {
  org: OrgView;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [name, setName] = useState("");
  const [giving, setGiving] = useState<string | null>(null);
  const [setting, setSetting] = useState<string | null>(null);
  const [door, setDoor] = useState<EventRow | null>(null);
  const [handles, setHandles] = useState("");
  const base = `/orgs/${encodeURIComponent(org.id)}/events`;
  const load = useCallback(async () => {
    try {
      setEvents((await api<{ events: EventRow[] }>(base)).events);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [base, notify]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!events) return null;
  return (
    <section className="op-panel" aria-label="Events">
      <div className="op-panel-head">
        <b>Events</b>
        <small>Free tickets for guests, a crew stamp for the people who ran it</small>
      </div>
      <form
        className="op-panel-form row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(base, { name });
            setName("");
            notify(`“${name}” has its crew stamp.`);
            await load();
          } catch (err) {
            notify((err as Error).message);
          }
        }}
      >
        <label className="sr-only" htmlFor="op-event">
          Event
        </label>
        <input
          id="op-event"
          required
          minLength={2}
          maxLength={60}
          value={name}
          placeholder="Founders' Fest 2026"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="op-ink">Add event</button>
      </form>
      {events.length === 0 ? (
        <p className="op-quiet">No events yet.</p>
      ) : (
        <ul className="op-list">
          {events.map((ev) => (
            <li key={ev.id}>
              <small>
                {ev.crew === 0
                  ? "NO CREW YET"
                  : `${ev.crew} ${ev.crew === 1 ? "PERSON HOLDS" : "PEOPLE HOLD"} IT`}
              </small>
              <p>{ev.name}</p>
              {ev.tickets && (
                <p className="op-ev-tickets">
                  {dayTime(ev.tickets.when)} · {ev.tickets.place} ·{" "}
                  {ev.tickets.capacity - ev.tickets.left}/{ev.tickets.capacity} going
                  {ev.tickets.waiting ? `, ${ev.tickets.waiting} in line` : ""}
                </p>
              )}
              {setting === ev.id && (
                <TicketSetup
                  orgId={org.id}
                  eventId={ev.id}
                  tickets={ev.tickets}
                  notify={notify}
                  onDone={async () => {
                    setSetting(null);
                    await load();
                    await refresh();
                  }}
                />
              )}
              {giving === ev.id ? (
                <form
                  className="op-panel-form row"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const { awarded, skipped } = await api<{
                        awarded: string[];
                        skipped: { handle: string; why: string }[];
                      }>(`${base}/${encodeURIComponent(ev.id)}/award`, {
                        handles: handles.split(/[\s,]+/).filter(Boolean),
                      });
                      notify(
                        [
                          awarded.length
                            ? `Stamped ${awarded.map((h) => `@${h}`).join(", ")}.`
                            : "",
                          skipped.length
                            ? `Skipped ${skipped.map((x) => `@${x.handle} (${skipReason[x.why] ?? x.why})`).join(", ")}.`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" "),
                      );
                      setHandles("");
                      setGiving(null);
                      await load();
                    } catch (err) {
                      notify((err as Error).message);
                    }
                  }}
                >
                  <label className="sr-only" htmlFor={`op-crew-${ev.id}`}>
                    Handles
                  </label>
                  <input
                    id={`op-crew-${ev.id}`}
                    required
                    value={handles}
                    placeholder="@ana @leo"
                    onChange={(e) => setHandles(e.target.value)}
                  />
                  <button className="op-ink">Give</button>
                </form>
              ) : (
                <div className="op-list-actions">
                  <button className="op-plain" onClick={() => setGiving(ev.id)}>
                    Give to the crew
                  </button>
                  <button
                    className="op-plain"
                    aria-expanded={setting === ev.id}
                    onClick={() => setSetting((x) => (x === ev.id ? null : ev.id))}
                  >
                    {ev.tickets ? "Tickets" : "Free tickets"}
                  </button>
                  {ev.tickets && !ev.tickets.over && (
                    <button className="op-plain" onClick={() => setDoor(ev)}>
                      Open the door
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {door && (
        <DoorOverlay
          orgId={org.id}
          eventId={door.id}
          name={door.name}
          onClose={() => {
            setDoor(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
const skipReason: Record<string, string> = {
  unknown: "not on Smudge",
  "not-a-member": "not in the organisation",
  already: "already has it",
};

/** The archive: every term, and the line of each title from the first who held it. */
function Archive({ org, words }: { org: OrgView; words: Words }) {
  return (
    <section className="op-panel" aria-label="Archive">
      <div className="op-panel-head">
        <b>Archive</b>
        <small>
          {org.terms.length} {org.terms.length === 1 ? "term" : "terms"}
          {org.since ? ` since ${org.since}` : ""}
        </small>
      </div>
      <Lines lines={org.lines} />
      <ul className="op-list">
        {org.terms.map((t) => (
          <li key={t.id}>
            <small>{t.locked ? "LOCKED" : "NOW"}</small>
            <p>
              {t.label} · {org.company.find((c) => c.termId === t.id)?.people.length ?? 0} in{" "}
              {words.company.toLowerCase()}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Each title's line, newest holder first: "Head of Comms, 7th: Ana". */
function Lines({ lines }: { lines: OrgView["lines"] }) {
  if (lines.length === 0) return null;
  return (
    <div className="op-lines">
      {lines.map((line) => (
        <div key={line.role} className="op-line">
          <b>{line.role}</b>
          <ol>
            {[...line.holders].reverse().map((h) => (
              <li key={h.id}>
                <a href={`/u/${encodeURIComponent(h.handle)}`}>
                  <i>{ordinal(h.n)}</i> {h.name}
                  {h.from ? <small>{h.from}</small> : null}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** Edit page, first: how the page looks and what it calls things. */
function LookEditor({
  org,
  onDone,
  notify,
}: {
  org: Manage;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [look, setLook] = useState<OrgLookName>(org.look.look);
  const [accent, setAccent] = useState(org.look.accent ?? "");
  const [inside, setInside] = useState(org.look.inside ?? "");
  const [company, setCompany] = useState(org.look.company ?? "");
  const base = looks[look];
  return (
    <form
      className="org-admin op-look-form"
      aria-label="Look"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(
            `/orgs/${encodeURIComponent(org.id)}/look`,
            {
              look,
              ...(accent ? { accent } : {}),
              ...(inside.trim() ? { inside: inside.trim() } : {}),
              ...(company.trim() ? { company: company.trim() } : {}),
            },
            "PUT",
          );
          notify("The page has its new look.");
          await onDone();
        } catch (err) {
          notify((err as Error).message);
        }
      }}
    >
      <h2>Look</h2>
      <div className="op-looks" role="group" aria-label="Starting look">
        {(Object.keys(looks) as OrgLookName[]).map((id) => (
          <button
            key={id}
            type="button"
            className="op-look"
            aria-pressed={look === id}
            onClick={() => setLook(id)}
          >
            <i className={id} aria-hidden="true" />
            {looks[id].name}
            <small>{looks[id].fits}</small>
          </button>
        ))}
      </div>
      <label className="op-look-colour">
        Your colour
        <input
          type="color"
          value={accent || "#e8b44a"}
          onChange={(e) => setAccent(e.target.value)}
        />
        {accent && (
          <button type="button" className="small" onClick={() => setAccent("")}>
            Use the look’s own
          </button>
        )}
      </label>
      <label>
        Members’ tab
        <input
          value={inside}
          placeholder={base.inside}
          onChange={(e) => setInside(e.target.value)}
          maxLength={20}
        />
      </label>
      <label>
        The people of each term
        <input
          value={company}
          placeholder={base.company}
          onChange={(e) => setCompany(e.target.value)}
          maxLength={30}
        />
      </label>
      <button className="primary small">Save look</button>
    </form>
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
      <label className="org-form op-visibility">
        Who finds it
        <select
          value={org.visibility}
          onChange={(e) =>
            void run(
              () =>
                api(
                  `/orgs/${encodeURIComponent(org.id)}/visibility`,
                  { visibility: e.target.value },
                  "PUT",
                ),
              visibilityNote[e.target.value as OrgVisibility],
            )
          }
        >
          <option value="public">Public: anyone can find the page</option>
          <option value="link">Link only: off search, open to anyone with the link</option>
          <option value="private">Private: only its own people know it exists</option>
        </select>
      </label>
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

/** Start an organisation: a club, a society or a fan club. Whoever starts it runs it. */
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
            <option value="club">Club, society or fan club</option>
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
