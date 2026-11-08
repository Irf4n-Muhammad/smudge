import test from "node:test";
import assert from "node:assert/strict";
import {
  createDecipheriv,
  createECDH,
  createHmac,
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { PushService } from "../packages/core/src/push.js";

const b64u = (b: Buffer) => b.toString("base64url");

/** A browser: its keys, and how it reads what the push service hands it (RFC 8291). */
function browser() {
  const ecdh = createECDH("prime256v1");
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    keys: { p256dh: b64u(publicKey), auth: b64u(auth) },
    read(body: Buffer) {
      const salt = body.subarray(0, 16);
      const idlen = body.readUInt8(20);
      const asPublic = body.subarray(21, 21 + idlen);
      const data = body.subarray(21 + idlen);
      const hmac = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();
      const shared = ecdh.computeSecret(asPublic);
      const ikm = hmac(
        hmac(auth, shared),
        Buffer.concat([Buffer.from("WebPush: info\0"), publicKey, asPublic, Buffer.from([1])]),
      );
      const prk = hmac(salt, ikm);
      const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(
        0,
        16,
      );
      const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(
        0,
        12,
      );
      const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
      decipher.setAuthTag(data.subarray(-16));
      const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
      assert.equal(plain.at(-1), 2, "one last record");
      return JSON.parse(plain.subarray(0, -1).toString());
    },
  };
}

async function setup() {
  const store = await Store.open(join(mkdtempSync(join(tmpdir(), "forma-push-")), "db.sqlite"));
  const calls: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
  let status = 201;
  const push = new PushService(store, "https://smudge.example/", {
    allowHost: (u) => u.hostname === "127.0.0.1",
    perHour: 3,
    send: (async (url: string, init: { headers: Record<string, string>; body: Buffer }) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return new Response(null, { status });
    }) as unknown as typeof fetch,
  });
  return { store, push, calls, setStatus: (s: number) => (status = s) };
}

test("a push reaches the browser encrypted for it alone, signed with the server's key", async () => {
  const { push, calls } = await setup();
  const phone = browser();
  push.subscribe("ana", { endpoint: "http://127.0.0.1:9/push/abc", keys: phone.keys });
  const message = { title: "Smudge", body: "Budi answered “Swim?”.", url: "/?post=1" };
  assert.equal(await push.send("ana", message), 1);
  const [call] = calls;
  assert.equal(call?.headers["Content-Encoding"], "aes128gcm");
  assert.deepEqual(phone.read(call!.body), message);
  assert.notDeepEqual(browser().keys, phone.keys);

  // VAPID: a JWT for the push service's origin, verifiable with the key the browser subscribed with.
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(call!.headers.Authorization!)!;
  assert.equal(k, push.publicKey());
  const [h, p, s] = token!.split(".");
  const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
  assert.equal(claims.aud, "http://127.0.0.1:9");
  assert.equal(claims.sub, "https://smudge.example/");
  const pub = Buffer.from(k!, "base64url");
  const key = createPublicKey({
    key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) },
    format: "jwk",
  });
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(s!, "base64url"),
    ),
  );
});

test("only real push services, a few devices each, a cap per hour, and gone subscriptions are dropped", async () => {
  const { push, calls, setStatus } = await setup();
  const phone = browser();
  assert.throws(
    () => push.subscribe("ana", { endpoint: "https://evil.example/x", keys: phone.keys }),
    (e: { code?: string }) => e.code === "PUSH_ENDPOINT_NOT_ALLOWED",
  );
  assert.throws(() =>
    push.subscribe("ana", {
      endpoint: "https://fcm.googleapis.com/fcm/send/x",
      keys: { p256dh: "AA", auth: "AA" },
    }),
  );
  push.subscribe("ana", { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: phone.keys });
  assert.equal(push.subscriptions("ana").length, 1);
  assert.equal(await push.send("nobody", { title: "x", body: "y", url: "/" }), 0);

  for (let i = 0; i < 3; i++) await push.send("ana", { title: "x", body: String(i), url: "/" });
  assert.equal(await push.send("ana", { title: "x", body: "4th", url: "/" }), 0, "capped");
  assert.equal(calls.length, 3);

  const fresh = await setup();
  fresh.push.subscribe("ana", { endpoint: "http://127.0.0.1:9/gone", keys: phone.keys });
  fresh.setStatus(410);
  await fresh.push.send("ana", { title: "x", body: "y", url: "/" });
  assert.equal(fresh.push.subscriptions("ana").length, 0, "the browser dropped it");
  void setStatus;
});
