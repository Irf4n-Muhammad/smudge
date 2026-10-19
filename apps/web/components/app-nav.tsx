"use client";
import {
  BadgeCheck,
  Bookmark,
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
import type { ComponentType } from "react";
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
    ["moment", Gift, "Share a moment"],
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
