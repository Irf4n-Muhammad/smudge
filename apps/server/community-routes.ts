import type { Express, RequestHandler, Response } from "express";
import type { Actor } from "../../packages/core/src/index.js";
import type { CommunityService } from "../../packages/core/src/community.js";
import type { MessageService } from "../../packages/core/src/messages.js";
import type { AccountService } from "../../packages/core/src/accounts.js";

/** HTTP for blocks, notifications, people, messages, moderation and account deletion. */
export function communityRoutes(
  api: Express,
  community: CommunityService,
  messages: MessageService,
  accounts: AccountService,
  onDeleted: (res: Response) => void,
  authLimit: RequestHandler,
) {
  const actor = (res: Response) => res.locals.actor as Actor;
  const param = (value: unknown) => String(value);

  api.post("/api/users/:id/block", (req, res) =>
    res.json(community.block(actor(res), param(req.params.id))),
  );
  api.get("/api/blocks", (_req, res) => res.json(community.blocked(actor(res))));

  api.get("/api/notifications", (_req, res) => res.json(community.notifications(actor(res))));
  api.post("/api/notifications/read", (_req, res) => res.json(community.markRead(actor(res))));
  /** One cheap call for both badges, polled by the web app. */
  api.get("/api/badges", (_req, res) =>
    res.json({
      notifications: community.unread(actor(res)).count,
      messages: messages.unread(actor(res)).count,
    }),
  );

  api.get("/api/people", (req, res) => res.json(community.search(actor(res), req.query.q)));
  api.get("/api/people/suggested", (_req, res) => res.json(community.suggestions(actor(res))));

  api.get("/api/messages", (_req, res) => res.json(messages.conversations(actor(res))));
  api.get("/api/messages/:userId", (req, res) =>
    res.json(messages.thread(actor(res), param(req.params.userId))),
  );
  api.post("/api/messages/:userId", (req, res) =>
    res.json(messages.send(actor(res), param(req.params.userId), req.body)),
  );

  api.get("/api/moderation/reports", (_req, res) => res.json(community.reports(actor(res))));
  api.post("/api/moderation/actions", (req, res) =>
    res.json(community.moderate(actor(res), req.body)),
  );
  api.post("/api/moderation/users/:id/suspend", (req, res) =>
    res.json(community.suspend(actor(res), param(req.params.id), req.body)),
  );

  api.post("/api/account/delete", authLimit, (req, res) => {
    const result = accounts.deleteAccount(actor(res), req.body);
    onDeleted(res);
    res.json(result);
  });
}
