"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Plus, Users, X } from "lucide-react";
import type { DropClaimView, DropView, MyFanRoom } from "../../../packages/contracts/src/fans";
import { api } from "./runtime";
import { Avatar } from "./ui";

const face = (p: DropClaimView["person"]) => ({ ...p, bio: "" });
const dollars = (cents: number) => (cents ? String(cents / 100) : "");
const cents = (text: string) => Math.round((Number(text) || 0) * 100);

async function uploadPhoto(file: File) {
  const mime = file.type as "image/jpeg" | "image/png" | "image/webp";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("Use a JPEG, PNG or WebP photo.");
  if (file.size > 3_000_000) throw new Error("That photo is over 3 MB.");
  const base64 = btoa(
    Array.from(new Uint8Array(await file.arrayBuffer()), (b) => String.fromCharCode(b)).join(""),
  );
  return (await api<{ id: string }>("/assets", { name: file.name.slice(0, 120), mime, base64 })).id;
}

function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="mall-dialog-backdrop" onClick={onClose}>
      <div
        className="mall-dialog seller-sheet"
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="fan-close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{label}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** When everyone else may claim, counted from when fans can. */
const waves: [string, number | null][] = [
  ["Fans and stamp holders only", null],
  ["Everyone, at the same time", 0],
  ["Everyone, a day after fans", 24],
  ["Everyone, two days after fans", 48],
  ["Everyone, a week after fans", 168],
];

/**
 * For someone who makes drops: open or change the fan room, and put out a new drop with its
 * picture, price, how many, and when fans and everyone else can get it.
 */
