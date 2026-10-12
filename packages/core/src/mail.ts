import { randomUUID } from "node:crypto";
import type { Store } from "./database.js";

/**
 * Transactional outbox. Domain code queues a message in the same transaction as the change that
 * needs it; a server-side worker delivers it afterwards. A failed delivery never rolls back the
 * account change, and a rolled-back change never sends mail.
 */
export interface OutboxMessage {
  id: string;
  userId: string | null;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  status?: "pending" | "sent" | "failed" | undefined;
  attempts?: number | undefined;
  nextAttemptAt?: number | undefined;
}

/** Call inside a store transaction. */
export function queueMail(
  store: Store,
  message: { userId: string | null; to: string; subject: string; body: string },
  now: Date,
) {
  const record: OutboxMessage = {
    id: randomUUID(),
    ...message,
    createdAt: now.toISOString(),
    status: "pending",
    attempts: 0,
  };
  store.put("outbox", record.id, record);
  return record;
}

export function pendingMail(store: Store, now: number) {
  return store
    .all<OutboxMessage>("outbox")
    .filter((m) => (m.status ?? "pending") === "pending" && (m.nextAttemptAt ?? 0) <= now);
}

/** Codes and links are secrets: once delivered or abandoned, only the envelope is kept. */
export function settleMail(
  store: Store,
  id: string,
  outcome: "sent" | "failed" | "retry",
  now: number,
) {
  const message = store.get<OutboxMessage>("outbox", id);
  if (!message) return;
  const attempts = (message.attempts ?? 0) + (outcome === "sent" ? 0 : 1);
  const status = outcome === "retry" ? (attempts >= 5 ? "failed" : "pending") : outcome;
  store.transaction(() =>
    store.put("outbox", id, {
      ...message,
      status,
      attempts,
      nextAttemptAt: status === "pending" ? now + 2 ** attempts * 5_000 : undefined,
      body: status === "pending" ? message.body : "[delivered content removed]",
    }),
  );
}
