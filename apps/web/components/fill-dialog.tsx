"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./runtime";
import { Dialog } from "./ui";
import type { DraftView, PostView } from "../../../packages/contracts/src/experience";

export type FillField = {
  key: string;
  label: string;
  kind: "text" | "long" | "image";
  value: string;
};

async function uploadPhoto(file: File) {
  const mime = file.type as "image/jpeg" | "image/png" | "image/webp";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("Use a JPEG, PNG or WebP photo.");
  const base64 = btoa(
    Array.from(new Uint8Array(await file.arrayBuffer()), (b) => String.fromCharCode(b)).join(""),
  );
  return (await api<{ id: string }>("/assets", { name: file.name.slice(0, 120), mime, base64 })).id;
}

/**
 * Your own version of a fill-in format: the creator's fields as a form, posted in one go. The
 * code stays the creator's; "Edit the code" opens the plain copy in the studio instead.
 */
export function FillDialog({
  post,
  fields,
  onClose,
  onPosted,
  onCode,
}: {
  post: PostView;
  fields: FillField[];
  onClose: () => void;
  onPosted: (postId: string) => void;
  onCode: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [previews, setPreviews] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const shown = useRef<string[]>([]);
  useEffect(() => () => shown.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const value = (f: FillField) => values[f.key] ?? f.value;
  async function pick(f: FillField, file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const id = await uploadPhoto(file);
      setValues((v) => ({ ...v, [f.key]: id }));
      const url = URL.createObjectURL(file);
      shown.current.push(url);
      setPreviews((p) => ({ ...p, [f.key]: url }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const draft = await api<DraftView>(`/posts/${post.id}/fill`, { values });
      const published = await api<{ id: string }>(`/drafts/${draft.id}/publish`, {
        revision: draft.revision,
      });
      onPosted(published.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Your version of “${post.metadata.title}”`} onClose={onClose}>
      <form className="moment-form fill-form" onSubmit={submit}>
        <p className="fineprint">
          Change what you like. Anything you leave stays as {post.author.name} made it.
        </p>
        {fields.map((f) =>
          f.kind === "image" ? (
            <label key={f.key}>
              {f.label}
              <img
                className="fill-photo"
                src={previews[f.key] ?? `/api/assets/${f.value}`}
                alt=""
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={`Choose ${f.label}`}
                onChange={(e) => void pick(f, e.target.files?.[0])}
              />
            </label>
          ) : (
            <label key={f.key}>
              {f.label}
              {f.kind === "long" ? (
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={value(f)}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  maxLength={200}
                  value={value(f)}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ),
        )}
        {error && (
          <p className="fineprint" role="alert">
            {error}
          </p>
        )}
        <div className="moment-actions">
          <button type="button" className="text-button" onClick={onCode}>
            Edit the code instead
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Posting…" : "Post my version"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
