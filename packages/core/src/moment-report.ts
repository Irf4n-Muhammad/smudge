import type { Store } from "./database.js";
import type { Gathering } from "./gatherings.js";

/** How long after the day a guest's own moment still counts toward the test (work plan, stage 5). */
const followUpDays = 30;

export interface MomentReport {
  title: string;
  date: string;
  invited?: number;
  answers: number;
  attending: number;
  heads: number;
  answeredSignedIn: number;
  members: number;
  arrived: number;
  newAccounts: number;
  uploaders: number;
  photos: number;
  wishes: number;
  ownMoments: number;
}

/**
 * The numbers the test wedding is judged by: how many guests answered, made an account, added a
 * photo, and made a moment of their own within 30 days. Counts only, never names or numbers, so
 * the report can be shared without anyone's details.
 */
export function momentReport(store: Store, gatheringId: string, invited?: number): MomentReport {
  const g = store.get<Gathering>("gathering", gatheringId);
  if (!g) throw new Error(`No moment ${gatheringId}`);
  const of = <T extends { gatheringId: string }>(kind: string) =>
    store.all<T>(kind).filter((r) => r.gatheringId === gatheringId);
  const rsvps = of<{ gatheringId: string; attending: boolean; guests: number; userId?: string }>(
    "gathering-rsvp",
  );
  const guests = new Set(
    of<{ gatheringId: string; userId: string }>("gathering-member").map((m) => m.userId),
  );
  const arrived = of<{ gatheringId: string; userId: string }>("gathering-checkin");
  const photos = of<{ gatheringId: string; ownerId: string }>("gathering-photo");
  const made = Date.parse(g.createdAt);
  const newAccounts = [...guests].filter((userId) => {
    const credential = store.get<{ createdAt: string }>("credential", userId);
    return !!credential && Date.parse(credential.createdAt) >= made;
  }).length;
  const until = Date.parse(`${g.date}T23:59:59Z`) + followUpDays * 86_400_000;
  const ownMoments = new Set(
    store
      .all<Gathering>("gathering")
      .filter(
        (other) =>
          other.id !== g.id &&
          guests.has(other.ownerId) &&
          Date.parse(other.createdAt) >= made &&
          Date.parse(other.createdAt) <= until,
      )
      .map((other) => other.ownerId),
  ).size;
  return {
    title: g.title,
    date: g.date,
    ...(invited ? { invited } : {}),
    answers: rsvps.length,
    attending: rsvps.filter((r) => r.attending).length,
    heads: rsvps.reduce((sum, r) => sum + (r.attending ? r.guests : 0), 0),
    answeredSignedIn: rsvps.filter((r) => r.userId).length,
    members: guests.size,
    arrived: arrived.length,
    newAccounts,
    uploaders: new Set(photos.map((p) => p.ownerId)).size,
    photos: photos.length,
    wishes: of("gathering-wish").length,
    ownMoments,
  };
}

const share = (part: number, whole?: number) =>
  whole ? `${part} (${Math.round((part / whole) * 100)}%)` : `${part}`;
/** The report as lines to read, each with what it is counted against. */
export function formatMomentReport(r: MomentReport) {
  return [
    `${r.title} · ${r.date}`,
    `Invitations sent: ${r.invited ?? "not given (pass --invited N)"}`,
    `Answered the RSVP: ${share(r.answers, r.invited)} of invitations; ${r.attending} coming, ${r.heads} people`,
    `Answered while signed in: ${share(r.answeredSignedIn, r.answers)} of answers`,
    `In the moment group: ${r.members} guests (the host not counted)`,
    `Came in through the door: ${share(r.arrived, r.heads)} of people coming`,
    `Made a Smudge account for it: ${share(r.newAccounts, r.members)} of guests in the group`,
    `Added a photo: ${share(r.uploaders, r.arrived)} of those who came in; ${r.photos} photos`,
    `Left a wish: ${r.wishes}`,
    `Made a moment of their own within ${followUpDays} days: ${share(r.ownMoments, r.members)} of guests in the group`,
  ];
}
