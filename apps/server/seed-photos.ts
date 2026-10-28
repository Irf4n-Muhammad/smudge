import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SocialService } from "../../packages/core/src/social.js";
import type { User } from "../../packages/contracts/src/experience.js";
import { buildPost, startPostDesign } from "../../packages/core/src/easy-post.js";
import type { PostDesign, PostStyle } from "../../packages/core/src/easy-post.js";

// Real faces and real photos, so the playground reads like a lived-in network instead of
// placeholders. Every image is bundled from Unsplash (see assets/demo/CREDITS.md).
const id = (n: number) => `10000000-0000-4000-8000-${String(200 + n).padStart(12, "0")}`;

const faces: Record<string, string> = {
  you: "alex",
  maya: "maya",
  leo: "leo",
  ines: "ines",
  raka: "kai",
  sofi: "sofi",
  dani: "dani",
  nadia: "nadia",
  arif: "arif",
};
const photos = [
  "coffee-cheers",
  "long-table",
  "beach-sunset",
  "gig",
  "latte",
  "cafe-room",
  "cat",
  "dog",
  "skate",
  "mountains",
  "above-clouds",
  "summit-friends",
  "bookshelf",
  "library",
  "french-toast",
  "workshop",
  "talk",
  "grill",
  "dinner-plate",
  "salad",
  "city",
  "stage-lights",
  "friends-hill",
  "crowd-party",
  // Dani's chapters (ADR 0052); also stored by seedDaniPage for data dirs seeded earlier.
  "run-shoes",
  "laptop-code",
  "dj-hands",
] as const;
type Photo = (typeof photos)[number];
export type PhotoName = Photo;
export const photoId = (name: Photo) => id(20 + photos.indexOf(name));
const faceId = (name: string) => id(Object.values(faces).indexOf(name));

const people: User[] = [
  {
    id: "sofi",
    name: "Sofi Ruiz",
    handle: "sofi.paints",
    initials: "SR",
    color: "#cfe3f2",
    bio: "Murals, fostered cats and too much coffee.",
  },
  {
    id: "dani",
    name: "Dani Saputra",
    handle: "danisaputra",
    initials: "DS",
    color: "#e8dcc8",
    bio: "Skate, film cameras, Bandung → Jakarta.",
  },
  {
    id: "nadia",
    name: "Nadia Putri",
    handle: "nadiaputri",
    initials: "NP",
    color: "#f4d6dc",
    bio: "Front row at every gig. Cooks for everyone on Sundays.",
  },
  {
    id: "arif",
    name: "Arif Rahman",
    handle: "arif.brews",
    initials: "AR",
    color: "#dfe7d6",
    bio: "Left the office, opened a tiny coffee bar. Ask me about beans.",
  },
];

