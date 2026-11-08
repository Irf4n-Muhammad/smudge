import { randomUUID } from "node:crypto";
import type { IdentityService } from "../../packages/core/src/identity.js";
import type { SocialService } from "../../packages/core/src/social.js";
import type { Chapter } from "../../packages/contracts/src/identity.js";

const media = {
  coast: "10000000-0000-4000-8000-000000000001",
  lake: "10000000-0000-4000-8000-000000000002",
  forest: "10000000-0000-4000-8000-000000000003",
};

/** Synthetic chapters, decoration choices and one public graduation moment. Runs once. */
export function seedIdentity(identity: IdentityService, social: SocialService) {
  seedChapters(identity, social);
  seedTripTheme(social);
}
function seedChapters(identity: IdentityService, social: SocialService) {
  const store = social.store;
  if (store.get("system", "seed-identity-v1")) return;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const chapter = (value: Omit<Chapter, "id" | "createdAt">): Chapter => ({
    ...value,
    id: randomUUID(),
    createdAt: daysAgo(30),
  });
  const leoGrad = chapter({
    ownerId: "leo",
    kind: "education",
    label: "Graduate, Lembayung University",
    orgId: "lembayung",
    from: 2022,
    to: 2026,
    method: "email",
    audience: "public",
  });
  store.transaction(() => {
    for (const id of ["you", "maya", "leo", "ines"])
      store.put("prefs", id, { ...(store.get<object>("prefs", id) ?? {}), country: "ID" });
    store.put("prefs", "maya", { country: "ID", base: { id: "cat-peek", since: daysAgo(40) } });
    store.put("prefs", "ines", { country: "ID", base: { id: "vines", since: daysAgo(10) } });
    store.put("prefs", "leo", { country: "ID", base: { id: "stage-lights", since: daysAgo(70) } });
    for (const c of [
      leoGrad,
      chapter({
        ownerId: "leo",
        kind: "title",
        label: "Best Short Film, Lembayung Film Festival 2025",
        orgId: "film-fest",
        from: 2025,
        method: "invite",
        audience: "public",
      }),
      chapter({
        ownerId: "maya",
        kind: "member",
        label: "Member, Teater Senja",
        orgId: "teater-senja",
        from: 2021,
        to: "now",
        method: "invite",
        audience: "public",
      }),
    ])
      store.put("chapter", c.id, c);
  });
  identity.createMoment(
    { userId: "leo" },
    {
      kind: "graduation",
      chapterId: leoGrad.id,
      title: "Finally graduated.",
      story: "Four years at Lembayung, one page. Thank you for walking it with me.",
      coverAssetId: media.lake,
      sections: [
        {
          heading: "First day",
          text: "Walked to campus, got lost in the engineering building, knew nobody.",
          assetId: media.forest,
          note: "2022",
        },
        {
          heading: "Final cut",
          text: "Third coffee, last export at 3 a.m., then relief.",
          assetId: media.coast,
          note: "2026",
        },
      ],
      thanks: "Mum, Dad, Film 22, and the coffee stall that stayed open till dawn.",
      paper: {
        title: "Remembered Colours: Small-Town Palettes in Family Archives",
        abstract: "Twelve hundred family photos from three small towns, read decade by decade.",
        body: "We sampled 1,200 photographs from family archives in three small towns.\n\nEach decade has a palette that survives in memory longer than in the prints themselves.",
      },
      audience: "public",
    },
  );
  store.transaction(() =>
    store.put("system", "seed-identity-v1", { at: new Date().toISOString() }),
  );
}

/**
 * Inès proved a trip to France and wears the Paris event theme (ADR 0022), so the demo shows a
 * theme opened by proof. Runs once, and never replaces a theme she picked herself.
 */
function seedTripTheme(social: SocialService) {
  const store = social.store;
  if (store.get("system", "seed-trip-theme-v1") || !store.get("user", "ines")) return;
  const prefs = store.get<{ base?: { id: string | null } }>("prefs", "ines") ?? {};
  store.transaction(() => {
    const trip: Chapter = {
      id: randomUUID(),
      ownerId: "ines",
      kind: "travel",
      label: "Been to France",
      country: "FR",
      from: new Date().getUTCFullYear(),
      method: "photo-location",
      audience: "public",
      createdAt: new Date().toISOString(),
    };
    store.put("chapter", trip.id, trip);
    if (!prefs.base || prefs.base.id === "vines")
      store.put("prefs", "ines", {
        ...prefs,
        base: { id: "paris", since: new Date().toISOString() },
      });
    store.put("system", "seed-trip-theme-v1", { at: new Date().toISOString() });
  });
}

