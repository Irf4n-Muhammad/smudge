"use client";
import {
  BadgeCheck,
  Bookmark,
  Check,
  CalendarDays,
  Gift,
  Globe,
  IdCard,
  Layers,
  LogIn,
  Palette,
  Settings,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { SeasonChip } from "./season";
import type { User } from "../../../packages/contracts/src/experience";

/**
 * The "More" menu: everything that is not one of the five main tabs. The feed shell shows it
 * behind the sidebar's More button on wide screens; the profile page shows it behind the ☰ so
 * a phone reaches the same places from the Profile tab, the way Instagram does.
 */
export type MoreKey =
  | "saved"
  | "decor"
  | "who"
  | "card"
  | "account"
  | "studio"
  | "moderation"
  | "moment"
  | "moments"
  | "import"
  | "signup"
  | "login";

export function moreItems(
  moderator: boolean,
): [MoreKey, ComponentType<{ size?: number }>, string][] {
  return [
    ["saved", Bookmark, "Saved"],
    ["decor", Palette, "Themes"],
    ["who", BadgeCheck, "Who you are"],
    ["card", IdCard, "Share card"],
    ["studio", Layers, "My studio"],
    ["moments", CalendarDays, "Moments"],
    ["moment", Gift, "Share a milestone"],
    ["import", Globe, "Import a website"],
    ["account", Settings, "Account settings"],
    ...(moderator ? [["moderation", ShieldCheck, "Moderation"] as const] : []),
  ] as [MoreKey, ComponentType<{ size?: number }>, string][];
}

export function MoreMenu({
  moderator,
  production,
  demo,
  onPick,
}: {
  moderator: boolean;
  production: boolean;
  /** The local playground's account switcher; absent in production. */
  demo?: { users: User[]; meId: string; onSwitch: (id: string) => void } | null;
  onPick: (key: MoreKey) => void;
}) {
  return (
    <div className="more-menu" role="group" aria-label="More">
      {moreItems(moderator).map(([key, I, label]) => (
        <button key={key} className="quiet-button" onClick={() => onPick(key)}>
          <I size={18} /> {label}
        </button>
      ))}
      <div className="more-menu-row">
        <ThemeToggle />
        <SeasonChip />
      </div>
      {demo && (
        <label className="more-menu-row more-switch">
          <span>Preview as</span>
          <select
            aria-label="Preview as demo account"
            value={demo.meId}
            onChange={(e) => demo.onSwitch(e.target.value)}
          >
            {demo.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!production && demo && (
        <div className="more-menu-row demo-auth">
          <button className="text-button signup-link" onClick={() => onPick("signup")}>
            <UserPlus size={14} /> Create an account
          </button>
          <button className="text-button signup-link" onClick={() => onPick("login")}>
            <LogIn size={14} /> Log in
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The rail's "Preview as": tap your photo, pick one of the demo people from a list with their
 * faces. A native select drew its options in the page's ink, which on night mode is white on the
 * browser's white popup.
 */
export function AccountSwitch({
  users,
  meId,
  onSwitch,
}: {
  users: User[];
  meId: string;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null);
  const me = users.find((u) => u.id === meId);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!me) return null;
  return (
    <div className="account-switch" ref={box}>
      <button
        className="account-switch-button"
        aria-label="Preview as demo account"
        title={`Previewing as ${me.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar user={me} />
        <span className="account-switch-text">
          <small>Preview as</small>
          <strong>{me.name}</strong>
        </span>
      </button>
      {/* In the body: the rail blurs and scrolls, which would clip a fixed menu inside it. */}
      {open &&
        createPortal(
          <div className="account-menu" role="menu" aria-label="Preview as" ref={list}>
            <span className="account-menu-label">Preview as</span>
            {users.map((u) => (
              <button
                key={u.id}
                role="menuitemradio"
                aria-checked={u.id === meId}
                aria-label={u.name}
                data-user={u.id}
                onClick={() => {
                  setOpen(false);
                  if (u.id !== meId) onSwitch(u.id);
                }}
              >
                <Avatar user={u} small />
                <span>{u.name}</span>
                {u.id === meId && <Check size={16} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
