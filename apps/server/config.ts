/**
 * Process configuration. `demo` (the default) is the local playground: demo accounts, account
 * switching, the MCP token and an in-app inbox. `production` is for real people: password
 * accounts only, real email delivery, HTTPS origins and no demo content.
 */
export interface Config {
  mode: "demo" | "production";
  publicUrl: URL;
  runtimeUrl: URL;
  apiPort: number;
  runtimePort: number;
  demoContent: boolean;
  /** Confirmed emails of moderators. In demo mode Alex moderates too. */
  adminEmails: string[];
  google: { clientId: string; clientSecret: string } | null;
  /** "Your song shows up by itself" needs a Spotify app (ADR 0044). */
  spotify: { clientId: string; clientSecret: string } | null;
  mail:
    | { provider: "inbox" }
    | { provider: "file" }
    | { provider: "resend"; apiKey: string; from: string };
}

function url(name: string, value: string | undefined, fallback: string) {
  try {
    const parsed = new URL(value ?? fallback);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash)
      throw new Error("must be an origin");
    return parsed;
  } catch (e) {
    throw new Error(`${name} must be an origin like https://example.com (${(e as Error).message})`);
  }
}
function port(name: string, value: string | undefined, fallback: number) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a port`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.FORMA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "production")
    throw new Error("FORMA_MODE must be demo or production");
  const production = mode === "production";
  if (production && (!env.FORMA_PUBLIC_URL || !env.FORMA_RUNTIME_URL))
    throw new Error("Production needs FORMA_PUBLIC_URL and FORMA_RUNTIME_URL");
  const publicUrl = url("FORMA_PUBLIC_URL", env.FORMA_PUBLIC_URL, "http://127.0.0.1:3000");
  const runtimeUrl = url("FORMA_RUNTIME_URL", env.FORMA_RUNTIME_URL, "http://127.0.0.1:3002");
  // Post code runs on the runtime origin; sharing the app origin would hand it the session.
  if (publicUrl.origin === runtimeUrl.origin)
    throw new Error("FORMA_RUNTIME_URL must be a different origin from FORMA_PUBLIC_URL");
  if (
    production &&
    env.FORMA_ALLOW_HTTP !== "1" &&
    (publicUrl.protocol !== "https:" || runtimeUrl.protocol !== "https:")
  )
    throw new Error("Production URLs must use https (FORMA_ALLOW_HTTP=1 only for local trials)");

  const provider = env.FORMA_MAIL ?? (production ? "resend" : "inbox");
  let mail: Config["mail"];
  if (provider === "resend") {
    if (!env.RESEND_API_KEY || !env.FORMA_MAIL_FROM)
      throw new Error("Email via Resend needs RESEND_API_KEY and FORMA_MAIL_FROM");
    mail = { provider, apiKey: env.RESEND_API_KEY, from: env.FORMA_MAIL_FROM };
  } else if (provider === "file") mail = { provider };
  else if (provider === "inbox" && !production) mail = { provider };
  else throw new Error("FORMA_MAIL must be resend or file (inbox is demo only)");

  if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET)
    throw new Error("Google sign-in needs both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  const google = env.GOOGLE_CLIENT_ID
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! }
    : null;
  if (!!env.SPOTIFY_CLIENT_ID !== !!env.SPOTIFY_CLIENT_SECRET)
    throw new Error("Spotify needs both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET");
  const spotify = env.SPOTIFY_CLIENT_ID
    ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET! }
    : null;
  const adminEmails = (env.FORMA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const demoContent = (env.FORMA_DEMO_CONTENT ?? (production ? "0" : "1")) === "1";
  return {
    mode,
    publicUrl,
    runtimeUrl,
    apiPort: port("FORMA_API_PORT", env.FORMA_API_PORT, 3001),
    runtimePort: port("FORMA_RUNTIME_PORT", env.FORMA_RUNTIME_PORT, 3002),
    demoContent,
    adminEmails,
    google,
    spotify,
    mail,
  };
}
