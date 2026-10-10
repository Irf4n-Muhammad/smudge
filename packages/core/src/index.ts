import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { postPackageSchema } from "../../contracts/src/index.js";
import type { OperationEvent, PostPackage } from "../../contracts/src/index.js";

/** Supplied by a trusted auth adapter, NEVER deserialized from a client body. */
export interface Actor {
  userId: string;
}

export class DomainError extends Error {
  constructor(
    public readonly code: NonNullable<OperationEvent["errorCode"]>,
    public readonly traceId: string,
  ) {
    super(code);
    this.name = "DomainError";
  }
}

interface Draft {
  id: string;
  ownerId: string;
  postPackage: PostPackage;
}

export interface PublishedPost {
  id: string;
  draftId: string;
  ownerId: string;
  packageDigest: string;
  postPackage: PostPackage;
}

function digest(postPackage: PostPackage): string {
  // Explicit ordering keeps the identity independent of object insertion order.
  const canonical = {
    manifest: {
      schemaVersion: postPackage.manifest.schemaVersion,
      runtimeVersion: postPackage.manifest.runtimeVersion,
      name: postPackage.manifest.name,
      entrypoint: postPackage.manifest.entrypoint,
      capabilities: [...postPackage.manifest.capabilities].sort(),
    },
    files: Object.entries(postPackage.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Local executable model only: no persistence, transport, or safe code execution. */
export class InMemoryPostService {
  private readonly drafts = new Map<string, Draft>();
  private readonly publishedByDraft = new Map<string, PublishedPost>();
  private readonly events: OperationEvent[] = [];

  getEvents(): OperationEvent[] {
    return structuredClone(this.events);
  }

  createDraft(actor: Actor | null, input: unknown): { draftId: string; traceId: string } {
    const traceId = randomUUID();
    const started = performance.now();
    if (!actor?.userId.trim()) {
      this.fail("UNAUTHENTICATED", traceId, "create_draft", "authorize", started);
    }
    const parsed = postPackageSchema.safeParse(input);
    if (!parsed.success) {
      this.fail("PACKAGE_INVALID", traceId, "create_draft", "validate_package", started);
    }
    const draftId = randomUUID();
    this.drafts.set(draftId, {
      id: draftId,
      ownerId: actor.userId,
      postPackage: structuredClone(parsed.data),
    });
    this.events.push({
      traceId,
      operation: "create_draft",
      stage: "commit",
      outcome: "success",
      durationMs: performance.now() - started,
    });
    return { draftId, traceId };
  }

  publish(actor: Actor | null, draftId: string): { post: PublishedPost; traceId: string } {
    const traceId = randomUUID();
    const started = performance.now();
    if (!actor?.userId.trim()) {
      this.fail("UNAUTHENTICATED", traceId, "publish_post", "authorize", started);
    }
    const draft = this.drafts.get(draftId);
    // A foreign private draft must not be distinguishable from a missing draft.
    if (!draft || draft.ownerId !== actor.userId) {
      this.fail("NOT_FOUND", traceId, "publish_post", "authorize", started);
    }
    const parsed = postPackageSchema.safeParse(draft.postPackage);
    if (!parsed.success) {
      this.fail("PACKAGE_INVALID", traceId, "publish_post", "validate_package", started);
    }
    let post = this.publishedByDraft.get(draftId);
    if (!post) {
      post = {
        id: randomUUID(),
        draftId,
        ownerId: actor.userId,
        packageDigest: digest(parsed.data),
        postPackage: structuredClone(parsed.data),
      };
      this.publishedByDraft.set(draftId, post);
    }
    this.events.push({
      traceId,
      operation: "publish_post",
      stage: "commit",
      outcome: "success",
      durationMs: performance.now() - started,
      packageDigest: post.packageDigest,
    });
    return { post: structuredClone(post), traceId };
  }

  private fail(
    code: NonNullable<OperationEvent["errorCode"]>,
    traceId: string,
    operation: OperationEvent["operation"],
    stage: OperationEvent["stage"],
    started: number,
  ): never {
    this.events.push({
      traceId,
      operation,
      stage,
      outcome: "failure",
      durationMs: performance.now() - started,
      errorCode: code,
    });
    throw new DomainError(code, traceId);
  }
}
