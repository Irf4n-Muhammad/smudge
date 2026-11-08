"use client";
import { useState } from "react";
import { CalendarDays, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import { api } from "./runtime";
import type { OprecView } from "./oprec-panel";
import { money } from "./org-tools";

interface TicketView {
  id: string;
  name: string;
  when: string;
  place: string;
  capacity: number;
  left: number;
  waiting: number;
  price: number;
  currency: string | null;
  over: boolean;
  opensForYou: string | null;
  mine: { status: "going" | "waiting" | "held" | "released"; place?: number } | null;
}
type Mine = { role: string; status: "applied" | "accepted" | "declined" } | null;
export interface OrgFeedPost {
  id: string;
  org: { id: string; name: string; kind: string; look: { look: string; accent?: string } };
  text: string;
  at: string;
  member: boolean;
  attach:
    | { kind: "tickets"; ticket: TicketView }
    | { kind: "oprec"; oprec: OprecView | null; mine: Mine }
    | null;
}

const errors: Record<string, string> = {
  ALREADY_APPLIED: "You already applied.",
  OPREC_CLOSED: "This recruitment is closed.",
  TICKETS_NOT_OPEN: "Tickets aren’t open for you yet.",
  SOLD_OUT: "Sold out.",
  EVENT_OVER: "This already happened.",
};
const said = (e: unknown) => {
  const message = (e as Error).message;
  return errors[message.split(" ")[0]!] ?? message;
};
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * A post an organisation published, in the feed of the people who follow it or belong to it.
 * Whatever it carries works right here: take a ticket, or apply for a division, without
 * leaving the feed.
 */
export function OrgPostCard({
  post,
  notify,
  onChanged,
}: {
  post: OrgFeedPost;
  notify: (s: string) => void;
  onChanged: () => Promise<void>;
}) {
  const accent = post.org.look.accent ?? "#2d302c";
  const href = `/o/${encodeURIComponent(post.org.id)}`;
  return (
    <article
      className="org-feed-card"
      data-post-id={post.id}
      tabIndex={-1}
      style={{ "--org-accent": accent } as React.CSSProperties}
      aria-label={`Post from ${post.org.name}`}
    >
      <header>
        <a className="org-feed-badge" href={href} aria-hidden="true" tabIndex={-1}>
          {initials(post.org.name)}
        </a>
        <span>
          <a href={href}>
            <strong>{post.org.name}</strong>
          </a>
          <small>
            {post.member ? "Your organisation" : "Organisation you follow"} · {ago(post.at)}
          </small>
        </span>
      </header>
      <p className="org-feed-text">{post.text}</p>
      {post.attach?.kind === "tickets" && (
        <TicketBlock
          orgId={post.org.id}
          ticket={post.attach.ticket}
          href={href}
          notify={notify}
          onChanged={onChanged}
        />
      )}
      {post.attach?.kind === "oprec" && post.attach.oprec && (
        <OprecBlock
          orgId={post.org.id}
          oprec={post.attach.oprec}
          mine={post.attach.mine}
          member={post.member}
          notify={notify}
          onChanged={onChanged}
        />
      )}
    </article>
  );
}

function TicketBlock({
  orgId,
  ticket,
  href,
  notify,
  onChanged,
}: {
  orgId: string;
  ticket: TicketView;
  href: string;
  notify: (s: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const price = ticket.price && ticket.currency ? money(ticket.price, ticket.currency) : "Free";
  const open = !!ticket.opensForYou && ticket.opensForYou <= new Date().toISOString();
  const status = ticket.mine
    ? ticket.mine.status === "going"
      ? "You’re going. Your ticket is on the organisation’s page."
      : ticket.mine.status === "waiting"
        ? `You’re #${ticket.mine.place ?? "?"} in line.`
        : ticket.mine.status === "held"
          ? "Held for you for 10 minutes."
          : null
    : null;
  return (
    <div className="org-feed-attach">
      <span className="org-feed-tag">
        <Ticket size={13} /> Tickets
      </span>
      <strong>{ticket.name}</strong>
      <ul>
        <li>
          <CalendarDays size={13} /> {when(ticket.when)}
        </li>
        <li>
          <MapPin size={13} /> {ticket.place}
        </li>
        <li>
          <Users size={13} />{" "}
          {ticket.left > 0 ? `${ticket.left} of ${ticket.capacity} left` : "Full, line is open"}
        </li>
      </ul>
      {status ? (
        <p className="org-feed-status">
          {status}
          {ticket.mine?.status === "held" && (
            <>
              {" "}
              <a href={href}>Pay on the page</a>
            </>
          )}
        </p>
      ) : ticket.over ? (
        <p className="org-feed-status">This already happened.</p>
      ) : !open ? (
        <p className="org-feed-status">
          {ticket.opensForYou
            ? `Opens for you ${when(ticket.opensForYou)}`
            : "Not open to you yet."}
        </p>
      ) : (
        <button
          className="primary small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await api<TicketView>(
                `/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(ticket.id)}/claim`,
                {},
              );
              notify(
                next.mine?.status === "going"
                  ? `You’re going to ${ticket.name}.`
                  : next.mine?.status === "waiting"
                    ? "It’s full. You’re in line."
                    : "Held for you. Pay on the page within 10 minutes.",
              );
              await onChanged();
            } catch (e) {
              notify(said(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Ticket size={14} /> {ticket.left > 0 ? `Get a ticket · ${price}` : "Join the line"}
        </button>
      )}
    </div>
  );
}

function OprecBlock({
  orgId,
  oprec,
  mine,
  member,
  notify,
  onChanged,
}: {
  orgId: string;
  oprec: OprecView;
  mine: Mine;
  member: boolean;
  notify: (s: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [role, setRole] = useState(oprec.roles[0]!);
  const [answers, setAnswers] = useState<string[]>(oprec.questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const status = mine
    ? mine.status === "accepted"
      ? `You’re in: ${mine.role}.`
      : mine.status === "declined"
        ? `Not this time for ${mine.role}.`
        : `You applied for ${mine.role}. The committee will decide.`
    : null;
  return (
    <div className="org-feed-attach">
      <span className="org-feed-tag">
        <Sparkles size={13} /> Open recruitment{oprec.term ? ` · ${oprec.term}` : ""}
      </span>
      <strong>{oprec.title}</strong>
      <ul className="org-feed-roles">
        {oprec.roles.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <small className="org-feed-hint">
        {oprec.applicants} {oprec.applicants === 1 ? "person" : "people"} applied
      </small>
      {status ? (
        <p className="org-feed-status">{status}</p>
      ) : !oprec.accepting ? (
        <p className="org-feed-status">This recruitment is closed.</p>
      ) : member && !opened ? (
        <button className="quiet-button small" onClick={() => setOpened(true)}>
          Apply for another division
        </button>
      ) : !opened ? (
        <button className="primary small" onClick={() => setOpened(true)}>
          Apply here
        </button>
      ) : (
        <form
          className="org-feed-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                `/orgs/${encodeURIComponent(orgId)}/oprec/${encodeURIComponent(oprec.id)}/apply`,
                { role, answers },
              );
              notify(`Applied for ${role}. Your profile went with it.`);
              await onChanged();
            } catch (err) {
              notify(said(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Division
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {oprec.roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {oprec.questions.map((q, i) => (
            <label key={q}>
              {q}
              <input
                maxLength={1000}
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((all) => all.map((a, j) => (j === i ? e.target.value : a)))
                }
              />
            </label>
          ))}
          <small className="org-feed-hint">Your public chapters go with it. No form to fill.</small>
          <button className="primary small" disabled={busy}>
            Send application
          </button>
        </form>
      )}
    </div>
  );
}
