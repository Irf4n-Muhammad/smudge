import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "../../contracts/src/accounts.js";
import type { AccountView } from "../../contracts/src/accounts.js";
import type { User } from "../../contracts/src/experience.js";
import type { Actor } from "./index.js";
import type { IdentityService } from "./identity.js";
import { queueMail } from "./mail.js";
import { deleteAccountSchema } from "../../contracts/src/community.js";
import { reservedHandles } from "../../contracts/src/accounts.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

interface Credential {
  userId: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  createdAt: string;
}
interface Session {
  userId: string;
  createdAt: number;
  expiresAt: number;
}
interface AccountToken {
  userId: string;
  purpose: "verify" | "reset";
  expiresAt: number;
}
interface Throttle {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
export const SESSION_DAYS = 30;
const LOGIN_WINDOW = 15 * MINUTE;
const LOGIN_FAILURES = 5;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const commonPasswords = [
  "1234567890",
  "12345678910",
  "password123",
  "password1234",
  "qwertyuiop",
  "iloveyou123",
  "1q2w3e4r5t",
];
const reservedHandleCheck = (handle: string) => reservedHandles.includes(handle);
const newToken = () => randomBytes(32).toString("base64url");

// scrypt with a per-password salt; parameters live in the hash so they can be raised later.
const SCRYPT = { N: 16384, r: 8, p: 1 };
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = scryptSync(
    password.normalize("NFKC"),
    Buffer.from(salt, "base64"),
    expected.length,
    {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    },
  );
  return timingSafeEqual(actual, expected);
}
// Spent on unknown logins so response time does not reveal which accounts exist.
const decoyHash = hashPassword(randomBytes(12).toString("hex"));

/**
 * Accounts, passwords and sessions. Only hashes of session, verification and reset tokens are
 * stored; the raw values exist in the cookie or the email and nowhere else.
 */
export class AccountService {
  constructor(
    private readonly social: SocialService,
    private readonly identity: IdentityService,
    private readonly links: { verify: (token: string) => string; reset: (token: string) => string },
    private readonly now: () => Date = () => new Date(),
  ) {}
  /** Throws for accounts that may not sign in (suspended). Installed by the community layer. */
  loginGate: (userId: string) => void = () => {};
  /** Run inside the deletion transaction to remove everything else the account owns. */
  erasers: ((userId: string) => void)[] = [];
  private get store() {
    return this.social.store;
  }
  private time() {
    return this.now().getTime();
  }

  register(input: unknown) {
    const { email, password, ...profile } = registerSchema.parse(input);
    if (this.store.get("login-email", sha(email))) throw new AppError("EMAIL_TAKEN", 409);
    const user = this.identity.newUser(profile);
    const lower = password.toLowerCase();
    if (
      lower === email ||
      (user.handle.length >= 5 && lower.includes(user.handle)) ||
      commonPasswords.includes(lower)
    )
      throw new AppError("PASSWORD_TOO_GUESSABLE");
    const credential: Credential = {
      userId: user.id,
      email,
      emailVerified: false,
      passwordHash: hashPassword(password),
      createdAt: this.now().toISOString(),
    };
    const verify = newToken();
    const session = newToken();
    this.store.transaction(() => {
      this.store.put("user", user.id, user);
      this.store.put("credential", user.id, credential);
      this.store.put("login-email", sha(email), { userId: user.id });
      this.putToken(verify, user.id, "verify", DAY);
      this.putSession(session, user.id);
      this.mailVerification(user, email, verify);
    });
    return { user, session };
  }

