import type { User } from "../../../packages/contracts/src/experience";
export type Boot = {
  actor: { userId: string };
  users: User[];
  following: string[];
  assets: { id: string; name: string; mime: string }[];
};
export const labels: Record<string, string> = {
  scrapbook: "Scrapbook",
  story: "Choose your story",
  collaborative: "Made together",
  photo: "A moment",
  custom: "Something different",
};
