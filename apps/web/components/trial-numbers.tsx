"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./runtime";

type ByDay = Record<string, number>;
interface Numbers {
  posts: {
    id: string;
    title: string;
    opens: number;
    opensByDay: ByDay;
    answered: number;
    newAccounts: number;
    cameBack: number;
    madeTheirOwn: number;
  }[];
  orgs: {
    id: string;
    opens: number;
    opensByDay: ByDay;
    joined: number;
    joinedByDay: ByDay;
    newAccounts: number;
    cameBack: number;
  }[];
}
const pct = (n: number, of: number) => (of ? ` (${Math.round((n / of) * 100)}%)` : "");
const days = (byDay: ByDay) =>
  Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, n]) => `${d.slice(5)}: ${n}`)
    .join(" · ") || "none yet";

/**
 * The week 3 trial in numbers, for moderators: a post shared to IG stories and an organisation's
 * join link. Counts only; nobody's name is here.
 */
export function TrialNumbers() {
  const [post, setPost] = useState(""),
    [org, setOrg] = useState(""),
    [numbers, setNumbers] = useState<Numbers | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async (p: string, o: string) => {
    try {
      setNumbers(
        await api<Numbers>(`/trial?post=${encodeURIComponent(p)}&org=${encodeURIComponent(o)}`),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message.startsWith("FORBIDDEN") ? "Moderators only." : String(e));
    }
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("post") ?? "",
      o = q.get("org") ?? "";
    setPost(p);
    setOrg(o);
    if (p || o) void load(p, o);
  }, [load]);
  return (
    <main className="org-page trial-page">
      <a className="org-brand" href="/">
        smudge.
      </a>
      <h1>Trial numbers</h1>
      <form
        className="org-form"
        onSubmit={(e) => {
          e.preventDefault();
          window.history.replaceState(
            null,
            "",
            `/trial?post=${encodeURIComponent(post)}&org=${encodeURIComponent(org)}`,
          );
          void load(post, org);
        }}
      >
        <label>
          Post ids
          <input value={post} onChange={(e) => setPost(e.target.value)} placeholder="id, id" />
        </label>
        <label>
          Organisation ids
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="id, id" />
        </label>
        <button className="primary small">Show</button>
      </form>
      {error && (
        <p className="org-note" role="status">
          {error}
        </p>
      )}
      {numbers?.posts.map((p) => (
        <section key={p.id} className="org-admin" aria-label={`Post ${p.title}`}>
          <h2>{p.title}</h2>
          <dl className="trial-funnel">
            <dt>Opened from a link</dt>
            <dd>{p.opens}</dd>
            <dt>Played to the end, with an account</dt>
            <dd>{p.answered}</dd>
            <dt>Made an account for it</dt>
            <dd>
              {p.newAccounts}
              {pct(p.newAccounts, p.answered)}
            </dd>
            <dt>Came back another day</dt>
            <dd>
              {p.cameBack}
              {pct(p.cameBack, p.answered)}
            </dd>
            <dt>Made their own version</dt>
            <dd>
              {p.madeTheirOwn}
              {pct(p.madeTheirOwn, p.answered)}
            </dd>
          </dl>
          <p className="org-hint">Opens by day: {days(p.opensByDay)}</p>
        </section>
      ))}
      {numbers?.orgs.map((o) => (
        <section key={o.id} className="org-admin" aria-label={`Organisation ${o.id}`}>
          <h2>{o.id}</h2>
          <dl className="trial-funnel">
            <dt>Page opened</dt>
            <dd>{o.opens}</dd>
            <dt>Joined from the link</dt>
            <dd>{o.joined}</dd>
            <dt>Made an account to join</dt>
            <dd>
              {o.newAccounts}
              {pct(o.newAccounts, o.joined)}
            </dd>
            <dt>Came back another day</dt>
            <dd>
              {o.cameBack}
              {pct(o.cameBack, o.joined)}
            </dd>
          </dl>
          <p className="org-hint">Joined by day: {days(o.joinedByDay)}</p>
        </section>
      ))}
    </main>
  );
}
