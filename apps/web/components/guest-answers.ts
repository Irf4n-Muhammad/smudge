/**
 * A guest's progress and answer on a post, kept in this browser until they make an account, then
 * handed to it (`claimGuestAnswers`). Nothing here leaves the browser before that.
 */
type Kept = { progress?: unknown; answer?: unknown };
const key = (postId: string) => `smudge-guest:${postId}`;

function read(postId: string): Kept {
  try {
    return JSON.parse(localStorage.getItem(key(postId)) ?? "{}") as Kept;
  } catch {
    return {};
  }
}
function write(postId: string, kept: Kept) {
  try {
    localStorage.setItem(key(postId), JSON.stringify(kept));
  } catch {
    // Private windows may refuse storage; the guest still plays, it just isn't kept.
  }
}

/** Answers the post's own calls for a guest, or null when the method needs an account. */
export function guestCapability(postId: string, method: string, payload: unknown) {
  const kept = read(postId);
  if (method === "viewer.progress.read") return { value: kept.progress ?? {} };
  if (method === "viewer.progress.write") {
    write(postId, { ...kept, progress: payload });
    return { value: payload };
  }
  if (method === "answers.write") {
    write(postId, { ...kept, answer: payload });
    return { value: { count: 0, mine: payload, friends: [], guest: true } };
  }
  if (method === "answers.read")
    return { value: { count: 0, mine: kept.answer ?? null, friends: [], guest: true } };
  return null;
}
export function hasGuestAnswer(postId: string) {
  return read(postId).answer !== undefined;
}
/** After sign-up: moves what the guest did on this post to their account, then forgets it. */
export async function claimGuestAnswers(postId: string) {
  const kept = read(postId);
  if (kept.progress === undefined && kept.answer === undefined) return;
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kept),
  });
  if (!response.ok) return;
  try {
    localStorage.removeItem(key(postId));
  } catch {
    // Nothing to forget.
  }
  // Cards showing this post's answers fetch them again.
  window.dispatchEvent(new CustomEvent(answersChanged, { detail: postId }));
}
export const answersChanged = "smudge:answers-changed";
