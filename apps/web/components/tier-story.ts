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

/**
 * Any answer as a story: the post's photo on top when it has one, the question, what you said in
 * big type, and what the people you follow said, so the picture itself is the dare to answer.
 */
export function answerStorySvg(input: {
  title: string;
  mine: string;
  friends: { name: string; said: string }[];
  count: number;
  link: string;
  /** A data: URL; outside references would not load inside the picture. */
  photo?: string | undefined;
}) {
  const top = input.photo ? 820 : 260;
  const photo = input.photo
    ? `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#141210" stop-opacity="0"/><stop offset="1" stop-color="#141210"/></linearGradient><clipPath id="crop"><rect width="1080" height="900"/></clipPath></defs><image href="${escape(input.photo)}" x="0" y="0" width="1080" height="900" preserveAspectRatio="xMidYMid slice" clip-path="url(#crop)"/><rect width="1080" height="900" fill="url(#fade)"/>`
    : "";
  const words = clip(input.title, 60).split(/\s+/);
  const lines: string[] = [];
  for (const w of words)
    if (lines.length && `${lines.at(-1)} ${w}`.length <= 22) lines[lines.length - 1] += ` ${w}`;
    else lines.push(w);
  const title = lines
    .slice(0, 3)
    .map(
      (l, i) =>
        `<text x="80" y="${top + 40 + i * 84}" font-family="${font}" font-weight="900" font-size="76" fill="#ffffff">${escape(l)}</text>`,
    )
    .join("");
  const y = top + 40 + Math.min(lines.length, 3) * 84 + 40;
  const friends = input.friends
    .slice(0, 3)
    .map(
      (f, i) =>
        `<text x="80" y="${y + 300 + i * 70}" font-family="${font}" font-size="44" fill="#bdb6ac"><tspan font-weight="800" fill="#ffffff">${escape(clip(f.name, 14))}</tspan>  ${escape(clip(f.said, 26))}</text>`,
    )
    .join("");
  const others = input.count - 1 - Math.min(input.friends.length, 3);
  const more =
    others > 0
      ? `<text x="80" y="${y + 300 + Math.min(input.friends.length, 3) * 70}" font-family="${font}" font-size="40" fill="#8d877e">and ${others} more answered</text>`
      : "";
  const shown = input.link.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#141210"/>${photo}${title}<rect x="80" y="${y}" width="920" height="200" rx="40" fill="#d8ff3d"/><text x="120" y="${y + 62}" font-family="${font}" font-weight="700" font-size="32" fill="#141210" opacity=".7">I SAID</text><text x="120" y="${y + 150}" font-family="${font}" font-weight="900" font-size="72" fill="#141210">${escape(clip(input.mine, 22))}</text>${friends}${more}<text x="80" y="1640" font-family="${font}" font-size="40" fill="#bdb6ac">Answer it and see who agrees.</text><rect x="80" y="1680" width="920" height="120" rx="60" fill="#ffffff"/><text x="540" y="1756" text-anchor="middle" font-family="${font}" font-weight="800" font-size="40" fill="#141210">${escape(clip(shown, 40))}</text></svg>`;
}

/** A photo as a data: URL for the story picture, or nothing when it can't be read. */
export async function photoData(assetId: string | undefined) {
  if (!assetId) return undefined;
  try {
    const blob = await (await fetch(`/api/assets/${encodeURIComponent(assetId)}`)).blob();
    if (!blob.type.startsWith("image/")) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** The share sheet with the picture where the phone allows it; otherwise save it and copy the link. */
export async function shareStory(
  postId: string,
  title: string,
  name: string,
  svg: (link: string) => string,
) {
  const link = `${window.location.origin}/p/${encodeURIComponent(postId)}`;
  const blob = await svgToPng(svg(link));
  const file = new File([blob], name, { type: "image/png" });
  const data = { files: [file], text: `${title} ${link}` };
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

export function shareTierStory(input: {
  postId: string;
  title: string;
  placed: { item: string; tier: string }[];
}) {
  return shareStory(input.postId, input.title, "smudge-tier-list.png", (link) =>
    tierStorySvg({ ...input, link }),
  );
}
