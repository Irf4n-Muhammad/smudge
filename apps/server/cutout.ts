import sharp from "sharp";

/**
 * Lifts a product off its plain studio backdrop so every piece can sit on the same background.
 * Starting from the picture's edges, it clears what looks like backdrop: near the edge colour,
 * as colourless as it, and changing only gently (a soft shadow), stopping at the garment's edge.
 * Returns null when the picture has no plain backdrop, or is already cut out.
 */
export async function cutout(input: Buffer, size = 640): Promise<Buffer | null> {
  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w < 32 || h < 32) return null;
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  // Already see-through at the edges: someone cut it out before us.
  if (edge.filter((p) => data[p * 4 + 3]! < 128).length > edge.length / 2) return null;
  const mid = (c: number) => {
    const v = edge.map((p) => data[p * 4 + c]!).sort((a, b) => a - b);
    return v[v.length >> 1]!;
  };
  const bg = [mid(0), mid(1), mid(2)] as const;
  const far = (p: number) =>
    Math.max(
      Math.abs(data[p * 4]! - bg[0]),
      Math.abs(data[p * 4 + 1]! - bg[1]),
      Math.abs(data[p * 4 + 2]! - bg[2]),
    );
  // A backdrop is one light colour nearly all the way round.
  if (Math.min(...bg) < 200 || edge.filter((p) => far(p) > 12).length > edge.length * 0.15)
    return null;
  const tint = (p: number) => {
    const r = data[p * 4]! - bg[0];
    const g = data[p * 4 + 1]! - bg[1];
    const b = data[p * 4 + 2]! - bg[2];
    return Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  };
  const light = (p: number) => data[p * 4]! + data[p * 4 + 1]! + data[p * 4 + 2]!;
  const clear = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const p of edge)
    if (!clear[p] && far(p) <= 12) {
      clear[p] = 1;
      queue[tail++] = p;
    }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= w * h || clear[q]) continue;
      const d = far(q);
      // Plain backdrop, or a shadow on it: grey like the backdrop, and no sharp step from here.
      if (d <= 7 || (d <= 60 && tint(q) <= 7 && Math.abs(light(q) - light(p)) <= 9)) {
        clear[q] = 1;
        queue[tail++] = q;
      }
    }
  }
  const gone = tail / (w * h);
  if (gone < 0.15 || gone > 0.93) return null;
  for (let p = 0; p < w * h; p++) if (clear[p]) data[p * 4 + 3] = 0;
  // Soften the cut by one pixel so edges don't look scissored.
  const alpha = await sharp(Buffer.from(data.filter((_, i) => i % 4 === 3)), {
    raw: { width: w, height: h, channels: 1 },
  })
    .blur(0.8)
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let p = 0; p < w * h; p++) data[p * 4 + 3] = Math.min(data[p * 4 + 3]!, alpha[p]!);
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 90 })
    .toBuffer();
}
