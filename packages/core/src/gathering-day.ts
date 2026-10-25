import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  albumTagInputSchema,
  cardInputSchema,
  checkinInputSchema,
  closingInputSchema,
  coverInputSchema,
  photoMoveInputSchema,
  doorCodeInputSchema,
  localTimeSchema,
  photoLikeInputSchema,
  photographerInputSchema,
  shareInputSchema,
  wishInputSchema,
  type AlbumChapter,
  type AlbumPhoto,
  type GatheringAlbum,
  type GatheringDoor,
  type GatheringPerson,
  type GatheringWishView,
  type MemoryCard,
} from "../../contracts/src/gatherings.js";
import { buildPost, startPostDesign } from "./easy-post.js";
import type { Actor } from "./index.js";
import { locksAfter, venueTime } from "./gatherings.js";
import type { Gathering, GatheringsService } from "./gatherings.js";
import { AppError } from "./social.js";
import type { Asset, SocialService } from "./social.js";

interface DoorKey {
  gatheringId: string;
  secret: string;
}
interface Checkin {
  gatheringId: string;
  userId: string;
  at: string;
}
interface Photo {
  id: string;
  gatheringId: string;
  ownerId: string;
  /** Local time at the venue, "YYYY-MM-DDTHH:MM". */
  takenAt: string;
  at: string;
  width: number;
  height: number;
  tags: string[];
}
interface PhotoLike {
  photoId: string;
  gatheringId: string;
  userId: string;
}
interface Wish {
  gatheringId: string;
  userId: string;
  text: string;
  at: string;
}

/** The door code changes this often; a scan stays good for the current code and the two before. */
const doorStepMs = 30_000;
const doorSteps = 3;
/** Long enough to make an account at the door, short enough that a pass does not outlive the day. */
const passMs = 12 * 60 * 60_000;
/** Ceilings against abuse and disk, not product rules: a big wedding and a keen guest fit. */
const maxPhotos = 5000;
const maxPhotosEach = 300;
const maxTags = 50;

const sign = (secret: string, text: string, length: number) =>
  createHmac("sha256", secret).update(text).digest("base64url").slice(0, length);
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The day of a moment (ADR 0038): the door QR that records who came, and the live album. Photos
 * arrive already resized and stripped of their metadata by the server; their bytes live in files
 * beside the database, like videos, and only members of the moment can open them.
 */
export class MomentDayService {
  /** Installed by the server: whether `viewerId` may see `userId`'s memory cards (privacy). */
  cardFilter: (viewerId: string, userId: string) => boolean = () => true;
  constructor(
    private readonly social: SocialService,
    private readonly gatherings: GatheringsService,
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    mkdirSync(dir, { recursive: true });
    gatherings.onDrop.push((id) => this.drop(id));
    // A post may say which moment it came from only when its author is in that moment.
    const guard = social.publishGuard;
    social.publishGuard = (actorId, draft) => {
      guard(actorId, draft);
      const from = draft.metadata.gathering;
      if (!from) return;
      const gathering = this.store.get<Gathering>("gathering", from.id);
      if (
        !gathering ||
        !this.gatherings.isMember(gathering, actorId) ||
        gathering.title.slice(0, 80) !== from.title
      )
        throw new AppError("NOT_A_MEMBER", 400);
    };
  }
  private get store() {
    return this.social.store;
  }
  private asHost(actor: Actor, id: string) {
    const found = this.gatherings.memberOf(actor, id);
    if (found.gathering.ownerId !== found.me) throw new AppError("NOT_HOST", 403);
    return found;
  }

