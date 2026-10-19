import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { User, PostView, Experience } from "../../contracts/src/experience.js";
import {
  birthdaySchema,
  chapterAudienceSchema,
  countries,
  places,
  countryChoiceSchema,
  decorationById,
  decorationChoiceSchema,
  decorations,
  defaultEmotes,
  emailConfirmSchema,
  emailStartSchema,
  inviteCreateSchema,
  inviteRedeemSchema,
  momentInputSchema,
  momentTemplate,
  momentTemplates,
  orgById,
  orgs,
  partnerRequestSchema,
  reactionSchema,
  seasons,
  signupSchema,
  stickerById,
  themeEventById,
  travelProofSchema,
} from "../../contracts/src/identity.js";
import type {
  Audience,
  Chapter,
  CountryCode,
  Decoration,
  MomentInput,
  MomentKind,
  Org,
  OverlayPiece,
  PostDecor,
  Season,
} from "../../contracts/src/identity.js";
import { pieceDepth, textSlots, themeBand, themeEditSchema } from "../../contracts/src/themes.js";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { Asset, Publication, SocialService } from "./social.js";
import { countryAt, jpegGps, placeAt } from "./exif.js";
import { queueMail } from "./mail.js";
import type { OutboxMessage } from "./mail.js";
import { reservedHandles } from "../../contracts/src/accounts.js";

interface EmailChallenge {
  id: string;
  userId: string;
  orgId: string;
  domain: string;
  emailHash: string;
  codeHash: string;
  expires: number;
  attempts: number;
}
interface Invite {
  code: string;
  orgId: string;
  kind: "member" | "title";
  label: string;
  from?: number | undefined;
  to?: number | "now" | undefined;
  uses: number;
  used: number;
  createdBy: string;
  createdAt: string;
}
interface PartnerRequest {
  id: string;
  from: string;
  to: string;
  label: "Together" | "Married";
  createdAt: string;
}
interface Choice {
  id: string | null;
  since: string;
}
/** A wearer's own version of a theme: where its pieces sit and the words in its text slots. */
interface ThemeEdit {
  pieces: { dx: number; dy: number }[];
  texts: Record<string, string>;
}
interface Prefs {
  country?: CountryCode;
  base?: Choice;
  seasons?: Record<string, Choice>;
  /** By theme id, so switching away and back keeps someone's edits. */
  edits?: Record<string, ThemeEdit>;
}
export interface Moment {
  postId: string;
  ownerId: string;
  kind: MomentKind;
  chapterId?: string;
  audience: Audience;
  proof: string | null;
  createdAt: string;
}
interface Reaction {
  postId: string;
  userId: string;
  sticker: string;
}
export interface MomentRenderContext {
  input: MomentInput;
  owner: User;
  chapter?: Chapter;
  org?: Org;
  partner?: User;
  proof: string | null;
  stickers: { id: string; label: string }[];
}
export type MomentRenderer = (context: MomentRenderContext) => Experience;

