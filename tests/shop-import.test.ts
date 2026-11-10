import test from "node:test";
import assert from "node:assert/strict";
import { guessSlot, parseProducts } from "../apps/server/shop-import.js";

test("a shop's product list becomes Mall pieces, and junk is left out", () => {
  const body = JSON.stringify({
    products: [
      {
        handle: "wide-trousers",
        title: "Wide trousers",
        product_type: "Pants",
        images: [{ src: "https://cdn.example/a.jpg" }],
        variants: [{ price: "145.50" }],
      },
      {
        handle: "wide-trousers",
        title: "Twice",
        images: [{ src: "https://x.example/b.jpg" }],
        variants: [{ price: "1" }],
      },
      { handle: "no-picture", title: "No picture", images: [], variants: [{ price: "10" }] },
      {
        handle: "plain-http",
        title: "Plain http",
        images: [{ src: "http://x.example/a.jpg" }],
        variants: [{ price: "10" }],
      },
      {
        handle: "../etc",
        title: "Odd handle",
        images: [{ src: "https://x.example/a.jpg" }],
        variants: [{ price: "10" }],
      },
      {
        handle: "no-price",
        title: "No price",
        images: [{ src: "https://x.example/a.jpg" }],
        variants: [],
      },
      null,
    ],
  });
  assert.deepEqual(parseProducts("https://shop.example", body), [
    {
      key: "wide-trousers",
      name: "Wide trousers",
      image: "https://cdn.example/a.jpg",
      price: 14550,
      url: "https://shop.example/products/wide-trousers",
      slot: "bottom",
    },
  ]);
  assert.throws(() => parseProducts("https://shop.example", "<html>"), /SHOP_FEED_NOT_FOUND/);
  assert.throws(() => parseProducts("https://shop.example", "{}"), /SHOP_FEED_NOT_FOUND/);
});

test("a product's words say where on an outfit it goes", () => {
  assert.equal(guessSlot("Footwear Trail runners"), "shoes");
  assert.equal(guessSlot("Canvas tote"), "bag");
  assert.equal(guessSlot("Rain shell"), "outer");
  assert.equal(guessSlot("Denim shorts"), "bottom");
  assert.equal(guessSlot("Merino tee"), "top");
});
