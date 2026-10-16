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
