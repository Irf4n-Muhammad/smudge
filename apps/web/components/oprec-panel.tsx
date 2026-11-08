"use client";
import { useCallback, useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { api } from "./runtime";
import { signedInOrSignIn } from "./return-path";
import { shareOprecStory } from "./oprec-story";

export interface OprecView {
  id: string;
  title: string;
  roles: string[];
  questions: string[];
  closes: string;
  term: string | null;
  accepting: boolean;
  applicants: number;
}
type Mine = { role: string; status: "applied" | "accepted" | "declined" } | null;
interface Application {
  id: string;
  role: string;
  answers: string[];
  status: "applied" | "accepted" | "declined";
  applicant: { id: string; name: string; handle: string };
  proven: string[];
}
const day = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" });
const errors: Record<string, string> = {
  ALREADY_APPLIED: "You already applied.",
  OPREC_CLOSED: "This recruitment is closed.",
};
const said = (e: unknown) => {
  const message = (e as Error).message;
  return errors[message.split(" ")[0]!] ?? message;
};

/**
 * An organisation's open recruitment, for anyone: apply with the profile you already have, then
 * put the twibbon on your story so friends can apply too.
 */
export function OprecPublic({
  org,
  oprec,
  admin,
  onDone,
  notify,
}: {
  org: { id: string; name: string };
  oprec: OprecView;
  /** The committee runs it rather than applying to it. */
  admin: boolean;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [mine, setMine] = useState<Mine>(null);
  const [role, setRole] = useState(oprec.roles[0]!);
  const [answers, setAnswers] = useState<string[]>(oprec.questions.map(() => ""));
  const [shared, setShared] = useState("");
  const base = `/orgs/${encodeURIComponent(org.id)}/oprec/${encodeURIComponent(oprec.id)}`;
  const loadMine = useCallback(async () => {
    setMine(await api<Mine>(`${base}/mine`).catch(() => null));
  }, [base]);
  useEffect(() => {
    void loadMine();
  }, [loadMine]);
  const status = mine
    ? mine.status === "accepted"
      ? `You’re in: ${mine.role}. It’s on your page.`
      : mine.status === "declined"
        ? `Not this time for ${mine.role}.`
        : `You applied for ${mine.role}. The committee will decide.`
    : null;
  return (
    <section className="org-oprec" aria-label="Open recruitment">
      <span className="org-oprec-tag">Open recruitment{oprec.term ? ` · ${oprec.term}` : ""}</span>
      <h2>{oprec.title}</h2>
      <p className="org-hint">
        {oprec.accepting ? `Closes ${day(oprec.closes)}` : "Closed"} · {oprec.applicants}{" "}
        {oprec.applicants === 1 ? "person" : "people"} applied
      </p>
      <ul className="org-oprec-roles">
        {oprec.roles.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {status && <p className="org-oprec-status">{status}</p>}
      {mine && (
        <p className="answer-follow">
          <span>{shared || "Put it on your story. The link lets friends apply too."}</span>
          <button
            className="primary small"
            onClick={async () => {
              try {
                const how = await shareOprecStory({
                  org: org.name,
                  term: oprec.term,
                  role: mine.role,
                  title: oprec.title,
                  path: `/o/${encodeURIComponent(org.id)}`,
                });
                setShared(
                  how === "shared"
                    ? "Shared."
                    : "Picture saved and link copied. Add the link as a sticker on your story.",
                );
              } catch (e) {
                if ((e as Error).name !== "AbortError") setShared((e as Error).message);
              }
            }}
          >
            <Share2 size={13} /> Share to story
          </button>
        </p>
      )}
      {!mine && !admin && oprec.accepting && (
        <form
          className="org-form org-create"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (!(await signedInOrSignIn())) return;
              await api(`${base}/apply`, { role, answers });
              notify(`Applied for ${role}. Your profile went with it, no form to fill.`);
              await loadMine();
              await onDone();
            } catch (err) {
              notify(said(err));
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
          <p className="org-hint">Your public chapters go with your application.</p>
          <button className="primary">Apply</button>
        </form>
      )}
    </section>
  );
}

/** The committee's side: open a recruitment, read applicants with what they've proven, decide. */
export function OprecAdmin({
  orgId,
  oprec,
  onDone,
  notify,
}: {
  orgId: string;
  oprec: OprecView | null;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [roles, setRoles] = useState("");
  const [questions, setQuestions] = useState("");
  const [closes, setCloses] = useState(inTwoWeeks);
  const [apps, setApps] = useState<Application[]>([]);
  const base = oprec
    ? `/orgs/${encodeURIComponent(orgId)}/oprec/${encodeURIComponent(oprec.id)}`
    : null;
  const load = useCallback(async () => {
    if (!base) return setApps([]);
    setApps(
      (await api<{ applications: Application[] }>(`${base}/applications`).catch(() => null))
        ?.applications ?? [],
    );
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      notify(done);
      await load();
      await onDone();
    } catch (e) {
      notify(said(e));
    }
  };
  if (!oprec)
    return (
      <section className="org-admin" aria-label="Recruitment">
        <h2>Open a recruitment</h2>
        <form
          className="org-form org-create"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api(`/orgs/${encodeURIComponent(orgId)}/oprec`, {
                  title,
                  roles: roles
                    .split(",")
                    .map((r) => r.trim())
                    .filter(Boolean),
                  questions: questions
                    .split("\n")
                    .map((q) => q.trim())
                    .filter(Boolean),
                  closes,
                }),
              "Recruitment open. Share the page link.",
            );
          }}
        >
          <label>
            Title
            <input
              required
              minLength={3}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Divisions, separated by commas
            <input required value={roles} onChange={(e) => setRoles(e.target.value)} />
          </label>
          <label>
            Questions, one per line (up to 5)
            <textarea rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} />
          </label>
          <label>
            Closes
            <input
              type="date"
              required
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
            />
          </label>
          <button className="primary small">Open recruitment</button>
        </form>
      </section>
    );
  return (
    <section className="org-admin" aria-label="Applicants">
      <h2>Applicants</h2>
      {apps.length === 0 && <p className="org-hint">No one yet. Share the page link.</p>}
      <ul className="org-applicants">
        {apps.map((a) => (
          <li key={a.id}>
            <div>
              <strong>{a.applicant.name}</strong> <small>@{a.applicant.handle}</small> · {a.role}
            </div>
            {a.proven.length > 0 && <p className="org-proven">{a.proven.join(" · ")}</p>}
            {a.answers.filter(Boolean).map((answer, i) => (
              <p key={i} className="org-answer">
                <small>{oprec.questions[i]}</small> {answer}
              </p>
            ))}
            {a.status === "applied" ? (
              <div className="org-decide">
                <button
                  className="primary small"
                  onClick={() =>
                    void run(
                      () => api(`${base}/applications/${a.id}/decide`, { accept: true }),
                      `${a.applicant.name} is in. Their chapter is on their page.`,
                    )
                  }
                >
                  Accept
                </button>
                <button
                  className="small"
                  onClick={() =>
                    void run(
                      () => api(`${base}/applications/${a.id}/decide`, { accept: false }),
                      `Declined ${a.applicant.name}.`,
                    )
                  }
                >
                  Decline
                </button>
              </div>
            ) : (
              <span className={`org-decided ${a.status}`}>{a.status}</span>
            )}
          </li>
        ))}
      </ul>
      <button
        className="small"
        onClick={() => void run(() => api(`${base}/close`, {}), "Recruitment closed.")}
      >
        Close recruitment
      </button>
    </section>
  );
}
