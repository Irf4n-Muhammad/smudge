/**
 * A tier list result as a phone story (1080×1920): the viewer's tiers, the post's title and the
 * link back, drawn as one SVG with no outside references and rasterised to a PNG for the share
 * sheet. Every string is escaped.
 */
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const tierColor: Record<string, string> = {
  S: "#ff4f7b",
  A: "#ff9f43",
  B: "#ffd84d",
  C: "#7bd88f",
  D: "#6cb6ff",
};
const font = "'Helvetica Neue',Arial,sans-serif";

export function tierStorySvg(input: {
  title: string;
  placed: { item: string; tier: string }[];
  link: string;
}) {
  const tiers = [...new Set(input.placed.map((p) => p.tier))].sort((a, b) =>
    a === "S" ? -1 : b === "S" ? 1 : a.localeCompare(b),
  );
  const rowH = Math.min(220, Math.floor(1000 / Math.max(tiers.length, 1)));
  const rows = tiers
    .map((tier, i) => {
      const y = 520 + i * (rowH + 20);
      const lines: string[] = [];
      for (const item of input.placed.filter((p) => p.tier === tier).map((p) => clip(p.item, 24)))
        if (lines.length && `${lines.at(-1)}  ·  ${item}`.length <= 26)
          lines[lines.length - 1] += `  ·  ${item}`;
        else lines.push(item);
      const shown = lines.slice(0, 3);
      const color = tierColor[tier] ?? "#d9d4cc";
      const text = shown
        .map(
          (line, j) =>
            `<text x="${120 + rowH}" y="${y + rowH / 2 + 14 + (j - (shown.length - 1) / 2) * 52}" font-family="${font}" font-weight="700" font-size="40" fill="#ffffff">${escape(line)}</text>`,
        )
        .join("");
      return `<rect x="80" y="${y}" width="${rowH}" height="${rowH}" rx="28" fill="${color}"/><text x="${80 + rowH / 2}" y="${y + rowH / 2 + 34}" text-anchor="middle" font-family="${font}" font-weight="900" font-size="96" fill="#141210">${escape(clip(tier, 2))}</text>${text}`;
    })
    .join("");
  const shown = input.link.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#141210"/><text x="80" y="200" font-family="${font}" font-weight="700" font-size="40" fill="#ff4f7b">MY TIER LIST</text><text x="80" y="300" font-family="${font}" font-weight="900" font-size="68" fill="#ffffff">${escape(clip(input.title, 28))}</text><text x="80" y="390" font-family="${font}" font-size="40" fill="#bdb6ac">Do yours and see who agrees.</text>${rows}<rect x="80" y="1680" width="920" height="120" rx="60" fill="#ffffff"/><text x="540" y="1756" text-anchor="middle" font-family="${font}" font-weight="800" font-size="40" fill="#141210">${escape(clip(shown, 40))}</text></svg>`;
}

export async function svgToPng(svg: string, width = 1080, height = 1920) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The picture could not be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("The picture could not be saved."))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The share sheet with the picture where the phone allows it; otherwise save it and copy the link. */
export async function shareTierStory(input: {
  postId: string;
  title: string;
  placed: { item: string; tier: string }[];
}) {
  const link = `${window.location.origin}/p/${encodeURIComponent(input.postId)}`;
  const blob = await svgToPng(tierStorySvg({ ...input, link }));
  const file = new File([blob], "smudge-tier-list.png", { type: "image/png" });
  const data = { files: [file], text: `${input.title} ${link}` };
  if (typeof navigator.share === "function" && navigator.canShare?.(data)) {
    await navigator.share(data);
    return "shared" as const;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  await navigator.clipboard?.writeText(link).catch(() => undefined);
  return "saved" as const;
}
