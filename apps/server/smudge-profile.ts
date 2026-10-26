import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { profilePackageSchema, type ProfilePackage } from "../../packages/contracts/src/profile.js";

const files = Object.fromEntries(
  [
    "fonts.css",
    "shell.css",
    "parts.css",
    "helpers.js",
    "profile.html",
    "story.html",
    "post.html",
    "sections.js",
  ].map((file) => [
    `smudge/${file}`,
    readFileSync(resolve("apps/server/profiles/smudge", file), "utf8"),
  ]),
);
const social = ["profile.read", "profile.openPost", "profile.cover"] as const;

/** Smudge's default profile: a creator page in the paint-wall style, built only from real data. */
export const smudgeProfilePackage: ProfilePackage = profilePackageSchema.parse({
  manifest: {
    kind: "profile",
    schemaVersion: 2,
    runtimeVersion: "web-v1",
    name: "Smudge · Paint wall",
    entrypoint: "index.html",
    height: 1700,
    mobileHeight: 1900,
    autoHeight: true,
    assets: [],
    capabilities: [...social, "profile.social.read"],
    parts: {
      profile: {
        name: "Smudge / Paint wall",
        entrypoint: "smudge/profile.html",
        capabilities: [...social, "profile.social.read"],
      },
      story: {
        name: "Smudge / Latest",
        entrypoint: "smudge/story.html",
        capabilities: [...social],
      },
      post: {
        name: "Smudge / Selected walls",
        entrypoint: "smudge/post.html",
        capabilities: [...social],
      },
    },
  },
  files: {
    "index.html": readFileSync(resolve("apps/server/profiles/smudge/index.html"), "utf8"),
    ...files,
  },
});