type Entry = {
  owner: string;
  style: PostStyle;
  design: Partial<PostDesign> & { headline: string };
  pics: [Photo, string][];
  caption: string;
  likes: string[];
  comments: [string, string][];
};
const entries: Entry[] = [
  {
    owner: "arif",
    style: "magazine",
    design: {
      kicker: "Six months in",
      headline: "I quit my job to open a *tiny coffee bar*",
      text: "Eight seats, one grinder and a landlord who believed us.\n\nThe first week we sold forty cups. Last Saturday we ran out of milk by noon. Nobody tells you the hardest part is closing on time.",
      quote: "Nobody tells you the hardest part is closing on time.",
    },
    pics: [
      ["cafe-room", "Before we opened the doors"],
      ["latte", "Flat white, the one people come back for"],
    ],
    caption: "Half a year of Arif Brews. Thank you for every cup ☕",
    likes: ["maya", "leo", "nadia", "dani", "you"],
    comments: [
      ["nadia", "Still the best flat white in town, no debate"],
      ["you", "Proud of you man. See you Saturday"],
    ],
  },
  {
    owner: "nadia",
    style: "poster",
    design: {
      kicker: "Last night",
      headline: "Front row, *finally*",
      text: "Three years of buying tickets too late. Not this time.",
    },
    pics: [["gig", ""]],
    caption: "Voice gone. Worth it.",
    likes: ["maya", "dani", "sofi"],
    comments: [["maya", "The lights in this one 😭"]],
  },
  {
    owner: "sofi",
    style: "scrapbook",
    design: {
      kicker: "Foster diary",
      headline: "Week two with *Miso and Bean*",
      text: "Miso finally sleeps on the couch. Bean still steals socks.",
      quote: "They're both up for adoption!",
    },
    pics: [
      ["cat", "Miso, very serious"],
      ["dog", "Bean after the park"],
    ],
    caption: "Both still looking for a home. DM me 🐾",
    likes: ["ines", "you", "nadia", "leo"],
    comments: [
      ["ines", "Miso's face 🥹"],
      ["arif", "Bean can visit the coffee bar any time"],
    ],
  },
  {
    owner: "leo",
    style: "gallery",
    design: { kicker: "Photo dump", headline: "Summit at *5am*" },
    pics: [
      ["mountains", "The plan"],
      ["above-clouds", "Above it all"],
      ["summit-friends", "Worth every step"],
    ],
    caption: "Legs are done. Heart is full.",
    likes: ["maya", "you", "dani"],
    comments: [["dani", "Next time I'm coming, no excuses"]],
  },
  {
    owner: "dani",
    style: "poster",
    design: {
      kicker: "Golden hour",
      headline: "Sunset *session*",
      text: "Same ledge, new trick. Took forty tries.",
    },
    pics: [["skate", ""]],
    caption: "Forty tries. Don't ask about the first thirty-nine.",
    likes: ["nadia", "leo"],
    comments: [],
  },
  {
    owner: "ines",
    style: "magazine",
    design: {
      kicker: "Reading list",
      headline: "Five books that *changed* my year",
      text: "I read less this year, but better. These are the five I keep pressing into friends' hands.\n\nNone of them are new. All of them are short.",
      quote: "Read less, but better.",
    },
    pics: [
      ["bookshelf", "The shelf that keeps growing"],
      ["library", "Where I hide on Sundays"],
    ],
    caption: "Tell me yours, I need a new one for the train.",
    likes: ["sofi", "maya"],
    comments: [["maya", "Saving this for the holidays"]],
  },
  {
    owner: "maya",
    style: "gallery",
    design: { kicker: "Sunday", headline: "Lisbon, *slowly*" },
    pics: [
      ["coffee-cheers", "First stop"],
      ["long-table", "Lunch that turned into dinner"],
      ["beach-sunset", "And then this"],
    ],
    caption: "No plan was the plan.",
    likes: ["you", "leo", "ines", "sofi", "arif"],
    comments: [
      ["leo", "That table looks like a good decision"],
      ["you", "Take me next time"],
    ],
  },
  {
    owner: "nadia",
    style: "gallery",
    design: { kicker: "Masak-masak", headline: "Sunday dinner *for eight*" },
    pics: [
      ["grill", "Sate, obviously"],
      ["dinner-plate", "Mum's recipe, my mess"],
      ["salad", "Something green for balance"],
    ],
    caption: "Cooked for everyone again. Who's hosting next week?",
    likes: ["arif", "dani", "you"],
    comments: [["arif", "I'll bring the coffee"]],
  },
  {
    owner: "raka",
    style: "magazine",
    design: {
      kicker: "Recap",
      headline: "Our first *zine workshop*",
      text: "Twenty strangers, one long table, a lot of glue.\n\nEveryone left with a zine they made themselves. Next one is in November.",
      quote: "Everyone left with something they made.",
    },
    pics: [
      ["workshop", "Cutting and pasting"],
      ["talk", "Show and tell at the end"],
    ],
    caption: "Thank you to everyone who came. Spots for November open soon.",
    likes: ["sofi", "ines"],
    comments: [["sofi", "I'm signing up the second it opens"]],
  },
  {
    owner: "you",
    style: "poster",
    design: {
      kicker: "Hot take",
      headline: "Breakfast is the *best* meal",
      text: "I will not be taking questions.",
    },
    pics: [["french-toast", ""]],
    caption: "Fight me in the comments.",
    likes: ["maya", "arif"],
    comments: [
      ["leo", "Dinner. Always dinner."],
      ["maya", "Agree, if it's this one"],
    ],
  },
  {
    owner: "arif",
    style: "poster",
    design: {
      kicker: "Week one",
      headline: "New city, *new desk*",
      text: "Roasting trip turned into a month. The view helps.",
    },
    pics: [["city", ""]],
    caption: "Back soon, the bar is in good hands.",
    likes: ["nadia"],
    comments: [],
  },
  {
    owner: "dani",
    style: "gallery",
    design: { kicker: "Reunion", headline: "Class of '22, *still here*" },
    pics: [
      ["friends-hill", "Same people, older knees"],
      ["crowd-party", "It got loud"],
      ["stage-lights", "Someone booked a band"],
    ],
    caption: "Four years later and nobody changed. In a good way.",
    likes: ["nadia", "leo", "you", "sofi"],
    comments: [["nadia", "Already planning the next one"]],
  },
];

