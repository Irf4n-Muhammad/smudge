import type { Express, Response } from "express";
import { z } from "zod";
import type { Actor } from "../../packages/core/src/index.js";
import type { IdentityService } from "../../packages/core/src/identity.js";

/** HTTP boundary for chapters, moments, decorations and reactions. Rules live in core. */
export function identityRoutes(api: Express, identity: IdentityService) {
  const actor = (res: Response) => res.locals.actor as Actor;
  const id = (value: unknown) => z.string().max(80).parse(value);
  api.get("/api/identity/me", (_req, res) => res.json(identity.me(actor(res))));
  api.get("/api/users/:id/chapters", (req, res) =>
    res.json(identity.chaptersFor(actor(res), id(req.params.id))),
  );
  api.post("/api/chapters/:id/audience", (req, res) =>
    res.json(identity.setChapterAudience(actor(res), id(req.params.id), req.body)),
  );
  api.delete("/api/chapters/:id", (req, res) =>
    res.json(identity.removeChapter(actor(res), id(req.params.id))),
  );
  api.post("/api/identity/email/start", (req, res) =>
    res.json(identity.startEmail(actor(res), req.body)),
  );
  api.post("/api/identity/email/confirm", (req, res) =>
    res.json(identity.confirmEmail(actor(res), req.body)),
  );
  api.get("/api/identity/invites", (_req, res) => res.json(identity.invites(actor(res))));
  api.post("/api/identity/invites", (req, res) =>
    res.json(identity.createInvite(actor(res), req.body)),
  );
  api.post("/api/identity/invites/redeem", (req, res) =>
    res.json(identity.redeemInvite(actor(res), req.body)),
  );
  api.post("/api/identity/partner", (req, res) =>
    res.json(identity.requestPartner(actor(res), req.body)),
  );
  api.post("/api/identity/partner/:id/respond", (req, res) =>
    res.json(
      identity.respondPartner(
        actor(res),
        id(req.params.id),
        z.object({ accept: z.boolean() }).strict().parse(req.body).accept,
      ),
    ),
  );
  api.post("/api/identity/travel", (req, res) =>
    res.json(identity.travelProof(actor(res), req.body)),
  );
  api.post("/api/identity/birthday", (req, res) =>
    res.json(identity.setBirthday(actor(res), req.body)),
  );
  api.post("/api/identity/country", (req, res) =>
    res.json(identity.setCountry(actor(res), req.body)),
  );
  api.get("/api/users/:id/theme", (req, res) =>
    res.json({ theme: identity.themeFor(actor(res), id(req.params.id)) }),
  );
  api.get("/api/decorations", (_req, res) => res.json(identity.decorations(actor(res))));
  api.post("/api/decorations/choose", (req, res) =>
    res.json(identity.chooseDecoration(actor(res), req.body)),
  );
  api.post("/api/decorations/edit", (req, res) =>
    res.json(identity.editDecoration(actor(res), req.body)),
  );
  api.delete("/api/decorations/edit/:id", (req, res) =>
    res.json(identity.resetDecorationEdit(actor(res), id(req.params.id))),
  );
  api.get("/api/creator/earnings", (_req, res) => res.json(identity.earnings(actor(res))));
  api.get("/api/moments/templates", (_req, res) => res.json(identity.templates(actor(res))));
  api.post("/api/moments", (req, res) => res.json(identity.createMoment(actor(res), req.body)));
  api.get("/api/posts/:id/reactions", (req, res) =>
    res.json(identity.reactions(actor(res), id(req.params.id))),
  );
  api.post("/api/posts/:id/reactions", (req, res) =>
    res.json(identity.react(actor(res), id(req.params.id), req.body)),
  );
}
