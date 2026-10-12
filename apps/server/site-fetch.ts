import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";
import http from "node:http";
import https from "node:https";
import sharp from "sharp";
import { AppError } from "../../packages/core/src/social.js";

/**
 * Fetching on behalf of users is the classic way into a server's private network, so every
 * request here: resolves the host first and refuses private, loopback, link-local and other
 * special addresses; connects to exactly the address it checked (no second DNS answer); follows at
 * most three redirects, checking each hop the same way; and stops at a size and time limit.
 */

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, bits, "ipv6");

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (!family) return false;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it really is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return !blocked.check(mapped[1]!, "ipv4");
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export interface FetchOptions {
  /** host:port pairs a local trial may fetch from despite the rules above. Never in production. */
  allowHosts?: string[];
  timeoutMs?: number;
}
interface Fetched {
  url: URL;
  type: string;
  body: Buffer;
}

async function resolveSafe(url: URL, allow: boolean) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const answers = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new AppError("SITE_NOT_FOUND", 422);
      });
  if (!answers.length) throw new AppError("SITE_NOT_FOUND", 422);
  if (!allow && answers.some((a) => !isPublicAddress(a.address)))
    throw new AppError("SITE_NOT_ALLOWED", 422);
  return answers[0]!;
}

function checkUrl(raw: string | URL, options: FetchOptions) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("SITE_URL_INVALID", 422);
  }
  const allowed = (options.allowHosts ?? []).includes(url.host);
  if (url.username || url.password) throw new AppError("SITE_URL_INVALID", 422);
  if (url.protocol !== "https:" && !(allowed && url.protocol === "http:"))
    throw new AppError("SITE_NEEDS_HTTPS", 422);
  if (url.port && url.port !== "443" && !allowed) throw new AppError("SITE_NOT_ALLOWED", 422);
  url.hash = "";
  return { url, allowed };
}

/** One GET with every rule above. `accept` decides whether the content type is wanted. */
export async function safeGet(
  raw: string,
  maxBytes: number,
  accept: (type: string) => boolean,
  options: FetchOptions = {},
): Promise<Fetched> {
  const deadline = Date.now() + (options.timeoutMs ?? 8000);
  let next = raw;
  for (let hop = 0; hop < 4; hop++) {
    const { url, allowed } = checkUrl(next, options);
    const target = await resolveSafe(url, allowed);
    const pinned: LookupFunction = (_host, opts, done) => {
      if (typeof opts === "object" && opts && "all" in opts && opts.all)
        (done as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
          target,
        ]);
      else done(null, target.address, target.family);
    };
    const result = await new Promise<{
      status: number;
      location?: string;
      type: string;
      body: Buffer;
    }>((resolve, reject) => {
      const left = deadline - Date.now();
      if (left <= 0) return reject(new AppError("SITE_TOO_SLOW", 422));
      const request = (url.protocol === "https:" ? https : http).request(
        url,
        {
          method: "GET",
          lookup: pinned,
          timeout: left,
          headers: {
            "user-agent": "SmudgeImport/1.0 (+one-time page import requested by its owner)",
            accept: "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.1",
            "accept-encoding": "identity",
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const type = String(response.headers["content-type"] ?? "").toLowerCase();
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            return resolve({
              status,
              location: response.headers.location,
              type,
              body: Buffer.alloc(0),
            });
          }
          if (status !== 200) {
            response.resume();
            return reject(new AppError(status === 404 ? "SITE_NOT_FOUND" : "SITE_REFUSED", 422));
          }
          if (!accept(type)) {
            response.resume();
            return reject(new AppError("SITE_NOT_A_PAGE", 422));
          }
          const declared = Number(response.headers["content-length"] ?? 0);
          if (declared > maxBytes) {
            response.destroy();
            return reject(new AppError("SITE_TOO_LARGE", 422));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              response.destroy();
              reject(new AppError("SITE_TOO_LARGE", 422));
            } else chunks.push(chunk);
          });
          response.on("end", () => resolve({ status, type, body: Buffer.concat(chunks) }));
          response.on("error", () => reject(new AppError("SITE_REFUSED", 422)));
        },
      );
      request.on("timeout", () => request.destroy(new AppError("SITE_TOO_SLOW", 422)));
      request.on("error", (e) =>
        reject(e instanceof AppError ? e : new AppError("SITE_UNREACHABLE", 422)),
      );
      request.end();
    });
    if (result.location) {
      next = new URL(result.location, url).href;
      continue;
    }
    return { url, type: result.type, body: result.body };
  }
  throw new AppError("SITE_TOO_MANY_REDIRECTS", 422);
}

export async function fetchPage(raw: string, options: FetchOptions = {}) {
  const page = await safeGet(
    raw,
    2_000_000,
    (type) => type.includes("text/html") || type.includes("application/xhtml"),
    options,
  );
  const declared = /charset=([\w-]+)/.exec(page.type)?.[1];
  const sniffed = /<meta[^>]+charset=["']?([\w-]+)/i.exec(
    page.body.subarray(0, 2048).toString("latin1"),
  )?.[1];
  let html: string;
  try {
    html = new TextDecoder(declared ?? sniffed ?? "utf-8").decode(page.body);
  } catch {
    html = new TextDecoder("utf-8").decode(page.body);
  }
  return { url: page.url.href, html };
}

/**
 * Downloads a photo and re-encodes it as a modest WebP, so what reaches Smudge is pixels only (no
 * metadata, no SVG, no animation) and pages stay light. Returns null for anything unusable.
 */
export async function fetchPhoto(raw: string, options: FetchOptions = {}) {
  try {
    const file = await safeGet(
      raw,
      6_000_000,
      (type) => /^image\/(jpeg|png|webp|gif|avif)/.test(type),
      {
        ...options,
        timeoutMs: options.timeoutMs ?? 6000,
      },
    );
    const image = sharp(file.body, { limitInputPixels: 40_000_000, animated: false });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width < 120 || meta.height < 120) return null;
    const out = await image
      .rotate()
      .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();
    return out.length <= 900_000 ? out : null;
  } catch {
    return null;
  }
}
