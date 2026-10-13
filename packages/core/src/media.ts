import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Actor } from "./index.js";
import { AppError } from "./social.js";
import type { Asset, SocialService } from "./social.js";

export const videoMimes = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const maxVideoBytes = 30_000_000;

/** True for the start of an MP4/MOV (`ftyp` box) or WebM (EBML header) file. */
export function looksLikeVideo(mime: string, bytes: Buffer) {
  if (mime === "video/webm")
    return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp";
}

/**
 * Videos are assets like photos (same ownership and visibility rules), but their bytes live in
 * files beside the database. The record store rewrites its whole file on every change, so
 * keeping tens of megabytes in it would make every like slow.
 */
export class MediaService {
  constructor(
    private readonly social: SocialService,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }
  path(id: string) {
    return join(this.dir, z.string().uuid().parse(id));
  }
  isVideo(asset: Pick<Asset, "mime">) {
    return asset.mime.startsWith("video/");
  }
  uploadVideo(actor: Actor, input: { name: unknown; mime: unknown; bytes: Buffer }) {
    this.social.actor(actor);
    const name = z.string().trim().min(1).max(120).catch("video").parse(input.name);
    const mime = z.enum(videoMimes).parse(input.mime);
    if (input.bytes.length > maxVideoBytes) throw new AppError("VIDEO_TOO_LARGE", 413);
    if (!looksLikeVideo(mime, input.bytes)) throw new AppError("INVALID_VIDEO");
    const asset: Asset = { id: randomUUID(), ownerId: actor.userId, mime, name, base64: "" };
    writeFileSync(this.path(asset.id), input.bytes);
    this.social.store.transaction(() =>
      this.social.store.put("asset", asset.id, { ...asset, bytes: input.bytes.length }),
    );
    return { id: asset.id, name, mime };
  }
  /** A private copy for someone reusing a post's format, as photos get. */
  copyVideo(actor: Actor, asset: Asset) {
    const copy: Asset = { ...asset, id: randomUUID(), ownerId: actor.userId };
    copyFileSync(this.path(asset.id), this.path(copy.id));
    this.social.store.transaction(() => this.social.store.put("asset", copy.id, copy));
    return copy.id;
  }
}
