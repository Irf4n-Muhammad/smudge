import type { Experience } from "../../contracts/src/experience.js";
import { sdkSource } from "../../post-sdk/src/source.js";

/** Only the app's own origins may frame post code. */
export const runtimeCspFor = (ancestors: string[]) =>
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-forms; frame-ancestors ${ancestors.join(" ")}`;
export const runtimeCsp = runtimeCspFor(["http://127.0.0.1:3000", "http://localhost:3000"]);

/** Do not compile untrusted source or resolve filesystem paths here. Files are in the validated package. */
export function renderDocument(
  experience: Experience,
  nonce: string,
  assets: Record<string, string>,
) {
  let html = experience.files["index.html"]!;
  html = html.replace(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (_all, path: string) => {
      const source = experience.files[path];
      return source === undefined
        ? ""
        : `<script>${source.replace(/<\/script/gi, "<\\/script")}</script>`;
    },
  );
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (_all, path: string) => {
    const source = experience.files[path];
    return source === undefined
      ? ""
      : `<style>${source.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  html = html.replace(/asset:([a-f0-9-]{36})/g, (_all, id: string) => assets[id] ?? "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;}*{box-sizing:border-box}body{font-family:Arial,sans-serif}button,input,textarea{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #d94f35;outline-offset:3px}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}</style><script>${sdkSource(nonce)}</script></head><body>${html}</body></html>`;
}
