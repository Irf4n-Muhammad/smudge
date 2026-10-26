import { createHash, randomBytes } from "node:crypto";
import type { NowView } from "../../packages/contracts/src/now.js";
import type { Store } from "../../packages/core/src/database.js";

/**
 * "Your song shows up by itself" (ADR 0044): the owner connects Spotify once (authorization code
 * flow with PKCE, like Google sign-in); after that the server asks Spotify what is playing, at
 * most once a minute per person, and the page reads the answer like any other entry. Only the
 * refresh token is kept, by user; disconnecting removes it.
 */
export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
const AUTH = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const PLAYING = "https://api.spotify.com/v1/me/player/currently-playing";
const SCOPE = "user-read-currently-playing";
const cacheFor = 60_000;

interface Link {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}
interface Playing {
  text: string;
  by: string;
  at: string;
}

export function spotifyStart(config: SpotifyConfig) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.href, state, verifier };
}

export class SpotifyService {
  private readonly cache = new Map<string, { until: number; playing: Playing | null }>();
  private readonly pending = new Map<string, Promise<void>>();
  constructor(
    private readonly store: Store,
    readonly config: SpotifyConfig | null,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  get configured() {
    return !!this.config;
  }
  connected(userId: string) {
    return !!this.store.get<Link>("spotify", userId);
  }
  private async token(body: URLSearchParams) {
    const config = this.config!;
    const response = await this.fetcher(TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("SPOTIFY_TOKEN_REJECTED");
    return (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
  }
  /** The callback: trade the code for tokens and remember the refresh token for this person. */
  async connect(userId: string, code: string, verifier: string) {
    if (!this.config) throw new Error("SPOTIFY_NOT_CONFIGURED");
    const t = await this.token(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: verifier,
      }),
    );
    if (!t.access_token || !t.refresh_token) throw new Error("SPOTIFY_TOKEN_REJECTED");
    const link: Link = {
      refreshToken: t.refresh_token,
      accessToken: t.access_token,
      expiresAt: this.now() + (t.expires_in ?? 3600) * 1000 - 30_000,
    };
    this.store.transaction(() => this.store.put("spotify", userId, link));
    this.cache.delete(userId);
  }
  disconnect(userId: string) {
    this.store.transaction(() => this.store.remove("spotify", userId));
    this.cache.delete(userId);
  }
  private async access(userId: string, link: Link) {
    if (link.expiresAt > this.now()) return link.accessToken;
    const t = await this.token(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: link.refreshToken }),
    );
    if (!t.access_token) throw new Error("SPOTIFY_TOKEN_REJECTED");
    const next: Link = {
      refreshToken: t.refresh_token ?? link.refreshToken,
      accessToken: t.access_token,
      expiresAt: this.now() + (t.expires_in ?? 3600) * 1000 - 30_000,
    };
    this.store.transaction(() => this.store.put("spotify", userId, next));
    return next.accessToken;
  }
  /**
   * Ask Spotify what this person is playing, at most once a minute; routes await this before
   * answering, and the synchronous source below reads the cached answer.
   */
  async poll(userId: string) {
    const link = this.store.get<Link>("spotify", userId);
    if (!link) return;
    const cached = this.cache.get(userId);
    if (cached && cached.until > this.now()) return;
    const running = this.pending.get(userId);
    if (running) return running;
    const task = (async () => {
      let playing: Playing | null = cached?.playing ?? null;
      try {
        const token = await this.access(userId, link);
        const response = await this.fetcher(PLAYING, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status === 204) playing = null;
        else if (response.ok) {
          const body = (await response.json()) as {
            is_playing?: boolean;
            item?: { name?: string; artists?: { name: string }[] } | null;
          };
          playing =
            body.is_playing && body.item?.name
              ? {
                  text: body.item.name.slice(0, 80),
                  by: (body.item.artists ?? [])
                    .map((a) => a.name)
                    .join(", ")
                    .slice(0, 50),
                  at: new Date(this.now()).toISOString(),
                }
              : null;
        }
      } catch {
        // Spotify is down or the token was revoked: keep what we had, try again in a minute.
      }
      this.cache.set(userId, { until: this.now() + cacheFor, playing });
    })().finally(() => this.pending.delete(userId));
    this.pending.set(userId, task);
    return task;
  }
  /** The "now" source: the song playing, as of the last poll. */
  source = (userId: string): NowView[] => {
    const playing = this.cache.get(userId)?.playing;
    return playing
      ? [{ id: `spotify:${userId}`, kind: "listening", ...playing, source: "spotify" }]
      : [];
  };
}
