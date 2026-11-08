import type { SocialService } from "../../packages/core/src/social.js";
import { buildPost, startPostDesign, type PostAsk } from "../../packages/core/src/easy-post.js";
import { photoId, type PhotoName } from "./seed-photos.js";

/**
 * Everyday posts: a photo and one question, the quickest thing to post, with a few friends
 * already answered so the box shows how people split. These are what Today's format leans on.
 */
const everyday: {
  owner: string;
  photo: PhotoName;
  question: string;
  ask: PostAsk;
  answered: [string, { pick?: string; score?: number; of?: number }][];
}[] = [
  {
    owner: "maya",
    photo: "french-toast",
    question: "Sweet or *savoury* breakfast?",
    ask: { kind: "poll", options: ["Sweet, always", "Savoury"] },
    answered: [
      ["leo", { pick: "Savoury" }],
      ["sofi", { pick: "Sweet, always" }],
      ["arif", { pick: "Sweet, always" }],
    ],
  },
  {
    owner: "nadia",
    photo: "bookshelf",
    question: "What should I read *next*?",
    ask: { kind: "open", options: [] },
    answered: [
      ["dani", { pick: "Piranesi" }],
      ["arif", { pick: "Anything by Ted Chiang" }],
    ],
  },
  {
    owner: "arif",
    photo: "run-shoes",
    question: "How *tired* am I after 21K?",
    ask: { kind: "slider", options: [], emoji: "🥵" },
    answered: [
      ["nadia", { score: 90, of: 100 }],
      ["maya", { score: 72, of: 100 }],
    ],
  },
];

export function seedEveryday(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-everyday-v1")) return;
  for (const e of everyday) {
    if (!store.get("user", e.owner) || !store.get("asset", photoId(e.photo))) continue;
    const actor = { userId: e.owner };
    const built = buildPost(
      startPostDesign("ask", {
        headline: e.question,
        photos: [{ assetId: photoId(e.photo), caption: "" }],
        ask: e.ask,
      }),
    );
    const draft = service.createDraft(actor, {
      package: built.package,
      metadata: { ...built.metadata, caption: "", contributors: [] },
    });
    service.publish(actor, draft.id, draft.revision, (post) => {
      for (const [userId, a] of e.answered)
        if (store.get("user", userId))
          store.put("answer", `${post.id}:${userId}`, {
            postId: post.id,
            userId,
            ...a,
            at: post.createdAt,
          });
    });
  }
  store.transaction(() => store.put("system", "seed-everyday-v1", { complete: true }));
}