  // The door ---------------------------------------------------------------------------------
  /** The host's door screen. The secret is made the first time the host opens it. */
  door(actor: Actor, id: string): GatheringDoor {
    const { gathering } = this.asHost(actor, id);
    let key = this.store.get<DoorKey>("gathering-door", id);
    if (!key) {
      key = { gatheringId: id, secret: randomBytes(32).toString("hex") };
      const made = key;
      this.store.transaction(() => this.store.put("gathering-door", id, made));
    }
    const t = this.now().getTime();
    const step = Math.floor(t / doorStepMs);
    const code = sign(key.secret, `door:${id}:${step}`, 8);
    return {
      code,
      path: `/m/${id}?pintu=${code}`,
      rotatesInMs: (step + 1) * doorStepMs - t,
      arrived: this.gatherings.arrived(gathering).length,
    };
  }
  /**
   * Anyone who scanned the door QR, signed in or not, trades the code for a pass. The pass lets
   * them sign in or make an account first and still be recorded as having come.
   */
  exchange(id: string, input: unknown) {
    this.gatherings.find(id);
    const { code } = doorCodeInputSchema.parse(input);
    const key = this.store.get<DoorKey>("gathering-door", id);
    const step = Math.floor(this.now().getTime() / doorStepMs);
    const fresh =
      !!key &&
      Array.from({ length: doorSteps }, (_, i) =>
        sign(key.secret, `door:${id}:${step - i}`, 8),
      ).some((c) => same(c, code));
    if (!key || !fresh) throw new AppError("DOOR_CODE_EXPIRED", 400);
    const issued = this.now().getTime();
    return { pass: `${issued}.${sign(key.secret, `pass:${id}:${issued}`, 22)}` };
  }
  /** A signed-in guest with a pass is recorded as having come, and joins the moment. */
  checkin(actor: Actor, id: string, input: unknown) {
    const me = this.social.actor(actor);
    const gathering = this.gatherings.find(id);
    const { pass } = checkinInputSchema.parse(input);
    const key = this.store.get<DoorKey>("gathering-door", id);
    const [issuedText = "", signature = ""] = pass.split(".");
    const issued = Number(issuedText);
    const age = this.now().getTime() - issued;
    if (
      !key ||
      !/^\d+$/.test(issuedText) ||
      age < -doorStepMs ||
      age > passMs ||
      !same(signature, sign(key.secret, `pass:${id}:${issued}`, 22))
    )
      throw new AppError("DOOR_PASS_EXPIRED", 400);
    this.store.transaction(() => {
      this.gatherings.addMember(gathering, me);
      const k = `${id}:${me}`;
      if (!this.store.get("gathering-checkin", k))
        this.store.put("gathering-checkin", k, {
          gatheringId: id,
          userId: me,
          at: this.now().toISOString(),
        } satisfies Checkin);
    });
    return this.gatherings.space(actor, id);
  }

