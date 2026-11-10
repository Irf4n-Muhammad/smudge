"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Clock, Lock, Package, Send, Users, X } from "lucide-react";
import type { DropView, FanPerson, FanRoomView } from "../../../packages/contracts/src/fans";
import { api } from "./runtime";
import { Avatar } from "./ui";
import { sized } from "./mall-figure";
import { ClaimsSheet, SellerBar } from "./fans-seller";

const money = (cents: number) =>
  cents
    ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`
    : "Free";
const face = (p: FanPerson) => ({ ...p, bio: "" });
/** "in 2 days", "in 3 hours", or null once it's open. */
function until(at: string) {
  const ms = Date.parse(at) - Date.now();
  if (ms <= 0) return null;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  if (hours < 36) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.round(hours / 24)} days`;
}

/** One drop: what it is, how many are left, and when the viewer can claim it. */
export function DropCard({
  drop,
  onClaim,
  onRoom,
  onClaims,
}: {
  drop: DropView;
  onClaim: (drop: DropView) => Promise<void>;
  onRoom?: (ownerId: string) => void;
  /** For the drop's maker: open the list of who claimed. */
  onClaims?: (drop: DropView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const wait = drop.opensForYou ? until(drop.opensForYou) : null;
  const soldOut = drop.left === 0;
  // One word on the picture for where the viewer stands.
  const tag = drop.mine
    ? "Your drop"
    : drop.code
      ? `Yours · #${drop.number} of ${drop.quantity}`
      : soldOut
        ? "Gone"
        : !drop.opensForYou
          ? "Fans only"
          : drop.wave === "fans"
            ? "Fans first: you're in"
            : wait
              ? "Fans first"
              : "Open to all";
  return (
    <article
      className={soldOut && !drop.code && !drop.mine ? "drop-card gone" : "drop-card"}
      aria-label={`${drop.title} by ${drop.owner.name}`}
    >
      <div className="drop-art" style={{ background: drop.color }}>
        {drop.image ? (
          <img src={sized(drop.image, 700)} alt="" loading="lazy" />
        ) : (
          <Package size={28} aria-hidden="true" />
        )}
        <span className="drop-tag">
          {tag === "Fans only" && <Lock size={12} aria-hidden="true" />}
          {tag}
        </span>
        {wait && !soldOut && !drop.code && (
          <span className="drop-count">
            <Clock size={13} aria-hidden="true" /> {wait.replace(/^in /, "")}
          </span>
        )}
      </div>
      <div className="drop-body">
        <button className="drop-owner" onClick={() => onRoom?.(drop.owner.id)}>
          <Avatar user={face(drop.owner)} small /> {drop.owner.name}
        </button>
        <h3>{drop.title}</h3>
        {drop.note && <p>{drop.note}</p>}
        <p className="drop-meta">
          <span>{drop.price ? money(drop.price) : "Free"}</span>
          <span>{soldOut ? "Sold out" : `${drop.left} of ${drop.quantity} left`}</span>
        </p>
        <span className="drop-stock" aria-hidden="true">
          <span style={{ width: `${(drop.left / drop.quantity) * 100}%` }} />
        </span>
        {drop.mine ? (
          <button className="mall-try" onClick={() => onClaims?.(drop)}>
            <Users size={15} /> {drop.claimed} claimed: see who
          </button>
        ) : drop.code ? (
          <p className="drop-claimed">
            <BadgeCheck size={16} aria-hidden="true" /> Yours. Code <code>{drop.code}</code>
          </p>
        ) : soldOut ? null : !drop.opensForYou ? (
          <p className="drop-wait">
            <Lock size={14} aria-hidden="true" /> Only for fans and stamp holders.
            {onRoom && (
              <button className="text-button" onClick={() => onRoom(drop.owner.id)}>
                See the fan room
              </button>
            )}
          </p>
        ) : wait ? (
          <p className="drop-wait">
            <Clock size={14} aria-hidden="true" /> Opens for you {wait}.
            {drop.wave === "everyone" && onRoom && (
              <button className="text-button" onClick={() => onRoom(drop.owner.id)}>
                Fans get it now
              </button>
            )}
          </p>
        ) : (
          <button
            className="drop-claim"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onClaim(drop).finally(() => setBusy(false));
            }}
          >
            {drop.price ? `Get it, ${money(drop.price)}` : "Claim it"}
          </button>
        )}
        {drop.wave === "fans" && !drop.code && !soldOut && (
          <small className="drop-presale">Presale: you&apos;re a fan or hold a stamp</small>
        )}
      </div>
    </article>
  );
}

/**
 * A creator's fan room in a sheet: what it gives, who you know in it, the join button, and for
 * fans the notes and drops. Opened from the creator's page or a drop.
 */
