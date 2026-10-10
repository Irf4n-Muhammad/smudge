import type { PostPackage } from "../packages/contracts/src/index.js";

export function simplePost(): PostPackage {
  return {
    manifest: {
      schemaVersion: 1,
      runtimeVersion: "web-v1",
      name: "Weekend notes",
      entrypoint: "index.html",
      capabilities: [],
    },
    files: { "index.html": "<main><h1>Weekend notes</h1><p>A small memory.</p></main>" },
  };
}
