"use client";
import { useEffect, useState } from "react";
import { Disc3, Sparkles } from "lucide-react";
import type { FriendNow } from "../../../packages/contracts/src/now";
import type { User } from "../../../packages/contracts/src/experience";
import { ago, nowIcons } from "./now";
import { api } from "./runtime";
import { Avatar } from "./ui";

/**
 * The first screen (ADR 0042): what the people you follow are up to, one tile each, newest
 * first, above the feed. A tap opens their page. Nothing shows until a friend has noted
 * something, so the row never looks empty.
 */
export function FriendsNow({
  onOpenUser,
  list = false,
}: {
  onOpenUser: (userId: string) => void;
  /** One row per friend under a heading, for the feed's side column on wide screens. */
  list?: boolean;
}) {
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
    <section
      className={list ? "friends-now friends-now-list" : "friends-now"}
      aria-label="Friends right now"
    >
      {list && <h3 className="home-aside-title">Right now</h3>}
      <ul>
        {rows.map(({ user, entry }) => {
          const Icon = nowIcons[entry.kind];
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
