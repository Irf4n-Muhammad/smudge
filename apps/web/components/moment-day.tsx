"use client";
import { useCallback, useEffect, useState } from "react";
import { toString as qrSvg } from "qrcode";
import type {
  AlbumChapter,
  AlbumPhoto,
  GatheringAlbum,
  GatheringDoor,
  GatheringSpace,
  MemoryCard,
} from "../../../packages/contracts/src/gatherings";
import { AuthDialog, type AuthMode } from "./auth";
import { HostShell, SignInFirst, useSignedIn } from "./gathering-shell";
import { api } from "./runtime";

// The day of a moment (ADR 0038): the door QR, arriving through it, and the live album. Guests
// see Indonesian, like the invite (ADR 0036).

const passKey = (id: string) => `smudge-door:${id}`;
const readPass = (id: string) => {
  try {
    return sessionStorage.getItem(passKey(id));
  } catch {
    return null;
  }
};
const keepPass = (id: string, pass: string | null) => {
  try {
    if (pass) sessionStorage.setItem(passKey(id), pass);
    else sessionStorage.removeItem(passKey(id));
  } catch {
    // Private windows may refuse storage; the pass then lasts as long as the page.
  }
};

export type DoorState = "none" | "pass" | "expired" | "welcome";
/**
 * A scan of the door QR opens `/m/<id>?pintu=<code>`. The code is traded for a pass at once,
 * since it changes every 30 seconds; the pass waits here while the guest signs in or makes an
 * account, and then records that they came.
 */
export function useDoorPass(
  id: string,
  signedIn: boolean | null,
  onSpace: (space: GatheringSpace) => void,
) {
  const [state, setState] = useState<DoorState>("none");
  const [pass, setPass] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("pintu");
    if (!code) {
      const kept = readPass(id);
      if (kept) {
        setPass(kept);
        setState("pass");
      }
      return;
    }
    window.history.replaceState(null, "", `/m/${encodeURIComponent(id)}`);
    api<{ pass: string }>(`/public/gatherings/${encodeURIComponent(id)}/door`, { code }).then(
      (r) => {
        keepPass(id, r.pass);
        setPass(r.pass);
        setState("pass");
      },
      () => setState("expired"),
    );
  }, [id]);
  useEffect(() => {
    if (state !== "pass" || !pass || !signedIn) return;
    api<GatheringSpace>(`/gatherings/${encodeURIComponent(id)}/checkin`, { pass }).then(
      (space) => {
        keepPass(id, null);
        setState("welcome");
        onSpace(space);
      },
      () => {
        keepPass(id, null);
        setState("expired");
      },
    );
  }, [id, pass, state, signedIn, onSpace]);
  return state;
}

/** What a guest who scanned the door sees above the invite before signing in. */
export function DoorNotice({
  state,
  signedIn,
  onSignedIn,
}: {
  state: DoorState;
  signedIn: boolean | null;
  onSignedIn: () => void;
}) {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  if (state === "expired")
    return (
      <section className="invite-block door-notice" role="status">
        <p>Kode pintunya sudah berganti. Scan lagi QR di pintu masuk.</p>
      </section>
    );
  if (state !== "pass" || signedIn) return null;
  return (
    <section className="invite-block door-notice" aria-label="Sudah sampai">
      <h2>Kamu sudah sampai</h2>
      <p>Masuk atau daftar Smudge untuk mencatat kehadiranmu dan membuka album bersama.</p>
      <div className="door-actions">
        <button className="invite-send" onClick={() => setAuth("signup")}>
          Daftar
        </button>
        <button className="invite-link" onClick={() => setAuth("login")}>
          Masuk
        </button>
      </div>
      {auth && (
        <AuthDialog
          initial={auth}
          onClose={() => setAuth(null)}
          onSignedIn={() => {
            setAuth(null);
            onSignedIn();
          }}
        />
      )}
    </section>
  );
}

