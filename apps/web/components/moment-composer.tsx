"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import type { MomentKind } from "../../../packages/contracts/src/identity";
import { api } from "./runtime";
import { Dialog } from "./ui";

type Template = {
  kind: MomentKind;
  name: string;
  rule: string;
  unlocked: boolean;
  chapters: { id: string; label: string }[];
  stickers: { id: string; label: string }[];
};
type Section = { heading: string; note: string; text: string; assetId?: string };

async function uploadPhoto(file: File) {
  const mime = file.type as "image/jpeg" | "image/png" | "image/webp";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("Use a JPEG, PNG or WebP photo.");
  const base64 = btoa(
    Array.from(new Uint8Array(await file.arrayBuffer()), (b) => String.fromCharCode(b)).join(""),
  );
  return (await api<{ id: string }>("/assets", { name: file.name.slice(0, 120), mime, base64 })).id;
}

function PhotoField({
  label,
  value,
  onChange,
  notify,
}: {
  label: string;
  value?: string | undefined;
  onChange: (id: string | undefined) => void;
  notify: (s: string) => void;
}) {
  return (
    <label className="photo-field">
      {label}
      {value && <img src={`/api/assets/${value}`} alt="" />}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            onChange(await uploadPhoto(file));
          } catch (err) {
            notify((err as Error).message);
          }
        }}
      />
    </label>
  );
}

