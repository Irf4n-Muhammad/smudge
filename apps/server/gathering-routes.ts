import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import type { GatheringsService } from "../../packages/core/src/gatherings.js";
import { GUEST } from "../../packages/core/src/social.js";

/**
 * HTTP boundary for moments as gatherings (ADR 0036). The invite and the RSVP are public so a
 * link pasted into WhatsApp works without an account; everything else needs one. Rules live in
 * core; the gathering id always comes from the path.
 */
export function gatheringRoutes(
  api: Express,
  gatherings: GatheringsService,
  guestLimit: RequestHandler,
  answerLimit: RequestHandler,
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
  api.get("/api/public/gatherings/:id", guestLimit, (req, res) =>
    res.json(gatherings.invite(id(req.params.id))),
  );
  // A signed-in guest's answer is linked to their account; anyone else answers as the guest.
  api.post("/api/public/gatherings/:id/rsvp", answerLimit, (req, res) => {
    const who = (res.locals.actor as Actor | undefined) ?? { userId: GUEST };
    res.json(gatherings.respond(who, id(req.params.id), req.body));
  });
}
