"use client";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "./runtime";

type StampKind = "crew" | "went" | "hunt" | "stamp";
interface PassportView {
  owner: { id: string; name: string; handle: string };
  mine: boolean;
  totals: { orgs: number; events: number; stamps: number; met: number };
  orgs: {
    id: string;
    name: string;
    kind: string;
    roles: { label: string; line?: { n: number; role: string }; from?: number }[];
    stamps: { kind: StampKind; label: string; name: string; from?: number; at: string }[];
  }[];
  stubs: {
    org: string;
    orgId: string;
    event: string;
    when: string;
    place: string;
    door: number;
  }[];
  met: { id: string; name: string; handle: string; event: string; org: string; at: string }[];
}

const stampWord: Record<StampKind, string> = {
  crew: "CREW",
  went: "WAS THERE",
  hunt: "FOUND ALL",
  stamp: "STAMP",
};
const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${tail}`;
};
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * A fan passport: someone's organisations, the stamps they earned there, the stub of every
 * event they walked into and, on their own passport only, the people they met.
 */
export function Passport({ handle }: { handle: string }) {
  const [view, setView] = useState<PassportView | null | "signin" | "missing">(null);
  useEffect(() => {
    api<PassportView>(`/passport/${encodeURIComponent(handle)}`)
      .then(setView)
      .catch((e: Error) => setView(e.message.startsWith("UNAUTHENTICATED") ? "signin" : "missing"));
  }, [handle]);
  if (view === null) return <main className="pp" aria-busy="true" />;
  if (view === "signin" || view === "missing")
    return (
      <main className="pp">
        <p className="pp-empty">
          {view === "signin" ? (
            <>
              Sign in to see passports. <a href="/">Sign in</a>
            </>
          ) : (
            "This passport isn’t here."
          )}
        </p>
      </main>
    );
  return (
    <main className="pp">
      <nav className="pp-top">
        <a href={`/u/${encodeURIComponent(view.owner.handle)}`} aria-label="Back to the profile">
          <ArrowLeft size={16} />
        </a>
      </nav>
      <header className="pp-cover">
        <small>SMUDGE · PASSPORT</small>
        <h1>{view.owner.name}</h1>
        <span>@{view.owner.handle}</span>
        <dl>
          <div>
            <dt>Places</dt>
            <dd>{view.totals.orgs}</dd>
          </div>
          <div>
            <dt>Events</dt>
            <dd>{view.totals.events}</dd>
          </div>
          <div>
            <dt>Stamps</dt>
            <dd>{view.totals.stamps}</dd>
          </div>
          {view.mine && (
            <div>
              <dt>Met</dt>
              <dd>{view.totals.met}</dd>
            </div>
          )}
        </dl>
      </header>
      {view.orgs.length === 0 && (
        <p className="pp-empty">
          {view.mine
            ? "Nothing here yet. Join an organisation or go to one of its events."
            : "Nothing to show yet."}
        </p>
      )}
      {view.stubs.length > 0 && (
        <section aria-label="Stubs">
          <h2>Stubs</h2>
          <ul className="pp-stubs">
            {view.stubs.map((s) => (
              <li key={`${s.orgId}-${s.event}`}>
                <div>
                  <small>{s.org.toUpperCase()}</small>
                  <b>{s.event}</b>
                  <span>
                    {day(s.when)} · {s.place}
                  </span>
                </div>
                <em aria-label={`${ordinal(s.door)} through the door`}>
                  <i>No.</i>
                  {s.door}
                </em>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.orgs.map((o) => (
        <section key={o.id} className="pp-page" aria-label={o.name}>
          <h2>
            <a href={`/o/${encodeURIComponent(o.id)}`}>{o.name}</a>
          </h2>
          {o.roles.length > 0 && (
            <ul className="pp-roles">
              {o.roles.map((r) => (
                <li key={r.label}>
                  {r.label}
                  {r.line && (
                    <small>
                      {ordinal(r.line.n)} {r.line.role}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
          {o.stamps.length > 0 && (
            <ul className="pp-stamps">
              {o.stamps.map((st, i) => (
                <li
                  key={`${st.label}-${i}`}
                  className={st.kind}
                  style={{ rotate: `${((i * 37) % 13) - 6}deg` }}
                >
                  <small>{stampWord[st.kind]}</small>
                  <b>{st.name}</b>
                  <span>{st.from ?? new Date(st.at).getFullYear()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {view.mine && view.met.length > 0 && (
        <section aria-label="People you met">
          <h2>People you met</h2>
          <p className="pp-note">Only you see this.</p>
          <ul className="pp-met">
            {view.met.map((m) => (
              <li key={`${m.id}-${m.event}`}>
                <a href={`/u/${encodeURIComponent(m.handle)}`}>{m.name}</a>
                <span>
                  at {m.event}, {m.org}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
