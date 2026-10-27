import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ProfilePackage } from "../../packages/contracts/src/profile.js";
import type { ProfileService } from "../../packages/core/src/profiles.js";
import { rakaPackage, basicPackage, seedRaka } from "./raka.js";
import { smudgeProfilePackage } from "./smudge-profile.js";
import {
  applySmudgeSettings,
  defaultSmudgeSettings,
} from "../../packages/core/src/smudge-design.js";
import { photoId } from "./seed-photos.js";

const make = (name: string, file: string, height: number, assets: string[]): ProfilePackage => ({
  manifest: {
    kind: "profile",
    schemaVersion: 1,
    runtimeVersion: "web-v1",
    name,
    entrypoint: "index.html",
    height,
    assets,
    capabilities: ["profile.read", "profile.openPost"],
  },
  files: { "index.html": readFileSync(resolve("apps/server/profiles", file), "utf8") },
});
export const profileTemplates = {
  smudge: smudgeProfilePackage,
  stack: {
    manifest: {
      kind: "profile",
      schemaVersion: 2,
      runtimeVersion: "web-v1",
      name: "Photo stack / Post mod",
      entrypoint: "index.html",
      height: 900,
      assets: ["30000000-0000-4000-8000-000000000001"],
      capabilities: [
        "profile.read",
        "profile.openPost",
        "profile.cover",
        "profile.social.read",
        "profile.social.toggle",
      ],
      parts: {
        post: {
          name: "Photo stack / Flip & explore",
          entrypoint: "photo-stack/post.html",
          capabilities: [
            "profile.read",
            "profile.openPost",
            "profile.cover",
            "profile.social.read",
            "profile.social.toggle",
          ],
        },
      },
    },
    files: {
      "index.html": "<!--forma:post-->",
      "photo-stack/post.html": readFileSync(
        resolve("apps/server/profiles/photo-stack.html"),
        "utf8",
      ),
    },
  } satisfies ProfilePackage,
  raka: rakaPackage,
  basic: basicPackage,
  room: make("A room of my own", "room.html", 1200, [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  ]),
  comic: make("Collected moments", "comic.html", 1800, []),
};
export function seedProfiles(profiles: ProfileService) {
  seedRaka(profiles);
  const store = profiles.social.store;
  for (const [ownerId, template, marker] of [
    ["maya", "room", "profile-v1:maya"],
    ["leo", "comic", "profile-v1:leo"],
    ["ines", "smudge", "profile-smudge-v2:ines"],
  ] as const) {
    if (store.get("seed", marker)) continue;
    // Never replace a profile a user has already published, including after interrupted seeding.
    if (profiles.state(ownerId).version === 0) {
      const actor = { userId: ownerId };
      const draft = profiles.create(
        actor,
        ownerId === "ines" ? inesPaintWall() : profileTemplates[template],
      );
      profiles.publish(actor, draft.id, 1, 0);
      if (ownerId === "ines")
        store.transaction(() =>
          store.put("profile-wall", "owner:ines", [
            wallNote("maya", "Maya Chen", "Walked past the mural today. The pink is unreal.", 2),
            wallNote("leo", "Leo Park", "Save me a can for the next one!", 0),
          ]),
        );
    }
    store.transaction(() => store.put("seed", marker, { complete: true }));
  }
}

/**
 * Dani's page is the profile mock made real (ADR 0052): a Run as a card, Work with tags, Music
 * in hours, each with one of the demo photos. Seeded after the photos, which it needs.
 */
