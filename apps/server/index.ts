import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { z } from "zod";
import { Store } from "../../packages/core/src/database.js";
import { SocialService, AppError, GUEST } from "../../packages/core/src/social.js";
import type { Asset } from "../../packages/core/src/social.js";
import type { Actor } from "../../packages/core/src/index.js";
import { bridgeRequestSchema } from "../../packages/contracts/src/experience.js";
import { renderDocument, runtimeCspFor } from "../../packages/runtime/src/document.js";
import { seed, seedSharedAssets } from "./seed.js";
import { seedWorlds } from "./seed-worlds.js";
import { ProfileService } from "../../packages/core/src/profiles.js";
import { ModService } from "../../packages/core/src/mods.js";
import { shareModSchema, installModSchema } from "../../packages/contracts/src/mod.js";
import { musicPackage } from "./music.js";
import { composeProfilePart } from "../../packages/core/src/composition.js";
import {
  profileDocument,
  profilePackageSchema,
  profileRequestSchema,
  profileIdentitySchema,
} from "../../packages/contracts/src/profile.js";
import { seedProfiles, seedDaniPage, profileTemplates } from "./seed-profiles.js";
import { IdentityService } from "../../packages/core/src/identity.js";
import { signupSchema } from "../../packages/contracts/src/identity.js";
import { renderMoment } from "./moments.js";
import { seedIdentity } from "./seed-identity.js";
import { seedSmudge } from "./seed-smudge.js";
import { seedPhotos } from "./seed-photos.js";
import { identityRoutes } from "./identity-routes.js";
import { themeRoutes } from "./theme-routes.js";
import { ThemeStudio } from "../../packages/core/src/themes.js";
import { seedThemes } from "./seed-themes.js";
import { SidesService } from "../../packages/core/src/sides.js";
import { PlansService } from "../../packages/core/src/plans.js";
import { GatheringsService } from "../../packages/core/src/gatherings.js";
import { MomentDayService } from "../../packages/core/src/gathering-day.js";
import { ProgramService } from "../../packages/core/src/programs.js";
import { NowService } from "../../packages/core/src/now.js";
import { PagesService } from "../../packages/core/src/pages.js";
import { setupColours, setupPage, upgradeSmudgePages } from "../../packages/core/src/setup.js";
import { gatheringRoutes } from "./gathering-routes.js";
import { ShareCardService } from "../../packages/core/src/share-card.js";
import { sideById } from "../../packages/contracts/src/sides.js";
import { sideRoutes } from "./side-routes.js";
import { seedGamers, seedGift, seedPlan, seedSides, seedStamps, seedWeekly } from "./seed-sides.js";
import { AccountService } from "../../packages/core/src/accounts.js";
import type { AuthState } from "../../packages/contracts/src/accounts.js";
import { loadConfig } from "./config.js";
import { deliveryFor, startMailWorker } from "./mail.js";
import { ActivityDigest } from "../../packages/core/src/digest.js";
import { rateLimit } from "./rate-limit.js";
import { CommunityService } from "../../packages/core/src/community.js";
import { MessageService } from "../../packages/core/src/messages.js";
import { PrivacyService } from "../../packages/core/src/privacy.js";
import { reportInputSchema } from "../../packages/contracts/src/community.js";
import { communityRoutes } from "./community-routes.js";
import { googleFinish, googleStart } from "./google.js";
import { SpotifyService, spotifyStart } from "./spotify.js";
import type { NowView } from "../../packages/contracts/src/now.js";
import type { Publication } from "../../packages/core/src/social.js";
import { importSite } from "./site-import.js";
import { SharingService } from "../../packages/core/src/sharing.js";
import { MediaService, maxVideoBytes } from "../../packages/core/src/media.js";

const config = loadConfig();
const production = config.mode === "production";

const dataDir = resolve(process.env.FORMA_DATA_DIR ?? ".local");
mkdirSync(dataDir, { recursive: true });
const lockPath = resolve(dataDir, "server.lock");
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, "utf8"));
  let alive = false;
  // After a container restart the stale lock can name this very process id.
  if (Number.isInteger(pid) && pid > 0 && pid !== process.pid)
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {}
  if (alive) throw new Error("Forma data directory is already owned by another process");
  unlinkSync(lockPath);
}
writeFileSync(lockPath, String(process.pid), { flag: "wx" });
process.on("exit", () => {
  try {
    unlinkSync(lockPath);
  } catch {}
});
const store = await Store.open(resolve(dataDir, "forma.sqlite"));
const service = new SocialService(store);
seedSharedAssets(service);
if (config.demoContent) {
  await seed(service);
  seedWorlds(service);
}
// FORMA_TODAY=YYYY-MM-DD pins the calendar for trying seasons and birthdays locally.
const today = process.env.FORMA_TODAY;
if (today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(today))
  throw new Error("FORMA_TODAY must be YYYY-MM-DD");
if (today && production) throw new Error("FORMA_TODAY is for local trials only");
const clock = () =>
  today ? new Date(`${today}T${new Date().toISOString().slice(11)}`) : new Date();
const identity = new IdentityService(
  service,
  renderMoment,
  clock,
  config.mail.provider === "inbox",
);
const accounts = new AccountService(
  service,
  identity,
  {
    verify: (token) => new URL(`/?verify=${token}`, config.publicUrl).href,
    reset: (token) => new URL(`/?reset=${token}`, config.publicUrl).href,
  },
  clock,
);
// Moderators: Alex in the playground; in production, accounts whose confirmed email is listed.
const isAdmin = (userId: string) => {
  if (!production && userId === "you") return true;
  const account = accounts.account({ userId });
  return account.emailVerified && !!account.email && config.adminEmails.includes(account.email);
};
const community = new CommunityService(service, isAdmin, clock);
const studio = new ThemeStudio(service, isAdmin, clock);
identity.communityThemes = () => studio.approved();
accounts.erasers.push((userId) => studio.erase(userId));
accounts.loginGate = (userId) => {
  if (community.isSuspended(userId)) throw new AppError("ACCOUNT_SUSPENDED", 403);
};
accounts.erasers.push((userId) => community.erase(userId));
const privacy = new PrivacyService(service, community, clock);
const sidesService = new SidesService(service, clock);
// A plan's list of names follows who may see whom (blocks, hidden accounts), like comments do.
const plans = new PlansService(service, clock);
plans.peopleFilter = (viewerId, userId) => community.canSeeUser(viewerId, userId);
// A side's home lists its members and plans by the same audience rules.
sidesService.peopleFilter = (viewerId, userId) => community.canSeeUser(viewerId, userId);
sidesService.planLister = (who, sideId) => plans.inSide(who, sideId);
sidesService.regularLister = (who, sideId) => plans.regulars(who, sideId);
// An organisation's invite or email opens that organisation's side along with the chapter.
identity.chapterListeners.push((c) => sidesService.joinByChapter(c));
// Moments as gatherings (ADR 0036): invites, RSVPs by phone, and only the host sees answers.
const gatherings = new GatheringsService(service, clock);
accounts.erasers.push((userId) => gatherings.erase(userId));
gatherings.peopleFilter = (viewerId, userId) => community.canSeeUser(viewerId, userId);
const momentDay = new MomentDayService(service, gatherings, resolve(dataDir, "moments"), clock);
accounts.erasers.push((userId) => momentDay.erase(userId));
momentDay.cardFilter = (viewerId, userId) =>
  community.canSeeUser(viewerId, userId) && privacy.canSeePosts(viewerId, userId);
