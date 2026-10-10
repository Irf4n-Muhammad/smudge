import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SocialService } from "../../packages/core/src/social.js";
import type { Experience, Metadata } from "../../packages/contracts/src/experience.js";

/** Add new examples once; never rewrite existing user work or published packages. */
export function seedWorlds(service: SocialService) {
  if (service.store.get("system", "worlds-v1")) return;
  const examples = [
    {
      file: "letter",
      owner: "ines",
      title: "A letter for slower days",
      format: "custom",
      caption: "For whoever needs a little room to breathe today.",
      background: "#eee4d5",
      ink: "#774a3d",
      nightBackground: "#29211f",
      nightInk: "#e8c6b2",
      height: 760,
      assets: [],
    },
    {
      file: "constellation",
      owner: "leo",
      title: "Somewhere between midnights",
      format: "story",
      caption: "Five nights. Five little universes. Pick a star.",
      background: "#13192a",
      ink: "#dfd5ed",
      nightBackground: "#0d1020",
      nightInk: "#dfd5ed",
      height: 790,
      assets: [],
    },
    {
      file: "keepsakes",
      owner: "maya",
      title: "A beautiful little mess",
      format: "scrapbook",
      caption: "A few things I couldn’t throw away. Move them around. Make yourself at home.",
      background: "#e9e8de",
      ink: "#3b4131",
      nightBackground: "#20251f",
      nightInk: "#e3e7d6",
      height: 780,
      assets: [
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000002",
        "10000000-0000-4000-8000-000000000003",
      ],
    },
  ];
  for (const e of examples) {
    // Marker per example makes interrupted seeding resumable without duplicate publications.
    if (service.store.get("system", `world:${e.file}`)) continue;
    const pkg: Experience = {
      manifest: {
        schemaVersion: 2,
        runtimeVersion: "web-v1",
        name: e.title,
        entrypoint: "index.html",
        capabilities: ["viewer.progress.read", "viewer.progress.write"],
        assets: e.assets,
        stage: {
          background: e.background,
          ink: e.ink,
          nightBackground: e.nightBackground,
          nightInk: e.nightInk,
          height: e.height,
        },
      },
      files: { "index.html": readFileSync(resolve(`apps/server/worlds/${e.file}.html`), "utf8") },
    };
    const draft = service.createDraft(
      { userId: e.owner },
      {
        package: pkg,
        metadata: {
          title: e.title,
          caption: e.caption,
          format: e.format as Metadata["format"],
          contributors: [],
        },
      },
    );
    const published = service.publish({ userId: e.owner }, draft.id, draft.revision);
    service.store.transaction(() =>
      service.store.put("system", `world:${e.file}`, { postId: published.id }),
    );
  }
  service.store.transaction(() => service.store.put("system", "worlds-v1", { complete: true }));
}