const daniPhotos = [
  "run-shoes",
  "laptop-code",
  "dj-hands",
  "mountains",
  "beach-sunset",
  "city",
  "coffee-cheers",
  "gig",
  "crowd-party",
  "friends-hill",
  "stage-lights",
  "skate",
] as const;
export function seedDaniPage(profiles: ProfileService) {
  const store = profiles.social.store;
  const marker = "profile-smudge-v3:dani";
  if (store.get("seed", marker) || !store.get("user", "dani")) return;
  // A page this seed wrote in an earlier version is written again; one someone edited is kept.
  const state = profiles.state("dani");
  if (state.version === 0 || store.get("seed", "profile-smudge-v2:dani")) {
    const actor = { userId: "dani" };
    // The photos on the page were added after the photo seed first ran, so a data dir from
    // before gets them here; the photo seed skips the ones that exist.
    store.transaction(() => {
      for (const photo of daniPhotos) {
        const assetId = photoId(photo);
        if (store.get("asset", assetId)) continue;
        store.put("asset", assetId, {
          id: assetId,
          ownerId: "shared",
          name: `${photo}.jpg`,
          mime: "image/jpeg",
          base64: readFileSync(resolve(`assets/demo/photos/${photo}.jpg`)).toString("base64"),
        });
      }
    });
    const pkg = applySmudgeSettings(profileTemplates.smudge, {
      ...defaultSmudgeSettings,
      place: "Jakarta",
      repeat: { song: "Nothing's Gonna Hurt You Baby", artist: "Cigarettes After Sex" },
      now: { text: "Cutting the skate film, night three", place: "Kemang", progress: 60 },
      chapters: [
        {
          kind: "run",
          label: "Strava · 2025",
          title: "Slow *runs*, far.",
          big: "1:52:10",
          unit: "",
          note: "Half marathon · Jakarta Marathon · Oct 2025",
          stats: [
            { value: "21.1", label: "km" },
            { value: "5:19", label: "per km" },
            { value: "148", label: "bpm" },
          ],
          lines: [],
          photo: photoId("run-shoes"),
          caption: "The pair that did it · Jakarta, 2025",
          snaps: [
            { photo: photoId("mountains"), caption: "Sentul, 05:40" },
            { photo: photoId("beach-sunset"), caption: "Pangandaran, 2024" },
          ],
        },
        {
          kind: "work",
          label: "2021 — now",
          title: "Film since *college*.",
          big: "",
          unit: "",
          note: "Four years shooting for brands in Bandung. Now cutting a skate film from a room in Kemang.",
          stats: [],
          lines: ["Bandung · 4 yrs", "Skate film · 2026", "Super 8 · always"],
          photo: photoId("laptop-code"),
          caption: "",
          snaps: [
            { photo: photoId("city"), caption: "Bandung, 2022" },
            { photo: photoId("coffee-cheers"), caption: "Kemang, 2025" },
          ],
        },
        {
          kind: "music",
          label: "Spotify · 2026",
          title: "",
          big: "412",
          unit: "hours",
          note: "Cigarettes After Sex, this year alone. Top 0.1% of listeners.",
          stats: [],
          lines: ["Apocalypse", "Nothing's Gonna Hurt You Baby", "Cry"],
          photo: photoId("dj-hands"),
          caption: "Rossi Musik, 2024",
          snaps: [],
        },
      ],
      roll: [
        { photo: photoId("gig"), caption: "Rossi, 2024" },
        { photo: photoId("crowd-party"), caption: "Blok M, 2025" },
        { photo: photoId("friends-hill"), caption: "Lembang, 2023" },
        { photo: photoId("stage-lights"), caption: "Jakarta, 2024" },
        { photo: photoId("coffee-cheers"), caption: "Kemang, 2025" },
        { photo: photoId("skate"), caption: "Senayan, 2025" },
        { photo: photoId("city"), caption: "Bandung, 2022" },
      ],
    });
    const draft = profiles.create(actor, pkg);
    profiles.publish(actor, draft.id, 1, state.version);
  }
  store.transaction(() => store.put("seed", marker, { complete: true }));
}

/** Inès shows what the easy editor can do: her own line, a place, extra sections and a Wall. */
function inesPaintWall() {
  return applySmudgeSettings(profileTemplates.smudge, {
    ...defaultSmudgeSettings,
    tagline: "*paints* the city, *slowly.*",
    place: "LISBON, PT",
    // Her posts live on the Posts page and in the landing's Picks (ADR 0052); the extras are hers.
    sections: ["quote", "wall"],
    chapters: [
      {
        kind: "work",
        label: "Since 2019",
        title: "Walls, *slowly*.",
        big: "31",
        unit: "murals",
        note: "Six years of painting other people's walls, one city at a time.",
        stats: [
          { value: "4", label: "cities" },
          { value: "2", label: "collectives" },
          { value: "1", label: "cat" },
        ],
        lines: [],
        // A shared demo photo, seeded before the pages (seed.ts).
        photo: "10000000-0000-4000-8000-000000000001",
      },
      {
        kind: "music",
        label: "This year",
        title: "Paint to *this*.",
        big: "212",
        unit: "hours",
        note: "Cigarettes After Sex, every mural.",
        stats: [],
        lines: ["Apocalypse", "Sunsetz", "K."],
      },
    ],
    now: { text: "Finishing the Rua das Flores mural", place: "Lisbon", progress: 70 },
    quote: { text: "Walls are just *slow* conversations." },
  });
}
function wallNote(userId: string, name: string, text: string, tone: number) {
  return {
    id: randomUUID(),
    userId,
    name,
    text,
    tone,
    createdAt: new Date().toISOString(),
  };
}