  // The album --------------------------------------------------------------------------------
  path(photoId: string, small: boolean) {
    return join(this.dir, `${z.string().uuid().parse(photoId)}${small ? "-s" : ""}.jpg`);
  }
  private photo(gathering: Gathering, me: string, photoId: string) {
    const photo = this.store.get<Photo>("gathering-photo", photoId);
    if (
      !photo ||
      photo.gatheringId !== gathering.id ||
      !this.gatherings.peopleFilter(me, photo.ownerId)
    )
      throw new AppError("NOT_FOUND", 404);
    return photo;
  }
  /** After the album locks, nothing is added; likes and taking your own photo down still work. */
  private assertOpen(gathering: Gathering) {
    if (this.gatherings.phase(gathering) === "closed") throw new AppError("ALBUM_LOCKED", 409);
  }
  /**
   * A member adds a photo. Its place in the album comes from the camera's time, else the time
   * the phone gives for the file, else when it arrived.
   */
  upload(
    actor: Actor,
    id: string,
    input: {
      full: Buffer;
      small: Buffer;
      width: number;
      height: number;
      takenAt?: string | null;
      clientTime?: unknown;
    },
  ) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    this.assertOpen(gathering);
    const photos = this.store.all<Photo>("gathering-photo").filter((p) => p.gatheringId === id);
    if (photos.length >= maxPhotos) throw new AppError("ALBUM_FULL", 409);
    if (photos.filter((p) => p.ownerId === me).length >= maxPhotosEach)
      throw new AppError("TOO_MANY_PHOTOS", 429);
    const fromCamera = localTimeSchema.safeParse(input.takenAt);
    const fromPhone = localTimeSchema.safeParse(input.clientTime);
    const photo: Photo = {
      id: randomUUID(),
      gatheringId: id,
      ownerId: me,
      takenAt: fromCamera.success
        ? fromCamera.data
        : fromPhone.success
          ? fromPhone.data
          : venueTime(this.now()),
      at: this.now().toISOString(),
      width: input.width,
      height: input.height,
      tags: [],
    };
    writeFileSync(this.path(photo.id, false), input.full);
    writeFileSync(this.path(photo.id, true), input.small);
    this.store.transaction(() => this.store.put("gathering-photo", photo.id, photo));
    return { id: photo.id };
  }
  /** The file behind a photo, for members of its moment only. */
  file(actor: Actor, id: string, photoId: string, small: boolean) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    return this.path(this.photo(gathering, me, photoId).id, small);
  }
  album(actor: Actor, id: string): GatheringAlbum {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    const see = (userId: string) => this.gatherings.peopleFilter(me, userId);
    const photographers = (gathering.photographers ?? []).filter(see);
    const mates = new Set(
      this.store
        .all<{ gatheringId: string; members: string[] }>("gathering-group")
        .filter((g) => g.gatheringId === id && g.members.includes(me))
        .flatMap((g) => g.members),
    );
    const likes = this.store
      .all<PhotoLike>("gathering-photo-like")
      .filter((l) => l.gatheringId === id && see(l.userId));
    const rundown = [...gathering.rundown].sort((a, b) => a.time.localeCompare(b.time));
    const chapters: AlbumChapter[] = [
      { kind: "before", title: "", photos: [] },
      ...(rundown.length
        ? rundown.map((r) => ({ kind: "day" as const, title: r.title, time: r.time, photos: [] }))
        : [{ kind: "day" as const, title: "", photos: [] }]),
      { kind: "after", title: "", photos: [] },
    ];
    const chapterOf = (takenAt: string) => {
      const day = takenAt.slice(0, 10);
      if (day < gathering.date) return 0;
      if (day > gathering.date) return chapters.length - 1;
      const time = takenAt.slice(11);
      let at = 0;
      rundown.forEach((r, i) => {
        if (r.time <= time) at = i;
      });
      return 1 + at;
    };
    const photos = this.store
      .all<Photo>("gathering-photo")
      .filter((p) => p.gatheringId === id && see(p.ownerId));
    for (const p of photos) {
      const by = this.gatherings.person(p.ownerId);
      if (!by) continue;
      const liked = likes.filter((l) => l.photoId === p.id);
      const tagged = p.tags.filter(see);
      const view: AlbumPhoto = {
        id: p.id,
        by,
        takenAt: p.takenAt,
        width: p.width,
        height: p.height,
        photographer: photographers.includes(p.ownerId),
        tagged,
        liked: liked.some((l) => l.userId === me),
        ...(p.ownerId === me ? { likes: liked.length } : {}),
        forYou:
          p.ownerId === me || tagged.includes(me) || (mates.has(p.ownerId) && p.ownerId !== me),
        mine: p.ownerId === me,
      };
      chapters[chapterOf(p.takenAt)]!.photos.push(view);
    }
    for (const c of chapters) this.sortChapter(gathering, c.photos, likes);
    const wishes = this.store
      .all<Wish>("gathering-wish")
      .filter((w) => w.gatheringId === id && see(w.userId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((w) => ({ w, from: this.gatherings.person(w.userId) }))
      .filter((x): x is { w: Wish; from: GatheringPerson } => !!x.from)
      .map(({ w, from }): GatheringWishView => ({ from, text: w.text, at: w.at }));
    const came = this.came(gathering, me);
    return {
      chapters: chapters.filter((c) => c.photos.length),
      wishes,
      photographers,
      count: photos.length,
      phase: this.gatherings.phase(gathering),
      locksAfter: locksAfter(gathering.date),
      thanks: gathering.thanks ?? "",
      ...(gathering.coverPhotoId ? { coverId: gathering.coverPhotoId } : {}),
      ...(came
        ? { card: this.store.get("gathering-card-hidden", `${id}:${me}`) ? "hidden" : "shown" }
        : {}),
    };
  }
  /**
   * The photos the host moved come first, in the host's order. The rest follow: the
   * photographers' pictures, then the ones people liked most, then in time order.
   */
  private sortChapter(gathering: Gathering, photos: AlbumPhoto[], likes: PhotoLike[]) {
    const order = gathering.albumOrder ?? [];
    const placed = (p: AlbumPhoto) => {
      const at = order.indexOf(p.id);
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    const count = (p: AlbumPhoto) => likes.filter((l) => l.photoId === p.id).length;
    photos.sort(
      (a, b) =>
        placed(a) - placed(b) ||
        Number(b.photographer) - Number(a.photographer) ||
        count(b) - count(a) ||
        a.takenAt.localeCompare(b.takenAt),
    );
  }
  /** The host and everyone who came in through the door get a memory card. */
  private came(gathering: Gathering, userId: string) {
    return (
      gathering.ownerId === userId ||
      !!this.store.get("gathering-checkin", `${gathering.id}:${userId}`)
    );
  }
  like(actor: Actor, id: string, photoId: string, input: unknown) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    const photo = this.photo(gathering, me, photoId);
    const { on } = photoLikeInputSchema.parse(input);
    const key = `${photo.id}:${me}`;
    this.store.transaction(() => {
      if (on)
        this.store.put("gathering-photo-like", key, {
          photoId: photo.id,
          gatheringId: id,
          userId: me,
        } satisfies PhotoLike);
      else this.store.remove("gathering-photo-like", key);
    });
    return this.album(actor, id);
  }
  /** Whoever posted a photo tags anyone in the moment; anyone tags or untags themselves. */
  tag(actor: Actor, id: string, photoId: string, input: unknown) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    const photo = this.photo(gathering, me, photoId);
    const { userId, on } = albumTagInputSchema.parse(input);
    this.assertOpen(gathering);
    if (userId !== me && photo.ownerId !== me) throw new AppError("NOT_YOURS", 403);
    if (on && !this.gatherings.isMember(gathering, userId)) throw new AppError("NOT_A_MEMBER", 400);
    const tags = on
      ? [...new Set([...photo.tags, userId])]
      : photo.tags.filter((t) => t !== userId);
    if (tags.length > maxTags) throw new AppError("TOO_MANY_TAGS", 400);
    this.store.transaction(() => this.store.put("gathering-photo", photo.id, { ...photo, tags }));
    return this.album(actor, id);
  }
  /** The person who posted a photo, or the host, takes it down. */
  removePhoto(actor: Actor, id: string, photoId: string) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    const photo = this.photo(gathering, me, photoId);
    if (photo.ownerId !== me && gathering.ownerId !== me) throw new AppError("NOT_YOURS", 403);
    this.store.transaction(() => this.dropPhoto(photo.id));
    return this.album(actor, id);
  }
  setPhotographer(actor: Actor, id: string, input: unknown) {
    const { gathering } = this.asHost(actor, id);
    const { userId, on } = photographerInputSchema.parse(input);
    if (on && !this.gatherings.isMember(gathering, userId)) throw new AppError("NOT_A_MEMBER", 400);
    const current = gathering.photographers ?? [];
    const photographers = on
      ? [...new Set([...current, userId])]
      : current.filter((p) => p !== userId);
    this.store.transaction(() =>
      this.store.put("gathering", id, { ...gathering, photographers } satisfies Gathering),
    );
    return this.album(actor, id);
  }
  /** One wish per member; writing again replaces it. */
  wish(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    const { text } = wishInputSchema.parse(input);
    this.assertOpen(gathering);
    this.store.transaction(() =>
      this.store.put("gathering-wish", `${id}:${me}`, {
        gatheringId: id,
        userId: me,
        text,
        at: this.now().toISOString(),
      } satisfies Wish),
    );
    return this.album(actor, id);
  }

  // Out of the album (ADR 0040) -------------------------------------------------------------
  /**
   * Photos picked from the album become a draft gallery post of your own, which you edit and
   * publish like any other: then it is on your profile and in your followers' feeds, under the
   * usual audience rules. You may pick photos you took and photos you are tagged in; someone
   * else's photo is credited to them in its caption. The photos are copied, so taking one down
   * from the album later does not break the post.
   */
  share(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    const { photoIds } = shareInputSchema.parse(input);
    const photos = [...new Set(photoIds)].map((photoId) => this.photo(gathering, me, photoId));
    if (photos.some((p) => p.ownerId !== me && !p.tags.includes(me)))
      throw new AppError("NOT_YOURS", 403);
    const copies = photos.map((p) => {
      const asset: Asset = {
        id: randomUUID(),
        ownerId: me,
        mime: "image/jpeg",
        name: `${gathering.title.slice(0, 100)}.jpg`,
        base64: readFileSync(this.path(p.id, false)).toString("base64"),
      };
      const credit = p.ownerId === me ? "" : this.gatherings.person(p.ownerId)?.name;
      return { asset, caption: credit ? `Foto: ${credit}`.slice(0, 120) : "" };
    });
    this.store.transaction(() => {
      for (const { asset } of copies) this.store.put("asset", asset.id, asset);
    });
    const title = gathering.title.slice(0, 80);
    const built = buildPost(
      startPostDesign("gallery", {
        kicker: "",
        headline: gathering.title.slice(0, 90),
        text: "",
        quote: "",
        photos: copies.map((c) => ({ assetId: c.asset.id, caption: c.caption })),
      }),
    );
    const draft = this.social.createDraft(actor, {
      package: built.package,
      metadata: { ...built.metadata, caption: "", contributors: [], gathering: { id, title } },
    });
    return { draftId: draft.id };
  }

  // Closing the moment (ADR 0039) -----------------------------------------------------------
  /** The host writes the thank-you, and may lock the album before it locks on its own. */
  close(actor: Actor, id: string, input: unknown) {
    const { gathering } = this.asHost(actor, id);
    const { thanks, lock } = closingInputSchema.parse(input);
    this.store.transaction(() =>
      this.store.put("gathering", id, {
        ...gathering,
        ...(thanks !== undefined ? { thanks } : {}),
        ...(lock && !gathering.lockedAt ? { lockedAt: this.now().toISOString() } : {}),
      } satisfies Gathering),
    );
    return this.album(actor, id);
  }
  setCover(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.asHost(actor, id);
    const { photoId } = coverInputSchema.parse(input);
    if (photoId) this.photo(gathering, me, photoId);
    const { coverPhotoId: _old, ...rest } = gathering;
    this.store.transaction(() =>
      this.store.put("gathering", id, {
        ...rest,
        ...(photoId ? { coverPhotoId: photoId } : {}),
      } satisfies Gathering),
    );
    return this.album(actor, id);
  }
  /** The host moves a photo one place up or down within its chapter, even after the lock. */
  move(actor: Actor, id: string, photoId: string, input: unknown) {
    const { me, gathering } = this.asHost(actor, id);
    this.photo(gathering, me, photoId);
    const { direction } = photoMoveInputSchema.parse(input);
    const chapter = this.album(actor, id).chapters.find((c) =>
      c.photos.some((p) => p.id === photoId),
    )!;
    const ids = chapter.photos.map((p) => p.id);
    const at = ids.indexOf(photoId);
    const to = direction === "up" ? at - 1 : at + 1;
    if (to < 0 || to >= ids.length) return this.album(actor, id);
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    // This chapter's photos take their new places; other chapters keep theirs.
    const albumOrder = [...ids, ...(gathering.albumOrder ?? []).filter((p) => !ids.includes(p))];
    this.store.transaction(() =>
      this.store.put("gathering", id, { ...gathering, albumOrder } satisfies Gathering),
    );
    return this.album(actor, id);
  }
  /** The cover anyone may see: the host chose it for the memory cards and the closed page. */
  coverFile(id: string) {
    const gathering = this.gatherings.find(id);
    const photo = gathering.coverPhotoId
      ? this.store.get<Photo>("gathering-photo", gathering.coverPhotoId)
      : undefined;
    if (!photo || photo.gatheringId !== id) throw new AppError("NOT_FOUND", 404);
    return this.path(photo.id, true);
  }
  /** Someone who came shows the memory card on their profile, or hides it. */
  setCard(actor: Actor, id: string, input: unknown) {
    const { me, gathering } = this.gatherings.memberOf(actor, id);
    if (!this.came(gathering, me)) throw new AppError("NOT_FOUND", 404);
    const { shown } = cardInputSchema.parse(input);
    const key = `${id}:${me}`;
    this.store.transaction(() => {
      if (shown) this.store.remove("gathering-card-hidden", key);
      else this.store.put("gathering-card-hidden", key, { gatheringId: id, userId: me });
    });
    return this.album(actor, id);
  }
  /**
   * The moments someone came to, once each is closed, newest first: the attendance timeline on
   * a profile. Hidden cards and moments the viewer may not see that person's cards for are left out.
   */
  cards(actor: Actor, userId: string): MemoryCard[] {
    const me = this.social.actor(actor);
    if (!this.gatherings.peopleFilter(me, userId) || !this.cardFilter(me, userId)) return [];
    return this.store
      .all<Gathering>("gathering")
      .filter(
        (g) =>
          this.came(g, userId) &&
          this.gatherings.phase(g) === "closed" &&
          !this.store.get("gathering-card-hidden", `${g.id}:${userId}`),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((g) => ({
        gatheringId: g.id,
        kind: g.kind,
        title: g.title,
        date: g.date,
        place: g.place,
        cover: !!g.coverPhotoId,
        people: this.gatherings.arrived(g).length,
        host: g.ownerId === userId,
      }));
  }

  private dropPhoto(photoId: string) {
    const photo = this.store.get<Photo>("gathering-photo", photoId);
    const gathering = photo && this.store.get<Gathering>("gathering", photo.gatheringId);
    if (
      gathering &&
      (gathering.coverPhotoId === photoId || gathering.albumOrder?.includes(photoId))
    ) {
      const { coverPhotoId, ...rest } = gathering;
      this.store.put("gathering", gathering.id, {
        ...rest,
        ...(coverPhotoId && coverPhotoId !== photoId ? { coverPhotoId } : {}),
        ...(gathering.albumOrder
          ? { albumOrder: gathering.albumOrder.filter((p) => p !== photoId) }
          : {}),
      } satisfies Gathering);
    }
    for (const key of this.store.ids("gathering-photo-like"))
      if (key.startsWith(`${photoId}:`)) this.store.remove("gathering-photo-like", key);
    this.store.remove("gathering-photo", photoId);
    rmSync(this.path(photoId, false), { force: true });
    rmSync(this.path(photoId, true), { force: true });
  }
  private drop(id: string) {
    for (const p of this.store.all<Photo>("gathering-photo"))
      if (p.gatheringId === id) this.dropPhoto(p.id);
    for (const kind of ["gathering-wish", "gathering-checkin", "gathering-card-hidden"])
      for (const key of this.store.ids(kind))
        if (key.startsWith(`${id}:`)) this.store.remove(kind, key);
    this.store.remove("gathering-door", id);
  }
  /** Called inside the account-deletion transaction: their photos, likes, tags and wishes go. */
  erase(userId: string) {
    for (const p of this.store.all<Photo>("gathering-photo")) {
      if (p.ownerId === userId) this.dropPhoto(p.id);
      else if (p.tags.includes(userId))
        this.store.put("gathering-photo", p.id, { ...p, tags: p.tags.filter((t) => t !== userId) });
    }
    for (const kind of [
      "gathering-photo-like",
      "gathering-wish",
      "gathering-checkin",
      "gathering-card-hidden",
    ])
      for (const key of this.store.ids(kind))
        if (key.endsWith(`:${userId}`)) this.store.remove(kind, key);
    for (const g of this.store.all<Gathering>("gathering"))
      if (g.photographers?.includes(userId))
        this.store.put("gathering", g.id, {
          ...g,
          photographers: g.photographers.filter((p) => p !== userId),
        });
  }
}
