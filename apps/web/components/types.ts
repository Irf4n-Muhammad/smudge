import type { User } from "../../../packages/contracts/src/experience";
import type { SidesView } from "../../../packages/contracts/src/sides";
export type Boot = {
  actor: { userId: string };
  users: User[];
  following: string[];
  /** Private accounts you asked to follow that haven't answered. */
  requested: string[];
  assets: { id: string; name: string; mime: string }[];
  /** Your sides and the active one (ADR 0027). */
  sides: SidesView;
};
/** The side a post carries, when it is not Everyday; set by the feed route. */
export type SideTag = {
  side?: { id: string; name: string; accent: string } | undefined;
  /** The writer also shares it to Everyday. */
  shared?: boolean | undefined;
};
export const labels: Record<string, string> = {
  scrapbook: "Scrapbook",
  story: "Choose your story",
  collaborative: "Made together",
  photo: "Photo gallery",
  custom: "Something different",
};