export function FanRoom({
  ownerId,
  notify,
  onClose,
}: {
  ownerId: string;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<FanRoomView | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<FanRoomView | null>(`/fans/${encodeURIComponent(ownerId)}`).then(setRoom, (e: Error) =>
        notify(e.message),
      ),
    [ownerId, notify],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  async function act(work: () => Promise<FanRoomView>, done?: string) {
    setBusy(true);
    try {
      setRoom(await work());
      if (done) notify(done);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // In the body: a profile page can transform or clip what sits inside it.
  return createPortal(
    <div className="fan-backdrop" onClick={onClose}>
      <section
        className="fan-room"
        role="dialog"
        aria-label={room ? room.title : "Fan room"}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="fan-close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        {room === undefined ? (
          <p className="fan-fine">Opening…</p>
        ) : room === null ? (
          <p className="fan-fine">No fan room here.</p>
        ) : (
          <>
            <header className="fan-head">
              <Avatar user={face(room.owner)} />
              <div>
                <small>{room.owner.name}&apos;s fan room</small>
                <h2>{room.title}</h2>
              </div>
            </header>
            {room.perks && <p className="fan-perks">{room.perks}</p>}
            <p className="fan-fine">
              {room.fans} {room.fans === 1 ? "fan" : "fans"}
              {room.friends.length > 0 &&
                `, ${room.friends.map((f) => f.name.split(" ")[0]).join(", ")} ${room.friends.length === 1 ? "is" : "are"} in`}
              {room.stampOrg && ` · Proven fans hold a stamp from ${room.stampOrg.name}`}
            </p>
            {room.proven && (
              <p className="fan-proven">
                <BadgeCheck size={15} aria-hidden="true" /> You hold their stamp: drops open for you
                first.
              </p>
            )}
            {room.mine ? null : room.member ? (
              <p className="fan-fine">
                You&apos;re in until{" "}
                {new Date(room.until!).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
                .{" "}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => api<FanRoomView>(`/fans/${ownerId}/leave`, {}),
                      "You left the room.",
                    )
                  }
                >
                  Leave
                </button>
              </p>
            ) : (
              <button
                className="fan-join"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api<FanRoomView>(`/fans/${ownerId}/join`, {}),
                    `You're in ${room.title}.`,
                  )
                }
              >
                Join, {room.price ? `${money(room.price)} a month` : "free"}
              </button>
            )}
            {!room.mine && !room.member && room.price > 0 && (
              <small className="fan-fine">Test mode: no money moves yet.</small>
            )}
            {room.drops.length > 0 && (
              <div className="fan-drops">
                {room.drops.map((d) => (
                  <DropCard
                    key={d.id}
                    drop={d}
                    onClaim={async (drop) => {
                      await api(`/fans/drops/${drop.id}/claim`, {});
                      notify(`${drop.title} is yours.`);
                      await load();
                    }}
                  />
                ))}
              </div>
            )}
            {(room.member || room.mine) && (
              <div className="fan-notes" aria-label="Fan notes">
                <form
                  className="fan-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!text.trim()) return;
                    void act(() => api<FanRoomView>(`/fans/${ownerId}/notes`, { text })).then(() =>
                      setText(""),
                    );
                  }}
                >
                  <input
                    aria-label="Write to the room"
                    placeholder="Write to the room"
                    maxLength={500}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button aria-label="Send" disabled={busy || !text.trim()}>
                    <Send size={16} />
                  </button>
                </form>
                {room.notes.map((n) => (
                  <div key={n.id} className={n.byOwner ? "fan-note owner" : "fan-note"}>
                    <Avatar user={face(n.author)} small />
                    <div>
                      <strong>
                        {n.author.name}
                        {n.proven && (
                          <BadgeCheck
                            size={13}
                            aria-label="Holds their stamp"
                            className="fan-badge"
                          />
                        )}
                      </strong>
                      <p>{n.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!room.member && !room.mine && (
              <p className="fan-fine">
                <Lock size={13} aria-hidden="true" /> Notes in the room are for fans.
              </p>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}

/** The Mall's Drops: what creators you follow or back are releasing, presale first. */
export function DropsList({ notify }: { notify: (message: string) => void }) {
  const [drops, setDrops] = useState<DropView[] | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [claims, setClaims] = useState<DropView | null>(null);
  const load = useCallback(
    () => api<DropView[]>("/fans/drops").then(setDrops, (e: Error) => notify(e.message)),
    [notify],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!drops) return <p className="mall-empty">Opening drops…</p>;
  // What you can still get comes first; what sold out stays below, as a record.
  const live = drops.filter((d) => d.left > 0 || d.code || d.mine);
  const gone = drops.filter((d) => d.left === 0 && !d.code && !d.mine);
  const claim = async (drop: DropView) => {
    try {
      await api(`/fans/drops/${drop.id}/claim`, {});
      notify(`${drop.title} is yours.`);
    } catch (e) {
      notify((e as Error).message);
    }
    await load();
  };
  return (
    <div className="drops">
      <p className="drops-about">
        Small runs from people you follow. Their fans go first, then everyone, until it&apos;s gone.
      </p>
      <SellerBar notify={notify} onChange={() => void load()} />
      {!drops.length && <p className="mall-empty">No drops from people you follow yet.</p>}
      {[live, gone].map(
        (list, n) =>
          list.length > 0 && (
            <section key={n} aria-label={n ? "Gone" : "Drops now"}>
              {n > 0 && <h2 className="drops-head">Gone</h2>}
              <div className="drops-grid">
                {list.map((d) => (
                  <DropCard
                    key={d.id}
                    drop={d}
                    onRoom={setRoom}
                    onClaim={claim}
                    onClaims={setClaims}
                  />
                ))}
              </div>
            </section>
          ),
      )}
      {room && (
        <FanRoom
          ownerId={room}
          notify={notify}
          onClose={() => {
            setRoom(null);
            void load();
          }}
        />
      )}
      {claims && <ClaimsSheet drop={claims} notify={notify} onClose={() => setClaims(null)} />}
    </div>
  );
}