export function SellerBar({
  notify,
  onChange,
}: {
  notify: (message: string) => void;
  onChange: () => void;
}) {
  const [mine, setMine] = useState<MyFanRoom | null>(null);
  const [sheet, setSheet] = useState<"room" | "drop" | null>(null);
  const load = useCallback(
    () => api<MyFanRoom>("/fans/mine").then(setMine, (e: Error) => notify(e.message)),
    [notify],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!mine) return null;
  return (
    <div className="seller-bar">
      <p>
        {mine.room ? (
          <>
            Your fan room: <strong>{mine.room.title}</strong>
          </>
        ) : (
          "Make something for the people who follow you: open a fan room, then put out a drop."
        )}
      </p>
      <span>
        <button className="mall-try" onClick={() => setSheet("room")}>
          <Users size={15} /> {mine.room ? "Change the room" : "Open a fan room"}
        </button>
        {mine.room && (
          <button className="drop-claim" onClick={() => setSheet("drop")}>
            <Plus size={15} /> New drop
          </button>
        )}
      </span>
      {sheet === "room" && (
        <RoomSheet
          mine={mine}
          notify={notify}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            void load();
            onChange();
          }}
        />
      )}
      {sheet === "drop" && (
        <DropSheet
          paid={mine.paid}
          notify={notify}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function RoomSheet({
  mine,
  notify,
  onClose,
  onDone,
}: {
  mine: MyFanRoom;
  notify: (message: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(mine.room?.title ?? "");
  const [perks, setPerks] = useState(mine.room?.perks ?? "");
  const [price, setPrice] = useState(dollars(mine.room?.price ?? 0));
  const [org, setOrg] = useState(mine.room?.stampOrgId ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet label={mine.room ? "Your fan room" : "Open a fan room"} onClose={onClose}>
      <label className="seller-field">
        Its name
        <input
          maxLength={60}
          placeholder="Long Run Club"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="seller-field">
        What fans get
        <textarea
          rows={2}
          maxLength={200}
          placeholder="Notes before anyone, first go at every drop"
          value={perks}
          onChange={(e) => setPerks(e.target.value)}
        />
      </label>
      <label className="seller-field">
        Dollars a month
        <input
          inputMode="decimal"
          placeholder="0 makes it free"
          disabled={!mine.paid}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      {!mine.paid && <p className="mall-fine">Payments are off here, so the room is free.</p>}
      <label className="seller-field">
        Proven fans hold a stamp from
        <select value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">Nobody: only room members go first</option>
          {mine.orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <footer>
        <button className="own-site-quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          className="easy-go"
          disabled={busy || title.trim().length < 2}
          onClick={() => {
            setBusy(true);
            api("/fans/room", {
              title,
              perks,
              price: mine.paid ? cents(price) : 0,
              stampOrgId: org || null,
            })
              .then(() => {
                notify(mine.room ? "Room changed." : `${title.trim()} is open.`);
                onDone();
              })
              .catch((e: Error) => notify(e.message))
              .finally(() => setBusy(false));
          }}
        >
          {mine.room ? "Save" : "Open the room"}
        </button>
      </footer>
    </Sheet>
  );
}

function DropSheet({
  paid,
  notify,
  onClose,
  onDone,
}: {
  paid: boolean;
  notify: (message: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("30");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [fansIn, setFansIn] = useState("0");
  const [wave, setWave] = useState("2");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!photo) return setPreview("");
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const many = Math.floor(Number(quantity));
  const ready = title.trim().length >= 2 && many >= 1 && many <= 10_000;
  async function make() {
    const opens = new Date(Date.now() + Number(fansIn) * 3_600_000);
    const after = waves[Number(wave)]![1];
    const assetId = photo ? await uploadPhoto(photo) : undefined;
    await api("/fans/drops", {
      title,
      note,
      price: paid ? cents(price) : 0,
      quantity: many,
      opens: opens.toISOString(),
      ...(after === null
        ? {}
        : { everyone: new Date(opens.getTime() + after * 3_600_000).toISOString() }),
      ...(assetId ? { assetId } : {}),
    });
  }
  return (
    <Sheet label="New drop" onClose={onClose}>
      <label className="seller-photo">
        {preview ? (
          <img src={preview} alt="" />
        ) : (
          <span>
            <ImagePlus size={22} aria-hidden="true" /> Add a photo of it
          </span>
        )}
        <input
          type="file"
          aria-label="Photo of the drop"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="seller-field">
        What it is
        <input
          maxLength={60}
          placeholder="Club singlet, run 02"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="seller-field">
        A line about it
        <input
          maxLength={200}
          placeholder="Thirty made. Collect at Sunday's run."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="seller-pair">
        <label className="seller-field">
          Price in dollars
          <input
            inputMode="decimal"
            placeholder="0 makes it free"
            disabled={!paid}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="seller-field">
          How many
          <input
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
      </div>
      {!paid && <p className="mall-fine">Payments are off here, so the drop is free.</p>}
      <label className="seller-field">
        Fans can get it
        <select value={fansIn} onChange={(e) => setFansIn(e.target.value)}>
          <option value="0">Now</option>
          <option value="24">Tomorrow</option>
          <option value="72">In three days</option>
          <option value="168">In a week</option>
        </select>
      </label>
      <label className="seller-field">
        Who else
        <select value={wave} onChange={(e) => setWave(e.target.value)}>
          {waves.map(([label], n) => (
            <option key={label} value={n}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <footer>
        <button className="own-site-quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          className="easy-go"
          disabled={busy || !ready}
          onClick={() => {
            setBusy(true);
            make()
              .then(() => {
                notify(`${title.trim()} is out.`);
                onDone();
              })
              .catch((e: Error) => notify(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Put it out
        </button>
      </footer>
    </Sheet>
  );
}

/** For the maker of a drop: who claimed, their number and code, and a tick once handed over. */
export function ClaimsSheet({
  drop,
  notify,
  onClose,
}: {
  drop: DropView;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const [claims, setClaims] = useState<DropClaimView[] | null>(null);
  useEffect(() => {
    api<DropClaimView[]>(`/fans/drops/${drop.id}/claims`).then(setClaims, (e: Error) =>
      notify(e.message),
    );
  }, [drop.id, notify]);
  const done = claims?.filter((c) => c.collected).length ?? 0;
  return (
    <Sheet label={`Who got ${drop.title}`} onClose={onClose}>
      <p className="mall-fine">
        {drop.claimed} of {drop.quantity} claimed
        {claims && claims.length > 0 && `, ${done} handed over`}. Tick one off when its owner has
        it.
      </p>
      {claims && !claims.length && <p className="mall-fine">Nobody yet.</p>}
      <ul className="seller-claims">
        {claims?.map((c) => (
          <li key={c.person.id}>
            <Avatar user={face(c.person)} small />
            <span>
              <strong>{c.person.name}</strong>
              <small>
                #{c.number} · <code>{c.code}</code>
              </small>
            </span>
            <label>
              <input
                type="checkbox"
                aria-label={`${c.person.name} has it`}
                checked={c.collected}
                onChange={(e) =>
                  api<DropClaimView[]>(`/fans/drops/${drop.id}/collect`, {
                    userId: c.person.id,
                    collected: e.target.checked,
                  }).then(setClaims, (err: Error) => notify(err.message))
                }
              />
              Handed over
            </label>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
