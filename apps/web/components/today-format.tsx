"use client";
import { Sparkles } from "lucide-react";
import type { DecoratedPost } from "./post-decor";

export interface TodayView {
  date: string;
  post: DecoratedPost;
  played: number;
  mine: { pick?: string; score?: number; of?: number } | null;
  friends: { userId: string; name: string; handle: string; match: number | null }[];
  matches: { userId: string; name: string; handle: string; shared: number; percent: number }[];
}

/**
 * The line above today's format: everyone who can see it plays the same post today, so it says
 * which friends already did, and how much you tend to agree with the people you follow.
 */
export function TodayRibbon({ today, onUser }: { today: TodayView; onUser: (id: string) => void }) {
  const friends = today.friends.slice(0, 3);
  const best = today.matches[0];
  return (
    <section className="today-ribbon" aria-label="Today’s format">
      <header>
        <span className="today-tag">
          <Sparkles size={13} /> Today’s format
        </span>
        <small>
          {today.played
            ? `${today.played} ${today.played === 1 ? "person" : "people"} played it`
            : "Be the first to play it"}
        </small>
      </header>
      <p>
        {today.mine
          ? "You played it. See how your friends did below."
          : friends.length
            ? `${friends.map((f) => f.name.split(" ")[0]).join(", ")} already played. Your turn.`
            : "One format a day, the same for everyone. Play it, then compare with friends."}
      </p>
      {(friends.length > 0 || best) && (
        <ul className="today-matches">
          {friends.map((f) => (
            <li key={f.userId}>
              <button onClick={() => onUser(f.userId)}>
                <strong>{f.name.split(" ")[0]}</strong>
                <span>{f.match === null ? "played" : `${f.match}% match`}</span>
              </button>
            </li>
          ))}
          {best && !friends.some((f) => f.userId === best.userId) && (
            <li>
              <button onClick={() => onUser(best.userId)}>
                <strong>{best.name.split(" ")[0]}</strong>
                <span>
                  {best.percent}% match · {best.shared} {best.shared === 1 ? "format" : "formats"}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
