import { orgById } from "../../contracts/src/identity.js";
import type { Store } from "./database.js";
import { AppError } from "./social.js";

/**
 * Counting the week 3 trial: a post shared to IG stories and one organisation's join link. Only
 * counts are kept or reported, never who; opens are tallied per day without any visitor id.
 */
const day = (iso: string | number | Date) => new Date(iso).toISOString().slice(0, 10);

/** Opens of a public post or organisation page, per day. Held in memory and written in batches. */
export class OpenCounter {
  private pending = new Map<string, number>();
  constructor(private readonly store: Store) {}
  count(kind: "post" | "org", id: string, at = new Date()) {
    const key = `${kind}:${id}:${day(at)}`;
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
  }
  flush() {
    if (!this.pending.size) return;
    const batch = this.pending;
    this.pending = new Map();
    this.store.transaction(() => {
      for (const [key, n] of batch) {
        const known = this.store.get<{ n: number }>("open-count", key)?.n ?? 0;
        this.store.put("open-count", key, { n: known + n });
      }
    });
  }
  opens(kind: "post" | "org", id: string) {
    const prefix = `${kind}:${id}:`;
    const byDay: Record<string, number> = {};
    for (const key of this.store.ids("open-count").filter((k) => k.startsWith(prefix)))
      byDay[key.slice(prefix.length)] = this.store.get<{ n: number }>("open-count", key)!.n;
    for (const [key, n] of this.pending)
      if (key.startsWith(prefix))
        byDay[key.slice(prefix.length)] = (byDay[key.slice(prefix.length)] ?? 0) + n;
    return byDay;
  }
}

interface Activity {
  userId: string;
  at: string;
}
/** Everything that shows someone used Smudge on a given day: answers, posts and comments. */
function activity(store: Store): Activity[] {
  return [
    ...store.all<{ userId: string; at: string }>("answer"),
    ...store
      .all<{ ownerId: string; createdAt: string }>("post")
      .map((p) => ({ userId: p.ownerId, at: p.createdAt })),
    ...store
      .all<{ userId: string; createdAt: string }>("comment")
      .map((c) => ({ userId: c.userId, at: c.createdAt })),
  ];
}
/** Of these people, how many did anything on a later day than the one they started. */
function cameBack(store: Store, started: Map<string, string>) {
  const all = activity(store);
  return [...started].filter(([userId, at]) =>
    all.some((a) => a.userId === userId && day(a.at) > day(at)),
  ).length;
}
function newAccount(store: Store, userId: string, since: string) {
  const credential = store.get<{ createdAt: string }>("credential", userId);
  return !!credential && Date.parse(credential.createdAt) >= Date.parse(since);
}

export interface PostTrial {
  title: string;
  opens: number;
  opensByDay: Record<string, number>;
  answered: number;
  newAccounts: number;
  cameBack: number;
  madeTheirOwn: number;
}
export function postTrial(store: Store, counter: OpenCounter, postId: string): PostTrial {
  const post = store.get<{ id: string; createdAt: string; metadata: { title: string } }>(
    "post",
    postId,
  );
  if (!post) throw new AppError("NOT_FOUND", 404);
  const answers = store.all<{ postId: string; userId: string; at: string }>("answer");
  const first = new Map<string, string>();
  for (const a of answers.filter((x) => x.postId === postId))
    if (!first.has(a.userId) || a.at < first.get(a.userId)!) first.set(a.userId, a.at);
  const opensByDay = counter.opens("post", postId);
  return {
    title: post.metadata.title,
    opens: Object.values(opensByDay).reduce((n, x) => n + x, 0),
    opensByDay,
    answered: first.size,
    newAccounts: [...first.keys()].filter((u) => newAccount(store, u, post.createdAt)).length,
    cameBack: cameBack(store, first),
    madeTheirOwn: new Set(
      store
        .all<{ ownerId: string; remixOf?: string }>("post")
        .filter((p) => p.remixOf === postId)
        .map((p) => p.ownerId),
    ).size,
  };
}

export interface OrgTrial {
  opens: number;
  opensByDay: Record<string, number>;
  joined: number;
  joinedByDay: Record<string, number>;
  newAccounts: number;
  cameBack: number;
}
export function orgTrial(store: Store, counter: OpenCounter, orgId: string): OrgTrial {
  if (!orgById(orgId)) throw new AppError("NOT_FOUND", 404);
  const joins = store
    .all<{
      ownerId: string;
      orgId?: string;
      kind: string;
      method: string;
      createdAt: string;
    }>("chapter")
    .filter((c) => c.orgId === orgId && c.kind === "member" && c.method === "invite");
  const first = new Map<string, string>();
  for (const c of joins)
    if (!first.has(c.ownerId) || c.createdAt < first.get(c.ownerId)!)
      first.set(c.ownerId, c.createdAt);
  const joinedByDay: Record<string, number> = {};
  for (const at of first.values()) joinedByDay[day(at)] = (joinedByDay[day(at)] ?? 0) + 1;
  const opensByDay = counter.opens("org", orgId);
  return {
    opens: Object.values(opensByDay).reduce((n, x) => n + x, 0),
    opensByDay,
    joined: first.size,
    joinedByDay,
    // Made an account at most a day before joining: they signed up to join.
    newAccounts: [...first].filter(([u, at]) =>
      newAccount(store, u, new Date(Date.parse(at) - 86_400_000).toISOString()),
    ).length,
    cameBack: cameBack(store, first),
  };
}