const messages = new MessageService(service, community, clock);
accounts.erasers.push((userId) => messages.erase(userId));
const deliver = deliveryFor(config, resolve(dataDir, "mail.jsonl"));
if (deliver) startMailWorker(store, deliver);
const digest = new ActivityDigest(service, community, config.publicUrl.href, clock);
// Activity emails go out with the other mail, a few minutes after things happen.
setInterval(() => digest.run(), 5 * 60_000).unref();
const profiles = new ProfileService(service);
if (config.demoContent) {
  seedIdentity(identity, service);
  seedProfiles(profiles);
  seedSmudge(service);
  seedPhotos(service);
  // After the photo seed, which adds Dani and the photos on his page.
  seedDaniPage(profiles);
  // After the photo seed, which adds Arif.
  seedThemes(service, studio);
  seedSides(service, sidesService);
  seedStamps(service);
  seedWeekly(service);
  seedPlan(service);
  seedGamers(service, sidesService);
  seedGift(service);
}
// Pages made on an older Paint wall are brought up to the template at start (ADR 0046).
{
  const upgraded = upgradeSmudgePages(profiles, profileTemplates.smudge).length;
  if (upgraded) console.log(`${upgraded} Paint wall page(s) brought up to the template`);
}
const sharing = new SharingService(service, community, identity, profiles);
// Your now (ADR 0041): one-tap entries, read by the same people who may see your posts, and by
// your own page program through profile.read.
const nowService = new NowService(service, clock);
nowService.viewFilter = (viewerId, userId) =>
  community.canSeeUser(viewerId, userId) && privacy.canSeePosts(viewerId, userId);
accounts.erasers.push((userId) => nowService.erase(userId));
profiles.extras = (viewerId, ownerId) => ({ now: nowService.live(viewerId, ownerId) });
// Read, not typed (ADR 0044): the song from Spotify, and what you did on Smudge itself.
const spotify = new SpotifyService(
  store,
  config.spotify && {
    ...config.spotify,
    redirectUri: new URL("/api/spotify/callback", config.publicUrl).href,
  },
);
accounts.erasers.push((userId) => store.remove("spotify", userId));
nowService.sources.push(spotify.source);
const users = () => new Map(service.users().map((u) => [u.id, u.name]));
nowService.sources.push((ownerId) =>
  store
    .all<Publication>("post")
    .filter((p) => p.ownerId === ownerId && !identity.isMoment(p.id))
    .slice(-20)
    .map((p) => ({
      id: `post:${p.id}`,
      kind: "posted" as const,
      text: p.metadata.title || "a new post",
      at: p.createdAt,
      source: "smudge",
    })),
);
nowService.sources.push((ownerId) => {
  const names = users();
  const rows: NowView[] = [];
  for (const key of store.ids("cat"))
    for (const f of store.get<{ userId: string; at: string }[]>("cat", key) ?? [])
      if (f.userId === ownerId && key !== ownerId)
        rows.push({
          id: `fed:${key}:${f.at}`,
          kind: "fed",
          text: `fed ${names.get(key) ?? "a friend"}'s cat`,
          at: f.at,
          source: "smudge",
        });
  for (const key of store.ids("quiz-score")) {
    const [owner, taker] = key.split(":");
    if (taker !== ownerId || !owner) continue;
    const s = store.get<{ score: number; total: number; at: string }>("quiz-score", key)!;
    rows.push({
      id: `quiz:${key}`,
      kind: "quiz",
      text: `took ${names.get(owner) ?? "a friend"}'s quiz: ${s.score}/${s.total}`,
      at: s.at,
      source: "smudge",
    });
  }
  return rows.slice(-40);
});
// Programs between people (ADR 0043): the quiz and the cat, read by whoever may see your posts.
const programs = new ProgramService(service, clock);
programs.viewFilter = (viewerId, userId) =>
  community.canSeeUser(viewerId, userId) && privacy.canSeePosts(viewerId, userId);
accounts.erasers.push((userId) => programs.erase(userId));
profiles.programs = (who, ownerId, method, payload) =>
  programs.capability(who, ownerId, method, payload);
// The fixed pages (ADR 0045): everyone's Posts and Stories, read by the feed's audience rules.
const pages = new PagesService(store, service, nowService);
pages.isMoment = (postId) => identity.isMoment(postId);
pages.cards = (viewerId, ownerId) =>
  viewerId === GUEST ? [] : momentDay.cards({ userId: viewerId }, ownerId);
// A side's link (ADR 0035) shows its home to guests, asked about the guest viewer.
sharing.sideHome = (sideId) => sidesService.home({ userId: GUEST }, sideId);
const media = new MediaService(service, resolve(dataDir, "media"));
const mods = new ModService(profiles);
if (config.demoContent) {
  mods.seed(
    "50000000-0000-4000-8000-000000000001",
    "Ink & Paper",
    "Cut paper posts, orbit highlights and a collaborative drawing relay.",
    profileTemplates.raka,
  );
  mods.seed(
    "50000000-0000-4000-8000-000000000003",
    "Smudge · Paint wall",
    "A giant painted name, tap-to-throw paint, your latest post and a sideways strip of picks.",
    profileTemplates.smudge,
  );
  mods.seed(
    "50000000-0000-4000-8000-000000000002",
    "After Hours / Music zine",
    "A spinning record, gig posters, ticket highlights and a persistent audience setlist vote.",
    musicPackage,
  );
}
const tokenPath = resolve(dataDir, "mcp-token");
if (!existsSync(tokenPath))
  writeFileSync(tokenPath, randomBytes(32).toString("hex"), { mode: 0o600 });
