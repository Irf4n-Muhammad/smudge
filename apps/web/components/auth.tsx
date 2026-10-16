"use client";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { KeyRound, Lock, LogOut, MailCheck, ShieldCheck } from "lucide-react";
import { api } from "./runtime";
import type { AuthState } from "../../../packages/contracts/src/accounts";
import { Dialog } from "./ui";
import { BlockedList, DeleteAccount } from "./community";
import { EmailPrefsPanel, ProfileBasics } from "./welcome";
import type { User } from "../../../packages/contracts/src/experience";

const messages: Record<string, string> = {
  LOGIN_INCORRECT: "That email or password is not right.",
  TOO_MANY_ATTEMPTS: "Too many tries. Wait a few minutes, or reset your password.",
  TOO_MANY_REQUESTS: "Too many requests from this connection. Try again a little later.",
  EMAIL_TAKEN: "There is already an account with this email. Log in instead.",
  HANDLE_TAKEN: "That handle is taken. Try another one.",
  PASSWORD_TOO_SHORT: "Use at least 10 characters for your password.",
  PASSWORD_TOO_GUESSABLE: "That password is too easy to guess. Try a longer phrase.",
  LINK_INVALID_OR_EXPIRED: "This link has expired or was already used. Ask for a new one.",
  TOO_MANY_EMAILS: "We already sent a few emails. Check your inbox and spam folder.",
  ACCOUNT_SUSPENDED: "This account is suspended for breaking the community rules.",
  EMAIL_NOT_CONFIRMED_FOR_LINKING:
    "An account with this email exists but its email is not confirmed. Log in with your password and confirm it first.",
  GOOGLE_EMAIL_UNVERIFIED: "Google has not verified that email address.",
  GOOGLE_STATE_MISMATCH: "Google sign-in expired. Please try again.",
};
export class AuthError extends Error {
  constructor(
    public code: string,
    public fields: string[] = [],
  ) {
    super(messages[code] ?? "Something went wrong. Please try again.");
  }
}
/** Like `api`, but keeps the error code and field issues so forms can say what is wrong. */
export async function authApi<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issues: { path: string; message: string }[] = value.issues ?? [];
    const password = issues.find((i) => i.message.startsWith("PASSWORD_"));
    if (password) throw new AuthError(password.message, ["password"]);
    if (value.error === "INVALID_INPUT")
      throw Object.assign(
        new AuthError(
          "INVALID_INPUT",
          issues.map((i) => i.path),
        ),
        {
          message: `Check ${issues.map((i) => i.path).join(", ") || "the form"}.`,
        },
      );
    throw new AuthError(value.error ?? "INTERNAL_ERROR");
  }
  return value as T;
}

function useSubmit(action: () => Promise<void>) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, submit };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

export type AuthMode = "login" | "signup" | "forgot";

export const authMessage = (code: string) =>
  messages[code] ?? "Sign-in did not work. Please try again.";

