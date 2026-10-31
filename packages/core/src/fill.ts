import { z } from "zod";
import type { Experience } from "../../contracts/src/experience.js";
import { AppError } from "./social.js";

/**
 * Fill-in formats. A creator lists the parts of a post others may change in `smudge/fill.js`
 * (`window.smudgeFill = {"fields":[...]};`), marks them in the page with `data-fill="key"` or
 * reads `window.smudgeFill.values`, and anyone can then make their own version from a form,
 * without touching the code. The file is rewritten here on every save, so the script that puts
 * values into the page is always this one.
 */
export const fillFile = "smudge/fill.js";
const assetValue = /^asset:([a-f0-9-]{36})$/;

const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),
    label: z.string().trim().min(1).max(60),
    /** `long` is a few lines of text; `image` holds `asset:ID`. */
    kind: z.enum(["text", "long", "image"]),
    value: z.string().max(2000),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.kind === "image" ? !assetValue.test(f.value) : f.value.length > limits[f.kind])
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_FILL_VALUE" });
  });
export type FillField = z.infer<typeof fieldSchema>;
const limits = { text: 200, long: 2000 };
const fillSchema = z
  .object({
    fields: z
      .array(fieldSchema)
      .min(1)
      .max(30)
      .refine((f) => new Set(f.map((x) => x.key)).size === f.length, "DUPLICATE_FILL_KEY"),
  })
  .strict();

/** Puts each value into the page's `data-fill` parts once it has loaded. */
const applyScript = `(()=>{const f=window.smudgeFill,v={};for(const x of f.fields)v[x.key]=x.value;f.values=v;const put=()=>{for(const el of document.querySelectorAll("[data-fill]")){const x=v[el.dataset.fill];if(x===undefined)continue;if(el.tagName==="IMG")el.src=x;else el.textContent=x}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",put):put()})();\n`;

const write = (fields: FillField[]) =>
  `window.smudgeFill = ${JSON.stringify({ fields }).replace(/</g, "\\u003c")};\n${applyScript}`;

/** The post's fields, or null when it is not a fill-in format or its list cannot be read. */
export function readFill(pkg: Experience): FillField[] | null {
  if (pkg.manifest.schemaVersion !== 2) return null;
  const match = /^window\.smudgeFill = (.+);\s*(?:\n|$)/.exec(pkg.files[fillFile] ?? "");
  if (!match) return null;
  try {
    const parsed = fillSchema.safeParse(JSON.parse(match[1]!));
    return parsed.success ? parsed.data.fields : null;
  } catch {
    return null;
  }
}

/**
 * Checks a saved package's field list and rewrites the file with the standard script. A list that
 * is there but cannot be read is an error, so a creator never publishes a format nobody can fill.
 */
export function normalizeFill(pkg: Experience): Experience {
  if (pkg.manifest.schemaVersion !== 2 || pkg.files[fillFile] === undefined) return pkg;
  const fields = readFill(pkg);
  if (!fields) throw new AppError("INVALID_FILL");
  const assets = new Set(pkg.manifest.assets);
  if (fields.some((f) => f.kind === "image" && !assets.has(assetValue.exec(f.value)![1]!)))
    throw new AppError("FILL_ASSET_NOT_IN_MANIFEST");
  return { ...pkg, files: { ...pkg.files, [fillFile]: write(fields) } };
}

/**
 * A copy of the package with new values. Keys left out keep the format's value; images are asset
 * ids the caller has already checked the person may use.
 */
export function fillPackage(pkg: Experience, values: Record<string, string>): Experience {
  const fields = readFill(pkg);
  if (!fields || pkg.manifest.schemaVersion !== 2) throw new AppError("NOT_FILLABLE");
  for (const key of Object.keys(values))
    if (!fields.some((f) => f.key === key)) throw new AppError("UNKNOWN_FILL_KEY");
  const next = fields.map((f) => {
    const value = values[f.key];
    if (value === undefined) return f;
    return fieldSchema.parse({ ...f, value: f.kind === "image" ? `asset:${value}` : value.trim() });
  });
  const added = next.flatMap((f) => (f.kind === "image" ? [assetValue.exec(f.value)![1]!] : []));
  return {
    ...pkg,
    manifest: { ...pkg.manifest, assets: [...new Set([...pkg.manifest.assets, ...added])] },
    files: { ...pkg.files, [fillFile]: write(next) },
  };
}
