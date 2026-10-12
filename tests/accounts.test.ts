import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/database.js";
import { SocialService } from "../packages/core/src/social.js";
import { IdentityService } from "../packages/core/src/identity.js";
import { AccountService, hashPassword, verifyPassword } from "../packages/core/src/accounts.js";
import { pendingMail } from "../packages/core/src/mail.js";
import type { OutboxMessage } from "../packages/core/src/mail.js";
import { renderMoment } from "../apps/server/moments.js";
import { resend, startMailWorker, toFile } from "../apps/server/mail.js";
import { loadConfig } from "../apps/server/config.js";

async function setup(localInbox = false) {
  const dir = mkdtempSync(join(tmpdir(), "forma-acct-"));
  const store = await Store.open(join(dir, "db.sqlite"));
  const clock = { now: new Date("2026-03-10T10:00:00Z") };
  const social = new SocialService(store);
  const identity = new IdentityService(social, renderMoment, () => clock.now, localInbox);
  const accounts = new AccountService(
    social,
    identity,
    {
      verify: (t) => `https://forma.test/?verify=${t}`,
      reset: (t) => `https://forma.test/?reset=${t}`,
    },
    () => clock.now,
  );
  const later = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms));
  return { dir, store, social, identity, accounts, later };
}
const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === code);
const sara = {
  name: "Sara Putri",
  handle: "sara.p",
  email: "Sara@Example.com",
  password: "a long enough phrase",
};
const mail = (store: Store, subject: string) =>
  store.all<OutboxMessage>("outbox").filter((m) => m.subject.startsWith(subject));
const linkToken = (message: OutboxMessage) => message.body.match(/=([A-Za-z0-9_-]{43})/)![1]!;

test("passwords are salted scrypt hashes and never stored in the clear", async () => {
  const a = hashPassword("correct horse battery"),
    b = hashPassword("correct horse battery");
  assert.notEqual(a, b);
  assert.ok(verifyPassword("correct horse battery", a));
  assert.ok(!verifyPassword("correct horse batterY", a));
  const { store, accounts } = await setup();
  const { user, session } = accounts.register(sara);
  const raw = JSON.stringify(store.all("credential"));
  assert.ok(!raw.includes(sara.password));
  assert.equal(accounts.account({ userId: user.id }).email, "sara@example.com");
  // Only the hash of the session token is stored.
  assert.ok(!JSON.stringify(store.all("session")).includes(session));
  assert.equal(accounts.resolve(session)?.actor.userId, user.id);
});

test("signup rejects taken emails and handles, reserved handles and weak passwords", async () => {
  const { accounts } = await setup();
  accounts.register(sara);
  rejects(() => accounts.register({ ...sara, handle: "other" }), "EMAIL_TAKEN");
  rejects(() => accounts.register({ ...sara, email: "x@example.com" }), "HANDLE_TAKEN");
  rejects(
    () => accounts.register({ ...sara, handle: "support", email: "s@example.com" }),
    "HANDLE_TAKEN",
  );
  assert.throws(() =>
    accounts.register({ ...sara, handle: "new1", email: "n@x.com", password: "short" }),
  );
  rejects(
    () =>
      accounts.register({ ...sara, handle: "newbie", email: "n@x.com", password: "password123" }),
    "PASSWORD_TOO_GUESSABLE",
  );
  rejects(
    () =>
      accounts.register({ ...sara, handle: "sarahh", email: "n@x.com", password: "i am sarahh!!" }),
    "PASSWORD_TOO_GUESSABLE",
  );
  // Body fields cannot pick an identity.
  assert.throws(() => accounts.register({ ...sara, handle: "z1z", email: "z@x.com", id: "you" }));
});

test("login by email or handle, lockout after repeated failures, generic error", async () => {
  const { accounts, later } = await setup();
  const { user } = accounts.register(sara);
  assert.equal(
    accounts.login({ login: "sara@example.com", password: sara.password }).userId,
    user.id,
  );
  assert.equal(accounts.login({ login: "SARA.P", password: sara.password }).userId, user.id);
  rejects(() => accounts.login({ login: "nobody@example.com", password: "x" }), "LOGIN_INCORRECT");
  for (let i = 0; i < 4; i++)
    rejects(() => accounts.login({ login: "sara.p", password: "wrong" }), "LOGIN_INCORRECT");
  // Email and handle share the account's limit.
  rejects(
    () => accounts.login({ login: "sara@example.com", password: "wrong" }),
    "LOGIN_INCORRECT",
  );
  rejects(
    () => accounts.login({ login: "sara@example.com", password: sara.password }),
    "TOO_MANY_ATTEMPTS",
  );
  later(16 * 60_000);
  assert.ok(accounts.login({ login: "sara@example.com", password: sara.password }).session);
});