  login(input: unknown) {
    const { login, password } = loginSchema.parse(input);
    const userId = login.includes("@")
      ? this.store.get<{ userId: string }>("login-email", sha(login))?.userId
      : this.social.users().find((u) => u.handle === login)?.id;
    // Keyed by account when it exists, so switching between email and handle shares one limit.
    const key = sha(userId ? `user:${userId}` : `login:${login}`);
    const throttle = this.store.get<Throttle>("login-throttle", key);
    if (throttle && throttle.lockedUntil > this.time())
      throw new AppError("TOO_MANY_ATTEMPTS", 429, {
        retryAfterSeconds: Math.ceil((throttle.lockedUntil - this.time()) / 1000),
      });
    const credential = userId ? this.store.get<Credential>("credential", userId) : undefined;
    const ok = verifyPassword(password, credential?.passwordHash ?? decoyHash) && !!credential;
    if (!ok) {
      const fresh = !throttle || this.time() - throttle.windowStart > LOGIN_WINDOW;
      const failures = fresh ? 1 : throttle.failures + 1;
      this.store.transaction(() =>
        this.store.put("login-throttle", key, {
          failures,
          windowStart: fresh ? this.time() : throttle.windowStart,
          lockedUntil: failures >= LOGIN_FAILURES ? this.time() + LOGIN_WINDOW : 0,
        } satisfies Throttle),
      );
      throw new AppError("LOGIN_INCORRECT", 401);
    }
    this.loginGate(credential.userId);
    const session = newToken();
    this.store.transaction(() => {
      this.store.remove("login-throttle", key);
      this.putSession(session, credential.userId);
    });
    return { userId: credential.userId, session };
  }

  /**
   * Sign in with a provider-verified email (Google). Links to an existing account only when that
   * account's email is already confirmed: otherwise whoever typed the address first, without
   * proving it, would receive the real owner's Google sign-ins.
   */
  externalLogin(provider: "google", profile: { sub: string; email: string; name: string }) {
    const email = profile.email.trim().toLowerCase();
    const linkKey = `${provider}:${profile.sub}`;
    let userId = this.store.get<{ userId: string }>("external-login", linkKey)?.userId;
    let created = false;
    if (!userId) {
      const existing = this.store.get<{ userId: string }>("login-email", sha(email))?.userId;
      if (existing) {
        if (!this.store.get<Credential>("credential", existing)?.emailVerified)
          throw new AppError("EMAIL_NOT_CONFIRMED_FOR_LINKING", 409);
        userId = existing;
      }
    }
    const session = newToken();
    if (userId) {
      this.loginGate(userId);
      const id = userId;
      this.store.transaction(() => {
        this.store.put("external-login", linkKey, { userId: id });
        this.putSession(session, id);
      });
      return { userId, session, created };
    }
    const user = this.identity.newUser({
      name: profile.name.trim().slice(0, 60) || email.split("@")[0]!,
      handle: this.freeHandle(email.split("@")[0]!),
    });
    created = true;
    this.store.transaction(() => {
      this.store.put("user", user.id, user);
      this.store.put("credential", user.id, {
        userId: user.id,
        email,
        emailVerified: true,
        passwordHash: "",
        createdAt: this.now().toISOString(),
      } satisfies Credential);
      this.store.put("login-email", sha(email), { userId: user.id });
      this.store.put("external-login", linkKey, { userId: user.id });
      this.putSession(session, user.id);
    });
    return { userId: user.id, session, created };
  }
  private freeHandle(base: string) {
    const stem =
      base
        .toLowerCase()
        .replace(/[^a-z0-9._]/g, "")
        .slice(0, 18) || "member";
    const taken = new Set(this.social.users().map((u) => u.handle));
    let handle = stem.length >= 3 ? stem : `${stem}.forma`;
    for (let i = 2; taken.has(handle) || reservedHandleCheck(handle); i++) handle = `${stem}${i}`;
    return handle;
  }

  /**
   * Deletes the account: sign-in, sessions, follows, reactions, chapters and messages go now;
   * posts disappear from every view at once (the stored copies are anonymised with the profile).
   */
  deleteAccount(actor: Actor, input: unknown) {
    const userId = this.social.actor(actor);
    const { password, handle } = deleteAccountSchema.parse(input);
    const credential = this.store.get<Credential>("credential", userId);
    if (credential?.passwordHash) {
      if (!password || !verifyPassword(password, credential.passwordHash))
        throw new AppError("LOGIN_INCORRECT", 401);
    } else if (handle !== this.user(userId).handle) throw new AppError("CONFIRMATION_MISMATCH");
    this.store.transaction(() => {
      for (const id of this.store.ids("session"))
        if (this.store.get<Session>("session", id)?.userId === userId)
          this.store.remove("session", id);
      for (const kind of ["external-login", "account-token"])
        for (const id of this.store.ids(kind))
          if (this.store.get<{ userId: string }>(kind, id)?.userId === userId)
            this.store.remove(kind, id);
      if (credential) this.store.remove("login-email", sha(credential.email));
      this.store.remove("credential", userId);
      for (const erase of this.erasers) erase(userId);
    });
    return { deleted: true };
  }

