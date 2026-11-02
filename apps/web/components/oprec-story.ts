import { svgToPng } from "./tier-story";

/**
 * The twibbon for an oprec: "I applied to <division>, <org> <term>" as a phone story, with the
 * link to the recruitment so whoever sees it can apply too. Every string is escaped.
 */
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const font = "'Helvetica Neue',Arial,sans-serif";

export function oprecStorySvg(input: {
  org: string;
  term: string | null;
  role: string;
  title: string;
  link: string;
}) {
  const initial = escape(input.org.trim()[0]?.toUpperCase() ?? "S");
  const shown = input.link.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d3a2e"/><stop offset="1" stop-color="#7a8a6c"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><rect x="60" y="60" width="960" height="1800" rx="48" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/><circle cx="540" cy="480" r="150" fill="#ffffff" fill-opacity="0.18"/><text x="540" y="530" text-anchor="middle" font-family="${font}" font-weight="900" font-size="150" fill="#ffffff">${initial}</text><text x="540" y="780" text-anchor="middle" font-family="${font}" font-weight="700" font-size="44" fill="#ffd84d">I APPLIED</text><text x="540" y="900" text-anchor="middle" font-family="${font}" font-weight="900" font-size="88" fill="#ffffff">${escape(clip(input.role, 18))}</text><text x="540" y="990" text-anchor="middle" font-family="${font}" font-weight="700" font-size="48" fill="#ffffff">${escape(clip(input.org, 30))}</text>${input.term ? `<text x="540" y="1060" text-anchor="middle" font-family="${font}" font-size="44" fill="#e8e2d6">${escape(clip(input.term, 20))}</text>` : ""}<text x="540" y="1300" text-anchor="middle" font-family="${font}" font-size="40" fill="#e8e2d6">${escape(clip(input.title, 40))}</text><text x="540" y="1370" text-anchor="middle" font-family="${font}" font-size="40" fill="#e8e2d6">Apply with your profile:</text><rect x="120" y="1660" width="840" height="120" rx="60" fill="#ffffff"/><text x="540" y="1736" text-anchor="middle" font-family="${font}" font-weight="800" font-size="36" fill="#141210">${escape(clip(shown, 42))}</text></svg>`;
}

export async function shareOprecStory(input: {
  org: string;
  term: string | null;
  role: string;
  title: string;
  path: string;
}) {
  const link = `${window.location.origin}${input.path}`;
  const blob = await svgToPng(oprecStorySvg({ ...input, link }));
  const file = new File([blob], "smudge-oprec.png", { type: "image/png" });
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
