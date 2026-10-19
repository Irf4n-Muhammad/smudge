import type { ShareCard } from "../../packages/core/src/share-card.js";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const fonts: Record<string, string> = {
  ui: "'Helvetica Neue',Arial,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  hand: "'Bradley Hand','Segoe Print','Comic Sans MS',cursive",
  display: "'Arial Black',Impact,'Helvetica Neue',sans-serif",
  spray: "'Arial Black',Impact,'Helvetica Neue',sans-serif",
};
/** Dark or light ink for a six-digit hex background. */
const inkFor = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#141210" : "#ffffff";
};
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * A 1080×1350 card (a phone story's shape) as one SVG with no outside references, so the
 * browser can rasterise it to a PNG and the share sheet can carry it. Every string is escaped.
 */
export function renderShareCard(card: ShareCard, origin: string) {
  const bg = card.side.accent;
  const ink = inkFor(bg);
  const accent = card.theme?.accent ?? "#ffffff";
  const accentInk = inkFor(accent);
  const font = fonts[card.theme?.font ?? "ui"] ?? fonts.ui!;
  const link = `${origin.replace(/\/$/, "")}${card.path}`;
  const shown = link.replace(/^https?:\/\//, "");
  const avatar = card.avatar
    ? `<clipPath id="a"><circle cx="540" cy="430" r="190"/></clipPath><image href="${escape(card.avatar)}" x="350" y="240" width="380" height="380" preserveAspectRatio="xMidYMid slice" clip-path="url(#a)"/>`
    : `<circle cx="540" cy="430" r="190" fill="${escape(card.user.color)}"/><text x="540" y="470" text-anchor="middle" font-family="${font}" font-weight="900" font-size="120" fill="#141210">${escape(card.user.initials)}</text>`;
  const theme = card.theme
    ? `<g transform="translate(540 1010)"><rect x="-260" y="-40" width="520" height="80" rx="40" fill="${escape(accent)}"/><text y="14" text-anchor="middle" font-family="${font}" font-weight="700" font-size="34" fill="${accentInk}">${escape(clip(card.theme.event ?? card.theme.name, 24))}</text></g>`
    : "";
  const stamps = card.stamps
    ? `<text x="540" y="${card.theme ? 1110 : 1030}" text-anchor="middle" font-family="${fonts.ui}" font-size="32" fill="${ink}" opacity=".85">${escape(`${card.stamps.held} of ${card.stamps.total} stamps · ${clip(card.stamps.name, 30)}`)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="${escape(`${card.user.name} · ${card.side.name} on Smudge`)}">
<rect width="1080" height="1350" fill="${escape(bg)}"/>
<circle cx="900" cy="-60" r="420" fill="${escape(accent)}" opacity=".18"/>
<circle cx="120" cy="1300" r="320" fill="${escape(accent)}" opacity=".12"/>
<text x="80" y="130" font-family="${fonts.ui}" font-weight="900" font-size="44" fill="${ink}" letter-spacing="-1">smudge.</text>
<g transform="translate(1000 100)"><rect x="${-(card.side.name.length * 20 + 60)}" y="-36" width="${card.side.name.length * 20 + 60}" height="72" rx="36" fill="${ink}" opacity=".12"/><text x="-30" y="12" text-anchor="end" font-family="${fonts.ui}" font-weight="700" font-size="30" fill="${ink}">${escape(card.side.name)}</text></g>
<circle cx="540" cy="430" r="206" fill="none" stroke="${escape(accent)}" stroke-width="12"/>
${avatar}
<text x="540" y="760" text-anchor="middle" font-family="${font}" font-weight="900" font-size="${card.user.name.length > 16 ? 72 : 96}" fill="${ink}">${escape(clip(card.user.name, 26))}</text>
<text x="540" y="830" text-anchor="middle" font-family="${fonts.ui}" font-size="40" fill="${ink}" opacity=".8">@${escape(card.user.handle)}</text>
<text x="540" y="920" text-anchor="middle" font-family="${fonts.ui}" font-weight="700" font-size="44" fill="${ink}">${escape(`${card.side.name} on Smudge`)}</text>
${theme}
${stamps}
<rect x="80" y="1190" width="920" height="90" rx="45" fill="${ink}" opacity=".1"/>
<text x="540" y="1250" text-anchor="middle" font-family="${fonts.ui}" font-weight="700" font-size="34" fill="${ink}">${escape(clip(shown, 44))}</text>
</svg>`;
}