/** Proof-locked moment pages: the server re-checks the proof when publishing. */
export function MomentComposer({
  onClose,
  onPublished,
  notify,
  onProve,
}: {
  onClose: () => void;
  onPublished: () => Promise<void>;
  notify: (s: string) => void;
  onProve: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]),
    [kind, setKind] = useState<MomentKind | null>(null),
    [chapterId, setChapterId] = useState(""),
    [title, setTitle] = useState(""),
    [story, setStory] = useState(""),
    [cover, setCover] = useState<string | undefined>(),
    [sections, setSections] = useState<Section[]>([]),
    [thanks, setThanks] = useState(""),
    [paperTitle, setPaperTitle] = useState(""),
    [paperAbstract, setPaperAbstract] = useState(""),
    [paperBody, setPaperBody] = useState(""),
    [paperLink, setPaperLink] = useState(""),
    [audience, setAudience] = useState<"circle" | "public">("circle"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Template[]>("/moments/templates").then(setTemplates, (e) => notify(e.message));
  }, [notify]);
  const template = templates.find((t) => t.kind === kind);
  async function publish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/moments", {
        kind,
        ...(chapterId ? { chapterId } : {}),
        title,
        story,
        ...(cover ? { coverAssetId: cover } : {}),
        sections: sections.map((s) => ({
          heading: s.heading,
          note: s.note,
          text: s.text,
          ...(s.assetId ? { assetId: s.assetId } : {}),
        })),
        thanks,
        ...(paperTitle
          ? {
              paper: {
                title: paperTitle,
                abstract: paperAbstract,
                body: paperBody,
                ...(paperLink ? { link: paperLink } : {}),
              },
            }
          : {}),
        audience,
      });
      await onPublished();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = templates.filter((t) => t.unlocked),
    locked = templates.filter((t) => !t.unlocked);
  const Tile = ({ t }: { t: Template }) => (
    <button
      className={`template-tile ${t.unlocked ? "" : "locked"}`}
      aria-label={`${t.name}${t.unlocked ? "" : ", locked"}`}
      onClick={() => {
        if (!t.unlocked) return notify(t.rule);
        setKind(t.kind);
        setChapterId(t.chapters[0]?.id ?? "");
      }}
    >
      <strong>
        {!t.unlocked && <Lock size={13} />} {t.name}
      </strong>
      <small>{t.unlocked ? (t.chapters[0]?.label ?? "Ready") : t.rule}</small>
    </button>
  );
  return (
    <Dialog title={template ? template.name : "Share a milestone"} onClose={onClose} wide>
      {!template ? (
        <div className="template-picker">
          {open.length > 0 && (
            <div className="template-grid">
              {open.map((t) => (
                <Tile key={t.kind} t={t} />
              ))}
            </div>
          )}
          {/* What needs proof first is folded away, so the ones you can use come first. */}
          {locked.length > 0 && (
            <details className="template-locked" open={open.length === 0}>
              <summary>{locked.length} more unlock with proof</summary>
              <div className="template-grid">
                {locked.map((t) => (
                  <Tile key={t.kind} t={t} />
                ))}
              </div>
              <p className="fineprint template-note">
                Locked templates open with proof.{" "}
                <button className="text-button" onClick={onProve}>
                  Add a chapter
                </button>
              </p>
            </details>
          )}
        </div>
      ) : (
        <form className="moment-form" onSubmit={publish}>
          {template.chapters.length > 0 && (
            <label>
              Proof
              <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                {template.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Title
            <input
              required
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Finally graduated."
            />
          </label>
          <label>
            A few words
            <textarea maxLength={600} value={story} onChange={(e) => setStory(e.target.value)} />
          </label>
          <PhotoField label="Cover photo" value={cover} onChange={setCover} notify={notify} />
          {sections.map((s, i) => (
            <fieldset key={i} className="moment-section">
              <legend>Chapter {i + 1}</legend>
              <label>
                Heading
                <input
                  required
                  maxLength={60}
                  value={s.heading}
                  onChange={(e) =>
                    setSections(
                      sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Small note (a year, a time)
                <input
                  maxLength={40}
                  value={s.note}
                  onChange={(e) =>
                    setSections(
                      sections.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Text
                <textarea
                  maxLength={500}
                  value={s.text}
                  onChange={(e) =>
                    setSections(
                      sections.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <PhotoField
                label="Photo"
                value={s.assetId}
                onChange={(id) =>
                  setSections(
                    sections.map((x, j) =>
                      j === i ? { ...x, ...(id ? { assetId: id } : {}) } : x,
                    ),
                  )
                }
                notify={notify}
              />
              <button
                type="button"
                className="text-button"
                onClick={() => setSections(sections.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} /> Remove chapter
              </button>
            </fieldset>
          ))}
          {sections.length < 3 && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => setSections([...sections, { heading: "", note: "", text: "" }])}
            >
              <Plus size={14} /> Add a chapter
            </button>
          )}
          <fieldset className="moment-section">
            <legend>
              {kind === "paper" ? "Paper or portfolio" : "Paper or final work (optional)"}
            </legend>
            <label>
              Paper title
              <input
                required={kind === "paper"}
                maxLength={140}
                value={paperTitle}
                onChange={(e) => setPaperTitle(e.target.value)}
              />
            </label>
            <label>
              Abstract
              <textarea
                maxLength={1200}
                value={paperAbstract}
                onChange={(e) => setPaperAbstract(e.target.value)}
              />
            </label>
            <label>
              Full text
              <textarea
                rows={6}
                maxLength={20000}
                value={paperBody}
                onChange={(e) => setPaperBody(e.target.value)}
              />
            </label>
            <label>
              Link (optional)
              <input
                type="url"
                maxLength={300}
                value={paperLink}
                onChange={(e) => setPaperLink(e.target.value)}
              />
            </label>
          </fieldset>
          <label>
            Thank you note (optional)
            <input maxLength={200} value={thanks} onChange={(e) => setThanks(e.target.value)} />
          </label>
          <label>
            Who sees it
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as "circle" | "public")}
            >
              <option value="circle">Close circle (people who follow each other with you)</option>
              <option value="public">Everyone</option>
            </select>
          </label>
          <p className="fineprint">
            Visitors can leave one sticker each: {template.stickers.map((s) => s.label).join(", ")}.
            No like counts, no free text.
          </p>
          <div className="moment-actions">
            <button type="button" className="text-button" onClick={() => setKind(null)}>
              Back
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Publishing…" : "Publish milestone"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
