import { randomUUID } from "node:crypto";
import {
  nowInputSchema,
  type NowArchive,
  type NowLive,
  type NowView,
} from "../../contracts/src/now.js";
import type { Actor } from "./index.js";
import { AppError, GUEST, type SocialService } from "./social.js";

interface NowEntry extends NowView {
  userId: string;
}
const keep = 300;

/**
 * "Lagi ngapain": a one-tap note of what you are doing, listening to, where you are or what you
 * are thinking. Written for yourself; friends happen to see it. Entries never expire, so the page
 * becomes an archive of ordinary days next to the big moments (ADR 0041).
 */
export class NowService {
  constructor(
    private readonly social: SocialService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  /** Who may read someone's entries besides the owner; the server installs the privacy rules. */
  viewFilter: (viewerId: string, ownerId: string) => boolean = () => true;
  private get store() {
    return this.social.store;
  }
  private view({ userId: _u, ...rest }: NowEntry): NowView {
    return rest;
  }
  private mine(userId: string) {
    // Reversed before the stable sort, so two taps in the same second keep the later one first.
    return this.store
      .all<NowEntry>("now")
      .filter((e) => e.userId === userId)
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  add(actor: Actor, input: unknown): NowView {
    const me = this.social.actor(actor);
    const value = nowInputSchema.parse(input);
    const entry: NowEntry = {
      id: randomUUID(),
      userId: me,
      kind: value.kind,
      text: value.text,
      ...(value.by ? { by: value.by } : {}),
      at: this.now().toISOString(),
    };
    this.store.transaction(() => {
      this.store.put("now", entry.id, entry);
      // The archive is long, not endless.
      for (const old of this.mine(me).slice(keep)) this.store.remove("now", old.id);
    });
    return this.view(entry);
  }
  remove(actor: Actor, id: string) {
    const me = this.social.actor(actor);
    const entry = this.store.get<NowEntry>("now", id);
    if (!entry || entry.userId !== me) throw new AppError("NOT_FOUND", 404);
    this.store.transaction(() => this.store.remove("now", id));
    return { removed: true };
  }
  private canSee(viewerId: string, ownerId: string) {
    return viewerId === ownerId || this.viewFilter(viewerId, ownerId);
  }
  /** Someone's archive as this viewer may see it; a closed account reads as an empty one. */
  archive(viewerId: string, ownerId: string): NowArchive {
    if (!this.canSee(viewerId, ownerId)) return { current: null, entries: [], total: 0 };
    const entries = this.mine(ownerId).map((e) => this.view(e));
    return { current: entries[0] ?? null, entries, total: entries.length };
  }
  /** What the owner's page program may read (profile.read), for its "now" and "on repeat". */
  live(viewerId: string, ownerId: string): NowLive {
    const { entries } = this.archive(viewerId || GUEST, ownerId);
    const current = entries.find((e) => e.kind !== "listening") ?? null;
    const listening = entries.find((e) => e.kind === "listening") ?? null;
    return { current, listening, recent: entries.slice(0, 5) };
  }
  /** Runs inside the account deletion's transaction. */
  erase(userId: string) {
    for (const e of this.mine(userId)) this.store.remove("now", e.id);
  }
}
