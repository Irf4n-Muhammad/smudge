"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BadgeCheck, Eye, EyeOff, Mail, Ticket, Heart, Plane, Cake, Trash2 } from "lucide-react";
import type { Chapter, CountryCode } from "../../../packages/contracts/src/identity";
import { countries } from "../../../packages/contracts/src/identity";
import { api } from "./runtime";
import type { Boot } from "./types";
import { askConfirm } from "./ui";

type Me = {
  chapters: Chapter[];
  birthday: string | null;
  country: CountryCode | null;
  incoming: { id: string; from: string; label: string }[];
  outgoing: { id: string; to: string; label: string }[];
  adminOrgs: { id: string; name: string; kind: string }[];
  outbox: { id: string; to: string; subject: string; body: string; createdAt: string }[];
};
type Invite = { code: string; orgId: string; label: string; uses: number; used: number };

const methodLabel: Record<Chapter["method"], string> = {
  email: "Verified by email",
  invite: "Issued by the organisation",
  partner: "Confirmed by both",
  "photo-location": "Photo taken there",
};

export function ChapterList({
  chapters,
  editable,
  onChange,
  notify,
}: {
  chapters: Chapter[];
  editable?: boolean;
  onChange?: () => Promise<void>;
  notify?: (s: string) => void;
}) {
  if (chapters.length === 0)
    return (
      <p className="fineprint">No chapters yet. Every chapter here is proven, never typed in.</p>
    );
  return (
    <ul className="chapter-list">
      {chapters.map((c) => (
        <li key={c.id} className={`chapter chapter-${c.kind}`}>
          <BadgeCheck size={16} aria-hidden="true" />
          <span className="chapter-text">
            <strong>{c.label}</strong>
            <small>
              {methodLabel[c.method]}
              {c.from ? ` · ${c.from}${c.to ? ` to ${c.to}` : ""}` : ""}
            </small>
          </span>
          {editable && (
            <span className="chapter-actions">
              <button
                className="text-button"
                aria-label={`Show ${c.label} to ${c.audience === "public" ? "close circle only" : "everyone"}`}
                onClick={async () => {
                  try {
                    await api(`/chapters/${c.id}/audience`, {
                      audience: c.audience === "public" ? "circle" : "public",
                    });
                    await onChange?.();
                  } catch (e) {
                    notify?.((e as Error).message);
                  }
                }}
              >
                {c.audience === "public" ? <Eye size={14} /> : <EyeOff size={14} />}
                {c.audience === "public" ? "Everyone" : "Close circle"}
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${c.label}`}
                onClick={async () => {
                  if (
                    c.kind === "together" &&
                    !(await askConfirm(
                      `End “${c.label}”?`,
                      "This ends the chapter for both of you.",
                      "End chapter",
                    ))
                  )
                    return;
                  try {
                    await api(`/chapters/${c.id}`, undefined, "DELETE");
                    await onChange?.();
                  } catch (e) {
                    notify?.((e as Error).message);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Who you are, proven": chapters come only from emails, invites, partners or photos. */
export function IdentityHub({
  boot,
  notify,
  onMoment,
  demo = false,
}: {
  boot: Boot;
  notify: (s: string) => void;
  onMoment: () => void;
  /** The local playground, where the made-up organisations below can be tried. */
  demo?: boolean;
}) {
  const [me, setMe] = useState<Me | null>(null),
    [tab, setTab] = useState("email"),
    [invites, setInvites] = useState<Invite[]>([]);
  const load = useCallback(async () => {
    try {
      const next = await api<Me>("/identity/me");
      setMe(next);
      if (next.adminOrgs.length) setInvites(await api<Invite[]>("/identity/invites"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!me) return <div className="empty-state">Loading your chapters…</div>;
  const name = (id: string) => boot.users.find((u) => u.id === id)?.name ?? id;
  return (
    <section className="identity-hub" aria-label="Who you are">
      <header className="identity-head">
        <span className="eyebrow">WHO YOU ARE, PROVEN</span>
        <h1>Your chapters</h1>
        <p>
          Campus, work, clubs, trips and the people you are with. Each one is proven by whoever can
          prove it. Nothing is posted automatically when you add one.
        </p>
        <button className="primary identity-moment" onClick={onMoment}>
          Share a moment
        </button>
      </header>
      <ChapterList chapters={me.chapters} editable onChange={load} notify={notify} />
      {me.incoming.map((r) => (
        <div className="identity-request" key={r.id}>
          <Heart size={16} /> {name(r.from)} says you are <strong>{r.label.toLowerCase()}</strong>.
          <button
            className="primary"
            onClick={async () => {
              await api(`/identity/partner/${r.id}/respond`, { accept: true }).catch((e) =>
                notify(e.message),
              );
              await load();
            }}
          >
            Confirm
          </button>
          <button
            className="text-button"
            onClick={async () => {
              await api(`/identity/partner/${r.id}/respond`, { accept: false });
              await load();
            }}
          >
            Decline
          </button>
        </div>
      ))}
      {me.outgoing.map((r) => (
        <p className="fineprint" key={r.id}>
          Waiting for {name(r.to)} to confirm “{r.label}”.
        </p>
      ))}
      <nav className="identity-tabs" aria-label="Add a chapter">
        {[
          ["email", Mail, "Campus or work email"],
          ["invite", Ticket, "Invite code"],
          ["partner", Heart, "Partner"],
          ["trip", Plane, "Trip photo"],
          ["more", Cake, "Birthday & country"],
        ].map(([key, Icon, label]) => {
          const I = Icon as typeof Mail;
          return (
            <button
              key={String(key)}
              aria-pressed={tab === key}
              className={tab === key ? "selected" : ""}
              onClick={() => setTab(String(key))}
            >
              <I size={14} /> {String(label)}
            </button>
          );
        })}
      </nav>
      <div className="identity-panel">
        {tab === "email" && <EmailProof me={me} demo={demo} onDone={load} notify={notify} />}
        {tab === "invite" && <InviteRedeem onDone={load} notify={notify} />}
        {tab === "partner" && <PartnerRequest boot={boot} onDone={load} notify={notify} />}
        {tab === "trip" && <TripProof onDone={load} notify={notify} />}
        {tab === "more" && <BirthdayCountry me={me} onDone={load} notify={notify} />}
      </div>
      {me.adminOrgs.length > 0 && (
        <InviteAdmin orgs={me.adminOrgs} invites={invites} onDone={load} notify={notify} />
      )}
    </section>
  );
}

function EmailProof({
  me,
  demo,
  onDone,
  notify,
}: {
  me: Me;
  demo: boolean;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState<{
      challengeId: string;
      sentTo: string;
      org: { name: string; kind: string };
    } | null>(null),
    [code, setCode] = useState(""),
    [role, setRole] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  async function start(e: FormEvent) {
    e.preventDefault();
    try {
      setChallenge(await api("/identity/email/start", { email }));
      setRole("");
      await onDone();
    } catch (err) {
      notify((err as Error).message);
    }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/identity/email/confirm", {
        challengeId: challenge!.challengeId,
        code,
        role,
        period: {
          ...(from ? { from: Number(from) } : {}),
          ...(to ? { to: to === "now" ? "now" : Number(to) } : {}),
        },
      });
      setChallenge(null);
      setCode("");
      setEmail("");
      notify("Chapter added. Nothing was posted.");
      await onDone();
    } catch (err) {
      notify((err as Error).message);
    }
  }
  return (
    <div>
      {!challenge ? (
        <form className="identity-form" onSubmit={start}>
          <label>
            Your campus or work email
            <input
              type="email"
              required
              value={email}
              placeholder={demo ? "you@student.lembayung.edu" : "you@campus.edu"}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="primary">Send code</button>
          <p className="fineprint">
            {demo
              ? "Demo organisations: @student.lembayung.edu, @lembayung.edu, @kopinusantara.co. "
              : "Works for organisations that have joined Smudge. "}
            We keep only a fingerprint of the address so it cannot prove a second account.
          </p>
        </form>
      ) : (
        <form className="identity-form" onSubmit={confirm}>
          <p>
            Code sent to {challenge.sentTo} for <strong>{challenge.org.name}</strong>.
          </p>
          <label>
            6-digit code
            <input
              inputMode="numeric"
              pattern="\d{6}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <label>
            {challenge.org.kind === "campus" ? "Student, graduate, lecturer…" : "Your role"}
            <input
              required
              minLength={2}
              maxLength={60}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </label>
          <div className="identity-row">
            <label>
              From
              <input
                inputMode="numeric"
                placeholder="2022"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input placeholder="2026 or now" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <button className="primary">Verify</button>
          <button type="button" className="text-button" onClick={() => setChallenge(null)}>
            Use another email
          </button>
        </form>
      )}
      {me.outbox.length > 0 && (
        <aside className="local-inbox" aria-label="Local demo inbox">
          <span className="eyebrow">LOCAL DEMO INBOX</span>
          <p className="fineprint">No email is sent from this local app. Messages land here.</p>
          {me.outbox.slice(0, 3).map((m) => (
            <p key={m.id}>
              <strong>{m.to}</strong> · {m.body}
            </p>
          ))}
        </aside>
      )}
    </div>
  );
}

function InviteRedeem({
  onDone,
  notify,
}: {
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      className="identity-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const chapter = await api<Chapter>("/identity/invites/redeem", { code });
          notify(`Added “${chapter.label}”.`);
          setCode("");
          await onDone();
        } catch (err) {
          notify((err as Error).message);
        }
      }}
    >
      <label>
        Invite code from a club, event or organisation
        <input
          required
          value={code}
          maxLength={10}
          placeholder="10 letters and numbers"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </label>
      <button className="primary">Redeem</button>
      <p className="fineprint">
        Clubs and events issue chapters like “Member, Teater Senja” or “Best Short Film 2025”.
        Members-only decorations unlock with them.
      </p>
    </form>
  );
}

function PartnerRequest({
  boot,
  onDone,
  notify,
}: {
  boot: Boot;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [partnerId, setPartnerId] = useState(""),
    [label, setLabel] = useState<"Together" | "Married">("Together");
  return (
    <form
      className="identity-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/identity/partner", { partnerId, label });
          notify("Request sent. It appears once they confirm.");
          await onDone();
        } catch (err) {
          notify((err as Error).message);
        }
      }}
    >
      <label>
        Who
        <select required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">Choose someone</option>
          {boot.users
            .filter((u) => u.id !== boot.actor.userId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Status
        <select value={label} onChange={(e) => setLabel(e.target.value as "Together" | "Married")}>
          <option>Together</option>
          <option>Married</option>
        </select>
      </label>
      <button className="primary">Ask them to confirm</button>
      <p className="fineprint">
        It only becomes a chapter when they confirm from their own account. Either of you can end
        it.
      </p>
    </form>
  );
}

function TripProof({
  onDone,
  notify,
}: {
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="identity-form">
      <label>
        A photo you took there (JPEG with location)
        <input
          type="file"
          accept="image/jpeg"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const base64 = btoa(
                Array.from(new Uint8Array(await file.arrayBuffer()), (b) =>
                  String.fromCharCode(b),
                ).join(""),
              );
              const asset = await api<{ id: string }>("/assets", {
                name: file.name.slice(0, 120),
                mime: "image/jpeg",
                base64,
              });
              const chapter = await api<Chapter>("/identity/travel", { assetId: asset.id });
              notify(`Added “${chapter.label}”.`);
              await onDone();
            } catch (err) {
              notify((err as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      <p className="fineprint">
        We read the country from the photo’s GPS. Location in a photo is evidence, not proof: it can
        be edited, and many apps strip it.
      </p>
    </div>
  );
}

function BirthdayCountry({
  me,
  onDone,
  notify,
}: {
  me: Me;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [month, setMonth] = useState("01"),
    [day, setDay] = useState("01");
  return (
    <div className="identity-form">
      {me.birthday ? (
        <p>
          Birthday saved: <strong>{me.birthday}</strong>. The birthday moment opens only around that
          day.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/identity/birthday", { birthday: `${month}-${day}` });
              await onDone();
            } catch (err) {
              notify((err as Error).message);
            }
          }}
        >
          <div className="identity-row">
            <label>
              Month
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Day
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary">Save birthday</button>
          <p className="fineprint">
            You can set it once, so nobody can open the birthday moment on demand.
          </p>
        </form>
      )}
      <label>
        Country, for local seasons like Hari Kemerdekaan
        <select
          value={me.country ?? ""}
          onChange={async (e) => {
            try {
              await api("/identity/country", { country: e.target.value });
              await onDone();
            } catch (err) {
              notify((err as Error).message);
            }
          }}
        >
          <option value="" disabled>
            Choose a country
          </option>
          {Object.entries(countries).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function InviteAdmin({
  orgs,
  invites,
  onDone,
  notify,
}: {
  orgs: Me["adminOrgs"];
  invites: Invite[];
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]!.id),
    [kind, setKind] = useState<"member" | "title">("member"),
    [label, setLabel] = useState(""),
    [uses, setUses] = useState(10);
  return (
    <section className="invite-admin">
      <span className="eyebrow">YOU MANAGE {orgs.map((o) => o.name.toUpperCase()).join(", ")}</span>
      <form
        className="identity-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/identity/invites", { orgId, kind, label, uses });
            setLabel("");
            await onDone();
          } catch (err) {
            notify((err as Error).message);
          }
        }}
      >
        <div className="identity-row">
          <label>
            Organisation
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as "member" | "title")}>
              <option value="member">Membership</option>
              <option value="title">Title or award</option>
            </select>
          </label>
        </div>
        <label>
          Chapter text
          <input
            required
            minLength={2}
            maxLength={80}
            value={label}
            placeholder="Member, Teater Senja"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          How many people can use it
          <input
            type="number"
            min={1}
            max={500}
            value={uses}
            onChange={(e) => setUses(Number(e.target.value))}
          />
        </label>
        <button className="primary">Create invite</button>
      </form>
      <ul className="invite-list">
        {invites.map((i) => (
          <li key={i.code}>
            <code>{i.code}</code> {i.label} · {i.used}/{i.uses} used
          </li>
        ))}
      </ul>
    </section>
  );
}