export function AuthForms({
  initial = "login",
  onSignedIn,
  google = false,
}: {
  initial?: AuthMode;
  onSignedIn: (fresh: boolean) => Promise<void> | void;
  google?: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>(initial);
  const [name, setName] = useState(""),
    [handle, setHandle] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [sent, setSent] = useState(false);
  const { error, busy, submit } = useSubmit(async () => {
    if (mode === "signup") {
      await authApi("/auth/signup", { name, handle, email, password });
      rememberAccount();
      await onSignedIn(true);
    } else if (mode === "login") {
      await authApi("/auth/login", { login: email, password });
      rememberAccount();
      await onSignedIn(false);
    } else {
      await authApi("/auth/forgot", { email });
      setSent(true);
    }
  });
  const go = (next: AuthMode) => {
    setMode(next);
    setSent(false);
  };
  return (
    <div className="auth-forms">
      {google && mode !== "forgot" && (
        <>
          <a className="google-button" href="/api/auth/google/start">
            <span aria-hidden="true">G</span> Continue with Google
          </a>
          <p className="auth-or">or with email</p>
        </>
      )}
      {mode !== "forgot" && (
        <div className="auth-tabs" role="tablist" aria-label="Log in or sign up">
          <button
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "selected" : ""}
            onClick={() => go("login")}
          >
            Log in
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "selected" : ""}
            onClick={() => go("signup")}
          >
            Sign up
          </button>
        </div>
      )}
      {mode === "forgot" && sent ? (
        <div className="auth-sent" role="status">
          <MailCheck size={22} />
          <p>
            If an account uses <strong>{email}</strong>, a reset link is on its way. It works once
            and expires in an hour.
          </p>
          <button className="text-button" onClick={() => go("login")}>
            Back to log in
          </button>
        </div>
      ) : (
        <form className="identity-form auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <>
              <Field label="Name">
                <input
                  required
                  maxLength={60}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Handle">
                <input
                  required
                  pattern="[a-z0-9._]{3,24}"
                  title="3 to 24 lowercase letters, numbers, dots or underscores"
                  autoComplete="username"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                />
              </Field>
            </>
          )}
          <Field label={mode === "login" ? "Email or handle" : "Email"}>
            <input
              required
              type={mode === "login" ? "text" : "email"}
              autoComplete={mode === "login" ? "username" : "email"}
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />
          </Field>
          {mode !== "forgot" && (
            <Field label="Password">
              <input
                required
                type="password"
                minLength={mode === "signup" ? 10 : 1}
                maxLength={200}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {mode === "signup" && (
            <p className="fineprint">
              At least 10 characters. Anyone can join; members-only decorations and moments unlock
              later with proof.
            </p>
          )}
          {mode === "forgot" && (
            <p className="fineprint">We will email a link to choose a new password.</p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {mode === "signup" ? "Create account" : mode === "login" ? "Log in" : "Send reset link"}
          </button>
          {mode === "login" && (
            <button type="button" className="text-button" onClick={() => go("forgot")}>
              Forgot password?
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" className="text-button" onClick={() => go("login")}>
              Back to log in
            </button>
          )}
        </form>
      )}
    </div>
  );
}

// This browser has signed in before, so the landing opens on Log in instead of Sign up.
const KNOWN = "smudge-has-account";
function rememberAccount() {
  try {
    localStorage.setItem(KNOWN, "1");
  } catch {
    // Storage can be blocked; the landing then simply opens on Sign up.
  }
}
function knownBrowser() {
  try {
    return localStorage.getItem(KNOWN) === "1";
  } catch {
    return false;
  }
}

interface Showcase {
  id: string;
  title: string;
  author: { id: string; name: string; handle: string };
}

/** Production landing for signed-out visitors: real posts first, then the way in. */
export function AuthScreen({
  onSignedIn,
  children,
  google = false,
}: {
  onSignedIn: (fresh: boolean) => Promise<void> | void;
  children?: ReactNode;
  google?: boolean;
}) {
  const [posts, setPosts] = useState<Showcase[]>([]),
    [initial, setInitial] = useState<AuthMode | null>(null);
  useEffect(() => {
    setInitial(knownBrowser() ? "login" : "signup");
    api<Showcase[]>("/public/showcase")
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);
  return (
    <main className="auth-screen">
      <section className="auth-pitch">
        <a className="brand" href="/" aria-label="Smudge home">
          <span className="brand-mark">s</span>smudge<span className="brand-dot">.</span>
        </a>
        <h1>
          Posts that look like <em>you.</em>
        </h1>
        <p>
          Photos, stories and big moments, each in a shape you pick. Made with the people you
          actually know.
        </p>
        {posts.length > 0 && (
          <ul className="auth-showcase" aria-label="Recent posts on Smudge">
            {posts.slice(0, 6).map((p) => (
              <li key={p.id}>
                <a href={`/p/${p.id}`}>
                  <img src={`/api/public/posts/${p.id}/cover`} alt="" loading="lazy" />
                  <span>
                    <strong>{p.title}</strong>
                    <small>@{p.author.handle}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="auth-card" aria-label="Account">
        {children ??
          (initial && <AuthForms initial={initial} onSignedIn={onSignedIn} google={google} />)}
      </section>
    </main>
  );
}

export function ResetPasswordForm({
  token,
  onDone,
}: {
  token: string;
  onDone: () => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const { error, busy, submit } = useSubmit(async () => {
    await authApi("/auth/reset", { token, password });
    await onDone();
  });
  return (
    <form className="identity-form auth-form" onSubmit={submit}>
      <h2>Choose a new password</h2>
      <label>
        New password
        <input
          required
          type="password"
          minLength={10}
          maxLength={200}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <p className="fineprint">This signs out every other device.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        Save new password
      </button>
    </form>
  );
}

export function AuthDialog({
  initial,
  onClose,
  onSignedIn,
  google = false,
}: {
  initial: AuthMode;
  onClose: () => void;
  onSignedIn: (fresh: boolean) => Promise<void> | void;
  google?: boolean;
}) {
  return (
    <Dialog title={initial === "signup" ? "Join Smudge" : "Welcome back"} onClose={onClose}>
      <AuthForms initial={initial} onSignedIn={onSignedIn} google={google} />
    </Dialog>
  );
}

export function VerifyBanner({
  state,
  notify,
}: {
  state: AuthState;
  notify: (message: string) => void;
}) {
  const [sending, setSending] = useState(false);
  if (!state.account?.hasPassword || state.account.emailVerified) return null;
  return (
    <div className="verify-banner" role="status">
      <MailCheck size={16} />
      <span>
        Confirm your email: we sent a link to <strong>{state.account.email}</strong>.
      </span>
      <button
        className="text-button"
        disabled={sending}
        onClick={async () => {
          setSending(true);
          try {
            const r = await authApi<{ sent: boolean }>("/auth/verify/resend", {});
            notify(r.sent ? "Sent a new confirmation link." : "Your email is already confirmed.");
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setSending(false);
          }
        }}
      >
        Send again
      </button>
    </div>
  );
}

export function AccountPanel({
  state,
  me,
  handle,
  isPrivate = false,
  notify,
  onSignedOut,
  onChanged,
}: {
  state: AuthState;
  me?: User | undefined;
  handle: string;
  isPrivate?: boolean;
  notify: (message: string) => void;
  onSignedOut: () => Promise<void> | void;
  onChanged: () => Promise<void> | void;
}) {
  const account = state.account;
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState("");
  const change = useSubmit(async () => {
    await authApi("/auth/password", { current, next });
    setCurrent("");
    setNext("");
    notify("Password changed. Other devices were signed out.");
    await onChanged();
  });
  async function signOut(everywhere: boolean) {
    try {
      await authApi(everywhere ? "/auth/logout-everywhere" : "/auth/logout", {});
      await onSignedOut();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <section className="account-panel" aria-labelledby="account-title">
      <header className="identity-head">
        <span className="eyebrow">ACCOUNT</span>
        <h1 id="account-title">Your account</h1>
      </header>
      {me && <ProfileBasics key={me.id} me={me} notify={notify} onChanged={onChanged} />}
      <div className="identity-panel">
        <h2>
          <Lock size={18} /> Privacy
        </h2>
        <label className="privacy-switch">
          <input
            type="checkbox"
            role="switch"
            checked={isPrivate}
            onChange={async (e) => {
              const on = e.target.checked;
              try {
                await api("/account/privacy", { private: on });
                notify(
                  on
                    ? "Your account is private. New followers need your OK."
                    : "Your account is public. Waiting requests were accepted.",
                );
                await onChanged();
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          />
          <span>
            <strong>Private account</strong>
            <small>
              Only followers you accept see your posts. Your profile page, name and bio stay
              visible.
            </small>
          </span>
        </label>
      </div>
      {account?.email && <EmailPrefsPanel notify={notify} />}
      <div className="identity-panel">
        <h2>
          <ShieldCheck size={18} /> Sign-in
        </h2>
        {account?.email ? (
          <>
            <p>
              {account.email}{" "}
              {account.emailVerified ? (
                <span className="decoration-on">Confirmed</span>
              ) : (
                <span className="decoration-lock">Not confirmed yet</span>
              )}
            </p>
            {!account.hasPassword && (
              <p className="fineprint">
                You sign in with Google.{" "}
                <button
                  className="text-button"
                  onClick={async () => {
                    await authApi("/auth/forgot", { email: account.email });
                    notify("We emailed you a link to set a password.");
                  }}
                >
                  Set a password too
                </button>
              </p>
            )}
          </>
        ) : (
          <p className="fineprint">
            This demo account has no email or password. Sign up to try real accounts.
          </p>
        )}
      </div>
      {account?.hasPassword && (
        <form className="identity-panel identity-form" onSubmit={change.submit}>
          <h2>
            <KeyRound size={18} /> Change password
          </h2>
          <label>
            Current password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              required
              type="password"
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          {change.error && (
            <p className="form-error" role="alert">
              {change.error}
            </p>
          )}
          <button className="primary" disabled={change.busy}>
            Change password
          </button>
        </form>
      )}
      <div className="identity-panel account-actions">
        <button className="quiet-button" onClick={() => void signOut(false)}>
          <LogOut size={16} /> Log out
        </button>
        <button className="text-button" onClick={() => void signOut(true)}>
          Log out on every device
        </button>
      </div>
      <BlockedList notify={notify} />
      <DeleteAccount
        hasPassword={!!account?.hasPassword}
        handle={handle}
        onDeleted={async () => {
          await onSignedOut();
          notify("Your account was deleted.");
        }}
      />
    </section>
  );
}
