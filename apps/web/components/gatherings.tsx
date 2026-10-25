"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  GatheringGuestList,
  GatheringInvite,
  GatheringMessageView,
  GatheringSpace,
  GatheringSummary,
} from "../../../packages/contracts/src/gatherings";
import { api } from "./runtime";

// Guest-facing text is Indonesian: the wedding template is for Indonesian weddings first
// (ADR 0036), and the people opening it from WhatsApp are the couple's families.
const longDate = (date: string, locale: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const mapLink = (place: string, address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [place, address].filter(Boolean).join(", "),
  )}`;
const inviteUrl = (id: string) =>
  typeof window === "undefined" ? `/m/${id}` : `${window.location.origin}/m/${id}`;
const message = (code: string) =>
  ({
    INVALID_PHONE: "Nomor HP-nya belum benar. Contoh: 0812 3456 7890.",
    TOO_MANY_REQUESTS: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
    GATHERING_FULL: "Undangan ini sudah tidak menerima konfirmasi.",
  })[code.split(" ")[0]!] ?? "Konfirmasi belum terkirim. Coba lagi.";

function Missing() {
  return (
    <main className="invite invite-missing">
      <h1>Undangan tidak ditemukan</h1>
      <p>Mungkin sudah dihapus oleh tuan rumah, atau tautannya tidak lengkap.</p>
    </main>
  );
}

/** The invite page (ADR 0036): what a guest opens from WhatsApp, with no account. */
export function Invitation({ id }: { id: string }) {
  const [invite, setInvite] = useState<GatheringInvite | null | "missing">(null);
  const signedIn = useSignedIn();
  // A member sees the moment group instead (ADR 0037); anyone else sees the invite.
  const [space, setSpace] = useState<GatheringSpace | null | "none">(null);
  const loadSpace = useCallback(
    () =>
      api<GatheringSpace>(`/gatherings/${encodeURIComponent(id)}/space`).then(setSpace, () =>
        setSpace("none"),
      ),
    [id],
  );
  useEffect(() => {
    api<GatheringInvite>(`/public/gatherings/${encodeURIComponent(id)}`)
      .then(setInvite)
      .catch(() => setInvite("missing"));
  }, [id]);
  useEffect(() => {
    if (signedIn) void loadSpace();
    else if (signedIn === false) setSpace("none");
  }, [signedIn, loadSpace]);
  if (invite === "missing") return <Missing />;
  if (!invite || space === null) return <main className="invite" aria-busy="true" />;
  if (space !== "none") return <MomentSpace space={space} onChange={setSpace} />;
  return (
    <main className="invite">
      <InviteBody invite={invite}>
        <Rsvp id={invite.id} {...(signedIn ? { onDone: () => void loadSpace() } : {})} />
        {signedIn && (
          <section className="invite-block">
            <p>Sudah konfirmasi lewat WhatsApp keluarga? Masuk langsung ke grup momennya.</p>
            <button
              className="invite-link"
              onClick={() =>
                void api<GatheringSpace>(`/gatherings/${encodeURIComponent(id)}/join`, {}).then(
                  setSpace,
                )
              }
            >
              Gabung ke grup momen
            </button>
          </section>
        )}
      </InviteBody>
    </main>
  );
}

function InviteBody({ invite, children }: { invite: GatheringInvite; children?: React.ReactNode }) {
  return (
    <>
      <header className="invite-cover">
        <p className="invite-kicker">Undangan Pernikahan</p>
        <h1>{invite.title}</h1>
        {invite.hosts && <p className="invite-hosts">{invite.hosts}</p>}
        <p className="invite-date">{longDate(invite.date, "id-ID")}</p>
      </header>
      <section className="invite-block" aria-label="Tempat">
        <h2>Tempat</h2>
        <p className="invite-place">{invite.place}</p>
        {invite.address && <p>{invite.address}</p>}
        <a
          className="invite-link"
          href={mapLink(invite.place, invite.address)}
          target="_blank"
          rel="noreferrer"
        >
          Buka peta
        </a>
      </section>
      {invite.note && (
        <section className="invite-block invite-note">
          {invite.note.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}
      {invite.rundown.length > 0 && (
        <section className="invite-block" aria-label="Susunan acara">
          <h2>Susunan acara</h2>
          <ol className="invite-rundown">
            {invite.rundown.map((r, i) => (
              <li key={i}>
                <time>{r.time}</time>
                <span>{r.title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {children}
      {invite.vendors.length > 0 && (
        <section className="invite-block invite-vendors" aria-label="Didukung oleh">
          <h2>Didukung oleh</h2>
          <ul>
            {invite.vendors.map((v, i) => (
              <li key={i}>
                <span>{v.role}</span> {v.name}
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="invite-footer">
        <a href="/">Dibuat dengan Smudge</a>
      </footer>
    </>
  );
}

type Tab = "invite" | "chat" | "album" | "members";
const tabs: [Tab, string][] = [
  ["invite", "Undangan"],
  ["chat", "Obrolan"],
  ["album", "Album"],
  ["members", "Anggota"],
];
/**
 * The moment group (ADR 0037): the invite pinned as the first tab, the chat, the album (on the
 * day, next stage) and who is in, with the small groups the viewer is in.
 */
function MomentSpace({
  space,
  onChange,
}: {
  space: GatheringSpace;
  onChange: (space: GatheringSpace) => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [groupId, setGroupId] = useState<string | null>(null);
  const { invite } = space;
  const group = space.groups.find((g) => g.id === groupId) ?? null;
  const base = `/gatherings/${encodeURIComponent(invite.id)}`;
  return (
    <div className="moment-space">
      <header className="moment-head">
        <a className="brand" href="/" aria-label="Smudge home">
          smudge.
        </a>
        <div>
          <h1>{invite.title}</h1>
          <p>
            {longDate(invite.date, "id-ID")} · {invite.place}
          </p>
        </div>
        {space.role === "host" && (
          <a className="moment-host-link" href={`/m/${invite.id}/guests`}>
            Daftar tamu
          </a>
        )}
      </header>
      <nav className="moment-tabs" role="tablist" aria-label="Momen">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "invite" && (
        <main className="invite moment-invite">
          <InviteBody invite={invite} />
        </main>
      )}
      {tab === "chat" && (
        <section className="moment-panel" aria-label="Obrolan">
          {space.groups.length > 0 && (
            <div className="moment-rooms" role="group" aria-label="Ruang obrolan">
              <button aria-pressed={!group} onClick={() => setGroupId(null)}>
                Semua tamu
              </button>
              {space.groups.map((g) => (
                <button
                  key={g.id}
                  aria-pressed={group?.id === g.id}
                  onClick={() => setGroupId(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {!group && space.role === "host" && (
            <label className="moment-mode">
              <input
                type="checkbox"
                checked={space.mode === "open"}
                onChange={(e) =>
                  void api<GatheringSpace>(`${base}/mode`, {
                    mode: e.target.checked ? "open" : "announce",
                  }).then(onChange)
                }
              />
              Semua tamu boleh ngobrol
            </label>
          )}
          <Chat
            key={group?.id ?? "main"}
            base={base}
            me={space.me}
            group={group?.id ?? null}
            canWrite={!!group || space.mode === "open" || space.role === "host"}
          />
          {group && (
            <button
              className="moment-leave"
              onClick={() =>
                void api<GatheringSpace>(`${base}/groups/${group.id}/leave`, {}).then((s) => {
                  setGroupId(null);
                  onChange(s);
                })
              }
            >
              Keluar dari {group.name}
            </button>
          )}
        </section>
      )}
      {tab === "album" && (
        <section className="moment-panel moment-album" aria-label="Album">
          <h2>Album dibuka di hari H</h2>
          <p>
            Foto dari semua tamu masuk ke sini dan diurutkan sesuai susunan acara. Scan QR di pintu
            masuk untuk ikut mengisi.
          </p>
        </section>
      )}
      {tab === "members" && (
        <Members
          space={space}
          base={base}
          onChange={onChange}
          onOpen={(id) => {
            setGroupId(id);
            setTab("chat");
          }}
        />
      )}
    </div>
  );
}

function Chat({
  base,
  me,
  group,
  canWrite,
}: {
  base: string;
  me: string;
  group: string | null;
  canWrite: boolean;
}) {
  const [messages, setMessages] = useState<GatheringMessageView[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const path = `${base}/messages${group ? `?group=${group}` : ""}`;
  useEffect(() => {
    let live = true;
    const load = () =>
      api<GatheringMessageView[]>(path).then(
        (m) => live && setMessages(m),
        () => {},
      );
    void load();
    // Polling, like the other chats (ADR 0021); real-time delivery is the next step.
    const timer = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [path]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError("");
    try {
      setMessages(
        await api<GatheringMessageView[]>(`${base}/messages`, {
          text,
          ...(group ? { group } : {}),
        }),
      );
      setText("");
    } catch {
      setError("Pesan belum terkirim. Coba lagi.");
    }
  }
  return (
    <div className="moment-chat">
      {messages.length === 0 ? (
        <p className="moment-empty">Belum ada pesan.</p>
      ) : (
        <ol aria-label="Pesan">
          {messages.map((m) => (
            <li key={m.id} className={m.from.id === me ? "mine" : ""}>
              {m.from.id !== me && <strong>{m.from.name}</strong>}
              <p>{m.text}</p>
              <time>
                {new Date(m.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </time>
            </li>
          ))}
        </ol>
      )}
      {canWrite ? (
        <form onSubmit={send}>
          <input
            aria-label="Tulis pesan"
            placeholder="Tulis pesan"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
          <button>Kirim</button>
        </form>
      ) : (
        <p className="moment-empty">Hanya tuan rumah yang mengirim pengumuman di sini.</p>
      )}
      {error && (
        <p className="invite-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Members({
  space,
  base,
  onChange,
  onOpen,
}: {
  space: GatheringSpace;
  base: string;
  onChange: (space: GatheringSpace) => void;
  onOpen: (groupId: string) => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const others = space.members.filter((m) => m.id !== space.me);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const next = await api<GatheringSpace>(`${base}/groups`, { name, members: picked });
    const made = next.groups.find((g) => !space.groups.some((old) => old.id === g.id));
    onChange(next);
    setName("");
    setPicked([]);
    if (made) onOpen(made.id);
  }
  return (
    <section className="moment-panel" aria-label="Anggota">
      <h2>{space.members.length} orang di momen ini</h2>
      <ul className="moment-members">
        {space.members.map((m) => (
          <li key={m.id}>
            <span className="moment-avatar" style={{ background: m.color }}>
              {m.initials}
            </span>
            {m.name}
          </li>
        ))}
      </ul>
      <h2>Grup kecil</h2>
      {space.groups.length > 0 && (
        <ul className="moment-groups">
          {space.groups.map((g) => (
            <li key={g.id}>
              <button onClick={() => onOpen(g.id)}>
                {g.name} · {g.memberIds.length} orang
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length === 0 ? (
        <p className="moment-empty">Grup kecil bisa dibuat setelah ada tamu lain yang bergabung.</p>
      ) : (
        <form className="moment-group-form" onSubmit={create} aria-label="Grup kecil baru">
          <label>
            Nama grup
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Geng SMA"
              maxLength={60}
              required
            />
          </label>
          <fieldset>
            <legend>Ajak siapa</legend>
            {others.map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  checked={picked.includes(m.id)}
                  onChange={(e) =>
                    setPicked(
                      e.target.checked ? [...picked, m.id] : picked.filter((id) => id !== m.id),
                    )
                  }
                />
                {m.name}
              </label>
            ))}
          </fieldset>
          <button className="invite-send">Buat grup kecil</button>
        </form>
      )}
    </section>
  );
}

function Rsvp({ id, onDone }: { id: string; onDone?: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [attending, setAttending] = useState<boolean | null>(null);
  const [guests, setGuests] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ attending: boolean; guests: number } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (attending === null) return setError("Pilih hadir atau tidak hadir.");
    setBusy(true);
    setError("");
    try {
      setDone(
        await api(`/public/gatherings/${encodeURIComponent(id)}/rsvp`, {
          name,
          phone,
          attending,
          guests,
          message: note,
        }),
      );
      // A signed-in guest is now a member: the page turns into the moment group.
      onDone?.();
    } catch (err) {
      setError(message((err as Error).message));
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <section className="invite-block invite-rsvp" aria-live="polite">
        <h2>Terima kasih</h2>
        <p>
          {done.attending
            ? `Konfirmasi kehadiran untuk ${done.guests} orang sudah kami terima.`
            : "Konfirmasi Anda sudah kami terima. Terima kasih atas doanya."}
        </p>
        <button className="invite-link" onClick={() => setDone(null)}>
          Ubah jawaban
        </button>
      </section>
    );
  return (
    <section className="invite-block invite-rsvp" aria-label="Konfirmasi kehadiran">
      <h2>Konfirmasi kehadiran</h2>
      <form onSubmit={send}>
        <label>
          Nama
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            autoComplete="name"
          />
        </label>
        <label>
          Nomor HP
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            maxLength={24}
            required
          />
          <small>Hanya untuk mengenali jawaban Anda. Nomornya tidak disimpan.</small>
        </label>
        <div className="invite-choice" role="radiogroup" aria-label="Kehadiran">
          <button
            type="button"
            role="radio"
            aria-checked={attending === true}
            onClick={() => setAttending(true)}
          >
            Hadir
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={attending === false}
            onClick={() => setAttending(false)}
          >
            Tidak hadir
          </button>
        </div>
        {attending && (
          <label>
            Jumlah orang
            <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Ucapan dan doa
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
        </label>
        {error && (
          <p className="invite-error" role="alert">
            {error}
          </p>
        )}
        <button className="invite-send" disabled={busy}>
          {busy ? "Mengirim…" : "Kirim konfirmasi"}
        </button>
      </form>
    </section>
  );
}

/** Signed in or not, for the host pages. */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch("/api/auth/state")
      .then((r) => r.json())
      .then((s: { signedIn?: boolean }) => setSignedIn(!!s.signedIn))
      .catch(() => setSignedIn(false));
  }, []);
  return signedIn;
}
function HostShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="moments-host">
      <header className="share-bar">
        <a className="brand" href="/" aria-label="Smudge home">
          smudge.
        </a>
        <nav>
          <a href="/m">Your moments</a>
        </nav>
      </header>
      <main className="moments-main">{children}</main>
    </div>
  );
}
function SignInFirst() {
  return (
    <HostShell>
      <h1>Moments</h1>
      <p>
        Log in to host a moment. <a href="/">Go to Smudge</a>
      </p>
    </HostShell>
  );
}

const blankRow = { time: "", title: "" };
const blankVendor = { role: "", name: "" };
/** Your moments and a form for a new wedding invite (ADR 0036). */
export function MomentsHome() {
  const signedIn = useSignedIn();
  const [list, setList] = useState<GatheringSummary[] | null>(null);
  const [form, setForm] = useState({
    title: "",
    hosts: "",
    date: "",
    place: "",
    address: "",
    note: "",
  });
  const [rundown, setRundown] = useState([{ ...blankRow }]);
  const [vendors, setVendors] = useState([{ ...blankVendor }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (signedIn) api<GatheringSummary[]>("/gatherings").then(setList, () => setList([]));
  }, [signedIn]);
  if (signedIn === null) return <HostShell>{null}</HostShell>;
  if (!signedIn) return <SignInFirst />;
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const made = await api<GatheringInvite>("/gatherings", {
        kind: "wedding",
        ...form,
        rundown: rundown.filter((r) => r.time && r.title),
        vendors: vendors.filter((v) => v.role && v.name),
      });
      window.location.assign(`/m/${made.id}/guests`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <HostShell>
      <h1>Moments</h1>
      {list && list.length > 0 && (
        <ul className="moments-list" aria-label="Your moments">
          {list.map((g) => (
            <li key={g.id}>
              <a href={g.host ? `/m/${g.id}/guests` : `/m/${g.id}`}>
                <strong>{g.title}</strong>
                <span>
                  {longDate(g.date, "en-GB")} · {g.place}
                  {g.host ? " · you host" : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <form className="moments-form" onSubmit={create} aria-label="New wedding invite">
        <h2>New wedding invite</h2>
        <label>
          Names on the invite
          <input {...field("title")} placeholder="Dina & Raka" maxLength={80} required />
        </label>
        <label>
          Line under the names
          <input
            {...field("hosts")}
            placeholder="Putri dari Bpk. Ahmad & Ibu Sari"
            maxLength={160}
          />
        </label>
        <label>
          Date
          <input {...field("date")} type="date" required />
        </label>
        <label>
          Place
          <input {...field("place")} placeholder="Gedung Sate" maxLength={120} required />
        </label>
        <label>
          Address
          <input {...field("address")} maxLength={240} />
        </label>
        <label>
          A note for guests
          <textarea {...field("note")} maxLength={600} />
        </label>
        <fieldset>
          <legend>Rundown</legend>
          {rundown.map((r, i) => (
            <div className="moments-row" key={i}>
              <input
                type="time"
                aria-label={`Time ${i + 1}`}
                value={r.time}
                onChange={(e) =>
                  setRundown(rundown.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))
                }
              />
              <input
                aria-label={`What happens ${i + 1}`}
                placeholder="Akad"
                maxLength={60}
                value={r.title}
                onChange={(e) =>
                  setRundown(rundown.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                }
              />
            </div>
          ))}
          {rundown.length < 20 && (
            <button type="button" onClick={() => setRundown([...rundown, { ...blankRow }])}>
              Add a time
            </button>
          )}
        </fieldset>
        <fieldset>
          <legend>Vendors</legend>
          {vendors.map((v, i) => (
            <div className="moments-row" key={i}>
              <input
                aria-label={`Vendor role ${i + 1}`}
                placeholder="Photographer"
                maxLength={40}
                value={v.role}
                onChange={(e) =>
                  setVendors(vendors.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))
                }
              />
              <input
                aria-label={`Vendor name ${i + 1}`}
                placeholder="Lensa Kita"
                maxLength={60}
                value={v.name}
                onChange={(e) =>
                  setVendors(vendors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
            </div>
          ))}
          {vendors.length < 20 && (
            <button type="button" onClick={() => setVendors([...vendors, { ...blankVendor }])}>
              Add a vendor
            </button>
          )}
        </fieldset>
        {error && (
          <p className="invite-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Making…" : "Make the invite"}
        </button>
      </form>
    </HostShell>
  );
}

/** The host's page: the link to send, the head count and every answer. */
export function GuestList({ id }: { id: string }) {
  const signedIn = useSignedIn();
  const [view, setView] = useState<GatheringGuestList | null | "missing">(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (signedIn)
      api<GatheringGuestList>(`/gatherings/${encodeURIComponent(id)}/guests`)
        .then(setView)
        .catch(() => setView("missing"));
  }, [signedIn, id]);
  if (signedIn === false) return <SignInFirst />;
  if (view === "missing")
    return (
      <HostShell>
        <h1>Not available</h1>
        <p>Only the host of this moment sees its guest list.</p>
      </HostShell>
    );
  if (!view) return <HostShell>{null}</HostShell>;
  const link = inviteUrl(view.invite.id);
  const text = `${view.invite.title}\n${longDate(view.invite.date, "id-ID")} · ${view.invite.place}\n\nMohon konfirmasi kehadiran di sini: ${link}`;
  return (
    <HostShell>
      <h1>{view.invite.title}</h1>
      <p className="moments-sub">
        {longDate(view.invite.date, "en-GB")} · {view.invite.place}
      </p>
      <section className="moments-share" aria-label="Send the invite">
        <code>{link}</code>
        <div>
          <a
            className="primary"
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
          >
            Send on WhatsApp
          </a>
          <button
            onClick={() =>
              void navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={`/m/${view.invite.id}`}>Open the invite</a>
        </div>
      </section>
      <dl className="moments-totals">
        <div>
          <dt>Coming</dt>
          <dd>{view.totals.guests}</dd>
        </div>
        <div>
          <dt>Answers yes</dt>
          <dd>{view.totals.attending}</dd>
        </div>
        <div>
          <dt>Can’t come</dt>
          <dd>{view.totals.declined}</dd>
        </div>
      </dl>
      {view.rsvps.length === 0 ? (
        <p>No answers yet. Send the link to your guests.</p>
      ) : (
        <table className="moments-guests">
          <thead>
            <tr>
              <th>Name</th>
              <th>Answer</th>
              <th>People</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {view.rsvps.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.name} <small>…{r.phoneEnd}</small>
                </td>
                <td>{r.attending ? "Coming" : "Can’t come"}</td>
                <td>{r.guests || "–"}</td>
                <td>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </HostShell>
  );
}