/** Faces for every demo person and a feed full of real photos. Added once, also to existing data. */
export function seedPhotos(service: SocialService) {
  const store = service.store;
  if (store.get("system", "seed-photos-v1")) return;
  const image = (path: string, assetId: string, name: string) => {
    if (!store.get("asset", assetId))
      store.put("asset", assetId, {
        id: assetId,
        ownerId: "shared",
        name,
        mime: "image/jpeg",
        base64: readFileSync(resolve(path)).toString("base64"),
      });
  };
  store.transaction(() => {
    for (const face of Object.values(faces))
      image(`assets/demo/people/${face}.jpg`, faceId(face), `${face}.jpg`);
    for (const photo of photos)
      image(`assets/demo/photos/${photo}.jpg`, photoId(photo), `${photo}.jpg`);
    for (const person of people)
      if (!store.get("user", person.id)) store.put("user", person.id, person);
    for (const [userId, face] of Object.entries(faces)) {
      const user = store.get<User>("user", userId);
      // A face someone picked for themselves stays.
      if (user && !user.avatarAssetId)
        store.put("user", userId, { ...user, avatarAssetId: faceId(face) });
    }
  });
  const exists = (userId: string) => !!store.get("user", userId);
  for (const e of entries) {
    if (!exists(e.owner)) continue;
    const actor = { userId: e.owner };
    const built = buildPost(
      startPostDesign(e.style, {
        ...e.design,
        photos: e.pics.map(([photo, caption]) => ({ assetId: photoId(photo), caption })),
      }),
    );
    const draft = service.createDraft(actor, {
      package: built.package,
      metadata: { ...built.metadata, caption: e.caption, contributors: [] },
    });
    const post = service.publish(actor, draft.id, draft.revision);
    for (const userId of e.likes) if (exists(userId)) service.toggle({ userId }, post.id, "like");
    for (const [userId, text] of e.comments)
      if (exists(userId)) service.comment({ userId }, post.id, text);
  }
  // Everyone knows a few people, so feeds, suggestions and Following all have something in them.
  const follows: [string, string[]][] = [
    ["you", ["arif", "nadia", "sofi"]],
    ["maya", ["arif", "sofi", "you"]],
    ["leo", ["dani", "you"]],
    ["ines", ["sofi", "maya"]],
    ["sofi", ["ines", "raka", "you"]],
    ["dani", ["nadia", "leo", "arif"]],
    ["nadia", ["dani", "arif", "maya"]],
    ["arif", ["nadia", "you", "maya"]],
  ];
  // follow() toggles, so only ask when not already following.
  for (const [userId, targets] of follows)
    for (const target of targets)
      if (exists(userId) && exists(target) && !store.get("follow", `${userId}:${target}`))
        service.follow({ userId }, target);
  store.transaction(() => store.put("system", "seed-photos-v1", { complete: true }));
}
