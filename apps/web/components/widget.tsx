"use client";
import { useEffect, useState } from "react";
import { Disc3, MapPin, MessageCircle, Sparkles } from "lucide-react";
import type { NowWidget } from "../../../packages/contracts/src/now";
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
 * One friend's page, live, the size of a home-screen widget (ADR 0042). It is the web face of
 * the widget: the native wrapper shows this URL, and until then it is a bookmark or a tab that
 * stays open. Polls every minute, opens the page on tap, needs no account.
 */
export function Widget({ handle }: { handle: string }) {
  const [view, setView] = useState<NowWidget | null | "missing">(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<NowWidget>(`/public/users/${encodeURIComponent(handle)}/widget`).then(
        (w) => alive && setView(w),
        () => alive && setView((v) => (v && v !== "missing" ? v : "missing")),
      );
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [handle]);
  if (view === null) return <div className="widget" aria-busy="true" />;
  if (view === "missing")
    return (
      <div className="widget widget-missing">
        <p>This page is not here.</p>
      </div>
    );
  const Icon = view.current ? icons[view.current.kind] : Sparkles;
  return (
    <a className="widget" href={`/u/${encodeURIComponent(view.user.handle)}`}>
      <header>
        <Avatar user={view.user as User} />
        <span>
          <strong>{view.user.name}</strong>
          <small>@{view.user.handle}</small>
        </span>
      </header>
      {view.current ? (
        <p className="widget-now">
          <Icon size={16} aria-hidden="true" />
          <span>{view.current.text}</span>
          <time dateTime={view.current.at}>{ago(view.current.at)}</time>
        </p>
      ) : (
        <p className="widget-now widget-quiet">
          <Sparkles size={16} aria-hidden="true" />
          <span>{view.user.bio || "Nothing noted yet."}</span>
        </p>
      )}
      {view.listening && (
        <p className="widget-song">
          <Disc3 size={14} aria-hidden="true" /> {view.listening.text}
          {view.listening.by && <small> · {view.listening.by}</small>}
        </p>
      )}
    </a>
  );
}
