import type { Express, Response } from "express";
import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import type { SidesService } from "../../packages/core/src/sides.js";
import type { ShareCardService } from "../../packages/core/src/share-card.js";
import { sideById } from "../../packages/contracts/src/sides.js";
import { renderShareCard } from "./share-card.js";

/** HTTP boundary for sides (ADR 0027). Rules live in core; the side id comes from the path. */
export function sideRoutes(
  api: Express,
  sides: SidesService,
  cards: ShareCardService,
  origin: string,
) {
  const actor = (res: Response) => res.locals.actor as Actor;
  const id = (value: unknown) => z.string().max(40).parse(value);
  api.get("/api/sides", (_req, res) => res.json(sides.me(actor(res))));
  // A side's home (ADR 0033): members, plans and posts; private sides answer only to members.
  api.get("/api/sides/:id/home", (req, res) => res.json(sides.home(actor(res), id(req.params.id))));
  // Your own share card (ADR 0030), as a picture; `side` picks which of your sides it is for.
  api.get("/api/me/card", (req, res) => {
    const card = cards.card(actor(res), req.query);
    res.setHeader("Cache-Control", "no-store");
    res.type("image/svg+xml").send(renderShareCard(card, origin));
  });
  api.get("/api/me/card/data", (req, res) => {
    const { avatar: _avatar, ...card } = cards.card(actor(res), req.query);
    res.json(card);
  });
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