const mcpToken = readFileSync(tokenPath, "utf8").trim();
interface Ticket {
  kind?: "profile" | "post";
  /** Opened from a share link without an account: renders, but can call no capabilities. */
  guest?: boolean;
  actor: Actor;
  target: string;
  preview: boolean;
  expires: number;
  nonce: string;
  revision: number;
  session: string;
}
const tickets = new Map<string, Ticket>();
function issueTicket(ticket: Omit<Ticket, "nonce" | "expires">) {
  const id = randomBytes(32).toString("hex");
  const nonce = randomUUID();
  for (const [key, t] of tickets) if (t.expires < Date.now()) tickets.delete(key);
  if (tickets.size > 1000) throw new AppError("TOO_MANY_RUNTIMES", 429);
  // Guests share a smaller pool and shorter lifetime so share links cannot starve members.
  if (ticket.guest && [...tickets.values()].filter((t) => t.guest).length >= 300)
    throw new AppError("TOO_MANY_RUNTIMES", 429);
  tickets.set(id, {
    ...ticket,
    nonce,
    expires: Date.now() + (ticket.guest ? 600000 : 1800000),
  });
  return { ticket: id, nonce, url: new URL(`/run/${id}`, config.runtimeUrl).href };
}
// The API listens on loopback only; the web server (or the edge proxy) forwards the public Host.
const allowedHosts = [
  `127.0.0.1:${config.apiPort}`,
  config.publicUrl.host,
  ...(production ? [] : ["127.0.0.1:3000", "localhost:3000"]),
];
const allowedOrigins = [
  config.publicUrl.origin,
  ...(production ? [] : ["http://127.0.0.1:3000", "http://localhost:3000"]),
];
const cookie = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: config.publicUrl.protocol === "https:",
  path: "/",
};
function readCookie(req: Request) {
  return req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("forma_session="))
    ?.slice(14);
}
function setSession(res: Response, token: string) {
  const old = res.locals.session as string | undefined;
  for (const [key, ticket] of tickets) if (old && ticket.session === old) tickets.delete(key);
  res.cookie("forma_session", token, { ...cookie, maxAge: 30 * 86400000 });
}
function clearSession(res: Response) {
  const old = res.locals.session as string | undefined;
  for (const [key, ticket] of tickets) if (old && ticket.session === old) tickets.delete(key);
  res.clearCookie("forma_session", cookie);
}
// Endpoints that work before signing in. Everything else needs a session.
const isPublicRoute = (path: string) =>
  publicRoutes.has(path) ||
  path.startsWith("/api/public/") ||
  /^\/api\/users\/[^/]+\/avatar$/.test(path);
