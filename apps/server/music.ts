import { readFileSync } from "node:fs";
import { profilePackageSchema } from "../../packages/contracts/src/profile.js";
import { rakaPackage } from "./raka.js";
const pkg = structuredClone(rakaPackage);
if (pkg.manifest.schemaVersion !== 2) throw new Error("Modular shell required");
pkg.manifest.name = "After Hours / Music zine";
pkg.manifest.headerOverlay = false;
// Keep the shared asset definitions for mixing Raka fragments, but own the shell and ending.
pkg.files["index.html"] =
  pkg.files["index.html"]!.split('<main class="world">')[0] +
  `
<style>.music-world{padding:0 0 20px}.music-world .post-tile .art{color:#171716}.mz-signoff{padding:30px 22px;font:700 12px monospace;letter-spacing:.18em;border-top:2px solid currentColor;display:flex;justify-content:space-between}</style>
<main class="world music-world">
<script>
window.profileData=forma.profile.read().catch(()=>({owner:{},posts:[]}));
window.refreshSocial=async()=>{try{const s=await forma.profile.social.read();window.dispatchEvent(new CustomEvent('profile-social',{detail:s}));return s}catch{return null}};
</script>
<!--forma:profile--><!--forma:story--><!--forma:feature--><!--forma:post-->
<footer class="mz-signoff"><span>SIDE B / KEEP LISTENING</span><span>END OF THIS SIDE ↗</span></footer>
</main>`;
pkg.manifest.poll = {
  id: "after-hours-encore",
  question: "What closes the night?",
  options: [
    { id: "long-way", label: "The Long Way Home" },
    { id: "velvet", label: "Velvet Static" },
    { id: "first-light", label: "First Light" },
  ],
};
pkg.manifest.parts = {
  profile: {
    name: "After Hours / Vinyl",
    entrypoint: "music/profile.html",
    capabilities: ["profile.read"],
  },
  post: {
    name: "After Hours / Gig posters",
    entrypoint: "music/post.html",
    capabilities: ["profile.read", "profile.openPost", "profile.cover"],
  },
  story: {
    name: "After Hours / Tickets",
    entrypoint: "music/story.html",
    capabilities: ["profile.read", "profile.openPost"],
  },
  feature: {
    name: "After Hours / Setlist vote",
    entrypoint: "music/feature.html",
    capabilities: ["profile.poll.read", "profile.poll.vote"],
  },
};
pkg.manifest.capabilities = [
  "profile.read",
  "profile.openPost",
  "profile.cover",
  "profile.poll.read",
  "profile.poll.vote",
];
for (const slot of ["profile", "post", "story", "feature"])
  pkg.files[`music/${slot}.html`] = readFileSync(`apps/server/profiles/music/${slot}.html`, "utf8");
export const musicPackage = profilePackageSchema.parse(pkg);
