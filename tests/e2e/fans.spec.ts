import { test, expect } from "@playwright/test";

test("fans: a drop opens first for a creator's fans, joining the room lets you in early", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".post-card").first().waitFor();
  await page.locator(".sidebar").getByRole("button", { name: "Mall" }).click();
  const mall = page.getByRole("region", { name: "Mall" });
  await mall.getByRole("tab", { name: "Drops" }).click();
  // Alex follows Leo but isn't in his room and holds no marathon stamp: everyone's wave.
  const drop = mall.getByRole("article", { name: "Club singlet, run 01 by Leo Park" });
  await expect(drop).toContainText("29 of 30 left");
  await expect(drop).toContainText(/Opens for you in 2 days/);
  await drop.getByRole("button", { name: "Fans get it now" }).click();

  const room = page.getByRole("dialog", { name: "Long Run Club" });
  await expect(room).toContainText("1 fan, Maya is in");
  await expect(room).toContainText("Notes in the room are for fans.");
  await room.getByRole("button", { name: "Join, $5 a month" }).click();
  await expect(room).toContainText("Sunday: 18K along the river");
  await room.getByLabel("Write to the room").fill("See you at the bridge");
  await room.getByRole("button", { name: "Send" }).click();
  await expect(room.locator(".fan-note").first()).toContainText("See you at the bridge");
  // The presale is Alex's now.
  const inRoom = room.getByRole("article", { name: /Club singlet/ });
  await inRoom.getByRole("button", { name: "Get it, $35" }).click();
  await expect(inRoom).toContainText(/Yours\. Code DROP-[0-9A-F]{8}/);
  await room.getByRole("button", { name: "Close" }).click();
  await expect(drop).toContainText("28 of 30 left");

  // Leo's page carries the room.
  await page.goto("/?profile=leo");
  await page.getByRole("button", { name: "Fan room: Long Run Club" }).click();
  await expect(page.getByRole("dialog", { name: "Long Run Club" })).toContainText(
    "You're in until",
  );
});
