"use client";
import { useEffect, useState } from "react";
import type { ProfileDraft, ProfileIdentity } from "../../../packages/contracts/src/profile";
import type { User } from "../../../packages/contracts/src/experience";
import {
  defaultProfileDesign,
  readProfileDesign,
  supportsProfileDesign,
  type ProfileDesign,
} from "../../../packages/core/src/profile-design";
import { api } from "./runtime";

type Media = { id: string; name: string; mime: string };
export function ProfilePersonalizer({
  draft,
  owner,
  disabled,
  onApply,
  onDirtyChange,
}: {
  draft: ProfileDraft;
  owner: User;
  disabled: boolean;
  onApply: (identity: ProfileIdentity, design: ProfileDesign | null) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initialIdentity = draft.identity ?? {
    name: owner.name,
    bio: owner.bio,
    avatarAssetId: owner.avatarAssetId ?? null,
  };
  const initialDesign = readProfileDesign(draft.package) ?? defaultProfileDesign;
  const supported = supportsProfileDesign(draft.package);
  const [identity, setIdentity] = useState<ProfileIdentity>(initialIdentity);
  const [design, setDesign] = useState<ProfileDesign>(initialDesign);
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const changed =
    JSON.stringify(identity) !== JSON.stringify(initialIdentity) ||
    JSON.stringify(design) !== JSON.stringify(initialDesign);
  useEffect(() => {
    onDirtyChange(changed);
  }, [changed, onDirtyChange]);
  useEffect(() => {
    void api<{ assets: Media[] }>("/bootstrap")
      .then((b) => setMedia(b.assets))
      .catch((e) => setError(e.message));
  }, []);
  function change<K extends keyof ProfileDesign>(key: K, value: ProfileDesign[K]) {
    setDesign((d) => ({ ...d, [key]: value }));
  }
  async function upload(file: File, avatar: boolean) {
    setUploading(true);
    setError("");
    try {
      if (file.size > 3_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG or WebP under 3 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]!);
        r.onerror = () => reject(new Error("Could not read image"));
        r.readAsDataURL(file);
      });
      const asset = await api<Media>("/assets", { name: file.name, mime: file.type, base64 });
      setMedia((m) => [...m, asset]);
      if (avatar) setIdentity((i) => ({ ...i, avatarAssetId: asset.id }));
      else change("illustrationAssetId", asset.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const range = (
    label: string,
    key: "illustrationX" | "illustrationY" | "illustrationScale" | "portraitSize" | "gap",
    min: number,
    max: number,
  ) => (
    <label>
      {label}
      <span className="personal-range">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          value={design[key]}
          onChange={(e) => change(key, Number(e.target.value))}
        />
        <output>{design[key]}</output>
      </span>
    </label>
  );
  return (
    <form
      className="profile-personalizer"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(identity, supported ? design : null);
      }}
    >
      <fieldset disabled={disabled || uploading}>
        <legend>Your identity & composition</legend>
        <p>Changes stay in this draft until you publish.</p>
        <details open>
          <summary>Identity</summary>
          <label>
            Display name
            <input
              aria-label="Profile display name"
              required
              maxLength={80}
              value={identity.name}
              onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
            />
          </label>
          <label>
            Bio
            <textarea
              aria-label="Profile bio"
              maxLength={300}
              rows={3}
              value={identity.bio}
              onChange={(e) => setIdentity({ ...identity, bio: e.target.value })}
            />
          </label>
          <label>
            Avatar
            <select
              aria-label="Profile avatar"
              value={identity.avatarAssetId ?? ""}
              onChange={(e) => setIdentity({ ...identity, avatarAssetId: e.target.value || null })}
            >
              <option value="">Use my initials</option>
              {media.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="personal-upload">
            Upload avatar
            <input
              aria-label="Upload profile avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file, true);
              }}
            />
          </label>
        </details>
        {supported && (
          <details>
            <summary>Composition</summary>
            <label>
              Introduction
              <select
                aria-label="Introduction alignment"
                value={design.alignment}
                onChange={(e) => change("alignment", e.target.value as ProfileDesign["alignment"])}
              >
                <option value="left">Left aligned</option>
                <option value="center">Centered</option>
              </select>
            </label>
            {range("Avatar size", "portraitSize", 80, 200)}
            <label>
              <input
                type="checkbox"
                checked={design.illustrationVisible}
                onChange={(e) => change("illustrationVisible", e.target.checked)}
              />
              Show header illustration
            </label>
            <label>
              Header illustration
              <select
                aria-label="Header illustration"
                value={design.illustrationAssetId ?? ""}
                onChange={(e) => change("illustrationAssetId", e.target.value || null)}
              >
                <option value="">Pencil illustration</option>
                {media.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="personal-upload">
              Upload illustration
              <input
                aria-label="Upload header illustration"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file, false);
                }}
              />
            </label>
            {range("Illustration horizontal position", "illustrationX", -100, 100)}
            {range("Illustration vertical position", "illustrationY", -80, 80)}
            {range("Illustration size", "illustrationScale", 50, 150)}
            <label>
              Post columns
              <select
                aria-label="Post columns"
                value={design.columns}
                onChange={(e) => change("columns", Number(e.target.value))}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "column" : "columns"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Card shape
              <select
                aria-label="Card shape"
                value={design.card}
                onChange={(e) => change("card", e.target.value as ProfileDesign["card"])}
              >
                <option value="cutout">Cut paper</option>
                <option value="straight">Straight</option>
                <option value="round">Rounded</option>
              </select>
            </label>
            {range("Space between posts", "gap", 8, 40)}
            <label>
              Highlights
              <select
                aria-label="Highlight shape"
                value={design.story}
                onChange={(e) => change("story", e.target.value as ProfileDesign["story"])}
              >
                <option value="circles">Circles</option>
                <option value="tiles">Tiles</option>
              </select>
            </label>
            <label>
              Highlight order
              <select
                aria-label="Highlight order"
                value={design.storyOrder}
                onChange={(e) =>
                  change("storyOrder", e.target.value as ProfileDesign["storyOrder"])
                }
              >
                <option value="original">Original order</option>
                <option value="reverse">Reverse order</option>
              </select>
            </label>
            <label>
              Accent
              <input
                aria-label="Profile accent"
                type="color"
                value={design.accent}
                onChange={(e) => change("accent", e.target.value)}
              />
            </label>
            <ol className="personal-order" aria-label="Surface order">
              {design.order.map((slot, index) => (
                <li key={slot}>
                  <span>
                    {
                      { profile: "Profile", post: "Posts", story: "Stories", feature: "Feature" }[
                        slot
                      ]
                    }
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${slot} up`}
                    disabled={index === 0}
                    onClick={() => {
                      const order = [...design.order];
                      [order[index - 1], order[index]] = [order[index]!, order[index - 1]!];
                      change("order", order);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${slot} down`}
                    disabled={index === 3}
                    onClick={() => {
                      const order = [...design.order];
                      [order[index], order[index + 1]] = [order[index + 1]!, order[index]!];
                      change("order", order);
                    }}
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
            <p>
              These controls arrange the layered version of this design. Custom source remains
              editable. Post controls apply to Cutouts and Straight; other mods keep their own
              behavior.
            </p>
          </details>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="profile-primary personal-apply"
          disabled={!changed && (!supported || Boolean(readProfileDesign(draft.package)))}
        >
          {uploading ? "Uploading…" : "Apply changes to preview"}
        </button>
        {changed && <small>Apply these changes before publishing or switching parts.</small>}
      </fieldset>
    </form>
  );
}
