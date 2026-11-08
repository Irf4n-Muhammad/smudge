const RETURN = "smudge-return";

/** An organisation link opened before signing in: remember it, sign in, come back to it. */
export function rememberReturnPath() {
  try {
    localStorage.setItem(RETURN, window.location.pathname + window.location.search);
  } catch {
    // The link still works; they just open it again.
  }
}
export function takeReturnPath() {
  try {
    const path = localStorage.getItem(RETURN);
    localStorage.removeItem(RETURN);
    return path?.startsWith("/o/") ? path : null;
  } catch {
    return null;
  }
}
/** True when signed in; otherwise remembers this page and sends them to sign in. */
export async function signedInOrSignIn() {
  const state = await fetch("/api/auth/state").then((r) => r.json());
  if (state.signedIn) return true;
  rememberReturnPath();
  window.location.assign("/");
  return false;
}
