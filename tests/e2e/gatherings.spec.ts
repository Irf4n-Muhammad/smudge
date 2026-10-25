import { test, expect } from "@playwright/test";
import { openMore } from "./nav";

test("a host makes a wedding invite, a guest answers without an account, only the host sees it", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await openMore(page, "Moments");
  await expect(page.getByRole("heading", { name: "Moments" })).toBeVisible();
  const form = page.getByRole("form", { name: "New wedding invite" });
  await form.getByLabel("Names on the invite").fill("Dina & Raka");
  await form.getByLabel("Date").fill("2026-12-12");
  await form.getByLabel("Place").fill("Gedung Sate");
  await form.getByLabel("Time 1").fill("09:00");
  await form.getByLabel("What happens 1").fill("Akad");
  await form.getByRole("button", { name: "Make the invite" }).click();

  await expect(page).toHaveURL(/\/m\/[0-9a-f-]+\/guests$/);
  await expect(page.getByText("No answers yet")).toBeVisible();
  const link = (await page.locator(".moments-share code").textContent())!;
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\?text=/,
  );

  // A guest with no account opens the link, as from WhatsApp.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Dina & Raka" })).toBeVisible();
  await expect(guest.getByText("Akad")).toBeVisible();
  await guest.getByLabel("Nama").fill("Tante Sri");
  await guest.getByLabel("Nomor HP").fill("0812 3456 7890");
  await guest.getByRole("radio", { name: "Hadir", exact: true }).click();
  await guest.getByLabel("Jumlah orang").selectOption("3");
  await guest.getByRole("button", { name: "Kirim konfirmasi" }).click();
  await expect(guest.getByText("Konfirmasi kehadiran untuk 3 orang")).toBeVisible();
  // The guest cannot open the host's list.
  await guest.goto(link + "/guests");
  await expect(guest.getByText("Log in to host a moment")).toBeVisible();
  await guestContext.close();

  await page.reload();
  await expect(page.getByRole("cell", { name: /Tante Sri/ })).toBeVisible();
  await expect(page.locator(".moments-totals dd").first()).toHaveText("3");
});
