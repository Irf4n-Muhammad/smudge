"use client";
import { useEffect, useState } from "react";

// Shared by the host pages of moments (ADR 0036) and the door screen (ADR 0038).
/** Signed in or not, for the host pages. */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch("/api/auth/state")
      .then((r) => r.json())
      .then((s: { signedIn?: boolean }) => setSignedIn(!!s.signedIn))
      .catch(() => setSignedIn(false));
  }, []);
  return signedIn;
}
export function HostShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="moments-host">
      <header className="share-bar">
        <a className="brand" href="/" aria-label="Smudge home">
          smudge.
        </a>
        <nav>
          <a href="/m">Your moments</a>
        </nav>
      </header>
      <main className="moments-main">{children}</main>
    </div>
  );
}
export function SignInFirst() {
  return (
    <HostShell>
      <h1>Moments</h1>
      <p>
        Log in to host a moment. <a href="/">Go to Smudge</a>
      </p>
    </HostShell>
  );
}
