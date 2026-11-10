import test from "node:test";
import assert from "node:assert/strict";
import {
  guessSlot,
  parseLd,
  parseProducts,
  parseWoo,
  sitemapLinks,
} from "../apps/server/shop-import.js";

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

test("a WooCommerce shop's list is read, with prices in its own small units", () => {
  const body = JSON.stringify([
    {
      slug: "rain-shell",
      name: "Rain shell &amp; hood",
      permalink: "https://shop.example/product/rain-shell/",
      prices: { price: "1250000", currency_minor_unit: 2 },
      images: [{ src: "https://shop.example/wp-content/shell.jpg" }],
      categories: [{ name: "Jackets" }],
    },
    {
      slug: "elsewhere",
      name: "Linked elsewhere",
      permalink: "https://other.example/x",
      prices: { price: "90", currency_minor_unit: 0 },
      images: [{ src: "https://shop.example/a.jpg" }],
    },
    { slug: "no-price", name: "No price", images: [{ src: "https://shop.example/a.jpg" }] },
  ]);
  assert.deepEqual(parseWoo("https://shop.example", body), [
    {
      key: "rain-shell",
      name: "Rain shell & hood",
      image: "https://shop.example/wp-content/shell.jpg",
      price: 1250000,
      url: "https://shop.example/product/rain-shell/",
      slot: "outer",
    },
    {
      key: "elsewhere",
      name: "Linked elsewhere",
      image: "https://shop.example/a.jpg",
      price: 9000,
      url: "https://shop.example/product/elsewhere",
      slot: "top",
    },
  ]);
  assert.throws(() => parseWoo("https://shop.example", "{}"), /SHOP_FEED_NOT_FOUND/);
});

test("any website's product pages are read from the data they give search engines", () => {
  const html = `<html><head>
    <script type="application/ld+json">{ broken </script>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Shop" },
        {
          "@type": ["Product"],
          name: "Canvas tote",
          image: ["https://shop.example/tote.jpg"],
          offers: [{ "@type": "Offer", price: "60.00", priceCurrency: "USD" }],
        },
        {
          "@type": "Product",
          name: "Wide jeans",
          url: "/shop/wide-jeans.html",
          image: { "@type": "ImageObject", url: "https://shop.example/jeans.jpg" },
          offers: { "@type": "AggregateOffer", lowPrice: 89.5 },
        },
        { "@type": "Product", name: "No price", image: "https://shop.example/x.jpg" },
      ],
    })}</script></head></html>`;
  assert.deepEqual(parseLd("https://shop.example/product/canvas-tote/", html), [
    {
      key: "canvas-tote",
      name: "Canvas tote",
      image: "https://shop.example/tote.jpg",
      price: 6000,
      url: "https://shop.example/product/canvas-tote/",
      slot: "bag",
    },
    {
      key: "wide-jeans",
      name: "Wide jeans",
      image: "https://shop.example/jeans.jpg",
      price: 8950,
      url: "https://shop.example/shop/wide-jeans.html",
      slot: "bottom",
    },
  ]);
});

test("a sitemap gives the shop's own addresses only", () => {
  const xml = `<urlset><url><loc>https://shop.example/product/a</loc></url>
    <url><loc><![CDATA[https://shop.example/product/b?x=1&amp;y=2]]></loc></url>
    <url><loc>https://other.example/product/c</loc></url></urlset>`;
  assert.deepEqual(sitemapLinks("https://shop.example", xml), [
    "https://shop.example/product/a",
    "https://shop.example/product/b?x=1&y=2",
  ]);
});
