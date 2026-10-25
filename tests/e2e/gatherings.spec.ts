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

test("members see the moment group: announcements, open chat and a small group the host can't see", async ({
  page,
  browser,
}) => {
  const call = (p: typeof page, path: string, body?: unknown) =>
    p.evaluate(
      async ({ path, body }) => {
        const r = await fetch("/api" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!r.ok) throw new Error("API failed: " + r.status);
        return r.json();
      },
      { path, body },
    );
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const made = (await call(page, "/gatherings", {
    kind: "wedding",
    title: "Sari & Bima",
    date: "2026-11-21",
    place: "Taman Mini",
  })) as { id: string };
  await page.goto(`/m/${made.id}`);
  await expect(page.getByRole("tab", { name: "Obrolan" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Tulis pesan").fill("Dress code: batik");
  await page.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText("Dress code: batik")).toBeVisible();

  // Maya answers while signed in and lands in the group; the main chat is announcements only.
  const other = await browser.newContext();
  const maya = await other.newPage();
  await maya.goto("/");
  await maya.locator(".post-card").first().waitFor();
  await call(maya, "/session", { userId: "maya" });
  await maya.goto(`/m/${made.id}`);
  await maya.getByLabel("Nama").fill("Maya");
  await maya.getByLabel("Nomor HP").fill("0812 9999 0000");
  await maya.getByRole("radio", { name: "Hadir", exact: true }).click();
  await maya.getByRole("button", { name: "Kirim konfirmasi" }).click();
  await expect(maya.getByText("Dress code: batik")).toBeVisible();
  await expect(maya.getByText("Hanya tuan rumah yang mengirim pengumuman")).toBeVisible();

  // The host opens the chat to everyone.
  // The box follows the saved mode, so it ticks once the server has answered.
  await page.getByLabel("Semua tamu boleh ngobrol").click();
  await expect(page.getByLabel("Semua tamu boleh ngobrol")).toBeChecked();
  await maya.reload();
  await maya.getByLabel("Tulis pesan").fill("Siap!");
  await maya.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText("Siap!")).toBeVisible();

  // Maya makes a small group without asking the host: the host never sees it.
  await maya.getByRole("tab", { name: "Anggota" }).click();
  const form = maya.getByRole("form", { name: "Grup kecil baru" });
  await form.getByLabel("Nama grup").fill("Geng SMA");
  await form.getByRole("button", { name: "Buat grup kecil" }).click();
  await expect(maya.getByRole("button", { name: "Geng SMA", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Geng SMA", exact: true })).toHaveCount(0);
  await other.close();
});