test("sessions expire, logout revokes one, logout everywhere revokes all", async () => {
  const { accounts, later } = await setup();
  const { user, session: first } = accounts.register(sara);
  const { session: second } = accounts.login({ login: "sara.p", password: sara.password });
  accounts.logout(first);
  assert.equal(accounts.resolve(first), null);
  assert.ok(accounts.resolve(second));
  const { session: third } = accounts.login({ login: "sara.p", password: sara.password });
  accounts.logoutEverywhere({ userId: user.id });
  assert.equal(accounts.resolve(second), null);
  assert.equal(accounts.resolve(third), null);
  const { session: fourth } = accounts.login({ login: "sara.p", password: sara.password });
  later(31 * 86_400_000);
  assert.equal(accounts.resolve(fourth), null);
  assert.equal(accounts.resolve("not-a-real-token"), null);
});

test("email verification link works once and expires", async () => {
  const { store, accounts, later } = await setup();
  const { user } = accounts.register(sara);
  const actor = { userId: user.id };
  const [message] = mail(store, "Confirm your email");
  assert.equal(message!.to, "sara@example.com");
  assert.match(message!.body, /https:\/\/forma\.test\/\?verify=/);
  assert.equal(accounts.account(actor).emailVerified, false);
  accounts.verifyEmail({ token: linkToken(message!) });
  assert.equal(accounts.account(actor).emailVerified, true);
  rejects(() => accounts.verifyEmail({ token: linkToken(message!) }), "LINK_INVALID_OR_EXPIRED");
  assert.deepEqual(accounts.resendVerification(actor), { sent: false });

  const other = accounts.register({ ...sara, handle: "other", email: "o@example.com" });
  const [late] = mail(store, "Confirm your email").filter((m) => m.to === "o@example.com");
  later(25 * 3_600_000);
  rejects(() => accounts.verifyEmail({ token: linkToken(late!) }), "LINK_INVALID_OR_EXPIRED");
  for (let i = 0; i < 3; i++) accounts.resendVerification({ userId: other.user.id });
  rejects(() => accounts.resendVerification({ userId: other.user.id }), "TOO_MANY_EMAILS");
});

test("password reset does not reveal accounts, works once and signs out every device", async () => {
  const { store, accounts, later } = await setup();
  const { user, session } = accounts.register(sara);
  assert.deepEqual(accounts.requestPasswordReset({ email: "ghost@example.com" }), { ok: true });
  assert.equal(mail(store, "Reset your").length, 0);
  assert.deepEqual(accounts.requestPasswordReset({ email: "sara@example.com" }), { ok: true });
  const [message] = mail(store, "Reset your");
  const token = linkToken(message!);
  for (let i = 0; i < 5; i++)
    assert.throws(() => accounts.login({ login: "sara.p", password: "wrong" }));
  const reset = accounts.resetPassword({ token, password: "a brand new phrase" });
  assert.equal(reset.userId, user.id);
  assert.equal(accounts.resolve(session), null);
  assert.ok(accounts.resolve(reset.session));
  // The reset clears the lockout and confirms the mailbox.
  assert.ok(accounts.login({ login: "sara.p", password: "a brand new phrase" }));
  assert.equal(accounts.account({ userId: user.id }).emailVerified, true);
  rejects(
    () => accounts.resetPassword({ token, password: "another new phrase" }),
    "LINK_INVALID_OR_EXPIRED",
  );
  accounts.requestPasswordReset({ email: "sara@example.com" });
  const expiring = mail(store, "Reset your").at(-1)!;
  later(61 * 60_000);
  rejects(
    () => accounts.resetPassword({ token: linkToken(expiring), password: "another new phrase" }),
    "LINK_INVALID_OR_EXPIRED",
  );
});

