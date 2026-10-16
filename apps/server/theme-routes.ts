import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import type { ThemeStudio } from "../../packages/core/src/themes.js";

/** HTTP boundary for the open theme market (ADR 0024). Rules and review live in core. */
export function themeRoutes(api: Express, studio: ThemeStudio, submitLimit: RequestHandler) {
  const actor = (res: Response) => res.locals.actor as Actor;
  const id = (value: unknown) => z.string().max(40).parse(value);
  api.get("/api/themes/submissions", (_req, res) => res.json(studio.mine(actor(res))));
  api.post("/api/themes/submissions", submitLimit, (req, res) =>
    res.json(studio.submit(actor(res), req.body)),
  );
  api.delete("/api/themes/submissions/:id", (req, res) =>
    res.json(studio.withdraw(actor(res), id(req.params.id))),
  );
  api.get("/api/moderation/themes", (_req, res) => res.json(studio.queue(actor(res))));
  api.post("/api/moderation/themes/:id", (req, res) =>
    res.json(studio.review(actor(res), id(req.params.id), req.body)),
  );
}
