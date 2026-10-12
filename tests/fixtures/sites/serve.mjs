// A tiny local "website" for trying the website import without the internet. The API server only
// fetches from it when FORMA_IMPORT_ALLOW_HOSTS names it (never in production).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const port = Number(process.env.PORT ?? 3010);
const pages = { "/": "bakery.html", "/journal": "journal.html" };
const photos = {
  bread: "spray",
  croissant: "concert",
  cake: "rooftop",
  shop: "coast",
  rooftop: "rooftop",
  hero: "forest",
};

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const img = /^\/img\/(\w+)\.jpg$/.exec(path);
  if (img && photos[img[1]]) {
    res.writeHead(200, { "content-type": "image/jpeg" });
    return res.end(readFileSync(resolve(root, "assets/demo", `${photos[img[1]]}.jpg`)));
  }
  const page = pages[path];
  if (!page) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(resolve(here, page)));
}).listen(port, "127.0.0.1", () => console.log(`Trial sites on http://127.0.0.1:${port}`));
