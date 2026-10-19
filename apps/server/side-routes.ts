import type { Express, Response } from "express";
import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import type { SidesService } from "../../packages/core/src/sides.js";

/** HTTP boundary for sides (ADR 0027). Rules live in core; the side id comes from the path. */
export function sideRoutes(api: Express, sides: SidesService) {
  const actor = (res: Response) => res.locals.actor as Actor;
  const id = (value: unknown) => z.string().max(40).parse(value);
  api.get("/api/sides", (_req, res) => res.json(sides.me(actor(res))));
  api.post("/api/sides/active", (req, res) => res.json(sides.setActive(actor(res), req.body)));
  api.post("/api/sides/layout", (req, res) => res.json(sides.setLayout(actor(res), req.body)));
  api.post("/api/sides/:id/join", (req, res) =>
    res.json(sides.join(actor(res), id(req.params.id))),
  );
  api.post("/api/sides/:id/leave", (req, res) =>
    res.json(sides.leave(actor(res), id(req.params.id))),
  );
  api.post("/api/posts/:id/share", (req, res) =>
    res.json(sides.share(actor(res), id(req.params.id), req.body)),
  );
}