  // Sessions -------------------------------------------------------------------------------
  /** Demo account switching and tests; production sessions come from register/login/reset. */
  startSession(userId: string) {
    this.social.actor({ userId });
    const session = newToken();
    this.store.transaction(() => this.putSession(session, userId));
    return session;
  }
  private putSession(token: string, userId: string) {
    this.store.put("session", sha(token), {
      userId,
      createdAt: this.time(),
      expiresAt: this.time() + SESSION_DAYS * DAY,
    } satisfies Session);
  }
  /** Returns the session's actor, renewing it at most every few days to limit writes. */
  resolve(token: string | undefined): { actor: Actor; id: string; renewed: boolean } | null {
    if (!token || token.length > 100) return null;
    const id = sha(token);
    const session = this.store.get<Session>("session", id);
    if (!session) return null;
    let allowed = true;
    try {
      this.loginGate(session.userId);
    } catch {
      allowed = false;
    }
    if (
      !allowed ||
      session.expiresAt <= this.time() ||
      !this.store.get<User>("user", session.userId)
    ) {
      this.store.transaction(() => this.store.remove("session", id));
      return null;
    }
    const renewed = session.expiresAt - this.time() < (SESSION_DAYS - 3) * DAY;
    if (renewed)
      this.store.transaction(() =>
        this.store.put("session", id, { ...session, expiresAt: this.time() + SESSION_DAYS * DAY }),
      );
    return { actor: { userId: session.userId }, id, renewed };
  }
  logout(token: string | undefined) {
    if (token) this.store.transaction(() => this.store.remove("session", sha(token)));
  }
  logoutEverywhere(actor: Actor) {
    const userId = this.social.actor(actor);
    this.revokeSessions(userId);
  }
  private revokeSessions(userId: string, keep?: string) {
    const ids = this.store
      .ids("session")
      .filter((id) => id !== keep && this.store.get<Session>("session", id)?.userId === userId);
    this.store.transaction(() => ids.forEach((id) => this.store.remove("session", id)));
  }

