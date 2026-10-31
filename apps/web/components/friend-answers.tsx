"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "./runtime";
import { answersChanged } from "./guest-answers";

type Answer = { userId: string; name: string; pick?: string; score?: number; of?: number };
type Answers = { count: number; mine: Answer | null; friends: Answer[] };

const said = (a: Answer) =>
  a.score !== undefined ? `${a.score}/${a.of}` : a.pick !== undefined ? a.pick : "";

/**
 * Under a post that takes answers: what you and the people you follow answered, and how many
 * played in all. `version` bumps when you answer, so the line catches up.
 */
export function FriendAnswers({ postId, version }: { postId: string; version: number }) {
  const [answers, setAnswers] = useState<Answers | null>(null),
    [claimed, setClaimed] = useState(0);
  useEffect(() => {
    const changed = (e: Event) => {
      if ((e as CustomEvent<string>).detail === postId) setClaimed((n) => n + 1);
    };
    window.addEventListener(answersChanged, changed);
    return () => window.removeEventListener(answersChanged, changed);
  }, [postId]);
  useEffect(() => {
    let live = true;
    api<Answers>(`/posts/${postId}/answers`)
      .then((a) => live && setAnswers(a))
      .catch(() => live && setAnswers(null));
    return () => {
      live = false;
    };
  }, [postId, version, claimed]);
  if (!answers || answers.count === 0) return null;
  const people = [...(answers.mine ? [{ ...answers.mine, name: "You" }] : []), ...answers.friends];
  return (
    <div className="moment-line friend-answers" aria-label="Answers from you and people you follow">
      <span className="moment-mark">
        <Users size={13} />
        {people.length ? (
          <span>
            {people.slice(0, 4).map((a, i) => (
              <span key={a.userId}>
                {i > 0 && " · "}
                <strong>{a.name}</strong> {said(a)}
              </span>
            ))}
            {people.length > 4 && ` · +${people.length - 4}`}
          </span>
        ) : null}
        <span>
          {people.length ? " · " : ""}
          {answers.count} {answers.count === 1 ? "person" : "people"} played
        </span>
      </span>
      {answers.mine && <small>People who follow you see your answer.</small>}
    </div>
  );
}
