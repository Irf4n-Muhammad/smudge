import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError, type SocialService } from "./social.js";
import type { Actor } from "./index.js";

/**
 * A person's own website as their profile. Smudge shows it only after the person proves the
 * domain is theirs, with a token in a file on the site or in a DNS TXT record, and checks again
 * now and then so a domain that changes hands stops showing on the old owner's profile.
 */
export interface OwnSite {
  ownerId: string;
  url: string;
  host: string;
  token: string;
  verifiedAt: string | null;
  /** Last time the token was seen again after verifying. */
  confirmedAt: string | null;
  method: "file" | "dns" | null;
}

/** What the server can ask the outside world, so this file never touches the network itself. */
export interface SiteProbe {
  /** The text at an https URL, or null when the site answered without it; throws when unreachable. */
  readText(url: string): Promise<string | null>;
  /** TXT records for a DNS name; empty when there are none. */
  txt(name: string): Promise<string[]>;
}

export const ownSiteFile = "/.well-known/smudge-verification.txt";
export const ownSiteDnsName = (host: string) => `_smudge.${host}`;
const recheckAfterMs = 24 * 60 * 60_000;

const inputSchema = z.object({ url: z.string().trim().min(1).max(500) }).strict();

/** Reduces what someone typed to an https address with no credentials, query or fragment. */
export function normalizeSiteUrl(raw: string, allowHttpHosts: string[] = []) {
  const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("SITE_URL_INVALID", 422);
  }
  const local = allowHttpHosts.includes(url.host);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    throw new AppError("SITE_NEEDS_HTTPS", 422);
  if (url.username || url.password || (!url.hostname.includes(".") && !local))
    throw new AppError("SITE_URL_INVALID", 422);
  if (url.port && url.port !== "443" && !local) throw new AppError("SITE_NOT_ALLOWED", 422);
  url.hash = "";
  url.search = "";
  return url;
}

export class OwnSiteService {
  constructor(
    private readonly social: SocialService,
    private readonly probe: SiteProbe,
    private readonly options: { allowHttpHosts?: string[]; now?: () => Date } = {},
  ) {}
  private now() {
    return (this.options.now ?? (() => new Date()))();
  }
  private stored(ownerId: string) {
    return this.social.store.get<OwnSite>("own-site", ownerId);
  }
  private save(site: OwnSite) {
    this.social.store.transaction(() => this.social.store.put("own-site", site.ownerId, site));
    return site;
  }
  /** The owner's own view, with the token they need to place. */
  mine(actor: Actor) {
    const ownerId = this.social.actor(actor);
    const site = this.stored(ownerId);
    return site ? this.view(site, true) : null;
  }
  /** What any viewer may know: only a verified site, never the token. */
  public(ownerId: string) {
    const site = this.stored(ownerId);
    return site?.verifiedAt ? this.view(site, false) : null;
  }
  private view(site: OwnSite, owner: boolean) {
    return {
      url: site.url,
      host: site.host,
      verified: Boolean(site.verifiedAt),
      verifiedAt: site.verifiedAt,
      method: site.method,
      ...(owner
        ? {
            token: site.token,
            file: `${new URL(site.url).origin}${ownSiteFile}`,
            dnsName: ownSiteDnsName(site.host),
          }
        : {}),
    };
  }
  /** Sets the site to use. A new host starts unverified with a fresh token. */
  set(actor: Actor, input: unknown) {
    const ownerId = this.social.actor(actor);
    const { url: raw } = inputSchema.parse(input);
    const url = normalizeSiteUrl(raw, this.options.allowHttpHosts);
    const old = this.stored(ownerId);
    const host = url.hostname.toLowerCase();
    // Moving to another page of the same verified host keeps the proof; a new host needs a new one.
    const keep = old && old.host === host;
    const site = this.save({
      ownerId,
      url: url.href,
      host,
      token: keep ? old.token : `smudge-verify=${randomBytes(12).toString("hex")}`,
      verifiedAt: keep ? old.verifiedAt : null,
      confirmedAt: keep ? old.confirmedAt : null,
      method: keep ? old.method : null,
    });
    return this.view(site, true);
  }
  remove(actor: Actor) {
    const ownerId = this.social.actor(actor);
    this.social.store.transaction(() => this.social.store.remove("own-site", ownerId));
    return { removed: true };
  }
  erase(ownerId: string) {
    this.social.store.remove("own-site", ownerId);
  }
  /** Looks for the token in the file first, then in DNS. Which one passed is remembered. */
  private async find(site: OwnSite): Promise<{ method: "file" | "dns" | null; reached: boolean }> {
    let reached = false;
    try {
      const text = await this.probe.readText(`${new URL(site.url).origin}${ownSiteFile}`);
      reached = true;
      if (text && text.split(/\s+/).includes(site.token)) return { method: "file", reached };
    } catch {
      // Unreachable; DNS may still prove it.
    }
    for (const name of [ownSiteDnsName(site.host), site.host]) {
      const records = await this.probe.txt(name).catch(() => [] as string[]);
      if (records.some((r) => r.trim() === site.token)) return { method: "dns", reached: true };
    }
    return { method: null, reached };
  }
  async verify(actor: Actor) {
    const ownerId = this.social.actor(actor);
    const site = this.stored(ownerId);
    if (!site) throw new AppError("NOT_FOUND", 404);
    const { method } = await this.find(site);
    if (!method) throw new AppError("SITE_NOT_VERIFIED", 422);
    const at = this.now().toISOString();
    return this.view(this.save({ ...site, verifiedAt: at, confirmedAt: at, method }), true);
  }
  /**
   * Called when the profile is viewed: once a day the proof is looked for again. Only a site that
   * answers without the token loses the badge; a site that is merely down keeps it.
   */
  async recheck(ownerId: string) {
    const site = this.stored(ownerId);
    if (!site?.verifiedAt) return;
    const last = Date.parse(site.confirmedAt ?? site.verifiedAt);
    if (this.now().getTime() - last < recheckAfterMs) return;
    const { method, reached } = await this.find(site);
    const current = this.stored(ownerId);
    if (!current || current.token !== site.token) return;
    if (method) this.save({ ...current, confirmedAt: this.now().toISOString(), method });
    else if (reached) this.save({ ...current, verifiedAt: null, confirmedAt: null, method: null });
  }
}
