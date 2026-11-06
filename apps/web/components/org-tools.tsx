"use client";
import { useEffect, useRef, useState } from "react";
import { toString as qrSvg } from "qrcode";
import { CalendarPlus, X } from "lucide-react";
import { api } from "./runtime";
import { signedInOrSignIn } from "./return-path";
import type { Yearbook } from "../../../packages/contracts/src/org-rooms";

/** One event's tickets as the server shows them to this viewer. */
export interface TicketView {
  id: string;
  name: string;
  when: string;
  place: string;
  capacity: number;
  left: number;
  waiting: number;
  firstWave: string;
  everyone: string | null;
  over: boolean;
  opensForYou: string | null;
  yourWave: "presale" | "first" | "everyone" | null;
  price: number;
  currency: string | null;
  presale: { opens: string; minStamps: number } | null;
  hunt: { spots: number; found: number; done: boolean } | null;
  mine: {
    status: "going" | "waiting" | "held";
    place?: number;
    heldUntil?: string;
    paid?: { amount: number; currency: string };
    arrivedAt?: string;
  } | null;
}
/** "$15.00", in the viewer's own way of writing money. */
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);
const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const said: Record<string, string> = {
  TICKETS_NOT_OPEN: "Tickets aren’t open for you yet.",
  EVENT_OVER: "This one already happened.",
  NO_TICKET: "You don’t have a ticket for this one.",
  DOOR_CODE_EXPIRED: "That door code changed. Scan the QR at the door again.",
  ALREADY_ARRIVED: "You’re already in, so the ticket stays yours.",
  CAPACITY_BELOW_TAKEN: "More people already have tickets than that.",
  SLOW_MODE: "Slow mode is on. Wait a moment before your next message.",
  MUTED: "An admin paused your messages in this room.",
  SOLD_OUT: "Sold out.",
  NO_HOLD: "Your seat wasn’t held anymore. Try again.",
  PAYMENTS_OFF: "Paid tickets aren’t switched on yet.",
  CURRENCY_REQUIRED: "Pick a currency for the price.",
  REFUND_BY_ORGANISER: "Paid tickets go back through the organiser.",
  SWAP_SELF: "That’s your own code.",
  SWAP_CODE_EXPIRED: "That code changed. Scan their QR again.",
  HUNT_SPOT_UNKNOWN: "That isn’t one of this hunt’s spots.",
};
/** A friendly line for a server error code, or the message as it came. */
export const plain = (e: unknown) => {
  const message = (e as Error).message ?? String(e);
  return said[message.split(" ")[0]!] ?? message;
};
export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
/** `datetime-local` wants local time without a zone. */
const localInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A calendar file for one thing, made on the phone itself; nothing about it leaves the page. */
export function CalendarLink({
  title,
  start,
  allDay,
  place,
}: {
  title: string;
  start: string;
  allDay?: boolean;
  place?: string;
}) {
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, " ");
  const when = allDay
    ? `DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`
    : `DTSTART:${stamp(new Date(start))}\r\nDTEND:${stamp(new Date(Date.parse(start) + 2 * 3_600_000))}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smudge//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(new Date(start))}-${title.length}@smudge`,
    `DTSTAMP:${stamp(new Date())}`,
    when,
    `SUMMARY:${esc(title)}`,
    ...(place ? [`LOCATION:${esc(place)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return (
    <a
      className="op-cal"
      href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
      download={`${title.slice(0, 40).replace(/[^\w -]/g, "")}.ics`}
      onClick={(e) => e.stopPropagation()}
    >
      <CalendarPlus size={13} aria-hidden="true" /> Add to calendar
    </a>
  );
}

/** The public page's tickets: what's coming, who can claim now, and your own ticket. */
export function TicketsSection({
  orgId,
  tickets,
  onChange,
  notify,
}: {
  orgId: string;
  tickets: TicketView[];
  onChange: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [swapping, setSwapping] = useState<TicketView | null>(null);
  if (tickets.length === 0) return null;
  const act = async (t: TicketView, what: "claim" | "release" | "pay") => {
    if (!(await signedInOrSignIn())) return;
    try {
      const next = await api<TicketView>(
        `/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(t.id)}/${what}`,
        {},
      );
      notify(
        what === "release"
          ? t.price
            ? "Seat given back."
            : "Ticket given back. The next person in line gets it."
          : next.mine?.status === "held"
            ? `Your seat is held until ${clockTime(next.mine.heldUntil!)}. Pay to keep it.`
            : next.mine?.status === "going"
              ? `You’re going to ${t.name}. Scan the QR at the door when you get there.`
              : `It’s full, so you’re number ${next.mine?.place ?? "?"} in line.`,
      );
      await onChange();
    } catch (e) {
      notify(plain(e));
    }
  };
  const now = new Date().toISOString();
  const waves = (t: TicketView) =>
    t.yourWave === "presale"
      ? "You’re in the presale"
      : t.yourWave === "first"
        ? "You’re in the first wave"
        : [
            t.presale ? `Fans with ${t.presale.minStamps}+ stamps first` : "Members first",
            t.everyone ? `everyone from ${dayTime(t.everyone)}` : "members only",
          ].join(", ");
  return (
    <section className="op-bill" aria-label="Tickets">
      <h2>Tickets</h2>
      <ul className="op-tickets">
        {tickets.map((t) => {
          const open = !!t.opensForYou && t.opensForYou <= now;
          return (
            <li key={t.id}>
              <div>
                <small>
                  {dayTime(t.when).toUpperCase()} · {t.place.toUpperCase()}
                </small>
                <b>{t.name}</b>
                <span>
                  {t.left > 0
                    ? `${t.left} of ${t.capacity} left`
                    : `Full${t.waiting ? `, ${t.waiting} in line` : ""}`}
                  {t.price && t.currency ? ` · ${money(t.price, t.currency)}` : " · Free"}
                  {" · "}
                  {waves(t)}
                </span>
              </div>
              {t.mine ? (
                <div className="op-ticket-mine">
                  <em>
                    {t.mine.arrivedAt
                      ? "You’re in"
                      : t.mine.status === "going"
                        ? "You’re going"
                        : t.mine.status === "held"
                          ? `Held until ${clockTime(t.mine.heldUntil!)}`
                          : `Number ${t.mine.place} in line`}
                  </em>
                  {t.mine.status === "held" && t.currency && (
                    <button className="op-claim" onClick={() => void act(t, "pay")}>
                      Pay {money(t.price, t.currency)}
                    </button>
                  )}
                  {!t.mine.arrivedAt && !t.mine.paid && (
                    <button className="op-link" onClick={() => void act(t, "release")}>
                      Give it back
                    </button>
                  )}
                  {t.mine.status === "going" && (
                    <>
                      <CalendarLink title={t.name} start={t.when} place={t.place} />
                      <button className="op-link" onClick={() => setSwapping(t)}>
                        My QR to swap
                      </button>
                    </>
                  )}
                  {t.hunt && t.mine.status === "going" && (
                    <small className="op-hunt-progress">
                      {t.hunt.done
                        ? "Hunt: found them all"
                        : `Hunt: ${t.hunt.found} of ${t.hunt.spots} found`}
                    </small>
                  )}
                </div>
              ) : open || t.yourWave === null ? (
                <button className="op-claim" onClick={() => void act(t, "claim")}>
                  {t.price && t.currency
                    ? t.left > 0
                      ? `Get a ticket · ${money(t.price, t.currency)}`
                      : "Sold out"
                    : t.left > 0
                      ? "Get a free ticket"
                      : "Join the line"}
                </button>
              ) : (
                <small className="op-opens">
                  {t.opensForYou ? `Opens for you ${dayTime(t.opensForYou)}` : "Members only"}
                </small>
              )}
            </li>
          );
        })}
      </ul>
      {swapping && <SwapOverlay orgId={orgId} event={swapping} onClose={() => setSwapping(null)} />}
    </section>
  );
}

/** A QR that changes every 30 seconds, drawn from a path the server gives. */
function useRotatingQr(path: string, onTick?: (data: Record<string, unknown>) => void) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const tick = useRef(onTick);
  tick.current = onTick;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const data = await api<{ path: string; rotatesInMs: number } & Record<string, unknown>>(
          path,
        );
        const image = await qrSvg(`${window.location.origin}${data.path}`, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!live) return;
        setSvg(image);
        setError("");
        tick.current?.(data);
        timer = setTimeout(load, Math.min(data.rotatesInMs + 250, 10_000));
      } catch (e) {
        if (!live) return;
        setError(plain(e));
        timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [path]);
  return { svg, error };
}

/** Your own QR at an event: someone who scans it remembers they met you there, and you them. */
function SwapOverlay({
  orgId,
  event,
  onClose,
}: {
  orgId: string;
  event: TicketView;
  onClose: () => void;
}) {
  const { svg, error } = useRotatingQr(
    `/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(event.id)}/swap`,
  );
  return (
    <div className="op-door" role="dialog" aria-label="Swap">
      <button className="op-round op-door-close" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </button>
      <small>SWAP · {event.name.toUpperCase()}</small>
      <h2>Met someone?</h2>
      <QrFigure svg={svg} label="Your swap QR code" />
      <p>
        Let them scan this with their phone. You’ll both keep that you met at {event.name}. Only the
        two of you see it.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function QrFigure({ svg, label }: { svg: string; label: string }) {
  return svg ? (
    <figure
      className="op-door-qr"
      aria-label={label}
      // The SVG comes from the QR library, built from our own path.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <div className="op-door-qr" aria-busy="true" />
  );
}

/** The Hunt: the admin names spots around the venue and prints a QR for each. */
export function HuntEditor({
  orgId,
  eventId,
  notify,
}: {
  orgId: string;
  eventId: string;
  notify: (s: string) => void;
}) {
  const base = `/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(eventId)}/hunt`;
  const [spots, setSpots] = useState("");
  const [sheet, setSheet] = useState<{ event: string; spots: { name: string; path: string }[] }>();
  const [printing, setPrinting] = useState<{ name: string; svg: string }[] | null>(null);
  useEffect(() => {
    void api<{ event: string; spots: { name: string; path: string }[] }>(base)
      .then((s) => {
        setSheet(s);
        setSpots(s.spots.map((x) => x.name).join("\n"));
      })
      .catch(() => undefined);
  }, [base]);
  const print = async () => {
    if (!sheet) return;
    setPrinting(
      await Promise.all(
        sheet.spots.map(async (x) => ({
          name: x.name,
          svg: await qrSvg(`${window.location.origin}${x.path}`, { type: "svg", margin: 1 }),
        })),
      ),
    );
  };
  return (
    <form
      className="op-panel-form op-ticket-setup"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setSheet(
            await api(
              base,
              {
                spots: spots
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
              },
              "PUT",
            ),
          );
          notify("The hunt is set. Print the QRs and hide them.");
        } catch (err) {
          notify(plain(err));
        }
      }}
    >
      <label>
        Spots to hide, one per line <small>(2 to 12)</small>
        <textarea
          rows={4}
          required
          value={spots}
          placeholder={"Stage door\nMerch table\nPhoto wall"}
          onChange={(e) => setSpots(e.target.value)}
        />
      </label>
      <div className="op-list-actions">
        <button className="op-ink">Save the hunt</button>
        {sheet && sheet.spots.length > 0 && (
          <button type="button" className="op-plain" onClick={() => void print()}>
            Print the QRs
          </button>
        )}
      </div>
      {printing && (
        <div className="op-door op-hunt-sheet" role="dialog" aria-label="Hunt sheet">
          <button
            type="button"
            className="op-round op-door-close"
            aria-label="Close"
            onClick={() => setPrinting(null)}
          >
            <X size={16} />
          </button>
          <h2>The Hunt · {sheet?.event}</h2>
          <div className="op-hunt-grid">
            {printing.map((x) => (
              <figure key={x.name}>
                <div dangerouslySetInnerHTML={{ __html: x.svg }} />
                <figcaption>{x.name}</figcaption>
              </figure>
            ))}
          </div>
          <button type="button" className="op-ink" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}
    </form>
  );
}

/** The admin sets an event's date, place, seats and waves. */
export function TicketSetup({
  orgId,
  eventId,
  tickets,
  onDone,
  notify,
}: {
  orgId: string;
  eventId: string;
  tickets: TicketView | null;
  onDone: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [when, setWhen] = useState(localInput(tickets?.when));
  const [place, setPlace] = useState(tickets?.place ?? "");
  const [capacity, setCapacity] = useState(String(tickets?.capacity ?? 50));
  const [first, setFirst] = useState(localInput(tickets?.firstWave ?? new Date().toISOString()));
  const [everyone, setEveryone] = useState(localInput(tickets?.everyone));
  const [presale, setPresale] = useState(localInput(tickets?.presale?.opens));
  const [minStamps, setMinStamps] = useState(String(tickets?.presale?.minStamps ?? 2));
  const [price, setPrice] = useState(tickets?.price ? String(tickets.price / 100) : "");
  const [currency, setCurrency] = useState(tickets?.currency ?? "USD");
  return (
    <form
      className="op-panel-form op-ticket-setup"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(
            `/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(eventId)}/tickets`,
            {
              when: new Date(when).toISOString(),
              place,
              capacity: Number(capacity),
              firstWave: new Date(first).toISOString(),
              ...(everyone ? { everyone: new Date(everyone).toISOString() } : {}),
              ...(presale
                ? {
                    presale: {
                      opens: new Date(presale).toISOString(),
                      minStamps: Number(minStamps),
                    },
                  }
                : {}),
              ...(Number(price) > 0 ? { price: Math.round(Number(price) * 100), currency } : {}),
            },
            "PUT",
          );
          notify("Tickets are set. They show on the page.");
          await onDone();
        } catch (err) {
          notify(plain(err));
        }
      }}
    >
      <label>
        When
        <input
          type="datetime-local"
          required
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      </label>
      <label>
        Where
        <input
          required
          minLength={2}
          maxLength={80}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        />
      </label>
      <label>
        Seats
        <input
          type="number"
          min={1}
          max={5000}
          required
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </label>
      <label>
        Members and stamp holders from
        <input
          type="datetime-local"
          required
          value={first}
          onChange={(e) => setFirst(e.target.value)}
        />
      </label>
      <label>
        Everyone from <small>(leave empty for members only)</small>
        <input
          type="datetime-local"
          value={everyone}
          onChange={(e) => setEveryone(e.target.value)}
        />
      </label>
      <label>
        Presale for fans from <small>(optional, before the first wave)</small>
        <input type="datetime-local" value={presale} onChange={(e) => setPresale(e.target.value)} />
      </label>
      {presale && (
        <label>
          Stamps a fan needs for the presale
          <input
            type="number"
            min={1}
            max={50}
            value={minStamps}
            onChange={(e) => setMinStamps(e.target.value)}
          />
        </label>
      )}
      <div className="op-price">
        <label>
          Price <small>(empty for free)</small>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["USD", "EUR", "GBP", "SGD", "AUD", "IDR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <button className="op-ink">{tickets ? "Save tickets" : "Open tickets"}</button>
    </form>
  );
}

/** The door, full screen on the admin's phone: a QR that changes every 30 seconds. */
export function DoorOverlay({
  orgId,
  eventId,
  name,
  onClose,
}: {
  orgId: string;
  eventId: string;
  name: string;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState("");
  const [count, setCount] = useState<{ arrived: number; going: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const door = await api<{
          path: string;
          rotatesInMs: number;
          arrived: number;
          going: number;
        }>(`/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(eventId)}/door`);
        const image = await qrSvg(`${window.location.origin}${door.path}`, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!live) return;
        setSvg(image);
        setCount({ arrived: door.arrived, going: door.going });
        setError("");
        timer = setTimeout(load, Math.min(door.rotatesInMs + 250, 10_000));
      } catch (e) {
        if (!live) return;
        setError(plain(e));
        timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [orgId, eventId]);
  return (
    <div className="op-door" role="dialog" aria-label="Door">
      <button className="op-round op-door-close" aria-label="Close the door" onClick={onClose}>
        <X size={16} />
      </button>
      <small>THE DOOR · {name.toUpperCase()}</small>
      <h2>Scan to get in</h2>
      {svg ? (
        <figure
          className="op-door-qr"
          aria-label="Door QR code"
          // The SVG comes from the QR library, built from our own path.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="op-door-qr" aria-busy="true" />
      )}
      <p>Ticket holders scan this with their own phone. It changes every 30 seconds.</p>
      {error && <p role="alert">{error}</p>}
      {count && (
        <p className="op-door-count" aria-live="polite">
          <b>{count.arrived}</b> of {count.going} in
        </p>
      )}
    </div>
  );
}

/** What a finished term left behind, for the people who were there. */
export function YearbookCard({ book }: { book: Yearbook }) {
  return (
    <section className="op-panel op-yearbook" aria-label="Yearbook">
      <div className="op-panel-head">
        <b>Yearbook {book.label}</b>
        <small>
          {book.people.length} {book.people.length === 1 ? "PERSON" : "PEOPLE"}
        </small>
      </div>
      <p className="op-yb-counts">
        {book.counts.messages} messages · {book.counts.announcements} notes ·{" "}
        {book.counts.scheduled} on the sheet · {book.counts.decisions} decided
      </p>
      {book.firstWord && (
        <blockquote>
          <small>THE FIRST WORD</small>
          <p>
            “{book.firstWord.text}” <i>{book.firstWord.name}</i>
          </p>
        </blockquote>
      )}
      {book.decisions.length > 0 && (
        <>
          <small className="op-yb-label">WHAT WE DECIDED</small>
          <ul className="op-yb-list">
            {book.decisions.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {book.crew.length > 0 && (
        <>
          <small className="op-yb-label">WHAT WE RAN</small>
          <ul className="op-yb-list">
            {book.crew.map((c) => (
              <li key={c.event}>
                {c.event} <i>{c.people} crew</i>
              </li>
            ))}
          </ul>
        </>
      )}
      {book.people.length > 0 && (
        <>
          <small className="op-yb-label">THE COMPANY</small>
          <ul className="op-yb-people">
            {book.people.map((p) => (
              <li key={p.id}>
                <a href={`/u/${encodeURIComponent(p.handle)}`}>{p.name}</a> <i>{p.role}</i>
              </li>
            ))}
          </ul>
        </>
      )}
      {book.lastNote && (
        <blockquote>
          <small>THE LAST NOTE</small>
          <p>
            “{book.lastNote.text}” <i>{book.lastNote.name}</i>
          </p>
        </blockquote>
      )}
    </section>
  );
}
