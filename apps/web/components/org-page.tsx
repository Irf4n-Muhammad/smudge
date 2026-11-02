"use client";
import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "./runtime";

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

/**
 * An organisation's public face: anyone can open it without joining. Its admin sees the same
 * page with the parts only they run: terms and the handover to the next admin.
 */
export function OrgPage({ id }: { id: string }) {
  const [org, setOrg] = useState<OrgView | null | "missing">(null);
  const [manage, setManage] = useState<Manage | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    try {
      setOrg(await api<OrgView>(`/public/orgs/${encodeURIComponent(id)}`));
    } catch {
      setOrg("missing");
      return;
    }
    // Only the admin gets an answer here; everyone else just sees the public page.
    setManage(await api<Manage>(`/orgs/${encodeURIComponent(id)}/manage`).catch(() => null));
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
      {manage && <Admin org={manage} onDone={load} notify={setNote} />}
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
