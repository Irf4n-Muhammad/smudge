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
import { buildPost, startPostDesign } from "../../packages/core/src/easy-post.js";

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
  // The Track (ADR 0057): the same package, its look set to the cream ground.
  track: (() => {
    const pkg = applySmudgeSettings(smudgeProfilePackage, {
      ...defaultSmudgeSettings,
      look: "track",
    });
    return { ...pkg, manifest: { ...pkg.manifest, name: "Smudge · Track" } };
  })(),
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
/** Dani cut out of a photo, and two of his things (assets/demo/CREDITS.md), for the Track. */
const daniCutouts = {
  dani: "40000000-0000-4000-8000-000000000001",
  board: "40000000-0000-4000-8000-000000000002",
  shoe: "40000000-0000-4000-8000-000000000003",
} as const;
export function seedDaniPage(profiles: ProfileService) {
  const store = profiles.social.store;
  const marker = "profile-smudge-v7:dani";
  if (store.get("seed", marker) || !store.get("user", "dani")) return;
  // A page this seed wrote in an earlier version is written again; one someone edited is kept.
  const state = profiles.state("dani");
  const earlier = [
    "profile-smudge-v2:dani",
    "profile-smudge-v3:dani",
    "profile-smudge-v4:dani",
    "profile-smudge-v5:dani",
    "profile-smudge-v6:dani",
  ].some((m) => store.get("seed", m));
  if (state.version === 0 || earlier) {
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
      for (const [name, assetId] of Object.entries(daniCutouts)) {
        if (store.get("asset", assetId)) continue;
        store.put("asset", assetId, {
          id: assetId,
          ownerId: "shared",
          name: `${name}.png`,
          mime: "image/png",
          base64: readFileSync(resolve(`assets/demo/cutouts/${name}.png`)).toString("base64"),
        });
      }
    });
    const pkg = applySmudgeSettings(profileTemplates.smudge, {
      ...defaultSmudgeSettings,
      look: "track",
      cutout: daniCutouts.dani,
      things: [
        { photo: daniCutouts.board, caption: "Senayan, 2025" },
        { photo: daniCutouts.shoe, caption: "1,204 km this year" },
      ],
      next: { title: "Senayan Open", when: "2 Nov · 07:00" },
      tagline: "*Skate*, film cameras, Bandung → Jakarta.",
      place: "Jakarta",
      manifesto:
        "Skate since *fourteen.* Film since *college.* Bandung, then Jakarta. A skate film nobody asked for, cut at night.",
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
          title: "Cigarettes After Sex",
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
  seedDaniPosts(profiles);
  store.transaction(() => store.put("seed", marker, { complete: true }));
}
/**
 * Picks shows four posts (ADR 0056), the last two as blocks of colour with their captions. The
 * photo seed gives Dani two; these two are dated before them so the reunion and the skate
 * session keep their covers, and a data dir seeded earlier gets them too (once).
 */
const daniPosts: {
  marker: string;
  daysAgo: number;
  headline: string;
  kicker: string;
  text: string;
  photo: (typeof daniPhotos)[number];
  caption: string;
}[] = [
  {
    marker: "post-dani:night-three",
    daysAgo: 1,
    kicker: "Night three",
    headline: "The cut is at *11 minutes*",
    text: "It needs to be 8. Every clip I love is the clip that has to go.",
    photo: "laptop-code",
    caption: "The cut is at 11 minutes. It needs to be 8.",
  },
  {
    marker: "post-dani:super-8",
    daysAgo: 6,
    kicker: "Film test",
    headline: "Super 8 *test*",
    text: "One roll of Kodak 50D, expired 2019, shot at the beach before the light went.",
    photo: "beach-sunset",
    caption: "Kodak 50D, expired 2019. Still gold.",
  },
];
function seedDaniPosts(profiles: ProfileService) {
  const social = profiles.social;
  const store = social.store;
  const actor = { userId: "dani" };
  for (const p of daniPosts) {
    if (store.get("seed", p.marker)) continue;
    const built = buildPost(
      startPostDesign("poster", {
        kicker: p.kicker,
        headline: p.headline,
        text: p.text,
        photos: [{ assetId: photoId(p.photo), caption: "" }],
      }),
    );
    const draft = social.createDraft(actor, {
      package: built.package,
      metadata: { ...built.metadata, caption: p.caption, contributors: [] },
    });
    const createdAt = new Date(Date.now() - p.daysAgo * 86_400_000).toISOString();
    social.publish(actor, draft.id, draft.revision, (post) => {
      store.put("post", post.id, { ...post, createdAt });
      store.put("seed", p.marker, { complete: true });
    });
  }
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
