import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Starts the real API in production mode on spare ports (E2E owns 3000-3002) and drives the
// account flow over HTTP, the way the web app does.
const API = "http://127.0.0.1:4101";
const ORIGIN = "http://127.0.0.1:4100";

async function startServer() {
  const dataDir = mkdtempSync(join(tmpdir(), "forma-prod-"));
  const child = spawn(process.execPath, ["--import", "tsx", "apps/server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORMA_MODE: "production",
      FORMA_DATA_DIR: dataDir,
      FORMA_PUBLIC_URL: ORIGIN,
      FORMA_RUNTIME_URL: "http://127.0.0.1:4102",
      FORMA_ALLOW_HTTP: "1",
      FORMA_MAIL: "file",
      FORMA_API_PORT: "4101",
      FORMA_RUNTIME_PORT: "4102",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 60_000);
    const onData = (chunk: Buffer) => {
      output += chunk;
      if (output.includes("Forma runtime ready")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`server exited ${code}:\n${output}`)));
  });
  return { child, dataDir };
}

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
    async call(path: string, body?: unknown, headers: Record<string, string> = {}) {
      const response = await fetch(API + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: ORIGIN }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        const value = setCookie.split(";")[0]!;
        cookie = value.endsWith("=") ? "" : value;
      }
      return { status: response.status, setCookie, json: (await response.json()) as any };
    },
  };
}

async function mailTo(dataDir: string, subject: string, count = 1) {
  const path = join(dataDir, "mail.jsonl");
  for (let i = 0; i < 50; i++) {
    if (existsSync(path)) {
      const messages = readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { to: string; subject: string; body: string })
        .filter((m) => m.subject.startsWith(subject));
      if (messages.length >= count) return messages.at(-1)!;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no mail: ${subject}`);
}
const token = (body: string) => body.match(/=([A-Za-z0-9_-]{43})/)![1]!;

test("production mode: real accounts only, no demo content, mail delivered out of band", async () => {
  const { child, dataDir } = await startServer();
  try {
    const anon = client();
    const state = await anon.call("/api/auth/state");
    assert.deepEqual(state.json, {
      mode: "production",
      signedIn: false,
      account: null,
      google: false,
      moderator: false,
    });
    assert.equal((await anon.call("/api/bootstrap")).status, 401);
    assert.equal((await anon.call("/api/session", { userId: "you" })).status, 401);
    // The local MCP token is not an identity in production.
    const mcp = readFileSync(join(dataDir, "mcp-token"), "utf8").trim();
    assert.equal(
      (await anon.call("/api/bootstrap", undefined, { Authorization: `Bearer ${mcp}` })).status,
      401,
    );

    const sara = {
      name: "Sara Putri",
      handle: "sara",
      email: "sara@example.com",
      password: "a long enough phrase",
    };
    const noOrigin = await fetch(API + "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sara),
    });
    assert.equal(noOrigin.status, 403);
    const foreign = await anon.call("/api/auth/signup", sara, { Origin: "https://evil.example" });
    assert.equal(foreign.json.error, "ORIGIN_DENIED");

    const me = client();
    const signup = await me.call("/api/auth/signup", sara);
    assert.equal(signup.status, 201);
    assert.match(signup.setCookie!, /HttpOnly/);
    assert.match(signup.setCookie!, /SameSite=Strict/);
    const boot = await me.call("/api/bootstrap");
    assert.equal(boot.json.actor.userId, signup.json.id);
    assert.deepEqual(
      boot.json.users.map((u: { handle: string }) => u.handle),
      ["sara"],
      "no demo people in production",
    );
    assert.deepEqual((await me.call("/api/identity/me")).json.outbox, []);
    assert.equal((await me.call("/api/auth/state")).json.account.emailVerified, false);

    const verify = await mailTo(dataDir, "Confirm your email");
    assert.equal(verify.to, "sara@example.com");
    assert.ok(verify.body.includes(`${ORIGIN}/?verify=`));
    assert.equal((await anon.call("/api/auth/verify", { token: token(verify.body) })).status, 200);
    assert.equal((await me.call("/api/auth/state")).json.account.emailVerified, true);

    const old = me.cookie;
    await me.call("/api/auth/logout", {});
    assert.equal(me.cookie, "");
    me.cookie = old;
    assert.equal((await me.call("/api/bootstrap")).status, 401, "logged-out session is dead");

    const reset = client();
    assert.deepEqual((await reset.call("/api/auth/forgot", { email: "ghost@x.com" })).json, {
      ok: true,
    });
    await reset.call("/api/auth/forgot", { email: "sara@example.com" });
    const link = await mailTo(dataDir, "Reset your");
    const done = await reset.call("/api/auth/reset", {
      token: token(link.body),
      password: "brand new phrase here",
    });
    assert.equal(done.status, 200);
    assert.equal((await reset.call("/api/bootstrap")).json.actor.userId, signup.json.id);

    const attacker = client();
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await attacker.call("/api/auth/login", { login: "sara", password: "guess" + i })).status,
        401,
      );
    const locked = await attacker.call("/api/auth/login", {
      login: "sara",
      password: "brand new phrase here",
    });
    assert.equal(locked.json.error, "TOO_MANY_ATTEMPTS");
    // Delivered mail no longer holds its link in the database.
    const db = readFileSync(join(dataDir, "forma.sqlite"));
    assert.ok(!db.includes(Buffer.from(token(link.body))));

    // Moderation is invisible to members who are not on FORMA_ADMIN_EMAILS, and Google login
    // does not exist until it is configured.
    assert.equal((await reset.call("/api/moderation/reports")).status, 404);
    assert.equal((await anon.call("/api/auth/google/start")).status, 404);

    const leaver = client();
    await leaver.call("/api/auth/signup", {
      name: "Short Stay",
      handle: "shortstay",
      email: "short@example.com",
      password: "a long enough phrase",
    });
    assert.equal(
      (await leaver.call("/api/account/delete", { password: "not my password" })).status,
      401,
    );
    const gone = await leaver.call("/api/account/delete", { password: "a long enough phrase" });
    assert.equal(gone.status, 200);
    assert.equal(leaver.cookie, "", "deleting signs out");
    const again = await leaver.call("/api/auth/login", {
      login: "short@example.com",
      password: "a long enough phrase",
    });
    assert.equal(again.status, 401);
    assert.deepEqual((await reset.call("/api/people?q=shortstay")).json, []);
  } finally {
    child.kill("SIGTERM");
  }
});
