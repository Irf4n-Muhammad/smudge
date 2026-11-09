/** A person on a feed surprise card, as the viewer may see them. */
export interface SurprisePerson {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string;
}

/** Something people you know just did that touches you, shown between feed posts. */
export interface Surprise {
  id: string;
  kind: "version-of-yours" | "answered-yours" | "same-plan" | "friend-version";
  /** The post a tap opens: the newest version for versions, otherwise the post itself. */
  postId: string;
  title: string;
  /** Up to three people, newest first. */
  people: SurprisePerson[];
  /** Everyone the viewer may see who did it. */
  count: number;
  at: string;
}