/** The host's phone or tablet at the entrance: a QR that changes every 30 seconds. */
export function DoorScreen({ id }: { id: string }) {
  const signedIn = useSignedIn();
  const [door, setDoor] = useState<GatheringDoor | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await api<GatheringDoor>(`/gatherings/${encodeURIComponent(id)}/door`);
        const image = await qrSvg(`${window.location.origin}${next.path}`, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!live) return;
        setDoor(next);
        setSvg(image);
        setError("");
        // Refresh at the next change, and often enough that the arrival count stays current.
        timer = setTimeout(load, Math.min(next.rotatesInMs + 250, 10_000));
      } catch (e) {
        if (!live) return;
        setError(String(e).includes("NOT_HOST") ? "host" : "retry");
        timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, signedIn]);
  if (signedIn === false) return <SignInFirst />;
  if (error === "host")
    return (
      <HostShell>
        <p>Only the host can open the door screen.</p>
      </HostShell>
    );
  return (
    <main className="door-screen">
      <h1>Scan untuk masuk</h1>
      {door ? (
        <figure
          className="door-qr"
          data-door-path={door.path}
          aria-label="Kode QR pintu masuk"
          // The SVG comes from the QR library, built from our own path; no guest text is in it.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="door-qr" aria-busy="true" />
      )}
      <p>Arahkan kamera HP ke kode ini. Kodenya berganti tiap 30 detik.</p>
      {error === "retry" && <p role="alert">Koneksi terputus, mencoba lagi…</p>}
      <p className="door-count" aria-live="polite">
        <strong>{door?.arrived ?? 0}</strong> tamu sudah datang
      </p>
      <a href={`/m/${encodeURIComponent(id)}`}>Kembali ke momen</a>
    </main>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The phone's own time for a file, used when the photo carries no camera time. */
const localTime = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const chapterTitle = (c: AlbumChapter) =>
  c.kind === "before"
    ? "Sebelum hari H"
    : c.kind === "after"
      ? "Setelah acara"
      : c.time
        ? `${c.time} · ${c.title}`
        : "Hari H";
const uploadError = (code: string) =>
  ({
    INVALID_IMAGE: "Ada file yang bukan foto (JPEG, PNG atau WebP).",
    TOO_MANY_PHOTOS: "Kamu sudah mengunggah terlalu banyak foto di momen ini.",
    ALBUM_FULL: "Album ini sudah penuh.",
    TOO_MANY_REQUESTS: "Terlalu banyak unggahan. Coba lagi sebentar lagi.",
  })[code] ?? "Ada foto yang belum terunggah. Coba lagi.";

/**
 * The live album: every member adds photos, which fall into chapters by the rundown. The host's
 * photographers come first in each chapter, then the photos people liked most.
 */
export function Album({ base, space }: { base: string; space: GatheringSpace }) {
  const [album, setAlbum] = useState<GatheringAlbum | null>(null);
  const [only, setOnly] = useState<"all" | "you">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const load = useCallback(
    () => api<GatheringAlbum>(`${base}/album`).then(setAlbum, () => {}),
    [base],
  );
  useEffect(() => {
    void load();
    // Polled while the tab is open, so photos from the room arrive during the day.
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setUploading(files.length);
    for (const file of Array.from(files)) {
      const response = await fetch(`/api${base}/photos`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "image/jpeg",
          "X-Taken-At": localTime(file.lastModified),
        },
        body: file,
      }).catch(() => null);
      if (!response?.ok) {
        const body = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
        setError(uploadError(body?.error ?? ""));
      }
      setUploading((n) => n - 1);
    }
    await load();
  }
  if (!album) return <section className="moment-panel moment-album" aria-busy="true" />;
  const chapters = album.chapters
    .map((c) => ({ ...c, photos: c.photos.filter((p) => only === "all" || p.forYou) }))
    .filter((c) => c.photos.length);
  const open = album.chapters.flatMap((c) => c.photos).find((p) => p.id === openId) ?? null;
  const name = (userId: string) => space.members.find((m) => m.id === userId)?.name ?? "";
  return (
    <section className="moment-panel moment-album" aria-label="Album">
      <AlbumStatus base={base} album={album} host={space.role === "host"} onAlbum={setAlbum} />
      <div className="album-bar">
        {album.phase !== "closed" && (
          <label className="invite-send album-add">
            Tambah foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <div className="moment-rooms" role="group" aria-label="Tampilkan">
          <button aria-pressed={only === "all"} onClick={() => setOnly("all")}>
            Semua foto
          </button>
          <button aria-pressed={only === "you"} onClick={() => setOnly("you")}>
            Foto kamu
          </button>
        </div>
      </div>
      {uploading > 0 && <p role="status">Mengunggah {uploading} foto…</p>}
      {error && (
        <p className="invite-error" role="alert">
          {error}
        </p>
      )}
      {chapters.length === 0 ? (
        <p className="moment-empty">
          {only === "you"
            ? "Belum ada foto kamu. Foto yang kamu unggah, foto yang menandai kamu, dan foto dari grup kecilmu muncul di sini."
            : "Belum ada foto. Foto dari semua tamu masuk ke sini, diurutkan sesuai susunan acara."}
        </p>
      ) : (
        chapters.map((c) => (
          <section
            key={`${c.kind}-${c.time ?? ""}`}
            className="album-chapter"
            aria-label={chapterTitle(c)}
          >
            <h3>{chapterTitle(c)}</h3>
            <ul className="album-grid">
              {c.photos.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setOpenId(p.id)} aria-label={`Foto dari ${p.by.name}`}>
                    <img src={`/api${base}/photos/${p.id}?size=s`} alt="" loading="lazy" />
                    {p.photographer && <span className="album-badge">Fotografer</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {open && (
        <PhotoViewer
          base={base}
          photo={open}
          album={album}
          space={space}
          name={name}
          onAlbum={setAlbum}
          onClose={() => setOpenId(null)}
        />
      )}
      <Wishes base={base} album={album} onAlbum={setAlbum} />
      {space.role === "host" && (
        <Photographers base={base} space={space} album={album} onAlbum={setAlbum} />
      )}
    </section>
  );
}

function PhotoViewer({
  base,
  photo,
  album,
  space,
  name,
  onAlbum,
  onClose,
}: {
  base: string;
  photo: AlbumPhoto;
  album: GatheringAlbum;
  space: GatheringSpace;
  name: (userId: string) => string;
  onAlbum: (album: GatheringAlbum) => void;
  onClose: () => void;
}) {
  const path = `${base}/photos/${photo.id}`;
  const me = space.me;
  const tagged = photo.tagged.includes(me);
  const untagged = space.members.filter((m) => !photo.tagged.includes(m.id) && m.id !== me);
  const open = album.phase !== "closed";
  const host = space.role === "host";
  const act = (to: string, body: unknown) => void api<GatheringAlbum>(to, body).then(onAlbum);
  return (
    <div className="album-viewer" role="dialog" aria-label="Foto" aria-modal="true">
      <img src={`/api${path}`} alt={`Foto dari ${photo.by.name}`} />
      <div className="album-viewer-info">
        <p>
          Foto oleh <strong>{photo.by.name}</strong>
          {photo.photographer && " · Fotografer"}
          {" · "}
          {photo.takenAt.slice(11)}
        </p>
        {photo.tagged.length > 0 && (
          <p>Bersama {photo.tagged.map(name).filter(Boolean).join(", ")}</p>
        )}
        {photo.likes !== undefined && <p>{photo.likes} orang menyukai fotomu</p>}
        <div className="door-actions">
          <button
            aria-pressed={photo.liked}
            onClick={() =>
              void api<GatheringAlbum>(`${path}/like`, { on: !photo.liked }).then(onAlbum)
            }
          >
            {photo.liked ? "Disukai" : "Suka"}
          </button>
          {open && (
            <button
              aria-pressed={tagged}
              onClick={() =>
                void api<GatheringAlbum>(`${path}/tags`, { userId: me, on: !tagged }).then(onAlbum)
              }
            >
              {tagged ? "Bukan saya" : "Ada saya"}
            </button>
          )}
          {open && photo.mine && untagged.length > 0 && (
            <select
              aria-label="Tandai teman"
              value=""
              onChange={(e) =>
                void api<GatheringAlbum>(`${path}/tags`, { userId: e.target.value, on: true }).then(
                  onAlbum,
                )
              }
            >
              <option value="">Tandai teman…</option>
              {untagged.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {(photo.mine || space.role === "host") && (
            <button
              onClick={() =>
                void api<GatheringAlbum>(path, undefined, "DELETE").then((a) => {
                  onAlbum(a);
                  onClose();
                })
              }
            >
              Hapus foto
            </button>
          )}
          {host && (
            <>
              <button
                aria-pressed={album.coverId === photo.id}
                onClick={() =>
                  act(`${base}/cover`, { photoId: album.coverId === photo.id ? null : photo.id })
                }
              >
                {album.coverId === photo.id ? "Sampul momen" : "Jadikan sampul"}
              </button>
              <button onClick={() => act(`${path}/move`, { direction: "up" })}>Geser maju</button>
              <button onClick={() => act(`${path}/move`, { direction: "down" })}>
                Geser mundur
              </button>
            </>
          )}
          <button onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

function Wishes({
  base,
  album,
  onAlbum,
}: {
  base: string;
  album: GatheringAlbum;
  onAlbum: (album: GatheringAlbum) => void;
}) {
  const [text, setText] = useState("");
  return (
    <section className="album-wishes" aria-label="Ucapan">
      <h3>Ucapan</h3>
      {album.phase !== "closed" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void api<GatheringAlbum>(`${base}/wish`, { text }).then((a) => {
              onAlbum(a);
              setText("");
            });
          }}
        >
          <textarea
            aria-label="Tulis ucapan"
            placeholder="Doa dan ucapan untuk tuan rumah"
            value={text}
            maxLength={280}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="invite-send">Kirim ucapan</button>
        </form>
      )}
      <ul>
        {album.wishes.map((w) => (
          <li key={w.from.id}>
            <strong>{w.from.name}</strong>
            <p>{w.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The host names the photographers, whose photos are credited and shown first. */
function Photographers({
  base,
  space,
  album,
  onAlbum,
}: {
  base: string;
  space: GatheringSpace;
  album: GatheringAlbum;
  onAlbum: (album: GatheringAlbum) => void;
}) {
  const set = (userId: string, on: boolean) =>
    void api<GatheringAlbum>(`${base}/photographers`, { userId, on }).then(onAlbum);
  const others = space.members.filter((m) => !album.photographers.includes(m.id));
  return (
    <section className="album-wishes" aria-label="Fotografer">
      <h3>Fotografer</h3>
      <ul>
        {album.photographers.map((id) => (
          <li key={id}>
            {space.members.find((m) => m.id === id)?.name}{" "}
            <button onClick={() => set(id, false)}>Hapus</button>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <select
          aria-label="Tambah fotografer"
          value=""
          onChange={(e) => e.target.value && set(e.target.value, true)}
        >
          <option value="">Tambah fotografer…</option>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

const longDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long" });
/**
 * Where the album stands (ADR 0039): open until three days after the day, then locked. The host
 * writes the thank-you and may lock it early; someone who came chooses whether their memory card
 * shows on their profile.
 */
function AlbumStatus({
  base,
  album,
  host,
  onAlbum,
}: {
  base: string;
  album: GatheringAlbum;
  host: boolean;
  onAlbum: (album: GatheringAlbum) => void;
}) {
  const [thanks, setThanks] = useState(album.thanks);
  const closed = album.phase === "closed";
  const close = (body: { thanks?: string; lock?: true }) =>
    void api<GatheringAlbum>(`${base}/close`, body).then(onAlbum);
  return (
    <div className="album-status">
      <p className="moment-empty">
        {closed
          ? "Album sudah dikunci. Foto-foto ini disimpan untuk yang hadir."
          : `Album terbuka sampai ${longDay(album.locksAfter)}, lalu dikunci.`}
      </p>
      {album.card && closed && (
        <label className="moment-mode">
          <input
            type="checkbox"
            checked={album.card === "shown"}
            onChange={(e) =>
              void api<GatheringAlbum>(`${base}/card`, { shown: e.target.checked }).then(onAlbum)
            }
          />
          Tampilkan kartu kenangan di profilku
        </label>
      )}
      {host && (
        <form
          className="album-closing"
          aria-label="Penutup"
          onSubmit={(e) => {
            e.preventDefault();
            close({ thanks });
          }}
        >
          <textarea
            aria-label="Ucapan terima kasih"
            placeholder="Terima kasih sudah datang dan mendoakan kami."
            value={thanks}
            maxLength={600}
            onChange={(e) => setThanks(e.target.value)}
          />
          <div className="door-actions">
            <button>Simpan ucapan terima kasih</button>
            {!closed && (
              <button type="button" onClick={() => close({ thanks, lock: true })}>
                Kunci album sekarang
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * The attendance timeline on a profile (ADR 0039): a memory card for each closed moment the
 * person came to. The profile is the app's, so this is in English like the rest of it.
 */
export function MemoryCards({ ownerId, mine }: { ownerId: string; mine: boolean }) {
  const [cards, setCards] = useState<MemoryCard[]>([]);
  useEffect(() => {
    api<MemoryCard[]>(`/users/${encodeURIComponent(ownerId)}/moments`).then(setCards, () =>
      setCards([]),
    );
  }, [ownerId]);
  if (!cards.length) return null;
  return (
    <section className="memory-cards" aria-label="Moments">
      <h2>{mine ? "Moments you were at" : "Moments they were at"}</h2>
      <ul>
        {cards.map((c) => (
          <li key={c.gatheringId}>
            <a href={`/m/${encodeURIComponent(c.gatheringId)}`}>
              {c.cover ? (
                <img
                  src={`/api/public/gatherings/${encodeURIComponent(c.gatheringId)}/cover`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="memory-card-blank" aria-hidden="true">
                  ✳
                </span>
              )}
              <strong>{c.title}</strong>
              <small>
                {new Date(`${c.date}T00:00:00`).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {c.place}
              </small>
              <small>
                {c.host ? "Hosted · " : ""}
                {c.people} came
              </small>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
