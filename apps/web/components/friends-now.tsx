"use client";
import { useEffect, useState } from "react";
import { Disc3, MapPin, MessageCircle, Sparkles } from "lucide-react";
import type { FriendNow } from "../../../packages/contracts/src/now";
import type { User } from "../../../packages/contracts/src/experience";
import { ago } from "./now";
import { api } from "./runtime";
import { Avatar } from "./ui";

const icons = {
  listening: Disc3,
  doing: Sparkles,
  place: MapPin,
  thinking: MessageCircle,
} as const;

/**
 * The first screen (ADR 0042): what the people you follow are up to, one tile each, newest
 * first, above the feed. A tap opens their page. Nothing shows until a friend has noted
 * something, so the row never looks empty.
 */
export function FriendsNow({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const [rows, setRows] = useState<FriendNow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<FriendNow[]>("/me/friends-now").then(
        (list) => alive && setRows(list),
        () => alive && setRows([]),
      );
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!rows.length) return null;
  return (
    <section className="friends-now" aria-label="Friends right now">
      <ul>
        {rows.map(({ user, entry }) => {
          const Icon = icons[entry.kind];
          return (
            <li key={user.id}>
              <button
                className="friend-now"
                aria-label={`${user.name}: ${entry.text}`}
                onClick={() => onOpenUser(user.id)}
              >
                <Avatar user={user as User} />
                <strong>{user.name.split(" ")[0]}</strong>
                <span className="friend-now-text">
                  <Icon size={12} aria-hidden="true" /> {entry.text}
                  {entry.by && <small> · {entry.by}</small>}
                </span>
                <time dateTime={entry.at}>{ago(entry.at)}</time>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
