import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cutout } from "../apps/server/cutout.js";

const studio = (background: string, square: string) =>
  sharp({ create: { width: 200, height: 200, channels: 3, background } })
    .composite([
      {
        input: { create: { width: 80, height: 80, channels: 3, background: square } },
        left: 60,
        top: 60,
      },
    ])
    .png()
    .toBuffer();

test("a plain studio backdrop is lifted off, and the piece is kept", async () => {
  const cut = await cutout(await studio("#f2f2f0", "#5a3a22"));
  assert.ok(cut);
  const { data, info } = await sharp(cut).raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alpha(5, 5), 0, "the backdrop is see-through");
  assert.equal(alpha(100, 100), 255, "the piece is solid");
});

test("a picture with no plain backdrop, or one already cut out, is left as it is", async () => {
  assert.equal(await cutout(await studio("#335577", "#5a3a22")), null);
  const cut = await cutout(await studio("#f2f2f0", "#5a3a22"));
  assert.equal(await cutout(await sharp(cut!).png().toBuffer()), null);
});
