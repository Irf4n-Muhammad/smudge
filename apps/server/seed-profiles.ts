import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfilePackage } from "../../packages/contracts/src/profile.js";
import type { ProfileService } from "../../packages/core/src/profiles.js";
import { rakaPackage, basicPackage, seedRaka } from "./raka.js";

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
  for (const [ownerId, template] of [
    ["maya", "room"],
    ["leo", "comic"],
  ] as const) {
    const marker = `profile-v1:${ownerId}`;
    if (store.get("seed", marker)) continue;
    // Never replace a profile a user has already published, including after interrupted seeding.
    if (profiles.state(ownerId).version === 0) {
      const actor = { userId: ownerId };
      const draft = profiles.create(actor, profileTemplates[template]);
      profiles.publish(actor, draft.id, 1, 0);
    }
    store.transaction(() => store.put("seed", marker, { complete: true }));
  }
}
