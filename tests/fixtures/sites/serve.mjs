// A tiny local "website" for trying the website import without the internet. The API server only
// fetches from it when FORMA_IMPORT_ALLOW_HOSTS names it (never in production).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const port = Number(process.env.PORT ?? 3010);
const pages = { "/": "bakery.html", "/journal": "journal.html", "/portfolio": "portfolio.html" };
const photos = {
  bread: "spray",
  croissant: "concert",
  cake: "rooftop",
  shop: "coast",
  rooftop: "rooftop",
  hero: "forest",
  forest: "forest",
  coast: "coast",
  concert: "concert",
  spray: "spray",
  lake: "lake",
};

// The proof file for "Use my website": a test puts the code here, as the owner would upload it.
let proof = "";
// When on, the shop product list is gone, as on a website that isn't on a shop platform.
let plainShop = false;

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/__plain-shop" && req.method === "PUT") {
    plainShop = req.headers["x-on"] === "1";
    return res.writeHead(204).end();
  }
  if (path === "/__proof" && req.method === "PUT") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      proof = body;
      res.writeHead(204).end();
    });
    return;
  }
  if (path === "/.well-known/smudge-verification.txt") {
    if (!proof) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end(proof);
  }
  if (path === "/private") {
    // A site that asks not to be shown inside other sites.
    res.writeHead(200, { "content-type": "text/html", "x-frame-options": "DENY" });
    return res.end("<h1>Not in frames</h1>");
  }
  const img = /^\/img\/(\w+)\.jpg$/.exec(path);
  if (img && photos[img[1]]) {
    res.writeHead(200, { "content-type": "image/jpeg" });
    return res.end(readFileSync(resolve(root, "assets/demo", `${photos[img[1]]}.jpg`)));
  }
  // A second shop with no product list of its own kind: only a sitemap and a product page that
  // describes itself for search engines.
  if (path === "/sitemap.xml") {
    res.writeHead(200, { "content-type": "application/xml" });
    return res.end(
      `<urlset><url><loc>http://127.0.0.1:${port}/product/field-cap</loc></url></urlset>`,
    );
  }
  if (path === "/product/field-cap") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(
      `<title>Field cap</title><script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Field cap",
        image: "https://shop.example/field-cap.jpg",
        offers: { "@type": "Offer", price: "32.00" },
      })}</script><h1>Field cap</h1>`,
    );
  }
  if (path === "/products.json" && plainShop) return res.writeHead(404).end();
  if (path === "/products.json") {
    // The product list a shop platform publishes; pictures must be https, so they point outward.
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        products: [
          ["linen-overshirt", "Linen overshirt", "Shirts", "128.00"],
          ["wide-trousers", "Wide trousers", "Pants", "145.00"],
          ["canvas-tote", "Canvas tote", "Bags", "60.00"],
        ].map(([handle, title, product_type, price]) => ({
          handle,
          title,
          product_type,
          images: [{ src: `https://shop.example/${handle}.jpg` }],
          variants: [{ price }],
        })),
      }),
    );
  }
  const page = pages[path];
  if (!page) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(resolve(here, page)));
}).listen(port, "127.0.0.1", () => console.log(`Trial sites on http://127.0.0.1:${port}`));
