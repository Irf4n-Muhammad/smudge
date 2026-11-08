import type { Store } from "../../packages/core/src/database.js";
import type { OrgService } from "../../packages/core/src/orgs.js";
import type { OprecService } from "../../packages/core/src/oprec.js";
import type { OrgEventsService } from "../../packages/core/src/org-events.js";

/**
 * Teater Senja as an account people follow: a recruitment with two divisions already filled,
 * an opening night with free tickets, posts that carry both into the feed, Alex and Inès
 * following it, and a few things said in the divisions while Maya was away.
 */
export function seedOrgFeed(
  store: Store,
  orgs: OrgService,
  oprecs: OprecService,
  events: OrgEventsService,
  now: Date,
) {
  if (store.get("system", "seed-org-feed-v1")) return;
  const maya = { userId: "maya" };
  const org = "teater-senja";
  const term = "teater-senja-2025";
  // Older demo data may have moved on: Maya handed it over, the term got locked, or a
  // recruitment is already open. Then this leaves it alone rather than stop the server.
  const done = () =>
    store.transaction(() => store.put("system", "seed-org-feed-v1", { skipped: true }));
  const open = store.get<{ locked: boolean }>("term", term);
  if (!open || open.locked || !store.get("user", "maya")) return done();
  try {
    orgs.requireAdmin(maya, org);
  } catch {
    return done();
  }
  if (oprecs.current(org)) return done();
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

  const oprec = oprecs.create(maya, org, {
    title: "Crew for Paper House",
    roles: ["Costume", "Lighting", "Stage crew"],
    questions: ["Which evenings can you do?"],
    closes: day(14),
  });
  for (const [userId, role] of [
    ["dani", "Costume"],
    ["leo", "Stage crew"],
  ] as const)
    if (store.get("user", userId)) {
      const app = oprecs.apply({ userId }, org, oprec.id, { role, answers: ["Weekdays"] });
      oprecs.decide(maya, org, oprec.id, app.id, { accept: true });
    }

  const { stamp } = orgs.createEvent(maya, org, { name: "Paper House, opening night" });
  const opening = new Date(now.getTime() + 10 * 86_400_000);
  opening.setUTCHours(12, 0, 0, 0);
  events.setTickets(maya, org, stamp.id, {
    when: opening.toISOString(),
    place: "Hall B, Lembayung campus",
    capacity: 80,
    firstWave: ago(48),
    everyone: ago(24),
  });

  orgs.submitPost(maya, org, {
    text: "Rehearsal photos are up on the page. Act 2 is finally coming together.",
  });
  orgs.submitPost(maya, org, {
    text: "We need hands for Paper House: costume, lighting, stage crew. Apply right here, your profile goes with it.",
    attach: { kind: "oprec" },
  });
  orgs.submitPost(maya, org, {
    text: "Opening night is set. Free tickets, 80 seats. Get yours before they're gone.",
    attach: { kind: "tickets", event: stamp.id },
  });
  for (const userId of ["you", "ines"]) if (store.get("user", userId)) orgs.follow({ userId }, org);

  store.transaction(() => {
    const posts: [string, string, string | null, string, number][] = [
      ["seed-d1", "dani", "costume", "Fabric for the act 2 dresses came in. Fitting Thursday?", 6],
      ["seed-d2", "leo", "stage-crew", "Set pieces go up Saturday morning, 9am sharp.", 5],
      ["seed-d3", "leo", null, "@mayainframes can we move Thursday's rehearsal to 5pm?", 3],
      ["seed-d4", "dani", null, "Costume sizes due Friday, I still miss four people.", 2],
    ];
    for (const [id, userId, room, text, hours] of posts)
      store.put("room-post", id, {
        id,
        termId: term,
        userId,
        kind: "message",
        text,
        ...(room ? { room } : {}),
        createdAt: ago(hours),
      });
    // Maya last opened the room half a day ago, so she has something to catch up on.
    store.put("room-last", `${term}:maya`, { at: ago(12) });
    store.put("system", "seed-org-feed-v1", { at: now.toISOString() });
  });
}
