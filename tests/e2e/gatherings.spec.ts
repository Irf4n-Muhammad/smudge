import { test, expect } from "@playwright/test";
import sharp from "sharp";
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

test("on the day: the door QR lets a guest in and counts them, and the album fills by chapter", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  const made = await page.evaluate(async () => {
    const r = await fetch("/api/gatherings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "wedding",
        title: "Rina & Tomi",
        date: "2030-06-01",
        place: "Pendopo",
        rundown: [{ time: "09:00", title: "Akad" }],
      }),
    });
    return (await r.json()) as { id: string };
  });
  await page.goto(`/m/${made.id}/door`);
  await expect(page.getByRole("heading", { name: "Scan untuk masuk" })).toBeVisible();
  const qr = page.locator("figure.door-qr[data-door-path]");
  await expect(qr.locator("svg")).toBeVisible();
  const path = (await qr.getAttribute("data-door-path"))!;
  await expect(page.locator(".door-count")).toHaveText("0 tamu sudah datang");

  // Someone without an account scans: asked to sign up or log in to be counted.
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await stranger.goto(path);
  await expect(stranger.getByRole("heading", { name: "Kamu sudah sampai" })).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Daftar" })).toBeVisible();
  await strangerContext.close();

  // Maya is signed in on her phone: the scan records her and opens the album.
  const other = await browser.newContext();
  const maya = await other.newPage();
  await maya.goto("/");
  await maya.locator(".post-card").first().waitFor();
  await maya.evaluate(() =>
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "maya" }),
    }),
  );
  await maya.goto(path);
  await expect(maya.getByText("Kehadiranmu sudah tercatat")).toBeVisible();
  await expect(maya.getByRole("tab", { name: "Album" })).toHaveAttribute("aria-selected", "true");
  const png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#c9a26b" },
  })
    .png()
    .toBuffer();
  await maya
    .locator('input[type="file"]')
    .setInputFiles({ name: "akad.png", mimeType: "image/png", buffer: png });
  // The wedding is years away, so a photo from today goes before the day.
  const before = maya.getByRole("region", { name: "Sebelum hari H" });
  await expect(before.getByRole("button", { name: "Foto dari Maya Chen" })).toBeVisible();
  await before.getByRole("button", { name: "Foto dari Maya Chen" }).click();
  await maya.getByRole("button", { name: "Suka", exact: true }).click();
  await expect(maya.getByText("1 orang menyukai fotomu")).toBeVisible();
  await maya.getByRole("button", { name: "Tutup" }).click();
  await maya.getByLabel("Tulis ucapan").fill("Selamat ya!");
  await maya.getByRole("button", { name: "Kirim ucapan" }).click();
  await expect(maya.getByText("Selamat ya!")).toBeVisible();

  // The host's door screen counts her, and the host sees her photo but not its likes.
  await expect(page.locator(".door-count")).toHaveText("1 tamu sudah datang", { timeout: 20_000 });
  await page.goto(`/m/${made.id}`);
  await page.getByRole("tab", { name: "Album" }).click();
  await page.getByRole("button", { name: "Foto dari Maya Chen" }).click();
  await expect(page.getByText("Foto oleh Maya Chen")).toBeVisible();
  await expect(page.getByText(/menyukai/)).toHaveCount(0);

  // Maya picks her photo for a post: it opens in the editor and lands in the feed, from the moment.
  await maya.getByRole("button", { name: "Posting ke profil" }).click();
  await maya.getByRole("button", { name: "Foto dari Maya Chen" }).click();
  await maya.getByRole("button", { name: "Lanjut dengan 1 foto" }).click();
  await expect(maya).toHaveURL(/\?postDraft=/);
  const editor = maya.getByRole("dialog", { name: "Edit your post" });
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(editor).toHaveCount(0);
  const post = maya.getByRole("article", { name: /Rina & Tomi by/ }).first();
  await expect(post.getByRole("link", { name: "From Rina & Tomi" })).toHaveAttribute(
    "href",
    `/m/${made.id}`,
  );
  await other.close();
});

test("after the day: the host thanks and locks the album, and guests who came get a memory card", async ({
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
    title: "Lala & Bayu",
    date: "2030-03-03",
    place: "Kebun Raya",
  })) as { id: string };
  const door = (await call(page, `/gatherings/${made.id}/door`)) as { path: string };

  const other = await browser.newContext();
  const maya = await other.newPage();
  await maya.goto("/");
  await maya.locator(".post-card").first().waitFor();
  await call(maya, "/session", { userId: "maya" });
  await maya.goto(door.path);
  await expect(maya.getByText("Kehadiranmu sudah tercatat")).toBeVisible();
  const png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#7a9e7e" },
  })
    .png()
    .toBuffer();
  await maya
    .locator('input[type="file"]')
    .setInputFiles({ name: "kebun.png", mimeType: "image/png", buffer: png });
  await expect(maya.getByRole("button", { name: "Foto dari Maya Chen" })).toBeVisible();

  // The host picks the cover, writes the thank-you and locks the album.
  await page.goto(`/m/${made.id}`);
  await page.getByRole("tab", { name: "Album" }).click();
  await page.getByRole("button", { name: "Foto dari Maya Chen" }).click();
  await page.getByRole("button", { name: "Jadikan sampul" }).click();
  await expect(page.getByRole("button", { name: "Sampul momen" })).toBeVisible();
  await page.getByRole("button", { name: "Tutup" }).click();
  await page.getByLabel("Ucapan terima kasih").fill("Terima kasih sudah datang!");
  await page.getByRole("button", { name: "Kunci album sekarang" }).click();
  await expect(page.getByText("Album sudah dikunci.")).toBeVisible();

  // Maya can no longer add photos, and her card shows on her profile.
  await maya.reload();
  await expect(maya.getByRole("tab", { name: "Album" })).toHaveAttribute("aria-selected", "true");
  await expect(maya.getByText("Terima kasih sudah datang!")).toBeVisible();
  await expect(maya.getByText("Tambah foto")).toHaveCount(0);
  await expect(maya.getByLabel("Tampilkan kartu kenangan di profilku")).toBeChecked();
  // The memory card is a day on Maya's Stories page (ADR 0045).
  await page.goto("/?profile=maya&page=stories");
  const cards = page.getByRole("list", { name: "Stories" });
  await expect(cards.getByRole("link", { name: /Lala & Bayu/ })).toBeVisible();
  await expect(cards.getByText("1 came")).toBeVisible();
  await other.close();

  // Anyone opening the old link sees the thank-you instead of the RSVP.
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await stranger.goto(`/m/${made.id}`);
  await expect(stranger.getByRole("heading", { name: "Terima kasih" })).toBeVisible();
  await expect(stranger.getByText("Terima kasih sudah datang!")).toBeVisible();
  await expect(stranger.locator(".invite-thanks img")).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Kirim konfirmasi" })).toHaveCount(0);
  await strangerContext.close();
});
