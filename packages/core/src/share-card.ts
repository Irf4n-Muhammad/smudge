import { z } from "zod";
import type { User } from "../../contracts/src/experience.js";
import { EVERYDAY, sideById, sideIdSchema } from "../../contracts/src/sides.js";
import type { Actor } from "./index.js";
import type { IdentityService } from "./identity.js";
import type { SidesService } from "./sides.js";
import { AppError } from "./social.js";
import type { Asset, SocialService } from "./social.js";

export const shareCardInputSchema = z.object({ side: sideIdSchema.default(EVERYDAY) }).strict();
export interface ShareCard {
  user: { name: string; handle: string; initials: string; color: string; bio: string };
  side: { id: string; name: string; tagline: string; accent: string; private: boolean };
  theme: { name: string; accent: string; font: string; event?: string } | null;
  /** Progress in the side's collection, when the person holds any stamp of it. */
  stamps: { name: string; held: number; total: number } | null;
  /** Where the card sends people: the owner's public page, landing in the side when it is open. */
  path: string;
  /** The owner's avatar as a data URL, so the card is one self-contained picture. */
  avatar: string | null;
}

/**
 * Share cards (ADR 0030): one picture of you in one of your sides, made to leave Smudge (a chat
 * group, a story) and bring people back into that side. Only your own card, only for a side you
 * are in; the data is what the public page already shows plus the side's name.
 */
export class ShareCardService {
  constructor(
    private readonly social: SocialService,
    private readonly identity: IdentityService,
    private readonly sides: SidesService,
  ) {}
  card(actor: Actor, input: unknown): ShareCard {
    const userId = this.social.actor(actor);
    const { side: sideId } = shareCardInputSchema.parse(input);
    const side = sideById(sideId);
    if (!side || !this.sides.isMember(userId, side.id)) throw new AppError("NOT_FOUND", 404);
    const user = this.social.users().find((u) => u.id === userId) as User;
    const theme = this.identity.themeFor(actor, userId);
    const collection = this.identity.collectionsFor(actor, userId).find((c) => c.side === side.id);
    let avatar: string | null = null;
    if (user.avatarAssetId) {
      const asset = this.store.get<Asset>("asset", user.avatarAssetId);
      if (asset) avatar = `data:${asset.mime};base64,${asset.base64}`;
    }
    // A private side cannot be joined from a link, so the link only opens the page.
    const path = `/u/${encodeURIComponent(user.handle)}${side.private || side.id === EVERYDAY ? "" : `?side=${side.id}`}`;
    return {
      user: {
        name: user.name,
        handle: user.handle,
        initials: user.initials,
        color: user.color,
        bio: user.bio,
      },
      side: {
        id: side.id,
        name: side.name,
        tagline: side.tagline,
        accent: side.accent,
        private: side.private,
      },
      theme: theme
        ? {
            name: theme.name,
            accent: theme.accent,
            font: theme.font,
            ...(theme.event ? { event: theme.event } : {}),
          }
        : null,
      stamps: collection
        ? { name: collection.name, held: collection.held, total: collection.total }
        : null,
      path,
      avatar,
    };
  }
  private get store() {
    return this.social.store;
  }
}