  // Email verification and recovery ---------------------------------------------------------
  private putToken(token: string, userId: string, purpose: AccountToken["purpose"], ttl: number) {
    this.store.put("account-token", sha(token), {
      userId,
      purpose,
      expiresAt: this.time() + ttl,
    } satisfies AccountToken);
  }
  private takeToken(token: string, purpose: AccountToken["purpose"]) {
    const record = this.store.get<AccountToken>("account-token", sha(token));
    if (!record || record.purpose !== purpose || record.expiresAt <= this.time())
      throw new AppError("LINK_INVALID_OR_EXPIRED", 410);
    return { id: sha(token), record };
  }
  private mailVerification(user: User, email: string, token: string) {
    queueMail(
      this.store,
      {
        userId: user.id,
        to: email,
        subject: "Confirm your email for Forma",
        body: `Hi ${user.name},\n\nConfirm this address to finish setting up @${user.handle}:\n${this.links.verify(token)}\n\nThe link expires in 24 hours. If you did not sign up, ignore this email.`,
      },
      this.now(),
    );
  }
  resendVerification(actor: Actor) {
    const userId = this.social.actor(actor);
    const credential = this.store.get<Credential>("credential", userId);
    if (!credential) throw new AppError("NO_EMAIL_ON_ACCOUNT", 404);
    if (credential.emailVerified) return { sent: false };
    const recent = this.store
      .all<{ userId: string | null; createdAt: string; subject: string }>("outbox")
      .filter(
        (m) =>
          m.userId === userId &&
          m.subject.startsWith("Confirm your email") &&
          Date.parse(m.createdAt) > this.time() - 60 * MINUTE,
      );
    if (recent.length >= 3) throw new AppError("TOO_MANY_EMAILS", 429);
    const token = newToken();
    this.store.transaction(() => {
      this.putToken(token, userId, "verify", DAY);
      this.mailVerification(this.user(userId), credential.email, token);
    });
    return { sent: true };
  }
  verifyEmail(input: unknown) {
    const { id, record } = this.takeToken(tokenSchema.parse(input).token, "verify");
    const credential = this.store.get<Credential>("credential", record.userId);
    if (!credential) throw new AppError("LINK_INVALID_OR_EXPIRED", 410);
    this.store.transaction(() => {
      this.store.remove("account-token", id);
      this.store.put("credential", record.userId, { ...credential, emailVerified: true });
    });
    return { verified: true };
  }
  /** Always answers the same way so the form cannot be used to test which emails have accounts. */
  requestPasswordReset(input: unknown) {
    const { email } = forgotPasswordSchema.parse(input);
    const userId = this.store.get<{ userId: string }>("login-email", sha(email))?.userId;
    if (!userId) return { ok: true };
    const recent = this.store
      .all<{ userId: string | null; createdAt: string; subject: string }>("outbox")
      .filter(
        (m) =>
          m.userId === userId &&
          m.subject.startsWith("Reset your") &&
          Date.parse(m.createdAt) > this.time() - 60 * MINUTE,
      );
    if (recent.length >= 3) return { ok: true };
    const token = newToken();
    const user = this.user(userId);
    this.store.transaction(() => {
      this.putToken(token, userId, "reset", 60 * MINUTE);
      queueMail(
        this.store,
        {
          userId,
          to: email,
          subject: "Reset your Forma password",
          body: `Hi ${user.name},\n\nSomeone asked to reset the password for @${user.handle}. If it was you, choose a new one here:\n${this.links.reset(token)}\n\nThe link works once and expires in 1 hour. If it was not you, you can ignore this email; your password has not changed.`,
        },
        this.now(),
      );
    });
    return { ok: true };
  }
  /** Signs out every device, then signs this browser in with the new password. */
  resetPassword(input: unknown) {
    const parsed = resetPasswordSchema.parse(input);
    const { id, record } = this.takeToken(parsed.token, "reset");
    const credential = this.store.get<Credential>("credential", record.userId);
    if (!credential) throw new AppError("LINK_INVALID_OR_EXPIRED", 410);
    this.revokeSessions(record.userId);
    const session = newToken();
    this.store.transaction(() => {
      this.store.remove("account-token", id);
      // The reset link proves control of the mailbox, so it also verifies the address.
      this.store.put("credential", record.userId, {
        ...credential,
        emailVerified: true,
        passwordHash: hashPassword(parsed.password),
      });
      this.store.remove("login-throttle", sha(`user:${record.userId}`));
      this.putSession(session, record.userId);
    });
    return { userId: record.userId, session };
  }
  changePassword(actor: Actor, sessionToken: string | undefined, input: unknown) {
    const userId = this.social.actor(actor);
    const { current, next } = changePasswordSchema.parse(input);
    const credential = this.store.get<Credential>("credential", userId);
    if (!credential) throw new AppError("NO_EMAIL_ON_ACCOUNT", 404);
    if (!verifyPassword(current, credential.passwordHash))
      throw new AppError("LOGIN_INCORRECT", 401);
    this.revokeSessions(userId, sessionToken ? sha(sessionToken) : undefined);
    this.store.transaction(() =>
      this.store.put("credential", userId, { ...credential, passwordHash: hashPassword(next) }),
    );
    return { ok: true };
  }

  account(actor: Actor): AccountView {
    const userId = this.social.actor(actor);
    const credential = this.store.get<Credential>("credential", userId);
    return {
      userId,
      email: credential?.email ?? null,
      emailVerified: credential?.emailVerified ?? false,
      hasPassword: !!credential?.passwordHash,
    };
  }
  private user(id: string) {
    const user = this.store.get<User>("user", id);
    if (!user) throw new AppError("INVALID_USER");
    return user;
  }
}