const publicRoutes = new Set([
  "/api/health",
  "/api/auth/state",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/auth/verify",
  "/api/auth/google/start",
  "/api/auth/google/callback",
]);
const api = express();
api.disable("x-powered-by");
api.use((req, res, next) => {
  const traceId = randomUUID();
  res.locals.traceId = traceId;
  res.set({
    "X-Trace-Id": traceId,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const begin = performance.now();
  res.on("finish", () => {
    // Log route patterns, never URLs containing tickets, cookies, or request contents.
    console.log(
      JSON.stringify({
        traceId,
        method: req.method,
        route: req.route?.path ?? "unmatched",
        status: res.statusCode,
        durationMs: Math.round(performance.now() - begin),
      }),
    );
  });
  if (!allowedHosts.includes(req.headers.host ?? ""))
    return next(new AppError("INVALID_HOST", 403));
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) return next(new AppError("ORIGIN_DENIED", 403));
  next();
});
api.use(express.json({ limit: "6mb" }));
function bearer(req: Request) {
  const candidate = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  return (
    candidate.length === mcpToken.length &&
    timingSafeEqual(Buffer.from(candidate), Buffer.from(mcpToken))
  );
}
api.use((req, res, next) => {
  if (req.method !== "GET" && !req.headers.origin && !(!production && bearer(req)))
    return next(new AppError("ORIGIN_REQUIRED", 403));
  // The MCP token stands in for Alex's demo account and exists only in the local playground.
  if (!production && bearer(req)) {
    res.locals.actor = { userId: "you" };
    res.locals.session = "mcp";
    return next();
  }
  const session = accounts.resolve(readCookie(req));
  if (session) {
    res.locals.actor = session.actor;
    res.locals.session = session.id;
    if (session.renewed)
      res.cookie("forma_session", readCookie(req)!, { ...cookie, maxAge: 30 * 86400000 });
  } else if (
    !production &&
    req.path === "/api/bootstrap" &&
    req.method === "GET" &&
    store.get("user", "you")
  ) {
    // Demo convenience: a first visit is signed in as Alex.
    const token = accounts.startSession("you");
    res.locals.actor = { userId: "you" };
    res.locals.session = accounts.resolve(token)!.id;
    res.cookie("forma_session", token, { ...cookie, maxAge: 30 * 86400000 });
  } else if (!isPublicRoute(req.path)) return next(new AppError("UNAUTHENTICATED", 401));
  next();
});
const actor = (res: Response) => res.locals.actor as Actor;
api.get("/api/health", (_req, res) => res.json({ ok: true }));
api.get("/api/bootstrap", (_req, res) =>
  res.json({
    actor: actor(res),
    users: service.users(),
    following: service.following(actor(res)),
    requested: privacy.requested(actor(res)),
    assets: service.assets(actor(res)),
    sides: sidesService.me(actor(res)),
  }),
);
const authLimit = rateLimit({ windowMs: 15 * 60_000, max: 30 });
const signupLimit = rateLimit({ windowMs: 60 * 60_000, max: 10 });
const signedIn = (res: Response) => (res.locals.actor ? (res.locals.actor as Actor) : undefined);
api.get("/api/auth/state", (_req, res) => {
  const current = signedIn(res);
  res.json({
    mode: config.mode,
    signedIn: !!current,
    account: current ? accounts.account(current) : null,
    google: !!config.google,
    moderator: current ? community.canModerate(current) : false,
  } satisfies AuthState);
});
api.post("/api/auth/signup", signupLimit, (req, res) => {
  if (res.locals.session === "mcp") throw new AppError("MCP_IDENTITY_FIXED", 403);
  const { user, session } = accounts.register(req.body);
  setSession(res, session);
  res.status(201).json(user);
});
api.post("/api/auth/login", authLimit, (req, res) => {
  if (res.locals.session === "mcp") throw new AppError("MCP_IDENTITY_FIXED", 403);
  const { userId, session } = accounts.login(req.body);
  setSession(res, session);
  res.json({ userId });
});
api.post("/api/auth/logout", (req, res) => {
  accounts.logout(readCookie(req));
  clearSession(res);
  res.json({ ok: true });
});
api.post("/api/auth/logout-everywhere", (_req, res) => {
  accounts.logoutEverywhere(actor(res));
  clearSession(res);
  res.json({ ok: true });
});
api.post("/api/auth/verify", authLimit, (req, res) => res.json(accounts.verifyEmail(req.body)));
api.post("/api/auth/verify/resend", (_req, res) =>
  res.json(accounts.resendVerification(actor(res))),
);
api.post("/api/auth/forgot", authLimit, (req, res) =>
  res.json(accounts.requestPasswordReset(req.body)),
);
api.post("/api/auth/reset", authLimit, (req, res) => {
  const { userId, session } = accounts.resetPassword(req.body);
  setSession(res, session);
  res.json({ userId });
});
api.post("/api/auth/password", authLimit, (req, res) =>
  res.json(accounts.changePassword(actor(res), readCookie(req), req.body)),
);
// Demo only: switch between the seeded people without passwords.
api.post("/api/session", (req, res) => {
  if (production) throw new AppError("NOT_FOUND", 404);
  if (res.locals.session === "mcp") throw new AppError("MCP_IDENTITY_FIXED", 403);
  const { userId } = z.object({ userId: z.string() }).strict().parse(req.body);
  const token = accounts.startSession(userId);
  accounts.logout(readCookie(req));
  setSession(res, token);
  res.json({ ok: true });
});
// Demo only: the older name-and-handle signup, kept for scripts.
api.post("/api/signup", (req, res) => {
  if (production) throw new AppError("NOT_FOUND", 404);
  if (res.locals.session === "mcp") throw new AppError("MCP_IDENTITY_FIXED", 403);
  signupSchema.parse(req.body);
  const user = identity.signup(req.body);
  const token = accounts.startSession(user.id);
  accounts.logout(readCookie(req));
  setSession(res, token);
  res.json(user);
});
api.get("/api/feed", (_req, res) =>
  res.json(
    identity
      .decorate(actor(res), service.feed(actor(res)))
      .map((p) => ({ ...p, ...sidesService.tag(p) })),
  ),
);
// Moments are for the people who care, so they are never pushed to strangers or search.
api.get("/api/explore", (req, res) =>
  res.json(
    identity
      .decorate(actor(res), service.explore(actor(res), req.query.q))
      .filter((p) => !("moment" in p && p.moment))
      .map((p) => ({ ...p, ...sidesService.tag(p) })),
  ),
);
sideRoutes(
  api,
  sidesService,
  new ShareCardService(service, identity, sidesService),
  config.publicUrl.origin,
);
identityRoutes(api, identity);
themeRoutes(api, studio, rateLimit({ windowMs: 60 * 60_000, max: 20 }));
communityRoutes(api, community, messages, privacy, accounts, clearSession, authLimit);
// Google sign-in. The state and PKCE verifier live in a short-lived cookie scoped to the
// callback path; SameSite=Lax because Google sends the browser back with a top-level GET.
const googleCookie = { ...cookie, sameSite: "lax" as const, path: "/api/auth/google" };
const googleConfig = config.google && {
  ...config.google,
  redirectUri: new URL("/api/auth/google/callback", config.publicUrl).href,
};
api.get("/api/auth/google/start", authLimit, (_req, res) => {
  if (!googleConfig) throw new AppError("NOT_FOUND", 404);
  const { url, state, verifier } = googleStart(googleConfig);
  res.cookie("forma_google", `${state}.${verifier}`, { ...googleCookie, maxAge: 600_000 });
  res.redirect(url);
});
api.get("/api/auth/google/callback", authLimit, async (req, res) => {
  if (!googleConfig) throw new AppError("NOT_FOUND", 404);
  const raw = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("forma_google="))
    ?.slice(13);
  res.clearCookie("forma_google", googleCookie);
  const [state, verifier] = (raw ?? "").split(".");
  const fail = (code: string) => res.redirect(`/?auth_error=${code}`);
  if (!state || !verifier || req.query.state !== state || typeof req.query.code !== "string")
    return fail("GOOGLE_STATE_MISMATCH");
  try {
    const profile = await googleFinish(googleConfig, req.query.code, verifier);
    const { session } = accounts.externalLogin("google", profile);
    setSession(res, session);
    res.redirect("/");
  } catch (error) {
    fail(error instanceof AppError || error instanceof Error ? error.message : "GOOGLE_FAILED");
  }
});
api.get("/api/profile-spec", (_req, res) =>
  res.json({
    kind: "profile",
    schemaVersion: 1,
    supportedVersions: [1, 2],
    mods: "list_profile_mods → read_profile_mod → install_profile_mod creates a private copy, or mixes slot into owned draftId/revision. Share owned draft source and all declared assets with share_profile_mod (submissionId, name, description, slots, shareAssets:true). Mod versions are immutable; no auto-update of installations, identity or content transfer. Partial fragments must carry their own style/script dependencies to work in other shells.",
    profilePoll:
      "Additive v2: optional manifest.poll {id,question,options:[{id,label}]} belongs to the feature part. 2..8 unique choices; grants profile.poll.read and profile.poll.vote. SDK forma.profile.poll.read()/vote(optionId). One changeable vote per ticket actor, aggregates plus own selected choice only. Draft/revision practice state is separate. Removing/changing the active poll invalidates historical access.",
    identity:
      "Profile drafts snapshot {name,bio,avatarAssetId:UUID|null} outside the package. update_profile_draft accepts this optional strict object; omission preserves it. Name 1..80, bio max300, avatar owned/shared only. Preview sees the private snapshot; publish commits identity and design atomically. Restore applies a snapshot when present; legacy/default restores keep current identity. No actor or handle can be supplied.",
    composition:
      "v2 adds manifest.parts: profile/post/story/feature, each optional {name,entrypoint,capabilities}. index.html contains <!--forma:profile--> etc. Selected local HTML fragments replace these markers. All parts share one sandbox and the manifest capability set; this is not per-mod isolation. Read profile_templates for complete editable Raka and partial Essentials examples.",
    relay:
      "v2 capabilities relay.read and relay.add enable forma.relay.read() and forma.relay.add({submissionId:UUID,strokes:[{color:'#202020',width:5,points:[[x,y]]}]}). Up to 32 strokes, 128 points/stroke; x 0..1000, y 0..600, width 1..12. Identity is session-bound. Contributions persist per profile owner across design changes; preview uses draft/revision storage. 200 contributions max. Removing the active capability blocks historical runtimes too.",
    workflow:
      "profile_spec → profile_data → create_profile_draft → preview_profile_draft → update_profile_draft → publish_profile_draft. Use current state.version as expectedVersion; restore_profile selects an immutable revision or null for default.",
    manifest: {
      kind: "profile",
      schemaVersion: 1,
      runtimeVersion: "web-v1",
      name: "My world",
      entrypoint: "index.html",
      height: 1000,
      assets: [],
      capabilities: ["profile.read", "profile.openPost"],
    },
    sdk: {
      social:
        "Optional profile v2 grants profile.social.read and profile.social.toggle enable forma.profile.social.read() and forma.profile.social.toggle({action:'follow'}) or {action:'like'|'save',postId}. Owner-bound targets only, no actor fields. Returns {writable,ownProfile,following,requested,followers,posts:[{id,likes,liked,saved,comments}]}. Preview is read-only. All parts share grants; these are not proof of a human gesture.",
      cover:
        "Profile v2 optional grant profile.cover enables await forma.profile.cover(postId), returning {src:dataURL,alt} or null for an owner-bound published cover. Fetch lazily. No arbitrary asset IDs or draft media.",
      read: "await forma.profile.read() returns {owner:{id,name,handle,bio,initials,color},posts:[{id,title,caption,format,hasCover}],now:{current,listening,recent:[{id,kind,text,by?,at}]}}; published posts and the owner's latest 'now' entries as the viewer may see them, no viewer identity or private state.",
      open: "await forma.profile.openPost(postId) opens an owner post in host controls; foreign posts rejected.",
      appearance:
        "Use html[data-theme=dark]. Respect html[data-motion=reduce] and prefers-reduced-motion. No autoplay sound.",
    },
    limits:
      "600–4000px height, up to 20 local html/css/js files, 100000 code units each; index.html required. No remote network/eval/dependencies. Asset IDs must be owned/shared, use asset:UUID. Runtime sandbox and CSP match posts. Host owns back/follow/report and post navigation.",
    templates: Object.keys(profileTemplates),
  }),
);
api.get("/api/me/email-prefs", (_req, res) => res.json(digest.prefs(actor(res))));
api.post("/api/me/email-prefs", (req, res) => res.json(digest.setPrefs(actor(res), req.body)));
api.post("/api/me/identity", (req, res) => res.json(profiles.updateIdentity(actor(res), req.body)));
api.get("/api/profile-templates", (_req, res) => res.json(profileTemplates));
api.get("/api/setup/vibes", (_req, res) =>
  res.json(
    Object.entries(profileTemplates).map(([key, t]) => ({
      key,
      name: t.manifest.name,
      colours: setupColours(t),
    })),
  ),
);
api.post("/api/me/setup", (req, res) =>
  res.json(setupPage(profiles, nowService, profileTemplates, actor(res), req.body)),
);
api.post("/api/me/now", (req, res) => res.json(nowService.add(actor(res), req.body)));
api.delete("/api/me/now/:id", (req, res) =>
  res.json(nowService.remove(actor(res), String(req.params.id))),
);
api.get("/api/me/quiz", (_req, res) => res.json(programs.quiz(actor(res))));
api.put("/api/me/quiz", (req, res) => res.json(programs.setQuiz(actor(res), req.body)));
api.get("/api/me/friends-now", async (_req, res) => {
  await Promise.all(service.following(actor(res)).map((id) => spotify.poll(id)));
  res.json(nowService.friends(actor(res)));
});
api.get("/api/me/now-sources", (_req, res) =>
  res.json({
    spotify: { configured: spotify.configured, connected: spotify.connected(actor(res).userId) },
    songs: nowService.songs(actor(res)),
  }),
);
api.get("/api/users/:id/now", async (req, res) => {
  await spotify.poll(String(req.params.id));
  res.json(nowService.archive(actor(res).userId, String(req.params.id)));
});
api.get("/api/users/:id/posts", (req, res) =>
  res.json(pages.posts(actor(res).userId, String(req.params.id))),
);
api.get("/api/users/:id/timeline", async (req, res) => {
  await spotify.poll(String(req.params.id));
  res.json(pages.timeline(actor(res).userId, String(req.params.id)));
});
const spotifyCookie = { ...cookie, sameSite: "lax" as const, path: "/api/spotify" };
api.get("/api/spotify/start", authLimit, (_req, res) => {
  if (!spotify.config) throw new AppError("NOT_FOUND", 404);
  const { url, state, verifier } = spotifyStart(spotify.config);
  res.cookie("forma_spotify", `${state}.${verifier}`, { ...spotifyCookie, maxAge: 600_000 });
  res.redirect(url);
});
api.get("/api/spotify/callback", authLimit, async (req, res) => {
  if (!spotify.config) throw new AppError("NOT_FOUND", 404);
  const raw = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("forma_spotify="))
    ?.slice(14);
  res.clearCookie("forma_spotify", spotifyCookie);
  const [state, verifier] = (raw ?? "").split(".");
  const back = `/?profile=${encodeURIComponent(actor(res).userId)}`;
  if (!state || !verifier || req.query.state !== state || typeof req.query.code !== "string")
    return res.redirect(`${back}&spotify=failed`);
  try {
    await spotify.connect(actor(res).userId, req.query.code, verifier);
    res.redirect(`${back}&spotify=connected`);
  } catch {
    res.redirect(`${back}&spotify=failed`);
  }
});
api.delete("/api/spotify", (_req, res) => {
  spotify.disconnect(actor(res).userId);
  res.json({ connected: false });
});
api.get("/api/profiles/:ownerId", (req, res) => {
  community.assertVisibleUser(actor(res), String(req.params.ownerId));
  res.json(profiles.public(String(req.params.ownerId)));
});
api.get("/api/profiles/:ownerId/data", (req, res) => {
  community.assertVisibleUser(actor(res), String(req.params.ownerId));
  res.json(profiles.data(actor(res), String(req.params.ownerId)));
});
api.post("/api/profiles/:ownerId/report", (req, res) =>
  res.json(profiles.report(actor(res), String(req.params.ownerId))),
);
api.get("/api/profile-drafts", (_req, res) => res.json(profiles.drafts(actor(res))));
api.get("/api/mods", (_req, res) => res.json(mods.list(actor(res))));
api.get("/api/mod-creators/:id", (req, res) =>
  res.json(mods.creator(actor(res), z.string().min(1).max(80).parse(req.params.id))),
);
api.get("/api/profiles/:id/mods", (req, res) => res.json(mods.credits(String(req.params.id))));
api.post("/api/profiles/:id/combination", (req, res) => {
  const input = z.object({ publicationId: z.string().uuid() }).strict().parse(req.body);
  res.json(mods.combination(actor(res), String(req.params.id), input.publicationId));
});
api.post("/api/mod-previews/:id/apply", (req, res) => {
  z.object({}).strict().parse(req.body);
  res.json(mods.applyPreview(actor(res), z.string().uuid().parse(req.params.id)));
});
api.post("/api/mods/:id/preview", (req, res) =>
  res.json(
    mods.install(
      actor(res),
      z.string().uuid().parse(req.params.id),
      installModSchema.parse(req.body),
      true,
    ),
  ),
);
api.get("/api/mods/:id", (req, res) =>
  res.json(
    mods.get(
      z.string().uuid().parse(req.params.id),
      req.query.version === undefined
        ? undefined
        : z.coerce.number().int().positive().parse(req.query.version),
    ),
  ),
);
api.get("/api/mods/:id/assets/:assetId", (req, res) => {
  const a = mods.asset(
    z.string().uuid().parse(req.params.id),
    z.coerce.number().int().positive().parse(req.query.version),
    z.string().uuid().parse(req.params.assetId),
  );
  res.type(a.mime).send(Buffer.from(a.base64, "base64"));
});
api.post("/api/mods", (req, res) =>
  res.json(mods.share(actor(res), shareModSchema.parse(req.body))),
);
api.post("/api/mods/:id/install", (req, res) =>
  res.json(
    mods.install(
      actor(res),
      z.string().uuid().parse(req.params.id),
      installModSchema.parse(req.body),
    ),
  ),
);
api.get("/api/profile-history", (_req, res) =>
  res.json({
    state: profiles.state(actor(res).userId),
    publications: profiles.history(actor(res)),
  }),
);
api.get("/api/profile-drafts/:id", (req, res) =>
  res.json(profiles.draft(actor(res), String(req.params.id))),
);
api.post("/api/profile-validate", (req, res) => {
  const result = profilePackageSchema.safeParse(req.body);
  res.json(
    result.success
      ? { valid: true }
      : {
          valid: false,
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
  );
});
api.post("/api/profile-drafts", (req, res) => res.json(profiles.create(actor(res), req.body)));
api.post("/api/profile-drafts/:id/compose", (req, res) => {
  const input = z
    .object({
      revision: z.number().int().positive(),
      slot: z.enum(["profile", "post", "story", "feature"]),
      donor: profilePackageSchema.nullable(),
    })
    .strict()
    .parse(req.body);
  const draft = profiles.draft(actor(res), String(req.params.id));
  const pkg = composeProfilePart(draft.package, input.donor, input.slot);
  res.json(profiles.update(actor(res), draft.id, pkg, input.revision));
});
api.put("/api/profile-drafts/:id", (req, res) => {
  const input = z
    .object({
      package: z.unknown(),
      revision: z.number().int().positive(),
      identity: profileIdentitySchema.optional(),
    })
    .strict()
    .parse(req.body);
  res.json(
    profiles.update(
      actor(res),
      String(req.params.id),
      input.package,
      input.revision,
      input.identity,
    ),
  );
});
api.post("/api/profile-drafts/:id/publish", (req, res) => {
  const input = z
    .object({
      revision: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict()
    .parse(req.body);
  res.json(
    profiles.publish(actor(res), String(req.params.id), input.revision, input.expectedVersion),
  );
});
api.post("/api/profile-restore", (req, res) => {
  const input = z
    .object({
      publicationId: z.string().uuid().nullable(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict()
    .parse(req.body);
  res.json(profiles.restore(actor(res), input.publicationId, input.expectedVersion));
});
api.post("/api/users/:id/follow", (req, res) =>
  res.json(service.follow(actor(res), String(req.params.id))),
);
api.post("/api/posts/:id/like", (req, res) =>
  res.json(service.toggle(actor(res), String(req.params.id), "like")),
);
api.post("/api/posts/:id/save", (req, res) =>
  res.json(service.toggle(actor(res), String(req.params.id), "save")),
);
api.post("/api/posts/:id/report", (req, res) =>
  res.json(
    service.report(
      actor(res),
      String(req.params.id),
      req.body && Object.keys(req.body).length ? reportInputSchema.parse(req.body).reason : "other",
    ),
  ),
);
api.get("/api/posts/:id/comments", (req, res) => {
  service.visiblePost(actor(res), String(req.params.id));
  const viewer = actor(res).userId;
  res.json(
    service.comments(String(req.params.id)).filter((c) => community.canSeeUser(viewer, c.userId)),
  );
});
api.post("/api/posts/:id/comments", (req, res) => {
  const input = z
    .object({ text: z.string(), parentId: z.string().uuid().optional() })
    .strict()
    .parse(req.body);
  res.json(service.comment(actor(res), String(req.params.id), input.text, input.parentId));
});
api.delete("/api/comments/:id", (req, res) =>
  res.json(service.deleteComment(actor(res), String(req.params.id))),
);
api.delete("/api/posts/:id", (req, res) =>
  res.json(service.deletePost(actor(res), String(req.params.id))),
);
/** The draft that edits a published post; publishing it updates the post in place. */
api.post("/api/posts/:id/edit", (req, res) => {
  z.object({})
    .strict()
    .parse(req.body ?? {});
  res.json(service.editPost(actor(res), String(req.params.id)));
});
// Share links: read-only views anyone can open without an account.
const guestLimit = rateLimit({ windowMs: 60_000, max: 120 });
api.get("/api/public/showcase", guestLimit, (_req, res) => res.json(sharing.showcase()));
// A share card's landing page names the side it came from; private sides are never acknowledged.
api.get("/api/public/sides/:id", guestLimit, (req, res) => {
  const side = sideById(z.string().max(40).parse(req.params.id));
  if (!side || side.private) throw new AppError("NOT_FOUND", 404);
  res.json({ id: side.id, name: side.name, tagline: side.tagline, accent: side.accent });
});
// A side's link (ADR 0035): the home of an open side for someone without an account.
api.get("/api/public/sides/:id/home", guestLimit, (req, res) =>
  res.json(sharing.side(z.string().max(40).parse(req.params.id))),
);
api.get("/api/public/posts/:id", guestLimit, (req, res) =>
  res.json(sharing.post(String(req.params.id))),
);
api.get("/api/public/posts/:id/cover", guestLimit, (req, res) => {
  const asset = sharing.cover(String(req.params.id));
  res.type(asset.mime).send(Buffer.from(asset.base64, "base64"));
});
api.get("/api/public/users/:handle", guestLimit, (req, res) =>
  res.json(sharing.profile(z.string().min(1).max(30).parse(req.params.handle))),
);
api.get("/api/public/users/:handle/now", guestLimit, async (req, res) => {
  const id = sharing.profile(z.string().min(1).max(30).parse(req.params.handle)).user.id;
  await spotify.poll(id);
  res.json(nowService.archive(GUEST, id));
});
api.get("/api/public/users/:handle/posts", guestLimit, (req, res) => {
  const id = sharing.profile(z.string().min(1).max(30).parse(req.params.handle)).user.id;
  res.json(pages.posts(GUEST, id));
});
api.get("/api/public/users/:handle/timeline", guestLimit, async (req, res) => {
  const id = sharing.profile(z.string().min(1).max(30).parse(req.params.handle)).user.id;
  await spotify.poll(id);
  res.json(pages.timeline(GUEST, id));
});
// A friend's page for the home-screen widget (ADR 0042): guest view, polled, no account needed.
api.get("/api/public/users/:handle/widget", guestLimit, async (req, res) => {
  const id = sharing.profile(z.string().min(1).max(30).parse(req.params.handle)).user.id;
  await spotify.poll(id);
  res.json(nowService.widget(GUEST, id));
});
// An invite takes answers without an account, so its writes get their own tighter limit.
gatheringRoutes(
  api,
  gatherings,
  momentDay,
  guestLimit,
  rateLimit({ windowMs: 10 * 60_000, max: 30 }),
  rateLimit({ windowMs: 60_000, max: 60 }),
  // A whole wedding can share the venue's Wi-Fi, so photos and door scans allow a crowd.
  rateLimit({ windowMs: 10 * 60_000, max: 600 }),
  rateLimit({ windowMs: 10 * 60_000, max: 600 }),
);
api.post("/api/public/capability", guestLimit, (req, res) => {
  const { ticket: ticketId, request } = z
    .object({ ticket: z.string().length(64), request: profileRequestSchema })
    .strict()
    .parse(req.body);
  const ticket = tickets.get(ticketId);
  if (!ticket || !ticket.guest || ticket.expires < Date.now())
    throw new AppError("RUNTIME_EXPIRED", 403);
  // Guests run posts with no capabilities at all, and profiles with read-only ones.
  if (ticket.kind !== "profile") throw new AppError("SIGN_IN_REQUIRED", 401);
  res.json({ value: sharing.profileCapability(ticket.target, request.method, request.payload) });
});
api.post("/api/public/runtime", guestLimit, (req, res) => {
  const { target, kind } = z
    .object({ target: z.string().uuid(), kind: z.enum(["post", "profile"]).default("post") })
    .strict()
    .parse(req.body);
  const item = kind === "profile" ? sharing.profileRecord(target) : sharing.postRecord(target);
  res.json(
    issueTicket({
      kind,
      guest: true,
      actor: { userId: "" },
      target,
      preview: false,
      revision: item.revision,
      session: `guest:${randomUUID()}`,
    }),
  );
});
api.get("/api/drafts", (_req, res) => res.json(service.drafts(actor(res))));
api.get("/api/drafts/:id", (req, res) =>
  res.json(service.draft(actor(res), String(req.params.id))),
);
api.post("/api/drafts", (req, res) => res.json(service.createDraft(actor(res), req.body)));
api.put("/api/drafts/:id", (req, res) => {
  const { revision, ...input } = z
    .object({ revision: z.number().int(), package: z.unknown(), metadata: z.unknown() })
    .strict()
    .parse(req.body);
  res.json(service.updateDraft(actor(res), String(req.params.id), input, revision));
});
api.post("/api/drafts/:id/publish", (req, res) => {
  const { revision } = z.object({ revision: z.number().int() }).strict().parse(req.body);
  res.json(service.publish(actor(res), String(req.params.id), revision));
});
api.post("/api/posts/:id/reuse", (req, res) => {
  const post = service.visiblePost(actor(res), String(req.params.id));
  // A moment's page only means something with its proof; copying it would launder the look.
  if (identity.isMoment(post.id)) throw new AppError("MOMENT_NOT_REUSABLE", 403);
  // Copy published media into the new creator's namespace, so private asset ACLs remain meaningful.
  let pkg = structuredClone(post.package);
  let coverAssetId = post.metadata.coverAssetId;
  if (pkg.manifest.schemaVersion === 2) {
    const replacements = new Map<string, string>();
    for (const id of pkg.manifest.assets) {
      const a = service.asset(actor(res), id);
      if (a.ownerId !== "shared" && a.ownerId !== actor(res).userId)
        replacements.set(
          id,
          media.isVideo(a)
            ? media.copyVideo(actor(res), a)
            : service.upload(actor(res), { name: a.name, mime: a.mime, base64: a.base64 }).id,
        );
    }
    pkg.manifest.assets = pkg.manifest.assets.map((id) => replacements.get(id) ?? id);
    if (coverAssetId) coverAssetId = replacements.get(coverAssetId) ?? coverAssetId;
    for (const path of Object.keys(pkg.files))
      for (const [before, after] of replacements)
        pkg.files[path] = pkg.files[path]!.replaceAll(`asset:${before}`, `asset:${after}`);
  }
  const { side: _side, ...copied } = post.metadata;
  res.json(
    service.createDraft(actor(res), {
      package: pkg,
      metadata: {
        ...copied,
        coverAssetId,
        title: `${post.metadata.title} — remix`.slice(0, 100),
        contributors: [],
      },
    }),
  );
});
// Website import reads outside pages on a person's behalf, so it is throttled hard.
const importLimit = rateLimit({ windowMs: 10 * 60_000, max: 20 });
// Local trials and tests may point at sites on this machine; production never can.
const importAllowHosts = production
  ? []
  : (process.env.FORMA_IMPORT_ALLOW_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
api.post("/api/imports", importLimit, async (req, res) =>
  res.json(await importSite(service, actor(res), req.body, { allowHosts: importAllowHosts })),
);
api.post("/api/validate", (req, res) => res.json(service.validate(req.body)));
api.post("/api/assets", (req, res) => res.json(service.upload(actor(res), req.body)));
// Videos arrive as the raw file, not base64 JSON, and are kept as files (see MediaService).
const videoLimit = rateLimit({ windowMs: 10 * 60_000, max: 20 });
api.post(
  "/api/videos",
  videoLimit,
  express.raw({ type: ["video/*"], limit: maxVideoBytes }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new AppError("INVALID_VIDEO");
    res.json(
      media.uploadVideo(actor(res), {
        name: decodeURIComponent(String(req.headers["x-file-name"] ?? "video")),
        mime: req.headers["content-type"],
        bytes: req.body,
      }),
    );
  },
);
api.get("/api/assets/:id", (req, res) => {
  const a = service.asset(actor(res), String(req.params.id));
  // The data directory defaults to `.local`, which `send` would otherwise refuse as a dotfile.
  if (media.isVideo(a)) return res.type(a.mime).sendFile(media.path(a.id), { dotfiles: "allow" });
  res.type(a.mime).send(Buffer.from(a.base64, "base64"));
});
api.get("/api/users/:id/avatar", (req, res) => {
  const asset = res.locals.actor
    ? profiles.publicAvatar(String(req.params.id))
    : sharing.avatar(String(req.params.id));
  res.setHeader("Cache-Control", "no-store");
  res.type(asset.mime).send(Buffer.from(asset.base64, "base64"));
});
api.post("/api/runtime", (req, res) => {
  const { target, preview, kind } = z
    .object({
      target: z.string().uuid(),
      preview: z.boolean().default(false),
      kind: z.enum(["post", "profile"]).default("post"),
    })
    .strict()
    .parse(req.body);
  const item =
    kind === "profile"
      ? preview
        ? profiles.draft(actor(res), target)
        : profiles.publication(target)
      : preview
        ? service.draft(actor(res), target)
        : service.visiblePost(actor(res), target);
  res.json(
    issueTicket({
      kind,
      actor: actor(res),
      target,
      preview,
      revision: item.revision,
      session: res.locals.session as string,
    }),
  );
});
api.post("/api/capability", (req, res) => {
  const { ticket: ticketId, request } = z
    .object({
      ticket: z.string().length(64),
      request: z.union([bridgeRequestSchema, profileRequestSchema]),
    })
    .strict()
    .parse(req.body);
  const ticket = tickets.get(ticketId);
  if (
    !ticket ||
    ticket.guest ||
    ticket.expires < Date.now() ||
    ticket.session !== res.locals.session ||
    ticket.actor.userId !== actor(res).userId
  )
    throw new AppError("RUNTIME_EXPIRED", 403);
  if (ticket.kind === "profile") {
    profileRequestSchema.parse(request);
    if (ticket.preview && profiles.draft(actor(res), ticket.target).revision !== ticket.revision)
      throw new AppError("PREVIEW_STALE", 409);
    return res.json({
      value: profiles.capability(
        actor(res),
        ticket.target,
        ticket.preview,
        request.method,
        request.payload,
      ),
    });
  }
  bridgeRequestSchema.parse(request);
  if (ticket.preview && service.draft(actor(res), ticket.target).revision !== ticket.revision)
    throw new AppError("PREVIEW_STALE", 409);
  res.json({
    value: service.capability(
      actor(res),
      ticket.target,
      request.method,
      request.payload,
      ticket.preview,
    ),
  });
});
api.get("/api/spec", (_req, res) =>
  res.json({
    name: "Forma",
    schemaVersions: [1, 2],
    identity: "MCP is bound to the local You account; tools cannot select another user.",
    entrypoint: "index.html",
    files:
      "Up to 20 local html/css/js files. No external network, dependencies, eval, or server code. Inline scripts are supported. Local script src and stylesheet href are bundled.",
    assets:
      "Upload JPEG/PNG/WebP via upload_media, add IDs to manifest.assets, reference asset:ID in HTML or CSS. Max 3 MB each.",
    sdk: {
      progress: "await forma.progress.read(); await forma.progress.write({page:2})",
      contributions:
        "await forma.contributions.list(); await forma.contributions.add({text:'My memory'})",
      poll: "await forma.poll.read(); await forma.poll.vote(0)",
      plan: "await forma.plan.read(); await forma.plan.join(true) // or false to step out",
      appearance:
        "forma.appearance.theme is light or dark. Style html[data-theme=dark] or listen for the forma:theme window event. Appearance updates do not reload the post.",
    },
    stage:
      "Optional manifest.stage: {background,ink,nightBackground,nightInk,height}. Colors are six-digit hex; height is 560–960 CSS px. Declaring a stage enables edge-to-edge presentation. Use transparent body backgrounds so the host canvas continues behind your objects. Existing packages without a stage still work.",
    permissions:
      "Declare capabilities. Contributors must also be named in metadata.contributors; votes and progress are scoped to the viewer. Preview state is separate from published state.",
    workflow:
      "read_spec → list_media → create_draft → preview_draft → update_draft → publish_draft. Publish must use latest revision.",
    example: {
      manifest: {
        schemaVersion: 2,
        runtimeVersion: "web-v1",
        name: "My experience",
        entrypoint: "index.html",
        capabilities: [],
        assets: [],
      },
      files: { "index.html": "<main><h1>Hello, Forma</h1></main>" },
    },
  }),
);
api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    error instanceof AppError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : ((error as { status?: number }).status ?? 500);
  res.status(status).json({
    error:
      error instanceof AppError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_INPUT"
          : status === 413
            ? "PAYLOAD_TOO_LARGE"
            : "INTERNAL_ERROR",
    traceId: res.locals.traceId,
    ...(error instanceof AppError && error.details !== undefined ? { details: error.details } : {}),
    ...(error instanceof z.ZodError
      ? { issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }
      : {}),
  });
});
const runtimeHost = config.runtimeUrl.host;
const runtimeCsp = runtimeCspFor(
  production ? [config.publicUrl.origin] : ["http://127.0.0.1:3000", "http://localhost:3000"],
  config.runtimeUrl.origin,
);
const runtime = express();
runtime.disable("x-powered-by");
runtime.get("/run/:id", (req, res) => {
  if (req.headers.host !== runtimeHost && req.headers.host !== `127.0.0.1:${config.runtimePort}`)
    return res.sendStatus(403);
  const ticket = tickets.get(String(req.params.id));
  if (!ticket || ticket.expires < Date.now()) return res.sendStatus(404);
  try {
    const item =
      ticket.kind === "profile"
        ? ticket.preview
          ? profiles.draft(ticket.actor, ticket.target)
          : profiles.publication(ticket.target)
        : ticket.preview
          ? service.draft(ticket.actor, ticket.target)
          : service.post(ticket.target);
    if (item.revision !== ticket.revision) return res.sendStatus(409);
    const assets: Record<string, string> = {};
    if ("assets" in item.package.manifest)
      for (const id of item.package.manifest.assets) {
        const asset = store.get<Asset>("asset", id);
        if (asset)
          assets[id] = media.isVideo(asset)
            ? new URL(`/media/${String(req.params.id)}/${id}`, config.runtimeUrl).href
            : `data:${asset.mime};base64,${asset.base64}`;
      }
    res
      .set({
        "Content-Security-Policy": runtimeCsp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      })
      .type("html")
      .send(
        renderDocument(
          "kind" in item.package.manifest
            ? profileDocument(
                item.package as import("../../packages/contracts/src/profile.js").ProfilePackage,
              )
            : (item.package as import("../../packages/contracts/src/experience.js").Experience),
          ticket.nonce,
          assets,
        ),
      );
  } catch {
    res.sendStatus(404);
  }
});
/** A post's declared video, streamed (with range requests) to the frame its ticket opened. */
runtime.get("/media/:ticket/:asset", (req, res) => {
  if (req.headers.host !== runtimeHost && req.headers.host !== `127.0.0.1:${config.runtimePort}`)
    return res.sendStatus(403);
  const ticket = tickets.get(String(req.params.ticket));
  if (!ticket || ticket.expires < Date.now()) return res.sendStatus(404);
  try {
    const item =
      ticket.kind === "profile"
        ? ticket.preview
          ? profiles.draft(ticket.actor, ticket.target)
          : profiles.publication(ticket.target)
        : ticket.preview
          ? service.draft(ticket.actor, ticket.target)
          : service.post(ticket.target);
    const id = String(req.params.asset);
    const asset = store.get<Asset>("asset", id);
    if (!("assets" in item.package.manifest) || !item.package.manifest.assets.includes(id))
      return res.sendStatus(404);
    if (!asset || !media.isVideo(asset)) return res.sendStatus(404);
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=600",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.type(asset.mime).sendFile(media.path(id), { dotfiles: "allow" });
  } catch {
    res.sendStatus(404);
  }
});
const apiServer = api.listen(config.apiPort, "127.0.0.1", () =>
  console.log(`Forma API (${config.mode}) ready on 127.0.0.1:${config.apiPort}`),
);
// Outlive Node's five-second client pool idle timeout. Equal client/server defaults can
// race when Next reuses a socket just as this upstream closes it (ECONNRESET).
apiServer.keepAliveTimeout = 60000;
apiServer.headersTimeout = 65000;
const runtimeServer = runtime.listen(config.runtimePort, "127.0.0.1", () =>
  console.log(`Forma runtime ready on 127.0.0.1:${config.runtimePort}`),
);
for (const server of [apiServer, runtimeServer])
  server.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    apiServer.close();
    runtimeServer.close();
    store.close();
    process.exit(0);
  });
