import {
  createECDH,
  createHash,
  createHmac,
  createCipheriv,
  createPrivateKey,
  randomBytes,
  sign,
} from "node:crypto";
import { z } from "zod";
import type { Store } from "./database.js";
import { AppError } from "./social.js";

/**
 * Push notifications to the phone or computer, with no outside library: Web Push (RFC 8030) with
 * VAPID (RFC 8292) and the aes128gcm payload encryption of RFC 8291. Only the push service of the
 * person's own browser is ever called, and only with what they already see in Notifications.
 */
const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export interface PushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  at: string;
}
export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped; a path inside the app. */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
}

/** The push services browsers use. Anything else would let a subscription aim our server at any URL. */
const pushHosts = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];
export const isPushHost = (host: string) =>
  pushHosts.some((h) => host === h || host.endsWith(`.${h}`));

const subscriptionSchema = z
  .object({
    endpoint: z.string().url().max(1000),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().max(200),
        auth: z.string().max(100),
      })
      .strict(),
  })
  .strict();

/** RFC 8291: the payload encrypted for one browser, as the request body. */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const server = createECDH("prime256v1");
  const asPublic = server.generateKeys();
  const shared = server.computeSecret(uaPublic);
  const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(
    prkKey,
    Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]),
  );
  const salt = randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

export class PushService {
  private readonly sent = new Map<string, number[]>();
  constructor(
    private readonly store: Store,
    /** The app's own address, given to push services as the contact (VAPID `sub`). */
    private readonly appUrl: string,
    private readonly options: {
      /** Extra endpoint hosts allowed, such as a local test receiver. Never in production. */
      allowHost?: (url: URL) => boolean;
      send?: typeof fetch;
      now?: () => Date;
      /** Pushes per person per hour, so a busy post never floods a phone. */
      perHour?: number;
    } = {},
  ) {}

  /** The server's VAPID key pair, made once and kept, so subscriptions stay valid across restarts. */
  private keys() {
    const kept = this.store.get<{ publicKey: string; privateKey: string }>("config", "vapid");
    if (kept) return kept;
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
    this.store.transaction(() => this.store.put("config", "vapid", keys));
    return keys;
  }
  publicKey() {
    return this.keys().publicKey;
  }

  private allowed(endpoint: string) {
    const url = new URL(endpoint);
    if (url.protocol === "https:" && isPushHost(url.hostname)) return true;
    return this.options.allowHost?.(url) ?? false;
  }
  subscribe(userId: string, input: unknown) {
    const sub = subscriptionSchema.parse(input);
    if (!this.allowed(sub.endpoint)) throw new AppError("PUSH_ENDPOINT_NOT_ALLOWED");
    if (fromB64u(sub.keys.p256dh).length !== 65 || fromB64u(sub.keys.auth).length !== 16)
      throw new AppError("INVALID_PUSH_KEYS");
    const id = createHash("sha256").update(sub.endpoint).digest("hex");
    this.store.transaction(() => {
      this.store.put("push-sub", id, {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        at: (this.options.now?.() ?? new Date()).toISOString(),
      } satisfies PushSubscription);
      // A few devices each; the oldest goes first.
      const mine = this.subscriptions(userId).sort((a, b) => b.at.localeCompare(a.at));
      for (const old of mine.slice(5)) this.remove(old.endpoint);
    });
    return { on: true };
  }
  unsubscribe(userId: string, endpoint: string) {
    const sub = this.subscriptions(userId).find((s) => s.endpoint === endpoint);
    if (sub) this.store.transaction(() => this.remove(sub.endpoint));
    return { on: false };
  }
  subscriptions(userId: string) {
    return this.store.all<PushSubscription>("push-sub").filter((s) => s.userId === userId);
  }
  private remove(endpoint: string) {
    this.store.remove("push-sub", createHash("sha256").update(endpoint).digest("hex"));
  }

  private vapid(endpoint: string) {
    const { publicKey, privateKey } = this.keys();
    const pub = fromB64u(publicKey);
    const key = createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        d: privateKey,
        x: b64u(pub.subarray(1, 33)),
        y: b64u(pub.subarray(33, 65)),
      },
      format: "jwk",
    });
    const now = Math.floor((this.options.now?.() ?? new Date()).getTime() / 1000);
    const part = (o: object) => b64u(Buffer.from(JSON.stringify(o)));
    const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({
      aud: new URL(endpoint).origin,
      exp: now + 12 * 3600,
      sub: this.appUrl,
    })}`;
    const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
    return `vapid t=${unsigned}.${b64u(signature)}, k=${publicKey}`;
  }

  /** Sends to every device of a person. Returns how many accepted it; failures never throw. */
  async send(userId: string, message: PushMessage) {
    const now = (this.options.now?.() ?? new Date()).getTime();
    const recent = (this.sent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= (this.options.perHour ?? 20)) return 0;
    const subs = this.subscriptions(userId);
    if (!subs.length) return 0;
    this.sent.set(userId, [...recent, now]);
    const payload = Buffer.from(JSON.stringify(message));
    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          const response = await (this.options.send ?? fetch)(sub.endpoint, {
            method: "POST",
            headers: {
              Authorization: this.vapid(sub.endpoint),
              "Content-Encoding": "aes128gcm",
              "Content-Type": "application/octet-stream",
              TTL: "86400",
              Urgency: "normal",
              ...(message.tag
                ? {
                    Topic: createHash("sha256")
                      .update(message.tag)
                      .digest("base64url")
                      .slice(0, 32),
                  }
                : {}),
            },
            body: encryptPayload(payload, sub.p256dh, sub.auth),
            signal: AbortSignal.timeout(10_000),
          });
          // The browser threw the subscription away: forget it too.
          if (response.status === 404 || response.status === 410)
            this.store.transaction(() => this.remove(sub.endpoint));
          return response.ok ? 1 : 0;
        } catch {
          return 0;
        }
      }),
    );
    return results.reduce<number>((a, b) => a + b, 0);
  }
}
