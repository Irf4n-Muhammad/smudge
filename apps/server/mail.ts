import { appendFileSync } from "node:fs";
import type { Store } from "../../packages/core/src/database.js";
import { pendingMail, settleMail } from "../../packages/core/src/mail.js";
import type { OutboxMessage } from "../../packages/core/src/mail.js";
import type { Config } from "./config.js";

export type Deliver = (message: OutboxMessage) => Promise<"sent" | "retry" | "failed">;

/** Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email); no SDK needed. */
export function resend(apiKey: string, from: string, fetcher: typeof fetch = fetch): Deliver {
  return async (message) => {
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Lets Resend drop a duplicate if a crash happens between sending and recording it.
          "Idempotency-Key": message.id,
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return "sent";
      // 4xx other than rate limiting will not succeed on retry (bad address, unverified domain).
      return response.status === 429 || response.status >= 500 ? "retry" : "failed";
    } catch {
      return "retry";
    }
  };
}

/** For staging and tests: one JSON line per message in a file only the server can read. */
export function toFile(path: string): Deliver {
  return async (message) => {
    appendFileSync(
      path,
      JSON.stringify({ to: message.to, subject: message.subject, body: message.body }) + "\n",
      { mode: 0o600 },
    );
    return "sent";
  };
}

export function deliveryFor(config: Config, filePath: string): Deliver | null {
  if (config.mail.provider === "resend") return resend(config.mail.apiKey, config.mail.from);
  if (config.mail.provider === "file") return toFile(filePath);
  return null;
}

/** Drains the outbox. Runs one pass at a time; logs counts, never addresses or contents. */
export function startMailWorker(store: Store, deliver: Deliver, intervalMs = 2_000) {
  let running: Promise<void> | null = null;
  async function drain() {
    for (const message of pendingMail(store, Date.now())) {
      const outcome = await deliver(message);
      settleMail(store, message.id, outcome, Date.now());
      if (outcome !== "sent")
        console.log(JSON.stringify({ mail: outcome, attempts: (message.attempts ?? 0) + 1 }));
    }
  }
  /** Joins the pass in flight instead of starting a second one. */
  function pass() {
    running ??= drain().finally(() => (running = null));
    return running;
  }
  const timer = setInterval(() => void pass(), intervalMs);
  timer.unref();
  void pass();
  return { pass, stop: () => clearInterval(timer) };
}