test("changing the password needs the current one and keeps only this device", async () => {
  const { accounts } = await setup();
  const { user, session } = accounts.register(sara);
  const { session: other } = accounts.login({ login: "sara.p", password: sara.password });
  const actor = { userId: user.id };
  rejects(
    () => accounts.changePassword(actor, session, { current: "nope", next: "another long phrase" }),
    "LOGIN_INCORRECT",
  );
  accounts.changePassword(actor, session, { current: sara.password, next: "another long phrase" });
  assert.ok(accounts.resolve(session));
  assert.equal(accounts.resolve(other), null);
  rejects(() => accounts.login({ login: "sara.p", password: sara.password }), "LOGIN_INCORRECT");
});

test("the in-app inbox is demo only; production hides queued mail from the API", async () => {
  const demo = await setup(true);
  const { user } = demo.accounts.register(sara);
  assert.equal(demo.identity.outbox({ userId: user.id }).length, 1);
  const live = await setup(false);
  const { user: liveUser } = live.accounts.register(sara);
  assert.deepEqual(live.identity.outbox({ userId: liveUser.id }), []);
  assert.equal(live.identity.me({ userId: liveUser.id }).outbox.length, 0);
});

test("mail worker delivers through Resend, redacts sent mail and retries failures", async () => {
  const { store, accounts } = await setup();
  accounts.register(sara);
  const calls: { url: string; init: RequestInit }[] = [];
  let status = 503;
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  const worker = startMailWorker(store, resend("re_test", "Forma <hi@forma.test>", fetcher), 1e9);
  await worker.pass();
  worker.stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.resend.com/emails");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test");
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.deepEqual(body.to, ["sara@example.com"]);
  assert.equal(body.from, "Forma <hi@forma.test>");
  let [message] = store.all<OutboxMessage>("outbox");
  assert.equal(message!.status, "pending");
  assert.equal(message!.attempts, 1);
  assert.equal(pendingMail(store, Date.now()).length, 0, "backs off before retrying");
  status = 200;
  store.transaction(() => store.put("outbox", message!.id, { ...message, nextAttemptAt: 0 }));
  const retry = startMailWorker(store, resend("re_test", "x@forma.test", fetcher), 1e9);
  await retry.pass();
  retry.stop();
  [message] = store.all<OutboxMessage>("outbox");
  assert.equal(message!.status, "sent");
  assert.ok(!message!.body.includes("verify="), "secrets are removed after delivery");

  // A permanent rejection (e.g. invalid address) is not retried.
  accounts.requestPasswordReset({ email: "sara@example.com" });
  status = 422;
  const reject = startMailWorker(store, resend("re_test", "x@forma.test", fetcher), 1e9);
  await reject.pass();
  reject.stop();
  assert.equal(store.all<OutboxMessage>("outbox").at(-1)!.status, "failed");
});

test("file delivery writes one JSON line per message", async () => {
  const { dir, store, accounts } = await setup();
  accounts.register(sara);
  const path = join(dir, "mail.jsonl");
  const worker = startMailWorker(store, toFile(path), 1e9);
  await worker.pass();
  worker.stop();
  const [line] = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(JSON.parse(line!).to, "sara@example.com");
});

test("production config refuses unsafe or incomplete settings", () => {
  const base = {
    FORMA_MODE: "production",
    FORMA_PUBLIC_URL: "https://forma.example",
    FORMA_RUNTIME_URL: "https://run.forma.example",
    RESEND_API_KEY: "re_x",
    FORMA_MAIL_FROM: "Forma <hi@forma.example>",
  };
  const config = loadConfig(base);
  assert.equal(config.mode, "production");
  assert.equal(config.demoContent, false);
  assert.equal(config.mail.provider, "resend");
  assert.throws(() => loadConfig({ ...base, FORMA_RUNTIME_URL: undefined }));
  assert.throws(() => loadConfig({ ...base, FORMA_RUNTIME_URL: "https://forma.example" }));
  assert.throws(() => loadConfig({ ...base, FORMA_PUBLIC_URL: "http://forma.example" }));
  assert.throws(() => loadConfig({ ...base, RESEND_API_KEY: undefined }));
  assert.throws(() => loadConfig({ ...base, FORMA_MAIL: "inbox" }));
  assert.equal(loadConfig({}).mode, "demo");
  assert.equal(loadConfig({}).mail.provider, "inbox");
});
