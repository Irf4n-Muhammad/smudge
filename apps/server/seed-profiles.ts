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

/** Inès shows what the easy editor can do: her own line, a place, extra sections and a Wall. */
function inesPaintWall() {
  return applySmudgeSettings(profileTemplates.smudge, {
    ...defaultSmudgeSettings,
    tagline: "*paints* the city, *slowly.*",
    place: "LISBON, PT",
    sections: ["latest", "selected", "quote", "wall"],
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
