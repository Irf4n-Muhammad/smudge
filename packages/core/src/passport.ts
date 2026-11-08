import type { User } from "../../contracts/src/experience.js";
import { collectionById, orgById } from "../../contracts/src/identity.js";
import type { Chapter } from "../../contracts/src/identity.js";
import type { EventTickets, Ticket } from "../../contracts/src/org-rooms.js";
import type { Actor } from "./index.js";
import type { IdentityService } from "./identity.js";
import type { OrgEventsService } from "./org-events.js";
import type { OrgService } from "./orgs.js";
import { AppError } from "./social.js";
import type { SocialService } from "./social.js";

type StampKind = "crew" | "went" | "hunt" | "stamp";
const kindOf = (collection?: string): StampKind =>
  collection?.startsWith("crew-")
    ? "crew"
    : collection?.startsWith("went-")
      ? "went"
      : collection?.startsWith("hunt-")
        ? "hunt"
        : "stamp";

/**
 * A fan passport: everything someone did with the organisations they belong to, on one page.
 * Their roles, the stamps they earned (crew, came, found the hunt), the stub of every event they
 * walked into, and, for their eyes only, the people they met there. It shows only what the
 * viewer may see of their chapters, the same as their profile.
 */
export class PassportService {
  constructor(
    private readonly social: SocialService,
    private readonly identity: IdentityService,
    private readonly orgs: OrgService,
    private readonly events: OrgEventsService,
  ) {}
  private get store() {
    return this.social.store;
  }
  passport(actor: Actor, handle: string) {
    const viewer = this.social.actor(actor);
    const owner = this.store
      .all<User>("user")
      .find((u) => u.handle.toLowerCase() === handle.replace(/^@/, "").toLowerCase());
    if (!owner || this.orgs.blockedEither(viewer, owner.id)) throw new AppError("NOT_FOUND", 404);
    const chapters = this.identity
      .chaptersFor(actor, owner.id)
      .filter((c) => c.orgId && orgById(c.orgId));
    const byOrg = new Map<string, Chapter[]>();
    for (const c of chapters) byOrg.set(c.orgId!, [...(byOrg.get(c.orgId!) ?? []), c]);
    const orgs = [...byOrg].map(([orgId, held]) => {
      const org = orgById(orgId)!;
      return {
        id: org.id,
        name: org.name,
        kind: org.kind,
        roles: held
          .filter((c) => c.kind === "member" || c.kind === "title")
          .map((c) => ({
            label: c.label,
            ...(c.line ? { line: c.line } : {}),
            ...(c.from === undefined ? {} : { from: c.from }),
          })),
        stamps: held
          .filter((c) => c.kind === "stamp")
          .map((c) => ({
            kind: kindOf(c.collection),
            label: c.label,
            name:
              collectionById(c.collection ?? "")?.stamps.find((s) => s.id === c.stamp)?.name ??
              c.label,
            ...(c.from === undefined ? {} : { from: c.from }),
            at: c.createdAt,
          })),
      };
    });
    orgs.sort((a, b) => b.stamps.length - a.stamps.length || a.name.localeCompare(b.name));

    // A stub for each event they walked into, numbered by the order people came through the door.
    const tickets = this.store.all<Ticket>("event-ticket");
    const stubs = chapters
      .filter((c) => c.kind === "stamp" && kindOf(c.collection) === "went" && c.stamp)
      .flatMap((c) => {
        const setup = this.store.get<EventTickets>("event-tickets", `${c.orgId}:${c.stamp}`);
        const mine = tickets.find(
          (t) => t.orgId === c.orgId && t.stampId === c.stamp && t.userId === owner.id,
        );
        if (!setup || !mine?.arrivedAt) return [];
        const door =
          tickets.filter(
            (t) =>
              t.orgId === c.orgId &&
              t.stampId === c.stamp &&
              t.arrivedAt &&
              t.arrivedAt <= mine.arrivedAt!,
          ).length || 1;
        return [
          {
            org: orgById(c.orgId!)!.name,
            orgId: c.orgId!,
            event:
              collectionById(c.collection!)?.stamps.find((s) => s.id === c.stamp)?.name ?? c.label,
            when: setup.when,
            place: setup.place,
            door,
          },
        ];
      })
      .sort((a, b) => b.when.localeCompare(a.when));

    // The people they met stay theirs: nobody else sees who they swapped with.
    const users = new Map(this.store.all<User>("user").map((u) => [u.id, u]));
    const met =
      viewer === owner.id
        ? this.events.meetings(owner.id).flatMap((m) => {
            const other = users.get(m.people[0] === owner.id ? m.people[1] : m.people[0]);
            const event = collectionById(`crew-${m.orgId}`.slice(0, 40))?.stamps.find(
              (s) => s.id === m.stampId,
            );
            return other
              ? [
                  {
                    id: other.id,
                    name: other.name,
                    handle: other.handle,
                    event: event?.name ?? "",
                    org: orgById(m.orgId)?.name ?? "",
                    at: m.at,
                  },
                ]
              : [];
          })
        : [];
    return {
      owner: { id: owner.id, name: owner.name, handle: owner.handle },
      mine: viewer === owner.id,
      totals: {
        orgs: orgs.length,
        events: stubs.length,
        stamps: orgs.reduce((n, o) => n + o.stamps.length, 0),
        met: met.length,
      },
      orgs,
      stubs,
      met,
    };
  }
}
