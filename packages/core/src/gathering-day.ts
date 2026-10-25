import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  albumTagInputSchema,
  checkinInputSchema,
  doorCodeInputSchema,
  localTimeSchema,
  photoLikeInputSchema,
  photographerInputSchema,
  wishInputSchema,
  type AlbumChapter,
  type AlbumPhoto,
  type GatheringAlbum,
  type GatheringDoor,
  type GatheringPerson,
  type GatheringWishView,
} from "../../contracts/src/gatherings.js";
import type { Actor } from "./index.js";
import type { Gathering, GatheringsService } from "./gatherings.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

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
/** Without a camera time, a photo is placed by when it arrived, at Indonesian western time. */
const venueZone = "Asia/Jakarta";

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
  constructor(
    private readonly social: SocialService,
    private readonly gatherings: GatheringsService,
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    mkdirSync(dir, { recursive: true });
    gatherings.onDrop.push((id) => this.drop(id));
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
  private venueNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: venueZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(this.now());
    const v = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
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
    const { me } = this.gatherings.memberOf(actor, id);
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
          : this.venueNow(),
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
    // The photographers' pictures first, then the ones people liked most, then in time order.
    const count = (p: AlbumPhoto) => likes.filter((l) => l.photoId === p.id).length;
    for (const c of chapters)
      c.photos.sort(
        (a, b) =>
          Number(b.photographer) - Number(a.photographer) ||
          count(b) - count(a) ||
          a.takenAt.localeCompare(b.takenAt),
      );
    const wishes = this.store
      .all<Wish>("gathering-wish")
      .filter((w) => w.gatheringId === id && see(w.userId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((w) => ({ w, from: this.gatherings.person(w.userId) }))
      .filter((x): x is { w: Wish; from: GatheringPerson } => !!x.from)
      .map(({ w, from }): GatheringWishView => ({ from, text: w.text, at: w.at }));
    return {
      chapters: chapters.filter((c) => c.photos.length),
      wishes,
      photographers,
      count: photos.length,
    };
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
    const { me } = this.gatherings.memberOf(actor, id);
    const { text } = wishInputSchema.parse(input);
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

  private dropPhoto(photoId: string) {
    for (const key of this.store.ids("gathering-photo-like"))
      if (key.startsWith(`${photoId}:`)) this.store.remove("gathering-photo-like", key);
    this.store.remove("gathering-photo", photoId);
    rmSync(this.path(photoId, false), { force: true });
    rmSync(this.path(photoId, true), { force: true });
  }
  private drop(id: string) {
    for (const p of this.store.all<Photo>("gathering-photo"))
      if (p.gatheringId === id) this.dropPhoto(p.id);
    for (const kind of ["gathering-wish", "gathering-checkin"])
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
    for (const kind of ["gathering-photo-like", "gathering-wish", "gathering-checkin"])
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
