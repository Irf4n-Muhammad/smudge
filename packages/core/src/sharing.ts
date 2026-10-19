import { z } from "zod";
import type { User } from "../../contracts/src/experience.js";
import type { RelayContribution, WallNote } from "../../contracts/src/profile.js";
import { publicUser } from "./community.js";
import type { CommunityService } from "./community.js";
import type { IdentityService } from "./identity.js";
import type { ProfileService } from "./profiles.js";
import { AppError, GUEST } from "./social.js";
import type { Asset, Note, Publication, SocialService } from "./social.js";
import { EVERYDAY, sideById } from "../../contracts/src/sides.js";
import type { SideHome } from "../../contracts/src/sides.js";

/** A public side's page for a guest (ADR 0035): its home, plus its recent public posts. */
export interface SharedSide extends SideHome {
  recent: {
    id: string;
    title: string;
    caption: string;
    hasCover: boolean;
    author: ReturnType<typeof publicUser>;
  }[];
}

/**
 * What a share link shows to someone without an account: the same rules a stranger with an
 * account would get, minus anything that needs a viewer (likes, saves, circles, blocks).
 * Moments stay inside the app; their page only means something next to its proof.
 */
export class SharingService {
  constructor(
    private readonly social: SocialService,
    private readonly community: CommunityService,
    private readonly identity: IdentityService,
    private readonly profiles: ProfileService,
  ) {}
  /** Installed by the sides layer: a side's home as the guest viewer sees it. */
  sideHome: (sideId: string) => SideHome = () => {
    throw new AppError("NOT_FOUND", 404);
  };
  private get store() {
    return this.social.store;
  }
  /**
   * A side's link (ADR 0035): the side's home for someone without an account, with the same
   * audience rules as the home inside the app asked about the guest viewer. Private sides and
   * Everyday are never answered, exactly like a side that does not exist.
   */
  side(sideId: string, limit = 12): SharedSide {
    const side = sideById(sideId);
    if (!side || side.private || side.id === EVERYDAY) throw new AppError("NOT_FOUND", 404);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const recent = this.store
      .all<Publication>("post")
      .reverse()
      .filter(
        (p) =>
          p.metadata.side === side.id &&
          !this.identity.isMoment(p.id) &&
          !this.community.hidden(p.ownerId) &&
          this.social.viewFilter(GUEST, p),
      )
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        title: p.metadata.title,
        caption: p.metadata.caption,
        hasCover: !!p.metadata.coverAssetId,
        author: publicUser(users.get(p.ownerId)),
      }));
    return { ...this.sideHome(side.id), recent };
  }
  /** The publication behind a public post link, or NOT_FOUND exactly as for a missing post. */
  postRecord(id: string) {
    const post = this.store.get<Publication>("post", id);
    if (!post || this.identity.isMoment(id) || !this.social.viewFilter(GUEST, post))
      throw new AppError("NOT_FOUND", 404);
    return post;
  }
  post(id: string) {
    const post = this.postRecord(id);
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    const comments = this.social
      .comments(id)
      .filter((c) => !this.community.hidden(c.userId))
      .map((c: Note) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt,
        ...(c.parentId ? { parentId: c.parentId } : {}),
        author: publicUser(users.get(c.userId)),
      }));
    const manifest = post.package.manifest;
    return {
      id: post.id,
      author: publicUser(users.get(post.ownerId))!,
      title: post.metadata.title,
      caption: post.metadata.caption,
      format: post.metadata.format,
      hasCover: !!post.metadata.coverAssetId,
      createdAt: post.createdAt,
      ...(post.editedAt ? { editedAt: post.editedAt } : {}),
      revision: post.revision,
      stage: manifest.schemaVersion === 2 ? (manifest.stage ?? null) : null,
      likes: this.store.ids("like").filter((k) => k.startsWith(`${id}:`)).length,
      comments,
    };
  }
  /** A few recent public posts with a photo, so a visitor sees what Smudge is before joining. */
  showcase(limit = 8) {
    const users = new Map(this.social.users().map((u) => [u.id, u]));
    return this.store
      .all<Publication>("post")
      .filter(
        (p) =>
          !!p.metadata.coverAssetId &&
          !this.identity.isMoment(p.id) &&
          !this.community.hidden(p.ownerId) &&
          this.social.viewFilter(GUEST, p),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        title: p.metadata.title,
        author: publicUser(users.get(p.ownerId))!,
      }));
  }
  /** The cover image of a publicly visible post, for link previews and profile grids. */
  cover(id: string) {
    const post = this.postRecord(id);
    const asset = post.metadata.coverAssetId
      ? this.store.get<{ mime: string; base64: string }>("asset", post.metadata.coverAssetId)
      : undefined;
    if (!asset) throw new AppError("NOT_FOUND", 404);
    return asset;
  }
  private owner(handle: string) {
    const user = this.social.users().find((u) => u.handle === handle.toLowerCase());
    if (!user || this.community.hidden(user.id)) throw new AppError("NOT_FOUND", 404);
    return user;
  }
  profile(handle: string) {
    const user: User = this.owner(handle);
    const follows = this.store.all<{ userId: string; target: string }>("follow");
    const state = this.profiles.public(user.id);
    const posts = this.store
      .all<Publication>("post")
      .filter((p) => p.ownerId === user.id)
      .reverse()
      .filter((p) => !this.identity.isMoment(p.id) && this.social.viewFilter(GUEST, p))
      .map((p) => ({
        id: p.id,
        title: p.metadata.title,
        caption: p.metadata.caption,
        format: p.metadata.format,
        hasCover: !!p.metadata.coverAssetId,
        createdAt: p.createdAt,
      }));
    return {
      user: { ...publicUser(user)!, bio: user.bio },
      followers: follows.filter((f) => f.target === user.id).length,
      following: follows.filter((f) => f.userId === user.id).length,
      profile: state.publicationId
        ? { publicationId: state.publicationId, manifest: state.manifest }
        : null,
      posts,
    };
  }
  /** A profile page may run for guests only while it is its owner's current page. */
  profileRecord(publicationId: string) {
    const publication = this.profiles.publication(publicationId);
    if (
      this.community.hidden(publication.ownerId) ||
      this.profiles.state(publication.ownerId).publicationId !== publicationId
    )
      throw new AppError("NOT_FOUND", 404);
    return publication;
  }
  /** The owner's posts a guest may open, newest first. */
  private guestPosts(ownerId: string) {
    return this.store
      .all<Publication>("post")
      .filter((p) => p.ownerId === ownerId)
      .reverse()
      .filter((p) => !this.identity.isMoment(p.id) && this.social.viewFilter(GUEST, p));
  }
  /**
   * Read-only profile capabilities for a guest looking at someone's current page. Anything that
   * writes, or depends on who is looking (votes, follows), asks them to sign in instead.
   */
  profileCapability(publicationId: string, method: string, payload: unknown) {
    const publication = this.profileRecord(publicationId);
    const ownerId = publication.ownerId;
    if (!(publication.package.manifest.capabilities as string[]).includes(method))
      throw new AppError("CAPABILITY_DENIED", 403);
    const posts = this.guestPosts(ownerId);
    const postIdOf = () => {
      const { postId } = z.object({ postId: z.string().uuid() }).strict().parse(payload);
      const post = posts.find((p) => p.id === postId);
      if (!post) throw new AppError("NOT_FOUND", 404);
      return post;
    };
    if (method === "profile.read") {
      const owner = this.social.users().find((u) => u.id === ownerId)!;
      const avatar = owner.avatarAssetId
        ? this.store.get<Asset>("asset", owner.avatarAssetId)
        : undefined;
      return {
        owner: {
          ...owner,
          ...(avatar ? { avatarSrc: `data:${avatar.mime};base64,${avatar.base64}` } : {}),
        },
        posts: posts.map((p) => ({
          id: p.id,
          title: p.metadata.title,
          caption: p.metadata.caption,
          format: p.metadata.format,
          hasCover: Boolean(p.metadata.coverAssetId),
        })),
      };
    }
    if (method === "profile.openPost") return { postId: postIdOf().id };
    if (method === "profile.cover") {
      const post = postIdOf();
      const cover = post.metadata.coverAssetId;
      const asset = cover ? this.store.get<Asset>("asset", cover) : undefined;
      if (!cover || !asset) return null;
      return { src: `data:${asset.mime};base64,${asset.base64}`, alt: post.metadata.title };
    }
    if (method === "profile.social.read") {
      const comments = this.store.all<Note>("comment");
      return {
        writable: false,
        ownProfile: false,
        following: false,
        requested: false,
        followers: this.store.all<{ target: string }>("follow").filter((f) => f.target === ownerId)
          .length,
        posts: posts.map((p) => ({
          id: p.id,
          likes: this.store.ids("like").filter((k) => k.startsWith(`${p.id}:`)).length,
          liked: false,
          saved: false,
          comments: comments.filter((c) => c.postId === p.id).length,
        })),
      };
    }
    if (method === "relay.read")
      return this.store.get<RelayContribution[]>("profile-relay", `owner:${ownerId}`) ?? [];
    if (method === "profile.wall.read") {
      const notes = this.store.get<WallNote[]>("profile-wall", `owner:${ownerId}`) ?? [];
      return {
        notes: notes
          .slice(-60)
          .reverse()
          .map((n) => ({ ...n, removable: false, reportable: false })),
        total: notes.length,
      };
    }
    throw new AppError("SIGN_IN_REQUIRED", 401);
  }
  /** Avatars of hidden people are not served to guests. */
  avatar(userId: string) {
    if (this.community.hidden(userId)) throw new AppError("NOT_FOUND", 404);
    return this.profiles.publicAvatar(userId);
  }
}
