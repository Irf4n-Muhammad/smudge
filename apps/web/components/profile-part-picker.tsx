"use client";
import { useState } from "react";
import { partSlots, type ProfilePackage } from "../../../packages/contracts/src/profile";

type Slot = (typeof partSlots)[number];
const labels: Record<Slot, string> = {
  profile: "Profile",
  post: "Posts",
  story: "Stories",
  feature: "Feature",
};
const descriptions: Record<Slot, string> = {
  profile: "Your introduction, artwork and identity.",
  post: "How your published posts appear on this profile.",
  story: "The highlights visitors can open.",
  feature: "Something visitors can do together.",
};
export function ProfilePartPicker({
  pkg,
  templates,
  disabled,
  onChoose,
}: {
  pkg: ProfilePackage;
  templates: Record<string, ProfilePackage>;
  disabled: boolean;
  onChoose: (slot: Slot, donor: ProfilePackage | null) => void;
}) {
  const [slot, setSlot] = useState<Slot>("profile");
  if (pkg.manifest.schemaVersion !== 2) return null;
  const selected = pkg.manifest.parts[slot];
  const choices = Object.entries(templates).filter(
    ([, p]) => p.manifest.schemaVersion === 2 && p.manifest.parts[slot],
  );
  return (
    <fieldset className="part-workbench" disabled={disabled}>
      <legend>Make it yours</legend>
      <div className="part-surface-tabs" aria-label="Choose a surface">
        {partSlots.map((s) => (
          <button type="button" key={s} aria-pressed={slot === s} onClick={() => setSlot(s)}>
            {labels[s]}
          </button>
        ))}
      </div>
      <p>
        {descriptions[slot]}{" "}
        <span>Only this part changes. Layout sketches below; see the full result in preview.</span>
      </p>
      <div className="part-choices">
        {choices.map(([key, p]) => {
          const part = p.manifest.schemaVersion === 2 ? p.manifest.parts[slot] : undefined;
          const active =
            selected?.entrypoint === part?.entrypoint &&
            selected?.name === part?.name &&
            pkg.files[selected!.entrypoint] === p.files[part!.entrypoint];
          return (
            <button
              type="button"
              key={key}
              aria-pressed={active}
              aria-label={`Use ${part?.name}`}
              onClick={() => onChoose(slot, p)}
            >
              <span
                className={`part-swatch part-swatch-${slot} ${key === "raka" ? "ink" : key === "stack" ? "stack" : "plain"}`}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
                <b>{slot === "feature" ? "✎" : slot === "profile" ? "Aa" : ""}</b>
              </span>
              <strong>{part?.name}</strong>
              <small>{active ? "In this draft" : "Try in preview"}</small>
            </button>
          );
        })}
        <button
          type="button"
          className="part-remove"
          aria-pressed={!selected}
          onClick={() => onChoose(slot, null)}
        >
          <span aria-hidden="true">−</span>
          <strong>Without this part</strong>
          <small>{slot === "feature" ? "Drawings stay saved" : "Leave this surface empty"}</small>
        </button>
      </div>
      <label>
        Selected {labels[slot].toLowerCase()}
        <select
          aria-label={`${slot} part`}
          value="current"
          onChange={(e) => {
            const p = e.target.value === "none" ? null : templates[e.target.value];
            if (p !== undefined) onChoose(slot, p);
          }}
        >
          <option value="current">{selected?.name ?? "Not installed"}</option>
          {choices.map(([key, p]) => (
            <option key={key} value={key}>
              {p.manifest.schemaVersion === 2 ? p.manifest.parts[slot]?.name : key}
            </option>
          ))}
          <option value="none">Remove this part</option>
        </select>
      </label>
      <p className="part-preservation">
        Your posts, comments and published drawings stay with your profile. Preview drawings are
        practice only.
      </p>
      <details>
        <summary>Permissions and custom code</summary>
        <p>
          {pkg.manifest.capabilities.join(", ") || "None"}. Installed parts share these permissions.
          Import or use MCP for original parts; source editing remains available.
        </p>
      </details>
    </fieldset>
  );
}
