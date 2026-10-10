import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1536 } });
await page.goto("http://127.0.0.1:3000/?profile=raka");
await page.locator(".profile-world .runtime[data-ready=true]").waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: "artifacts/raka-reference-pass.png", fullPage: true });
console.log(
  await page.locator(".profile-world").frameLocator("iframe").locator(".relay").boundingBox(),
);
await browser.close();
