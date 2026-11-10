"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, MessageSquareHeart, Repeat2 } from "lucide-react";
import type { Surprise } from "../../../packages/contracts/src/surprises";
import type { User } from "../../../packages/contracts/src/experience";
import { ago } from "./now";
import { api } from "./runtime";
import { Avatar } from "./ui";

/** Every this many posts, one surprise card, so the feed stays mostly posts. */
export const SURPRISE_EVERY = 5;

/** What people you know just did that touches you; reloads with the feed. */
export function useSurprises(active: boolean, reload: unknown) {
  const [list, setList] = useState<Surprise[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    api<Surprise[]>("/me/surprises").then(
      (rows) => alive && setList(rows),
      () => alive && setList([]),
    );
    return () => {
      alive = false;
    };
  }, [active, reload]);
  return active ? list : [];
}

/** "Ines, Maya and 2 others" */
function names(s: Surprise) {
  const first = s.people.map((p) => p.name.split(" ")[0]!);
  const rest = s.count - first.length;
  if (rest > 0) return `${first.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
  if (first.length === 1) return first[0]!;
  return `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`;
}

function sentence(s: Surprise) {
  const who = names(s);
  const many = s.count > 1;
  switch (s.kind) {
    case "version-of-yours":
      return `${who} made ${many ? "their versions" : "their version"} of your “${s.title}”`;
    case "answered-yours":
      return `${who} answered your “${s.title}”`;
    case "same-plan":
      return `${who} ${many ? "are" : "is"} in “${s.title}” too`;
    case "friend-version":
      return `${who} made their version of “${s.title}”`;
  }
}

const icons = {
  "version-of-yours": Repeat2,
  "friend-version": Repeat2,
  "answered-yours": MessageSquareHeart,
  "same-plan": CalendarCheck,
} as const;

export function SurpriseCard({ surprise, onOpen }: { surprise: Surprise; onOpen: () => void }) {
  const Icon = icons[surprise.kind];
  const text = sentence(surprise);
  return (
    <button className="feed-surprise" data-kind={surprise.kind} aria-label={text} onClick={onOpen}>
      <span className="feed-surprise-faces" aria-hidden="true">
        {surprise.people.map((p) => (
          <Avatar key={p.id} user={p as User} small />
        ))}
      </span>
      <span className="feed-surprise-text">
        <span>{text}</span>
        <small>
          <Icon size={12} aria-hidden="true" /> {ago(surprise.at)}
        </small>
      </span>
    </button>
  );
}
