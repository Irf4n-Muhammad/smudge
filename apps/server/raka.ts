import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { profilePackageSchema, type ProfilePackage } from "../../packages/contracts/src/profile.js";
import type { ProfileService } from "../../packages/core/src/profiles.js";

const source = (file: string) => readFileSync(resolve("apps/server/profiles/raka", file), "utf8");
const sharedFiles = {
  "index.html": source("index.html"),
  "raka/base.css": source("base.css"),
  "raka/reference.css": source("reference.css"),
  "raka/profile.html": source("profile.html"),
  "raka/post.html": source("post.html"),
  "raka/story.html": source("story.html"),
  "raka/relay.html": source("relay.html"),
  "raka/relay.js": source("relay.js"),
  "basic/profile.html": source("basic-profile.html"),
  "basic/post.html": source("post.html").replace("post-grid post-grid-comic", "post-grid"),
  "basic/story.html": source("story.html").replace("stories stories-comic", "stories"),
};
export const rakaPackage: ProfilePackage = profilePackageSchema.parse({
  manifest: {
    kind: "profile",
    schemaVersion: 2,
    runtimeVersion: "web-v1",
    name: "Raka · Make your mark",
    entrypoint: "index.html",
    height: 1520,
    mobileHeight: 1260,
    headerOverlay: true,
    autoHeight: true,
    assets: [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000003",
      "30000000-0000-4000-8000-000000000004",
    ],
    capabilities: [
      "profile.read",
      "profile.openPost",
      "relay.read",
      "relay.add",
      "profile.cover",
      "profile.social.read",
      "profile.social.toggle",
    ],
    parts: {
      profile: {
        name: "Raka / Comic",
        entrypoint: "raka/profile.html",
        capabilities: ["profile.read", "profile.social.read", "profile.social.toggle"],
      },
      post: {
        name: "Raka / Cutouts",
        entrypoint: "raka/post.html",
        capabilities: [
          "profile.read",
          "profile.openPost",
          "profile.cover",
          "profile.social.read",
          "profile.social.toggle",
        ],
      },
      story: {
        name: "Raka / Orbit",
        entrypoint: "raka/story.html",
        capabilities: ["profile.read", "profile.openPost"],
      },
      feature: {
        name: "Drawing Relay",
        entrypoint: "raka/relay.html",
        capabilities: ["relay.read", "relay.add"],
      },
    },
  },
  files: sharedFiles,
});
export const basicPackage: ProfilePackage = profilePackageSchema.parse({
  manifest: {
    ...rakaPackage.manifest,
    name: "Forma / Essentials",
    capabilities: [
      "profile.read",
      "profile.openPost",
      "profile.cover",
      "profile.social.read",
      "profile.social.toggle",
    ],
    parts: {
      profile: {
        name: "Forma / Simple",
        entrypoint: "basic/profile.html",
        capabilities: ["profile.read"],
      },
      post: {
        name: "Forma / Straight",
        entrypoint: "basic/post.html",
        capabilities: [
          "profile.read",
          "profile.openPost",
          "profile.cover",
          "profile.social.read",
          "profile.social.toggle",
        ],
      },
      story: {
        name: "Forma / Circles",
        entrypoint: "basic/story.html",
        capabilities: ["profile.read", "profile.openPost"],
      },
    },
  },
  files: sharedFiles,
});
export function seedRaka(profiles: ProfileService) {
  const social = profiles.social,
    store = social.store;
  // A new immutable asset preserves historical publications and the untouched reference.
  const cleanPaperId = "30000000-0000-4000-8000-000000000004";
  if (!store.get("asset", cleanPaperId))
    store.transaction(() =>
      store.put("asset", cleanPaperId, {
        id: cleanPaperId,
        ownerId: "shared",
        name: "Raka clean paper artwork without UI",
        mime: "image/png",
        base64: readFileSync(resolve("assets/raka/clean-paper-v1.png")).toString("base64"),
      }),
    );
  const referenceId = "30000000-0000-4000-8000-000000000003";
  if (!store.get("asset", referenceId))
    store.transaction(() =>
      store.put("asset", referenceId, {
        id: referenceId,
        ownerId: "shared",
        name: "Original Raka reference artwork",
        mime: "image/png",
        base64: readFileSync(resolve("assets/raka/reference.png")).toString("base64"),
      }),
    );
  const starterId = "30000000-0000-4000-8000-000000000002";
  if (!store.get("asset", starterId))
    store.transaction(() =>
      store.put("asset", starterId, {
        id: starterId,
        ownerId: "shared",
        name: "Illustrated skate cat starter",
        mime: "image/png",
        base64: readFileSync(resolve("assets/raka/skate-cat.png")).toString("base64"),
      }),
    );
  const artworkId = "30000000-0000-4000-8000-000000000001";
  if (!store.get("asset", artworkId))
    store.transaction(() =>
      store.put("asset", artworkId, {
        id: artworkId,
        ownerId: "shared",
        name: "Raka illustrated artwork",
        mime: "image/png",
        base64: readFileSync(resolve("assets/raka/artwork.png")).toString("base64"),
      }),
    );
  if (!store.get("user", "raka"))
    store.transaction(() =>
      store.put("user", "raka", {
        id: "raka",
        name: "Raka",
        handle: "rakadulu",
        initials: "RK",
        color: "#e83727",
        bio: "Sketches, skate spots, unfinished things.",
      }),
    );
  if (store.get("seed", "raka-v2")) return;
  const actor = { userId: "raka" };
  // Existing profiles and posts are preserved, including an interrupted seed run.
  if (!social.feed(actor).some((p) => p.ownerId === "raka")) {
    for (const [title, caption, format, html] of [
      [
        "Pages from Sunday",
        "One more page. One less perfect drawing.",
        "photo",
        '<h1>Pages from Sunday</h1><p>A cat, a board, and absolutely no plan.</p><div style="font-size:120px">✎ ✳</div>',
      ],
      [
        "The long way home",
        "Took the wrong turn. Kept the view.",
        "photo",
        '<h1>The long way home</h1><img style="width:100%;max-height:500px;object-fit:cover" src="asset:10000000-0000-4000-8000-000000000001" alt="Coastline"><p>A quiet place to stop.</p>',
      ],
      [
        "Sketchbook",
        "A page from today.",
        "story",
        "<h1>Today in the sketchbook</h1><p>Tap to turn the page.</p><button onclick=\"this.textContent=this.textContent==='Keep going →'?'Make a mess. Keep the good bits.':'Keep going →'\">Keep going →</button>",
      ],
    ] as const) {
      const d = social.createDraft(actor, {
        package: {
          manifest: {
            schemaVersion: 2,
            runtimeVersion: "web-v1",
            name: title,
            entrypoint: "index.html",
            assets: ["10000000-0000-4000-8000-000000000001"],
            capabilities: [],
          },
          files: {
            "index.html":
              "<style>body{padding:35px;background:#f2efe6;color:#191919}html[data-theme=dark] body{background:#242424;color:#eee}h1{font:italic 48px Georgia}button{padding:20px;background:#e83727;color:white;border:0}</style>" +
              html,
          },
        },
        metadata: { title, caption, format, contributors: [] },
      });
      social.publish(actor, d.id, d.revision);
    }
  }
  if (profiles.state("raka").version === 0) {
    const d = profiles.create(actor, rakaPackage);
    const state = profiles.publish(actor, d.id, d.revision, 0);
    // The opening sketch is an ordinary attributed contribution, not a baked-in canvas background.
    profiles.capability(actor, state.publicationId!, false, "relay.add", {
      submissionId: "20000000-0000-4000-8000-000000000001",
      strokes: [
        [
          [350, 370],
          [330, 250],
          [350, 160],
          [405, 200],
          [480, 185],
          [535, 135],
          [545, 255],
          [520, 345],
          [475, 370],
          [350, 370],
        ],
        [
          [360, 390],
          [300, 400],
          [345, 425],
          [530, 405],
          [590, 375],
        ],
        [
          [300, 430],
          [350, 450],
          [510, 430],
          [590, 400],
        ],
        [
          [350, 457],
          [360, 448],
          [375, 451],
          [380, 465],
          [370, 476],
          [355, 471],
          [350, 457],
        ],
        [
          [515, 437],
          [525, 426],
          [540, 430],
          [545, 444],
          [535, 455],
          [520, 450],
          [515, 437],
        ],
        [
          [370, 255],
          [400, 250],
        ],
        [
          [460, 245],
          [490, 235],
        ],
        [
          [410, 290],
          [425, 305],
          [445, 290],
        ],
        [
          [300, 260],
          [360, 280],
        ],
        [
          [290, 295],
          [360, 295],
        ],
        [
          [510, 270],
          [580, 240],
        ],
        [
          [515, 290],
          [585, 290],
        ],
      ]
        .map((points) => ({ color: "#202020", width: 6, points }))
        .concat([
          {
            color: "#e83727",
            width: 6,
            points: [
              [365, 145],
              [355, 95],
              [395, 120],
              [425, 65],
              [450, 115],
              [485, 85],
              [480, 145],
            ],
          },
          {
            color: "#296ccc",
            width: 5,
            points: [
              [260, 460],
              [320, 462],
              [370, 457],
              [400, 460],
            ],
          },
        ]),
    });
  }
  store.transaction(() => store.put("seed", "raka-v2", { complete: true }));
}
