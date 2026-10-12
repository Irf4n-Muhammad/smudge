import { createHash, randomBytes } from "node:crypto";

/**
 * "Continue with Google" using the OAuth 2.0 authorization code flow with PKCE and a state
 * value bound to a short-lived cookie. The profile comes from Google's userinfo endpoint over
 * TLS with the access token we just received, so no ID-token signature handling is needed.
 * https://developers.google.com/identity/openid-connect/openid-connect
 */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleStart(config: GoogleConfig) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.href, state, verifier };
}

export class GoogleError extends Error {}

export async function googleFinish(
  config: GoogleConfig,
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const tokenResponse = await fetcher(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new GoogleError("GOOGLE_TOKEN_REJECTED");
  const { access_token } = (await tokenResponse.json()) as { access_token?: string };
  if (!access_token) throw new GoogleError("GOOGLE_TOKEN_REJECTED");
  const infoResponse = await fetcher(USERINFO, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!infoResponse.ok) throw new GoogleError("GOOGLE_PROFILE_UNAVAILABLE");
  const info = (await infoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!info.sub || !info.email) throw new GoogleError("GOOGLE_PROFILE_UNAVAILABLE");
  // An unverified Google email must never sign anyone into an account with that address.
  if (info.email_verified !== true) throw new GoogleError("GOOGLE_EMAIL_UNVERIFIED");
  return { sub: info.sub, email: info.email, name: info.name ?? "" };
}
