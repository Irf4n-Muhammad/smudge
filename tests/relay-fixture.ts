import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { profilePackageSchema, type ProfilePackage } from "../packages/contracts/src/profile.js";
import { rakaPackage } from "../apps/server/raka.js";

const source = (file: string) => readFileSync(resolve("tests/fixtures/relay", file), "utf8");

/**
 * Ink & Paper with a Drawing Relay feature part. No bundled template ships the relay any more
 * (visitors don't draw on someone else's page), but packages may still ask for the capability,
 * so the platform keeps it and these tests exercise it.
 */
export const relayPackage: ProfilePackage = profilePackageSchema.parse({
  manifest: {
    ...rakaPackage.manifest,
    name: "Ink & Paper · Make your mark",
    capabilities: [...rakaPackage.manifest.capabilities, "relay.read", "relay.add"],
    parts: {
      ...(rakaPackage.manifest.schemaVersion === 2 ? rakaPackage.manifest.parts : {}),
      feature: {
        name: "Drawing Relay",
        entrypoint: "raka/relay.html",
        capabilities: ["relay.read", "relay.add"],
      },
    },
  },
  files: {
    ...rakaPackage.files,
    "raka/relay.html": source("relay.html"),
    "raka/relay.js": source("relay.js"),
  },
});
