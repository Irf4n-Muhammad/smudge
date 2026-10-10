"use client";
import { useState } from "react";
import type { DraftView } from "../../../packages/contracts/src/experience";
import { api } from "./runtime";
export function ProfilePhotoComposer({
  disabled,
  onPublished,
}: {
  disabled: boolean;
  onPublished: () => Promise<void>;
}) {
  const [asset, setAsset] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ draft: DraftView; content: string } | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      if (file.size > 3_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG or WebP under 3 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]!);
        r.onerror = () => reject(new Error("Could not read file"));
        r.readAsDataURL(file);
      });
      const a = await api<{ id: string; name: string }>("/assets", {
        name: file.name,
        mime: file.type,
        base64,
      });
      setAsset(a);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 100));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!asset) return;
    setBusy(true);
    setMessage("");
    try {
      const input = {
        package: {
          manifest: {
            schemaVersion: 2,
            runtimeVersion: "web-v1",
            name: "Photo post",
            entrypoint: "index.html",
            assets: [asset.id],
            capabilities: [],
          },
          files: {
            "index.html": `<style>body{margin:0;background:transparent}img{display:block;width:100%;max-height:90vh;object-fit:contain}</style><img src="asset:${asset.id}" alt="Published photo">`,
          },
        },
        metadata: { title, caption, format: "photo", contributors: [], coverAssetId: asset.id },
      };
      const content = JSON.stringify(input);
      const d =
        pending?.content === content
          ? pending.draft
          : pending
            ? await api<DraftView>(
                `/drafts/${pending.draft.id}`,
                { ...input, revision: pending.draft.revision },
                "PUT",
              )
            : await api<DraftView>("/drafts", input);
      setPending({ draft: d, content });
      await api(`/drafts/${d.id}/publish`, { revision: d.revision });
      setPending(null);
      setAsset(null);
      setTitle("");
      setCaption("");
      await onPublished();
      setMessage("Photo published. It is now visible on your profile.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="profile-content">
      <summary>Add a photo post</summary>
      <p>Photo posts publish separately from your profile design.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <fieldset disabled={disabled || busy}>
          <label>
            Photo
            <input
              aria-label="New profile photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
          {asset && <img src={`/api/assets/${asset.id}`} alt="New photo preview" />}
          <label>
            Title
            <input
              aria-label="New photo title"
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Caption
            <textarea
              aria-label="New photo caption"
              maxLength={2000}
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          <button disabled={!asset || !title.trim()} className="profile-primary">
            {busy ? "Working…" : "Publish photo"}
          </button>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