/** Teater Senja has run for years: last term locked, this one open, Maya running it. */
export function seedOrgTerms(social: SocialService) {
  const store = social.store;
  if (store.get("system", "seed-org-terms-v1") || !store.get("user", "maya")) return;
  const at = new Date().toISOString();
  store.transaction(() => {
    for (const [label, from, to, locked] of [
      ["2024/25", 2024, 2025, true],
      ["2025/26", 2025, 2026, false],
    ] as const)
      store.put("term", `teater-senja-${from}`, {
        id: `teater-senja-${from}`,
        orgId: "teater-senja",
        label,
        from,
        to,
        locked,
        createdBy: "maya",
        createdAt: at,
      });
    store.put("system", "seed-org-terms-v1", { at });
  });
}

/** Teater Senja's current room, so the demo has a schedule, an announcement and people talking. */
export function seedOrgRooms(social: SocialService) {
  const store = social.store;
  if (store.get("system", "seed-org-rooms-v1") || !store.get("term", "teater-senja-2025")) return;
  const now = Date.now();
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const day = (days: number) => new Date(now + days * 86_400_000).toISOString().slice(0, 10);
  const term = "teater-senja-2025";
  store.transaction(() => {
    for (const ownerId of ["leo", "dani"])
      store.put("chapter", `seed-ts-member-${ownerId}`, {
        id: `seed-ts-member-${ownerId}`,
        ownerId,
        kind: "member",
        label: "Member, Teater Senja 2025/26",
        orgId: "teater-senja",
        from: 2025,
        to: 2026,
        method: "invite",
        audience: "circle",
        createdAt: ago(200),
      });
    store.put("room-state", term, {
      items: [
        {
          id: "seed-s1",
          kind: "schedule",
          text: "Weekly rehearsal, Hall B, 4pm",
          when: day(2),
          by: "maya",
          at: ago(30),
        },
        {
          id: "seed-s2",
          kind: "decision",
          text: "End-of-year show: \u201cPaper House\u201d. Final.",
          by: "maya",
          at: ago(20),
        },
        {
          id: "seed-s3",
          kind: "deadline",
          text: "Costume sizes to Dani",
          when: day(5),
          by: "maya",
          at: ago(10),
        },
      ],
    });
    const posts: [string, string, "announcement" | "message", string, number][] = [
      [
        "seed-p1",
        "maya",
        "announcement",
        "The Paper House script is shared. Read act 1 before Thursday's rehearsal.",
        26,
      ],
      ["seed-p2", "leo", "message", "Act 1 from the revised draft or the old one?", 25],
      ["seed-p3", "maya", "message", "Revised. We dropped the old one.", 24],
      [
        "seed-p4",
        "dani",
        "message",
        "I'm taking costume sizes. Send them to me before the deadline.",
        9,
      ],
    ];
    for (const [id, userId, kind, text, hours] of posts)
      store.put("room-post", id, { id, termId: term, userId, kind, text, createdAt: ago(hours) });
    store.put("system", "seed-org-rooms-v1", { at: ago(0) });
  });
}

/** Teater Senja's company this term, public on their pages, so its page has a cast list. */
export function seedOrgCompany(social: SocialService) {
  const store = social.store;
  if (store.get("system", "seed-org-company-v1") || !store.get("term", "teater-senja-2025")) return;
  const at = new Date().toISOString();
  store.transaction(() => {
    for (const [ownerId, role] of [
      ["maya", "Director"],
      ["dani", "Stage manager"],
      ["leo", "Ensemble"],
    ] as const)
      store.put("chapter", `seed-ts-title-${ownerId}`, {
        id: `seed-ts-title-${ownerId}`,
        ownerId,
        kind: "title",
        label: `${role}, Teater Senja 2025/26`,
        orgId: "teater-senja",
        from: 2025,
        to: 2026,
        method: "invite",
        audience: "public",
        createdAt: at,
      });
    store.put("system", "seed-org-company-v1", { at });
  });
}

/** Last season's room, finished: Dani was in it with Maya, and they still talk about it. */
export function seedOrgPastTerm(social: SocialService) {
  const store = social.store;
  if (store.get("system", "seed-org-past-term-v1") || !store.get("term", "teater-senja-2024"))
    return;
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const term = "teater-senja-2024";
  store.transaction(() => {
    store.put("chapter", "seed-ts-2024-dani", {
      id: "seed-ts-2024-dani",
      ownerId: "dani",
      kind: "title",
      label: "Lighting, Teater Senja 2024/25",
      orgId: "teater-senja",
      from: 2024,
      to: 2025,
      method: "invite",
      audience: "public",
      createdAt: ago(300),
    });
    const posts: [string, string, "announcement" | "message", string, number][] = [
      ["seed-q1", "maya", "announcement", "Closing night is sold out. Thank you, everyone.", 130],
      ["seed-q2", "dani", "message", "The blackout in act 2 finally worked 😭", 129],
      ["seed-q3", "maya", "message", "Best cue of the year. Dinner after strike?", 129],
    ];
    for (const [id, userId, kind, text, days] of posts)
      store.put("room-post", id, { id, termId: term, userId, kind, text, createdAt: ago(days) });
    store.put("system", "seed-org-past-term-v1", { at: ago(0) });
  });
}