/** Simulated monthly ad pool for the payout estimate. No money moves in this demo. */
export const creatorPool = { currency: "IDR", monthly: 10_000_000, creatorShare: 0.3 };
const DAY = 86_400_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class IdentityService {
  constructor(
    private readonly social: SocialService,
    private readonly render: MomentRenderer,
    private readonly now: () => Date = () => new Date(),
    /** Demo only: show queued mail inside the app instead of sending it. */
    private readonly localInbox = true,
  ) {
    social.viewFilter = (viewerId, post) => this.canView(viewerId, post.id, post.ownerId);
    // A moment's page only means something with its proof, so it cannot be rewritten later.
    social.editGuard = (post) => {
      if (this.isMoment(post.id)) throw new AppError("MOMENT_NOT_EDITABLE", 403);
    };
    social.postRemovers.push((postId) => {
      this.store.remove("moment", postId);
      for (const key of this.store.ids("reaction"))
        if (key.startsWith(`${postId}:`)) this.store.remove("reaction", key);
    });
    const practice = {
      options: defaultEmotes.map((id) => stickerById(id)!),
      counts: {},
      mine: null,
      wall: [],
    };
    social.capabilityHandlers["reactions.read"] = (actor, postId, _payload, preview) =>
      preview ? practice : this.reactions(actor, postId);
    social.capabilityHandlers["reactions.place"] = (actor, postId, payload, preview) => {
      if (preview) throw new AppError("PREVIEW_READ_ONLY");
      return this.react(actor, postId, payload);
    };
  }
  private get store() {
    return this.social.store;
  }
  private user(id: string) {
    const user = this.store.get<User>("user", id);
    if (!user) throw new AppError("INVALID_USER");
    return user;
  }
  private today() {
    const d = this.now();
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  /** Validates a new profile without saving it, so account creation can commit it atomically. */
  newUser(input: unknown): User {
    const parsed = signupSchema.parse(input);
    const users = this.social.users();
    if (reservedHandles.includes(parsed.handle) || users.some((u) => u.handle === parsed.handle))
      throw new AppError("HANDLE_TAKEN", 409);
    const words = parsed.name.split(/\s+/).filter(Boolean);
    return {
      id: `u-${randomUUID().slice(0, 8)}`,
      name: parsed.name,
      handle: parsed.handle,
      initials: words
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join(""),
      color: ["#dbe5d2", "#f2d2be", "#d5def0", "#e4dcec", "#f5e3b5"][users.length % 5]!,
      bio: "",
    };
  }
  /** Open signup without a password, used by tests and the demo seed. */
  signup(input: unknown) {
    const user = this.newUser(input);
    this.store.transaction(() => this.store.put("user", user.id, user));
    return user;
  }

  inCircle(viewerId: string, ownerId: string) {
    return (
      viewerId === ownerId ||
      (!!this.store.get("follow", `${viewerId}:${ownerId}`) &&
        !!this.store.get("follow", `${ownerId}:${viewerId}`))
    );
  }
  canView(viewerId: string, postId: string, ownerId: string) {
    const moment = this.store.get<Moment>("moment", postId);
    return !moment || moment.audience === "public" || this.inCircle(viewerId, ownerId);
  }

  // Chapters -------------------------------------------------------------------------------
  private chapters(userId: string) {
    return this.store.all<Chapter>("chapter").filter((c) => c.ownerId === userId);
  }
  chaptersFor(actor: Actor, ownerId: string) {
    const viewer = this.social.actor(actor);
    this.user(ownerId);
    const circle = this.inCircle(viewer, ownerId);
    return this.chapters(ownerId).filter((c) => c.audience === "public" || circle);
  }
  /** Told about every new chapter inside its transaction (sides: an organisation's side opens). */
  chapterListeners: ((chapter: Chapter) => void)[] = [];
  private addChapter(chapter: Omit<Chapter, "id" | "createdAt">) {
    const value: Chapter = { ...chapter, id: randomUUID(), createdAt: this.now().toISOString() };
    this.store.put("chapter", value.id, value);
    for (const listener of this.chapterListeners) listener(value);
    return value;
  }
  setChapterAudience(actor: Actor, id: string, input: unknown) {
    const owner = this.social.actor(actor);
    const chapter = this.store.get<Chapter>("chapter", id);
    if (!chapter || chapter.ownerId !== owner) throw new AppError("NOT_FOUND", 404);
    const next = { ...chapter, ...chapterAudienceSchema.parse(input) };
    this.store.transaction(() => this.store.put("chapter", id, next));
    return next;
  }
  /** Ending a "together" chapter ends it for both people; moments keep but lose their proof. */
  removeChapter(actor: Actor, id: string) {
    const owner = this.social.actor(actor);
    const chapter = this.store.get<Chapter>("chapter", id);
    if (!chapter || chapter.ownerId !== owner) throw new AppError("NOT_FOUND", 404);
    const pair =
      chapter.kind === "together"
        ? this.store
            .all<Chapter>("chapter")
            .filter((c) => c.kind === "together" && c.link === chapter.link && c.link !== undefined)
        : [chapter];
    this.store.transaction(() => pair.forEach((c) => this.store.remove("chapter", c.id)));
    return { removed: pair.length };
  }

  startEmail(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { email } = emailStartSchema.parse(input);
    const domain = email.split("@")[1]!;
    const org = orgs.find((o) => o.domains.includes(domain));
    if (!org) throw new AppError("EMAIL_DOMAIN_UNKNOWN");
    const emailHash = hash(email);
    const claim = this.store.get<{ userId: string }>("email-claim", emailHash);
    if (claim && claim.userId !== userId) throw new AppError("EMAIL_IN_USE", 409);
    const open = this.store
      .all<EmailChallenge>("email-challenge")
      .filter((c) => c.userId === userId && c.expires > this.now().getTime());
    if (open.length >= 5) throw new AppError("TOO_MANY_CODES", 429);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge: EmailChallenge = {
      id: randomUUID(),
      userId,
      orgId: org.id,
      domain,
      emailHash,
      codeHash: hash(`${emailHash}:${code}`),
      expires: this.now().getTime() + 15 * 60_000,
      attempts: 0,
    };
    this.store.transaction(() => {
      this.store.put("email-challenge", challenge.id, challenge);
      queueMail(
        this.store,
        {
          userId,
          to: email,
          subject: `Your ${org.name} code`,
          body: `Your verification code is ${code}. It expires in 15 minutes.`,
        },
        this.now(),
      );
    });
    return {
      challengeId: challenge.id,
      org: { id: org.id, name: org.name, kind: org.kind },
      sentTo: email.replace(/^(.).*(@.*)$/, "$1•••$2"),
    };
  }
  outbox(actor: Actor) {
    const userId = this.social.actor(actor);
    if (!this.localInbox) return [];
    return this.store
      .all<OutboxMessage>("outbox")
      .filter((m) => m.userId === userId)
      .reverse()
      .slice(0, 10);
  }
  confirmEmail(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = emailConfirmSchema.parse(input);
    const challenge = this.store.get<EmailChallenge>("email-challenge", parsed.challengeId);
    if (!challenge || challenge.userId !== userId) throw new AppError("NOT_FOUND", 404);
    if (challenge.expires < this.now().getTime() || challenge.attempts >= 5)
      throw new AppError("CODE_EXPIRED", 410);
    if (hash(`${challenge.emailHash}:${parsed.code}`) !== challenge.codeHash) {
      this.store.transaction(() =>
        this.store.put("email-challenge", challenge.id, {
          ...challenge,
          attempts: challenge.attempts + 1,
        }),
      );
      throw new AppError("CODE_INCORRECT");
    }
    const org = orgById(challenge.orgId)!;
    return this.store.transaction(() => {
      this.store.remove("email-challenge", challenge.id);
      // Only the hash is kept, to stop one address verifying several accounts.
      this.store.put("email-claim", challenge.emailHash, { userId });
      return this.addChapter({
        ownerId: userId,
        kind: org.kind === "campus" ? "education" : "work",
        label: `${parsed.role}, ${org.name}`,
        orgId: org.id,
        ...parsed.period,
        method: "email",
        audience: parsed.audience,
      });
    });
  }

  adminOrgs(userId: string) {
    return orgs.filter((o) => o.admins.includes(userId));
  }
  createInvite(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = inviteCreateSchema.parse(input);
    if (!this.adminOrgs(userId).some((o) => o.id === parsed.orgId))
      throw new AppError("ORG_ADMIN_REQUIRED", 403);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
    const invite: Invite = {
      code,
      orgId: parsed.orgId,
      kind: parsed.kind,
      label: parsed.label,
      ...parsed.period,
      uses: parsed.uses,
      used: 0,
      createdBy: userId,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => this.store.put("invite", code, invite));
    return invite;
  }
  invites(actor: Actor) {
    const userId = this.social.actor(actor);
    const mine = new Set(this.adminOrgs(userId).map((o) => o.id));
    return this.store.all<Invite>("invite").filter((i) => mine.has(i.orgId));
  }
  redeemInvite(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = inviteRedeemSchema.parse(input);
    const invite = this.store.get<Invite>("invite", parsed.code);
    if (!invite) throw new AppError("INVITE_INVALID", 404);
    if (this.store.get("invite-use", `${invite.code}:${userId}`))
      throw new AppError("INVITE_ALREADY_USED", 409);
    if (invite.used >= invite.uses) throw new AppError("INVITE_EXHAUSTED", 410);
    return this.store.transaction(() => {
      this.store.put("invite", invite.code, { ...invite, used: invite.used + 1 });
      this.store.put("invite-use", `${invite.code}:${userId}`, { userId });
      return this.addChapter({
        ownerId: userId,
        kind: invite.kind,
        label: invite.label,
        orgId: invite.orgId,
        ...(invite.from === undefined ? {} : { from: invite.from }),
        ...(invite.to === undefined ? {} : { to: invite.to }),
        method: "invite",
        audience: parsed.audience,
      });
    });
  }

  requestPartner(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = partnerRequestSchema.parse(input);
    if (parsed.partnerId === userId) throw new AppError("INVALID_USER");
    this.user(parsed.partnerId);
    this.social.relationGuard(userId, parsed.partnerId);
    const request: PartnerRequest = {
      id: randomUUID(),
      from: userId,
      to: parsed.partnerId,
      label: parsed.label,
      createdAt: this.now().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("partner-request", request.id, request);
      this.social.emit({ type: "partner-request", actorId: request.from, targetId: request.to });
    });
    return request;
  }
  respondPartner(actor: Actor, id: string, accept: boolean) {
    const userId = this.social.actor(actor);
    const request = this.store.get<PartnerRequest>("partner-request", id);
    if (!request || (request.to !== userId && request.from !== userId))
      throw new AppError("NOT_FOUND", 404);
    // Only the invited person can confirm; either side can withdraw or decline.
    if (accept && request.to !== userId) throw new AppError("PARTNER_MUST_CONFIRM", 403);
    return this.store.transaction(() => {
      this.store.remove("partner-request", id);
      if (!accept) return { accepted: false };
      const link = randomUUID();
      for (const [owner, partner] of [
        [request.from, request.to],
        [request.to, request.from],
      ] as const)
        this.addChapter({
          ownerId: owner,
          kind: "together",
          label: `${request.label} with ${this.user(partner).name}`,
          partnerId: partner,
          link,
          from: this.now().getUTCFullYear(),
          method: "partner",
          audience: "circle",
        });
      return { accepted: true };
    });
  }

  travelProof(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = travelProofSchema.parse(input);
    const asset = this.store.get<Asset>("asset", parsed.assetId);
    if (!asset || asset.ownerId !== userId) throw new AppError("NOT_FOUND", 404);
    const gps = asset.mime === "image/jpeg" ? jpegGps(Buffer.from(asset.base64, "base64")) : null;
    if (!gps) throw new AppError("PHOTO_HAS_NO_LOCATION");
    const country = countryAt(gps.lat, gps.lon);
    if (!country) throw new AppError("COUNTRY_NOT_SUPPORTED");
    // A place counts only inside the country the photo was placed in, so the two never disagree.
    const found = placeAt(gps.lat, gps.lon);
    const place = found && places[found].country === country ? found : undefined;
    const existing = this.chapters(userId).find(
      (c) => c.kind === "travel" && c.country === country && c.place === place,
    );
    if (existing) return existing;
    return this.store.transaction(() =>
      this.addChapter({
        ownerId: userId,
        kind: "travel",
        label: `Been to ${place ? places[place].name : countries[country]}`,
        country,
        ...(place ? { place } : {}),
        from: this.now().getUTCFullYear(),
        method: "photo-location",
        audience: parsed.audience,
      }),
    );
  }

  /** Set once. Changing it later would let anyone reopen the birthday template on demand. */
  setBirthday(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    if (this.store.get("birthday", userId)) throw new AppError("BIRTHDAY_LOCKED", 409);
    const value = birthdaySchema.parse(input);
    this.store.transaction(() => this.store.put("birthday", userId, value));
    return value;
  }
  private isBirthday(userId: string) {
    const b = this.store.get<{ birthday: string }>("birthday", userId)?.birthday;
    if (!b) return false;
    // One day either side covers time zones without a per-user zone setting.
    const t = this.now().getTime();
    return [t - DAY, t, t + DAY].some((x) => {
      const d = new Date(x);
      return (
        `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` ===
        b
      );
    });
  }

  me(actor: Actor) {
    const userId = this.social.actor(actor);
    const requests = this.store
      .all<PartnerRequest>("partner-request")
      .filter((r) => r.from === userId || r.to === userId);
    return {
      chapters: this.chapters(userId),
      birthday: this.store.get<{ birthday: string }>("birthday", userId)?.birthday ?? null,
      country: this.prefs(userId).country ?? null,
      incoming: requests.filter((r) => r.to === userId),
      outgoing: requests.filter((r) => r.from === userId),
      adminOrgs: this.adminOrgs(userId).map(({ admins, ...o }) => o),
      outbox: this.outbox(actor),
    };
  }

  // Seasons and decorations ----------------------------------------------------------------
  /**
   * Approved community themes (ADR 0024), supplied by the theme studio. They join the shipped
   * catalog; a theme that is later removed simply stops resolving, so nobody wears it any more.
   */
  communityThemes: () => Decoration[] = () => [];
  private catalog() {
    return [...decorations, ...this.communityThemes()];
  }
  private decorationById(id: string) {
    return decorationById(id) ?? this.communityThemes().find((d) => d.id === id);
  }
  private prefs(userId: string) {
    return this.store.get<Prefs>("prefs", userId) ?? {};
  }
  setCountry(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { country } = countryChoiceSchema.parse(input);
    this.store.transaction(() =>
      this.store.put("prefs", userId, { ...this.prefs(userId), country }),
    );
    return { country };
  }
  private inWindow(season: Season) {
    const today = this.today();
    return season.start <= season.end
      ? today >= season.start && today <= season.end
      : today >= season.start || today <= season.end;
  }
  activeSeason(userId: string): (Season & { key: string }) | null {
    const country = this.prefs(userId).country;
    const season = seasons.find(
      (s) => (s.country === null || s.country === country) && this.inWindow(s),
    );
    if (!season) return null;
    // Wrapping windows (New Year) belong to the year they started in.
    const now = this.now();
    const year =
      season.start > season.end && this.today() <= season.end
        ? now.getUTCFullYear() - 1
        : now.getUTCFullYear();
    return { ...season, key: `${season.id}:${year}` };
  }
  /** Seasonal default applies automatically; a manual choice for this season instance wins. */
  effectiveDecoration(userId: string) {
    const prefs = this.prefs(userId);
    const season = this.activeSeason(userId);
    if (season) {
      const choice = prefs.seasons?.[season.key];
      if (!choice)
        return {
          decoration: this.decorationById(season.defaultDecorationId)!,
          source: "season-default" as const,
          since: null,
        };
      if (choice.id && this.unlock(userId, this.decorationById(choice.id)).ok)
        return {
          decoration: this.decorationById(choice.id)!,
          source: "season-choice" as const,
          since: choice.since,
        };
    }
    if (prefs.base?.id && this.unlock(userId, this.decorationById(prefs.base.id)).ok)
      return {
        decoration: this.decorationById(prefs.base.id)!,
        source: "base" as const,
        since: prefs.base.since,
      };
    return null;
  }
  private unlock(userId: string, decoration?: Decoration): { ok: boolean; reason?: string } {
    if (!decoration) return { ok: false, reason: "Unknown decoration." };
    if (decoration.tier === "members") {
      const org = orgById(decoration.orgId!)!;
      const member = this.chapters(userId).some((c) => c.orgId === org.id);
      return member
        ? { ok: true }
        : {
            ok: false,
            reason:
              org.domains.length > 0
                ? `Members of ${org.name}. Verify your @${org.domains[0]} email or use an invite.`
                : `Members of ${org.name}. Ask them for an invite code.`,
          };
    }
    if (decoration.tier === "event") {
      const event = themeEventById(decoration.eventId!)!;
      if (event.kind === "season" && this.activeSeason(userId)?.id !== event.seasonId) {
        const season = seasons.find((s) => s.id === event.seasonId)!;
        return {
          ok: false,
          reason: `Only during ${season.name} (${season.start} to ${season.end}).`,
        };
      }
      // A trip theme stays yours while the travel chapter that proves it exists.
      // A place's chapter also proves its country; a country's chapter does not prove a place.
      if (
        event.kind === "trip" &&
        !this.chapters(userId).some(
          (c) =>
            c.kind === "travel" &&
            c.country === event.country &&
            (!event.place || c.place === event.place),
        )
      )
        return {
          ok: false,
          reason: `${event.name}. Prove it with a photo taken in ${
            event.place ? places[event.place].name : countries[event.country]
          }.`,
        };
    }
    return { ok: true };
  }
  /** Season themes come and go with their dates, so they can never be someone's everyday look. */
  private seasonal(decoration: Decoration) {
    return decoration.tier === "event" && themeEventById(decoration.eventId!)?.kind === "season";
  }
  /**
   * The theme as its wearer edited it. Edits are re-checked on read, like the lock: a piece moved
   * out of the edge band, or text for a slot the design no longer has, is simply ignored.
   */
  private edited(d: Decoration, ownerId: string | undefined): OverlayPiece[] {
    const edit = ownerId ? this.prefs(ownerId).edits?.[d.id] : undefined;
    if (!edit) return d.pieces;
    return d.pieces.map((p, i) => {
      const moved = edit.pieces.length === d.pieces.length ? { ...p, ...edit.pieces[i]! } : p;
      const piece = pieceDepth(moved) <= themeBand ? moved : p;
      if (!("html" in piece)) return piece;
      const slots = textSlots(piece.html);
      const texts = Object.fromEntries(
        Object.entries(edit.texts)
          .filter(([key]) => key.startsWith(`${i}.`) && slots.includes(key.slice(2)))
          .map(([key, text]) => [key.slice(2), text]),
      );
      return Object.keys(texts).length ? { ...piece, texts } : piece;
    });
  }
  private themeView(d: Decoration, users: User[], ownerId?: string) {
    const event = d.eventId ? themeEventById(d.eventId) : undefined;
    return {
      id: d.id,
      name: d.name,
      accent: d.accent,
      font: d.font,
      tier: d.tier,
      ...(event ? { event: event.name } : {}),
      ...(d.sponsor ? { sponsor: d.sponsor } : {}),
      creator: users.find((u) => u.id === d.creatorId)?.handle ?? d.creatorId,
      pieces: this.edited(d, ownerId),
    };
  }
  /** The theme someone wears, for their profile page. Wearing it is the owner's own choice. */
  themeFor(actor: Actor, ownerId: string) {
    const viewer = this.social.actor(actor);
    this.user(ownerId);
    // A theme dresses posts and can reveal a trip, so it follows who may see those posts: blocks,
    // hidden and private accounts all answer through the same view filter chain.
    if (!this.social.viewFilter(viewer, { id: "", ownerId } as Publication)) return null;
    const effective = this.effectiveDecoration(ownerId);
    return effective ? this.themeView(effective.decoration, this.social.users(), ownerId) : null;
  }
  decorations(actor: Actor) {
    const userId = this.social.actor(actor);
    const effective = this.effectiveDecoration(userId);
    const season = this.activeSeason(userId);
    return {
      current: effective
        ? { id: effective.decoration.id, source: effective.source }
        : { id: null, source: "none" },
      season: season ? { id: season.id, name: season.name, key: season.key } : null,
      country: this.prefs(userId).country ?? null,
      items: this.catalog().map((d) => {
        const lock = this.unlock(userId, d);
        const event = d.eventId ? themeEventById(d.eventId) : undefined;
        return {
          id: d.id,
          name: d.name,
          tier: d.tier,
          accent: d.accent,
          font: d.font,
          event: event?.name ?? null,
          seasonal: this.seasonal(d),
          sponsor: d.sponsor,
          creator: this.store.get<User>("user", d.creatorId)?.handle ?? d.creatorId,
          emotes: d.emotes.map((id) => stickerById(id)!),
          pieces: d.pieces,
          /** The caller's own edit of this theme, if they made one. */
          edit: this.prefs(userId).edits?.[d.id] ?? null,
          unlocked: lock.ok,
          reason: lock.reason ?? null,
        };
      }),
    };
  }
  /** Saves the caller's own version of a theme they may wear. The theme stays as it is for others. */
  editDecoration(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { decorationId, pieces, texts } = themeEditSchema.parse(input);
    const decoration = this.decorationById(decorationId);
    const lock = this.unlock(userId, decoration);
    if (!lock.ok) throw new AppError("DECORATION_LOCKED", 403, { reason: lock.reason });
    const d = decoration!;
    if (pieces.length !== d.pieces.length)
      throw new AppError("THEME_EDIT_INVALID", 400, { reason: "One position per piece." });
    pieces.forEach((at, i) => {
      if (pieceDepth({ ...d.pieces[i]!, ...at }) > themeBand)
        throw new AppError("THEME_EDIT_INVALID", 400, {
          reason: `Piece ${i + 1} would cover the post. Keep it near an edge.`,
        });
    });
    for (const key of Object.keys(texts)) {
      const piece = d.pieces[Number(key[0])];
      if (!piece || !("html" in piece) || !textSlots(piece.html).includes(key.slice(2)))
        throw new AppError("THEME_EDIT_INVALID", 400, { reason: "That text cannot be changed." });
    }
    const prefs = this.prefs(userId);
    const next = { ...prefs, edits: { ...prefs.edits, [d.id]: { pieces, texts } } };
    this.store.transaction(() => this.store.put("prefs", userId, next));
    return this.decorations(actor);
  }
  /** Back to the designer's original. */
  resetDecorationEdit(actor: Actor, decorationId: string) {
    const userId = this.social.actor(actor);
    const prefs = this.prefs(userId);
    if (prefs.edits?.[decorationId]) {
      const { [decorationId]: _gone, ...edits } = prefs.edits;
      this.store.transaction(() => this.store.put("prefs", userId, { ...prefs, edits }));
    }
    return this.decorations(actor);
  }
  chooseDecoration(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { decorationId, scope } = decorationChoiceSchema.parse(input);
    if (decorationId !== null) {
      const decoration = this.decorationById(decorationId);
      const lock = this.unlock(userId, decoration);
      if (!lock.ok) throw new AppError("DECORATION_LOCKED", 403, { reason: lock.reason });
      if (scope === "base" && this.seasonal(decoration!))
        throw new AppError("SEASONAL_NOT_PERMANENT");
    }
    const prefs = this.prefs(userId);
    const choice = { id: decorationId, since: this.now().toISOString() };
    let next: Prefs;
    if (scope === "season") {
      const season = this.activeSeason(userId);
      if (!season) throw new AppError("NO_ACTIVE_SEASON");
      next = { ...prefs, seasons: { ...prefs.seasons, [season.key]: choice } };
    } else next = { ...prefs, base: choice };
    this.store.transaction(() => this.store.put("prefs", userId, next));
    return this.decorations(actor);
  }

  /**
   * Creator estimate from a fixed pool. Each current wearer counts once; new adopters weigh more
   * than long-time ones (30-day half-life, floor 0.1) so one popular theme cannot earn forever,
   * and automatic seasonal defaults count half because nobody actively chose them.
   */
  earnings(actor: Actor) {
    const userId = this.social.actor(actor);
    const totals = new Map<string, { adopters: number; weight: number }>();
    let all = 0;
    for (const user of this.social.users()) {
      const effective = this.effectiveDecoration(user.id);
      if (!effective) continue;
      const days = effective.since ? (this.now().getTime() - Date.parse(effective.since)) / DAY : 0;
      const weight =
        Math.max(0.1, 0.5 ** (days / 30)) * (effective.source === "season-default" ? 0.5 : 1);
      const entry = totals.get(effective.decoration.id) ?? { adopters: 0, weight: 0 };
      totals.set(effective.decoration.id, {
        adopters: entry.adopters + 1,
        weight: entry.weight + weight,
      });
      all += weight;
    }
    const creatorPot = creatorPool.monthly * creatorPool.creatorShare;
    const mine = this.catalog()
      .filter((d) => d.creatorId === userId)
      .map((d) => {
        const t = totals.get(d.id) ?? { adopters: 0, weight: 0 };
        return {
          id: d.id,
          name: d.name,
          tier: d.tier,
          adopters: t.adopters,
          weight: Math.round(t.weight * 100) / 100,
          estimate: all ? Math.round((creatorPot * t.weight) / all) : 0,
        };
      });
    return {
      ...creatorPool,
      creatorPot,
      totalWeight: Math.round(all * 100) / 100,
      decorations: mine,
      estimate: mine.reduce((sum, d) => sum + d.estimate, 0),
    };
  }

  // Moments --------------------------------------------------------------------------------
  templates(actor: Actor) {
    const userId = this.social.actor(actor);
    const chapters = this.chapters(userId);
    return momentTemplates.map((t) => {
      const eligible = chapters.filter((c) => t.chapterKinds.includes(c.kind));
      const unlocked =
        t.kind === "paper"
          ? true
          : t.kind === "birthday"
            ? this.isBirthday(userId)
            : eligible.length > 0;
      return {
        kind: t.kind,
        name: t.name,
        rule: t.rule,
        unlocked,
        chapters: eligible.map((c) => ({ id: c.id, label: c.label })),
        stickers: t.stickers.map((id) => stickerById(id)!),
      };
    });
  }
  createMoment(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const parsed = momentInputSchema.parse(input);
    const template = momentTemplate(parsed.kind);
    let chapter: Chapter | undefined;
    let proof: string | null = null;
    if (template.chapterKinds.length > 0) {
      chapter = parsed.chapterId ? this.store.get<Chapter>("chapter", parsed.chapterId) : undefined;
      if (!chapter || chapter.ownerId !== userId || !template.chapterKinds.includes(chapter.kind))
        throw new AppError("MOMENT_LOCKED", 403, { rule: template.rule });
      proof = chapter.label;
    } else if (parsed.kind === "birthday") {
      if (!this.isBirthday(userId))
        throw new AppError("MOMENT_LOCKED", 403, { rule: template.rule });
      proof = `Birthday, ${this.now().toISOString().slice(0, 10)}`;
    }
    if (parsed.kind === "paper" && !parsed.paper) throw new AppError("PAPER_REQUIRED");
    const pkg = this.render({
      input: parsed,
      owner: this.user(userId),
      ...(chapter ? { chapter } : {}),
      ...(chapter?.orgId ? { org: orgById(chapter.orgId)! } : {}),
      ...(chapter?.partnerId ? { partner: this.user(chapter.partnerId) } : {}),
      proof,
      stickers: template.stickers.map((id) => ({ id, label: stickerById(id)!.label })),
    });
    const draft = this.social.createDraft(actor, {
      package: pkg,
      metadata: {
        title: parsed.title,
        caption: parsed.story.slice(0, 1000),
        format: "custom",
        ...(parsed.coverAssetId ? { coverAssetId: parsed.coverAssetId } : {}),
        contributors: [],
      },
    });
    const createdAt = this.now().toISOString();
    let moment: Moment | undefined;
    // Recorded in the publication transaction so a circle-only moment is never briefly public.
    const post = this.social.publish(actor, draft.id, draft.revision, (published) => {
      moment = {
        postId: published.id,
        ownerId: userId,
        kind: parsed.kind,
        ...(chapter ? { chapterId: chapter.id } : {}),
        audience: parsed.audience,
        proof,
        createdAt,
      };
      this.store.put("moment", published.id, moment);
    });
    return { post, moment };
  }
  private momentView(moment: Moment) {
    const verified =
      moment.kind === "paper"
        ? false
        : moment.chapterId
          ? !!this.store.get("chapter", moment.chapterId)
          : moment.proof !== null;
    return {
      kind: moment.kind,
      name: momentTemplate(moment.kind).name,
      audience: moment.audience,
      proof: verified ? moment.proof : null,
      verified,
    };
  }

  // Reactions ------------------------------------------------------------------------------
  private reactionOptions(post: Publication) {
    const moment = this.store.get<Moment>("moment", post.id);
    const ids = moment
      ? momentTemplate(moment.kind).stickers
      : (this.effectiveDecoration(post.ownerId)?.decoration.emotes ?? []);
    return [...new Set([...ids, ...(moment ? [] : defaultEmotes)])].map((id) => stickerById(id)!);
  }
  reactions(actor: Actor, postId: string) {
    const userId = this.social.actor(actor);
    const post = this.social.visiblePost(actor, postId);
    const all = this.store.all<Reaction>("reaction").filter((r) => r.postId === postId);
    const users = this.social.users();
    const counts: Record<string, number> = {};
    for (const r of all) counts[r.sticker] = (counts[r.sticker] ?? 0) + 1;
    return {
      options: this.reactionOptions(post),
      counts,
      mine: all.find((r) => r.userId === userId)?.sticker ?? null,
      wall: all.slice(-40).map((r) => ({
        sticker: r.sticker,
        label: stickerById(r.sticker)?.label ?? r.sticker,
        name: users.find((u) => u.id === r.userId)?.name ?? "Someone",
      })),
    };
  }
  /** One preset reaction per person per post; choosing again replaces it, null removes it. */
  react(actor: Actor, postId: string, input: unknown) {
    const userId = this.social.actor(actor);
    const post = this.social.visiblePost(actor, postId);
    const { sticker } = reactionSchema.parse(input);
    const key = `${postId}:${userId}`;
    if (sticker !== null && !this.reactionOptions(post).some((o) => o.id === sticker))
      throw new AppError("STICKER_NOT_ALLOWED");
    const had = !!this.store.get("reaction", key);
    this.store.transaction(() => {
      if (sticker === null) this.store.remove("reaction", key);
      else {
        this.store.put("reaction", key, { postId, userId, sticker });
        if (!had)
          this.social.emit({ type: "reaction", actorId: userId, targetId: post.ownerId, postId });
      }
    });
    return this.reactions(actor, postId);
  }

  /** Adds decoration, moment proof and reactions; hides counts on moments for non-owners. */
  decorate(actor: Actor, posts: PostView[]): (PostView & PostDecor)[] {
    const userId = this.social.actor(actor);
    const users = this.social.users();
    const all = this.store.all<Reaction>("reaction");
    return posts.map((post) => {
      const moment = this.store.get<Moment>("moment", post.id);
      const effective = this.effectiveDecoration(post.ownerId);
      const mine = all.filter((r) => r.postId === post.id);
      const counts: Record<string, number> = {};
      for (const r of mine) counts[r.sticker] = (counts[r.sticker] ?? 0) + 1;
      const hideCounts = !!moment && post.ownerId !== userId;
      const d = effective?.decoration;
      return {
        ...post,
        likes: hideCounts ? 0 : post.likes,
        ...(d ? { decoration: this.themeView(d, users, post.ownerId) } : {}),
        ...(moment ? { moment: this.momentView(moment) } : {}),
        reactions: {
          options: this.reactionOptions(this.social.post(post.id)),
          counts,
          mine: mine.find((r) => r.userId === userId)?.sticker ?? null,
        },
        hideCounts,
      };
    });
  }
  isMoment(postId: string) {
    return !!this.store.get("moment", postId);
  }
}
