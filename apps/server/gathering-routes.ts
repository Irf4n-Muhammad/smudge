import express from "express";
import type { Express, RequestHandler, Response } from "express";
import sharp from "sharp";
import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import { exifTakenAt } from "../../packages/core/src/exif.js";
import type { MomentDayService } from "../../packages/core/src/gathering-day.js";
import type { GatheringsService } from "../../packages/core/src/gatherings.js";
import { AppError, GUEST } from "../../packages/core/src/social.js";

/** A phone photo is a few megabytes; this leaves room for a camera's without taking a RAW. */
const maxPhotoBytes = 20_000_000;

/**
 * A photo for the album, resized for phones and turned upright. Re-encoding drops the file's
 * metadata, so a guest's GPS position never reaches the other guests; only the time is kept.
 */
async function preparePhoto(bytes: Buffer) {
  try {
    const image = sharp(bytes, { limitInputPixels: 60_000_000, animated: false });
    const meta = await image.metadata();
    const full = await image
      .clone()
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const small = await sharp(full.data)
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 74, mozjpeg: true })
      .toBuffer();
    return {
      full: full.data,
      small,
      width: full.info.width,
      height: full.info.height,
      takenAt: meta.exif ? exifTakenAt(meta.exif) : null,
    };
  } catch {
    throw new AppError("INVALID_IMAGE", 400);
  }
}

/**
 * HTTP boundary for moments as gatherings (ADR 0036). The invite and the RSVP are public so a
 * link pasted into WhatsApp works without an account; everything else needs one. Rules live in
 * core; the gathering id always comes from the path.
 */
export function gatheringRoutes(
  api: Express,
  gatherings: GatheringsService,
  day: MomentDayService,
  guestLimit: RequestHandler,
  answerLimit: RequestHandler,
  messageLimit: RequestHandler,
  photoLimit: RequestHandler,
  doorLimit: RequestHandler,
) {
  const actor = (res: Response) => res.locals.actor as Actor;
  const id = (value: unknown) => z.string().uuid().parse(value);
  api.get("/api/gatherings", (_req, res) => res.json(gatherings.mine(actor(res))));
  api.post("/api/gatherings", (req, res) =>
    res.status(201).json(gatherings.create(actor(res), req.body)),
  );
  api.get("/api/gatherings/:id/guests", (req, res) =>
    res.json(gatherings.guests(actor(res), id(req.params.id))),
  );
  api.delete("/api/gatherings/:id", (req, res) =>
    res.json(gatherings.remove(actor(res), id(req.params.id))),
  );
  // The moment group (ADR 0037): members only; everyone else gets NOT_FOUND.
  const group = (value: unknown) =>
    value === undefined || value === "" ? undefined : z.string().uuid().parse(value);
  api.get("/api/gatherings/:id/space", (req, res) =>
    res.json(gatherings.space(actor(res), id(req.params.id))),
  );
  api.post("/api/gatherings/:id/join", (req, res) =>
    res.json(gatherings.join(actor(res), id(req.params.id))),
  );
  api.post("/api/gatherings/:id/mode", (req, res) =>
    res.json(gatherings.setMode(actor(res), id(req.params.id), req.body)),
  );
  api.get("/api/gatherings/:id/messages", (req, res) =>
    res.json(gatherings.messages(actor(res), id(req.params.id), group(req.query.group))),
  );
  api.post("/api/gatherings/:id/messages", messageLimit, (req, res) =>
    res.json(gatherings.send(actor(res), id(req.params.id), req.body)),
  );
  api.post("/api/gatherings/:id/groups", (req, res) =>
    res.json(gatherings.createGroup(actor(res), id(req.params.id), req.body)),
  );
  api.post("/api/gatherings/:id/groups/:group/leave", (req, res) =>
    res.json(gatherings.leaveGroup(actor(res), id(req.params.id), id(req.params.group))),
  );
  // The day itself (ADR 0038): the door QR and the live album.
  api.get("/api/gatherings/:id/door", (req, res) =>
    res.json(day.door(actor(res), id(req.params.id))),
  );
  api.post("/api/public/gatherings/:id/door", doorLimit, (req, res) =>
    res.json(day.exchange(id(req.params.id), req.body)),
  );
  api.post("/api/gatherings/:id/checkin", (req, res) =>
    res.json(day.checkin(actor(res), id(req.params.id), req.body)),
  );
  api.get("/api/gatherings/:id/album", (req, res) =>
    res.json(day.album(actor(res), id(req.params.id))),
  );
  api.post(
    "/api/gatherings/:id/photos",
    photoLimit,
    // Membership first, so a stranger cannot make the server read or decode their files.
    (req, res, next) => {
      gatherings.memberOf(actor(res), id(req.params.id));
      next();
    },
    express.raw({ type: ["image/*"], limit: maxPhotoBytes }),
    async (req, res) => {
      const gatheringId = id(req.params.id);
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AppError("INVALID_IMAGE", 400);
      const photo = await preparePhoto(req.body);
      res.json(
        day.upload(actor(res), gatheringId, {
          ...photo,
          clientTime: req.headers["x-taken-at"],
        }),
      );
    },
  );
  api.get("/api/gatherings/:id/photos/:photo", (req, res) => {
    const file = day.file(
      actor(res),
      id(req.params.id),
      id(req.params.photo),
      req.query.size === "s",
    );
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.type("image/jpeg").sendFile(file, { dotfiles: "allow" });
  });
  api.delete("/api/gatherings/:id/photos/:photo", (req, res) =>
    res.json(day.removePhoto(actor(res), id(req.params.id), id(req.params.photo))),
  );
  api.post("/api/gatherings/:id/photos/:photo/like", (req, res) =>
    res.json(day.like(actor(res), id(req.params.id), id(req.params.photo), req.body)),
  );
  api.post("/api/gatherings/:id/photos/:photo/tags", (req, res) =>
    res.json(day.tag(actor(res), id(req.params.id), id(req.params.photo), req.body)),
  );
  api.post("/api/gatherings/:id/photographers", (req, res) =>
    res.json(day.setPhotographer(actor(res), id(req.params.id), req.body)),
  );
  api.post("/api/gatherings/:id/wish", messageLimit, (req, res) =>
    res.json(day.wish(actor(res), id(req.params.id), req.body)),
  );
  api.get("/api/public/gatherings/:id", guestLimit, (req, res) =>
    res.json(gatherings.invite(id(req.params.id))),
  );
  // A signed-in guest's answer is linked to their account; anyone else answers as the guest.
  api.post("/api/public/gatherings/:id/rsvp", answerLimit, (req, res) => {
    const who = (res.locals.actor as Actor | undefined) ?? { userId: GUEST };
    res.json(gatherings.respond(who, id(req.params.id), req.body));
  });
}
