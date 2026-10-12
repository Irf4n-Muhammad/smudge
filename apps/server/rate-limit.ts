import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../packages/core/src/social.js";

/**
 * Client address for throttling. In production the edge proxy (scripts/edge.mjs) overwrites
 * x-forma-client-ip on every request, so a client cannot choose its own bucket.
 */
export function clientIp(req: Request) {
  const forwarded = req.headers["x-forma-client-ip"];
  return (typeof forwarded === "string" && forwarded) || req.socket.remoteAddress || "unknown";
}

/** Fixed-window limiter in memory. Fine for the single-process server this app runs as. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; start: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 10_000)
      for (const [key, hit] of hits) if (now - hit.start > windowMs) hits.delete(key);
    const key = clientIp(req);
    const hit = hits.get(key);
    if (!hit || now - hit.start > windowMs) hits.set(key, { count: 1, start: now });
    else if (++hit.count > max) {
      const retryAfterSeconds = Math.ceil((hit.start + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return next(new AppError("TOO_MANY_REQUESTS", 429, { retryAfterSeconds }));
    }
    next();
  };
}
