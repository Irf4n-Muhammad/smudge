import type { SocialService } from "../../packages/core/src/social.js";
import type { ThemeStudio } from "../../packages/core/src/themes.js";

/**
 * Demo content for the open theme market (ADR 0024): one community theme already approved (worn
 * by its designer unless they already wear another) and one waiting in the review queue. Both
 * pass the same validation as any submission; only the approval is written directly, since the
 * seed has no moderator.
 */
export function seedThemes(social: SocialService, studio: ThemeStudio) {
  seedMarketThemes(social, studio);
  markNeonSign(social);
}
/** v2 (ADR 0025): the neon sign's words became a slot wearers may rewrite. */
function markNeonSign(social: SocialService) {
  const store = social.store;
  const marker = "seed-neon-sign-slot-v2";
  if (store.get("system", marker)) return;
  store.transaction(() => {
    for (const t of store.all<{
      id: string;
      creatorId: string;
      name: string;
      pieces: { html: string }[];
    }>("theme-submission"))
      if (
        t.creatorId === "leo" &&
        t.name === "Neon open late" &&
        !t.pieces[0]?.html.includes("data-text")
      )
        store.put("theme-submission", t.id, {
          ...t,
          pieces: t.pieces.map((p, i) =>
            i === 0
              ? { ...p, html: p.html.replace('class="neon"', 'class="neon" data-text="sign"') }
              : p,
          ),
        });
    store.put("system", marker, { at: new Date().toISOString() });
  });
}
function seedMarketThemes(social: SocialService, studio: ThemeStudio) {
  const store = social.store;
  const marker = "seed-community-themes-v1";
  if (store.get("system", marker) || !store.get("user", "leo") || !store.get("user", "arif"))
    return;
  const neon = studio.submit(
    { userId: "leo" },
    {
      name: "Neon open late",
      accent: "#ff4fd8",
      font: "display",
      kind: "market",
      pieces: [
        {
          anchor: "top-left",
          width: 170,
          height: 64,
          dx: -18,
          dy: -30,
          html: '<div class="neon" data-text="sign">open late</div>',
          css:
            ".neon{display:inline-block;margin:8px;padding:8px 14px;border:3px solid #ff4fd8;" +
            "border-radius:14px;background:#1b0b24;color:#fff;font:italic 800 24px/1 system-ui,sans-serif;" +
            "text-shadow:0 0 6px #ff4fd8,0 0 14px #ff4fd8;box-shadow:0 0 10px #ff4fd8,inset 0 0 8px #ff4fd8;" +
            "transform:rotate(-4deg);animation:flicker 3s infinite}" +
            "@keyframes flicker{0%,92%,100%{opacity:1}94%{opacity:.4}96%{opacity:1}97%{opacity:.6}}",
        },
        {
          anchor: "bottom-right",
          width: 60,
          height: 60,
          dx: -70,
          dy: -40,
          html: '<div class="star">✦</div>',
          css:
            ".star{color:#7df9ff;font:40px/60px system-ui,sans-serif;text-align:center;" +
            "text-shadow:0 0 10px #7df9ff;animation:spin 6s linear infinite}" +
            "@keyframes spin{to{transform:rotate(360deg)}}",
        },
      ],
    },
  );
  studio.submit(
    { userId: "arif" },
    {
      name: "Coffee steam",
      accent: "#7a4a2b",
      font: "hand",
      kind: "market",
      pieces: [
        {
          anchor: "top",
          width: 120,
          height: 80,
          dx: -60,
          dy: -60,
          html: '<div class="steam"><i></i><i></i><i></i></div>',
          css:
            ".steam{display:flex;justify-content:center;gap:14px;padding-top:6px}" +
            ".steam i{width:8px;height:56px;border-radius:8px;background:linear-gradient(#fff0,#c8a27a);" +
            "animation:rise 2.4s ease-in-out infinite}.steam i:nth-child(2){animation-delay:.8s}" +
            ".steam i:nth-child(3){animation-delay:1.6s}" +
            "@keyframes rise{0%{transform:translateY(16px) scaleY(.6);opacity:0}50%{opacity:1}" +
            "100%{transform:translateY(-8px) scaleY(1);opacity:0}}",
        },
      ],
    },
  );
  const now = new Date().toISOString();
  store.transaction(() => {
    const record = store.get<Record<string, unknown>>("theme-submission", neon.id)!;
    store.put("theme-submission", neon.id, {
      ...record,
      status: "approved",
      reviewedAt: now,
      reviewerId: "you",
    });
    const prefs = store.get<{ base?: { id: string | null } }>("prefs", "leo") ?? {};
    if (!prefs.base?.id) store.put("prefs", "leo", { ...prefs, base: { id: neon.id, since: now } });
    store.put("system", marker, { at: now });
  });
}
