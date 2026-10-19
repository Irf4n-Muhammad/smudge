"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Code,
  Dices,
  Eye,
  Globe,
  ImagePlus,
  Link2,
  Monitor,
  Palette,
  Pencil,
  Shapes,
  Smartphone,
  Star,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { DraftView } from "../../../packages/contracts/src/experience";
import {
  buildPost,
  withoutStarterWords,
  postFonts,
  postPalettes,
  postStyleInfo,
  postStyles,
  readPostDesign,
  restylePost,
  startPostDesign,
  type PostDesign,
  type PostFont,
  type PostPalette,
  type PostStyle,
} from "../../../packages/core/src/easy-post";
import { api } from "./runtime";
import { ChipRow, SmoothPreview, TextField } from "./easy-editor";

type Sheet = "field" | "style" | "colors" | "font" | "button" | null;

const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];
/**
 * A JPEG of an early frame, used as the video's poster and the post's cover. Grabbing it also
 * proves the browser can play the file before anything is uploaded.
 */
function posterFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (error?: string, value?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      if (error) reject(new Error(error));
      else resolve(value!);
    };
    const timer = setTimeout(() => finish("This video can't play here. Try an MP4."), 15000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => finish("This video can't play here. Try an MP4.");
    video.onloadedmetadata = () => {
      if (video.duration > 180) return finish("Videos can be up to 3 minutes long.");
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((video.videoWidth || 1280) * scale);
      canvas.height = Math.round((video.videoHeight || 720) * scale);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      finish(undefined, canvas.toDataURL("image/jpeg", 0.85).split(",")[1]!);
    };
    video.src = url;
  });
}
async function uploadVideo(file: File) {
  if (!videoTypes.includes(file.type) || file.size > 30_000_000)
    throw new Error("Choose an MP4, MOV or WebM video under 30 MB.");
  const poster = await posterFrame(file);
  const response = await fetch("/api/videos", {
    method: "POST",
    headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  const video = await response.json();
  if (!response.ok) throw new Error(video.error);
  const image = await api<{ id: string }>("/assets", {
    name: `${file.name.replace(/\.[^.]+$/, "")}.jpg`.slice(0, 120),
    mime: "image/jpeg",
    base64: poster,
  });
  return { assetId: image.id, caption: "", videoAssetId: video.id as string };
}
type Meta = { caption: string; linkLabel: string; linkUrl: string };

const fieldTitles: Record<string, string> = {
  kicker: "Small label",
  headline: "Headline",
  text: "Your words",
  quote: "Big quote",
  photos: "Photos",
};

/**
 * The easy post editor: pick a style, then tap any part of the post to change it. The design is
 * kept as ordinary package files (see packages/core/src/easy-post.ts), so the studio can open the
 * same draft as source.
 */
export function PostEditor({
  draftId,
  onClose,
  onPublished,
  editing = false,
  onStudio,
  onImport,
  side,
}: {
  draftId?: string | undefined;
  /** The side a new post goes to (ADR 0027); absent means Everyday. */
  side?: { id: string; name: string } | undefined;
  onClose: () => void;
  onPublished: () => Promise<void>;
  /** Opened from a published post's menu: publishing updates that post in place. */
  editing?: boolean;
  onStudio: (draftId?: string) => void;
  onImport: () => void;
}) {
  const [step, setStep] = useState<"loading" | "pick" | "edit">(draftId ? "loading" : "pick");
  const [choice, setChoice] = useState(0);
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [design, setDesign] = useState<PostDesign | null>(null);
  const [meta, setMeta] = useState<Meta>({ caption: "", linkLabel: "", linkUrl: "" });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [field, setField] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [device, setDevice] = useState<"phone" | "pc">("phone");
  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [height, setHeight] = useState(720);
  const draftRef = useRef<DraftView | null>(null);
  const latest = useRef<{ design: PostDesign | null; meta: Meta }>({ design, meta });
  latest.current = { design, meta };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (window.matchMedia("(min-width: 900px)").matches) setDevice("pc");
    setHeight(Math.max(480, window.innerHeight - 230));
  }, []);

  const open = useCallback((d: DraftView) => {
    const saved = readPostDesign(d.package);
    draftRef.current = d;
    setDraft(d);
    setDesign(saved);
    setMeta({
      caption: d.metadata.caption,
      linkLabel: d.metadata.link?.label ?? "",
      linkUrl: d.metadata.link?.url ?? "",
    });
    setSheet(null);
    setField(null);
    setStep("edit");
    return saved;
  }, []);
  useEffect(() => {
    if (!draftId) return;
    let gone = false;
    api<DraftView>(`/drafts/${draftId}`)
      .then((d) => {
        if (gone) return;
        // A draft without easy settings belongs in the studio.
        if (!open(d)) onStudio(d.id);
      })
      .catch((e) => {
        if (!gone) {
          setMessage(friendly(e));
          setStep("pick");
        }
      });
    return () => {
      gone = true;
    };
  }, [draftId, open, onStudio]);

  const metadataFor = (built: ReturnType<typeof buildPost>, m: Meta, base: DraftView) => ({
    ...base.metadata,
    ...built.metadata,
    coverAssetId: built.metadata.coverAssetId,
    caption: m.caption.trim().slice(0, 500),
    link: m.linkLabel.trim()
      ? { label: m.linkLabel.trim(), ...(m.linkUrl.trim() ? { url: m.linkUrl.trim() } : {}) }
      : undefined,
  });
  // Saves run one after another on the newest revision, so quick edits never conflict.
  const save = useCallback(() => {
    clearTimeout(timer.current);
    setSaving("saving");
    queue.current = queue.current.then(async () => {
      const current = draftRef.current;
      const { design: d, meta: m } = latest.current;
      if (!current || !d) return;
      try {
        const built = buildPost(d);
        const next = await api<DraftView>(
          `/drafts/${current.id}`,
          {
            revision: current.revision,
            package: built.package,
            metadata: metadataFor(built, m, current),
          },
          "PUT",
        );
        draftRef.current = next;
        setDraft(next);
        setSaving("saved");
      } catch (e) {
        setSaving("error");
        setMessage(friendly(e));
      }
    });
    return queue.current;
  }, []);
  function change(next: PostDesign, now = false) {
    setDesign(next);
    latest.current = { ...latest.current, design: next };
    // An empty headline would be refused: wait until there is one.
    if (!next.headline.trim()) return setSaving("error");
    setSaving("saving");
    clearTimeout(timer.current);
    if (now) void save();
    else timer.current = setTimeout(() => void save(), 700);
  }
  function changeMeta(next: Meta) {
    setMeta(next);
    latest.current = { ...latest.current, meta: next };
    setSaving("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  }

  async function start(style: PostStyle) {
    setBusy(true);
    setMessage("");
    try {
      if (design && draftRef.current) {
        change(restylePost(design, style), true);
        setStep("edit");
        return;
      }
      const built = buildPost(startPostDesign(style));
      open(
        await api<DraftView>("/drafts", {
          package: built.package,
          metadata: {
            ...built.metadata,
            caption: "",
            contributors: [],
            ...(side ? { side: side.id } : {}),
          },
        }),
      );
      // Photos make a post, so a new one starts there.
      pick("photos");
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!draftRef.current) return;
    setBusy(true);
    setMessage("");
    try {
      const current = latest.current.design;
      // Only a new post: an author may have kept those words on purpose in an earlier version.
      if (current && !editing) {
        const cleaned = withoutStarterWords(current);
        if (JSON.stringify(cleaned) !== JSON.stringify(current)) {
          setDesign(cleaned);
          latest.current = { ...latest.current, design: cleaned };
        }
      }
      await save();
      const d = draftRef.current!;
      await api(`/drafts/${d.id}/publish`, { revision: d.revision });
      await onPublished();
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!design) return;
    setMessage("");
    const room = 12 - design.photos.length;
    if (room <= 0) return setMessage("A post can hold 12 photos.");
    setBusy(true);
    try {
      const added: PostDesign["photos"] = [];
      for (const file of files.slice(0, room)) {
        if (file.type.startsWith("video/")) {
          added.push(await uploadVideo(file));
          continue;
        }
        if (file.size > 3_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
          throw new Error("Choose PNG, JPEG or WebP photos under 3 MB, or a video.");
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1]!);
          r.onerror = () => reject(new Error("Could not read that photo."));
          r.readAsDataURL(file);
        });
        const asset = await api<{ id: string }>("/assets", {
          name: file.name,
          mime: file.type,
          base64,
        });
        added.push({ assetId: asset.id, caption: "" });
      }
      const next = {
        ...latest.current.design!,
        photos: [...latest.current.design!.photos, ...added],
      };
      change(next, true);
      if (files.length > room) setMessage(`Added ${room}. A post can hold 12 photos.`);
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  function pick(next: string) {
    setField(next);
    setSheet("field");
    setPreviewing(false);
  }
  function movePhoto(i: number, by: number) {
    if (!design) return;
    const list = [...design.photos];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    change({ ...design, photos: list }, true);
    if (field === `photo-${i}`) setField(`photo-${j}`);
  }

  if (step === "loading")
    return (
      <div className="easy-editor" role="dialog" aria-label="Make a post">
        <p className="easy-loading">Opening your post…</p>
      </div>
    );

  if (step === "pick") {
    const style = postStyles[choice]!;
    return (
      <div className="easy-editor easy-pick post-pick" role="dialog" aria-label="Pick a post style">
        <header className="easy-pick-top">
          <span className="easy-logo">smudge</span>
          <span className="easy-steps" aria-hidden="true">
            <i className="on" />
            <i />
          </span>
          <button
            className="easy-close"
            aria-label={draft ? "Back to editing" : "Close editor"}
            onClick={() => (draft ? setStep("edit") : onClose())}
          >
            <X />
          </button>
        </header>
        <h1 className="easy-title">
          Make a <em>post,</em>
        </h1>
        <p className="easy-sub">
          Pick a style. You can change everything after, and switch styles any time.
        </p>
        <div
          className="easy-vibes"
          role="listbox"
          aria-label="Post styles"
          onScroll={(e) => {
            const row = e.currentTarget;
            const mid = row.scrollLeft + row.clientWidth / 2;
            let best = 0;
            Array.from(row.children).forEach((c, i) => {
              const el = c as HTMLElement;
              const b = row.children[best] as HTMLElement;
              if (
                Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) <
                Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid)
              )
                best = i;
            });
            if (best !== choice) setChoice(best);
          }}
        >
          {postStyles.map((s, i) => (
            <button
              key={s}
              role="option"
              aria-selected={i === choice}
              aria-label={postStyleInfo[s].name}
              className={`easy-vibe ${i === choice ? "on" : ""}`}
              onClick={(e) => {
                setChoice(i);
                e.currentTarget.scrollIntoView({ inline: "center", block: "nearest" });
              }}
            >
              <img src={`/post-styles/${s}.jpg`} alt="" />
            </button>
          ))}
        </div>
        <div className="easy-vibe-name">
          <strong>{postStyleInfo[style].name}</strong>
          <span>{postStyleInfo[style].note}</span>
          <span className="easy-dots" aria-hidden="true">
            {postStyles.map((s, i) => (
              <i key={s} className={i === choice ? "on" : ""} />
            ))}
          </span>
        </div>
        {message && (
          <p className="easy-message" role="status">
            {message}
          </p>
        )}
        {!draft && (
          <div className="post-other">
            <button onClick={onImport}>
              <Globe /> Import a website
            </button>
            <button onClick={() => onStudio()}>
              <Code /> Open the studio
            </button>
          </div>
        )}
        <footer className="easy-pick-actions">
          <button
            className="easy-dice"
            aria-label="Surprise me"
            title="Surprise me"
            onClick={() => {
              const next =
                (choice + 1 + Math.floor(Math.random() * (postStyles.length - 1))) %
                postStyles.length;
              setChoice(next);
              document
                .querySelectorAll(".easy-vibe")
                [next]?.scrollIntoView({ inline: "center", block: "nearest" });
            }}
          >
            <Dices />
          </button>
          <button className="easy-go" disabled={busy} onClick={() => void start(style)}>
            {draft ? "Switch to this style" : "Use this style"} <ArrowRight />
          </button>
        </footer>
      </div>
    );
  }

  const d = design!;
  const photoIndex = /^photo-(\d+)$/.exec(field ?? "")?.[1];
  const photo = photoIndex !== undefined ? d.photos[Number(photoIndex)] : undefined;
  const sheetTitle =
    sheet === "field"
      ? photo
        ? `Photo ${Number(photoIndex) + 1}`
        : (fieldTitles[field ?? ""] ?? "Edit")
      : sheet === "style"
        ? "Style"
        : sheet === "colors"
          ? "Colors"
          : sheet === "font"
            ? "Font"
            : "Caption & button";
  const addPhotos = (
    <label className="easy-upload">
      <input
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
        aria-label="Add photos or videos"
        disabled={busy || d.photos.length >= 12}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <ImagePlus size={16} /> {busy ? "Adding…" : "Add photos or videos"}
    </label>
  );
  return (
    <div
      className={`easy-editor easy-edit post-edit ${sheet ? "has-sheet" : ""} ${previewing ? "is-previewing" : ""}`}
      role="dialog"
      aria-label="Edit your post"
    >
      <header className="easy-bar">
        <button onClick={onClose}>Cancel</button>
        <div>
          <strong>{editing ? "Edit post" : "New post"}</strong>
          <small role="status">
            {saving === "saving"
              ? "Saving…"
              : saving === "error"
                ? "Not saved"
                : editing
                  ? "Saved · people see changes when you update"
                  : side
                    ? `Posting to ${side.name} · draft only you see`
                    : "Draft saved · only you see it"}
          </small>
        </div>
        <button className="easy-publish" disabled={busy} onClick={() => void publish()}>
          {editing ? "Update" : "Publish"}
        </button>
      </header>
      <div className="easy-stage">
        {!previewing && <p className="easy-hint">tap anything to change it</p>}
        <div className={`easy-frame ${device}`}>
          <SmoothPreview
            kind="post"
            draft={{ id: draft!.id, revision: draft!.revision }}
            height={height}
            heights={{}}
            editing={!previewing}
            onEdit={pick}
          />
        </div>
      </div>
      {message && (
        <p className="easy-message floating" role="status">
          {message} <button onClick={() => setMessage("")}>OK</button>
        </p>
      )}
      {sheet && (
        <section className={`easy-sheet sheet-${sheet}`} aria-label={sheetTitle}>
          <button className="easy-sheet-close" aria-label="Done" onClick={() => setSheet(null)}>
            <X />
          </button>
          {sheet === "field" && field === "kicker" && (
            <TextField
              title="Small label"
              value={d.kicker}
              max={40}
              placeholder="Tonight, A story, Hot take…"
              hint="Leave it empty to hide it."
              onChange={(v) => change({ ...d, kicker: v })}
            />
          )}
          {sheet === "field" && field === "headline" && (
            <TextField
              title="Headline"
              value={d.headline}
              max={90}
              hint="Put *stars* around words to make them italic."
              onChange={(v) => change({ ...d, headline: v })}
            />
          )}
          {sheet === "field" && (field === "text" || field === "quote") && (
            <div className="easy-field">
              <TextField
                title="Your words"
                value={d.text}
                max={1500}
                area
                hint="Leave an empty line to start a new paragraph."
                onChange={(v) => change({ ...d, text: v })}
              />
              <TextField
                title="Big quote"
                value={d.quote}
                max={200}
                area
                hint="One line people should remember. Leave it empty to hide it."
                onChange={(v) => change({ ...d, quote: v })}
              />
            </div>
          )}
          {sheet === "field" && field === "photos" && (
            <div className="easy-field">
              <h2>Photos</h2>
              <PhotoGrid design={d} onPick={(i) => setField(`photo-${i}`)} />
              {addPhotos}
              <p className="easy-note">Up to 12. The first one is the cover in the feed.</p>
            </div>
          )}
          {sheet === "field" && photo && (
            <div className="easy-field">
              <h2>Photo {Number(photoIndex) + 1}</h2>
              <img className="post-photo-big" src={`/api/assets/${photo.assetId}`} alt="" />
              <TextField
                title=""
                label="Caption"
                value={photo.caption}
                max={120}
                onChange={(v) =>
                  change({
                    ...d,
                    photos: d.photos.map((p, i) =>
                      i === Number(photoIndex) ? { ...p, caption: v } : p,
                    ),
                  })
                }
              />
              <div className="easy-row">
                <button
                  disabled={Number(photoIndex) === 0}
                  onClick={() => movePhoto(Number(photoIndex), -1)}
                >
                  <ArrowLeft /> Earlier
                </button>
                <button
                  disabled={Number(photoIndex) === d.photos.length - 1}
                  onClick={() => movePhoto(Number(photoIndex), 1)}
                >
                  Later <ArrowRight />
                </button>
                <button
                  disabled={Number(photoIndex) === 0}
                  onClick={() => {
                    const i = Number(photoIndex);
                    const list = [d.photos[i]!, ...d.photos.filter((_, j) => j !== i)];
                    change({ ...d, photos: list }, true);
                    setField("photo-0");
                  }}
                >
                  <Star /> Make cover
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    const i = Number(photoIndex);
                    change({ ...d, photos: d.photos.filter((_, j) => j !== i) }, true);
                    setField("photos");
                  }}
                >
                  <Trash2 /> Remove
                </button>
              </div>
              <button className="post-all-photos" onClick={() => setField("photos")}>
                All photos
              </button>
            </div>
          )}
          {sheet === "style" && (
            <div className="easy-field">
              <h2>Style</h2>
              <div className="post-styles" role="radiogroup" aria-label="Post style">
                {postStyles.map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={d.style === s}
                    onClick={() => change(restylePost(d, s), true)}
                  >
                    <img src={`/post-styles/${s}.jpg`} alt="" />
                    <span>{postStyleInfo[s].name}</span>
                  </button>
                ))}
              </div>
              <p className="easy-note">
                Your words and photos stay. Colors and font follow the style.
              </p>
            </div>
          )}
          {sheet === "colors" && (
            <div className="easy-field">
              <h2>Colors</h2>
              <div className="easy-palettes" role="radiogroup" aria-label="Colors">
                {(Object.keys(postPalettes) as PostPalette[]).map((key) => (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={d.palette === key}
                    onClick={() => change({ ...d, palette: key }, true)}
                  >
                    <span className="easy-swatch" aria-hidden="true">
                      {postPalettes[key].colors.slice(0, 3).map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    {postPalettes[key].name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sheet === "font" && (
            <div className="easy-field">
              <ChipRow
                label="Font"
                value={d.font}
                options={(Object.keys(postFonts) as PostFont[]).map(
                  (k) => [k, postFonts[k].name] as const,
                )}
                onChange={(font) => change({ ...d, font }, true)}
              />
              <ChipRow
                label="Motion"
                value={d.motion ? "on" : "off"}
                options={[
                  ["on", "Moves as you scroll"],
                  ["off", "Stays still"],
                ]}
                onChange={(v) => change({ ...d, motion: v === "on" }, true)}
              />
            </div>
          )}
          {sheet === "button" && (
            <div className="easy-field">
              <TextField
                title="Caption in the feed"
                value={meta.caption}
                max={500}
                area
                onChange={(caption) => changeMeta({ ...meta, caption })}
              />
              <TextField
                title="Button under the post"
                value={meta.linkLabel}
                max={32}
                placeholder="Read more, Get tickets…"
                hint="Leave it empty for no button."
                onChange={(linkLabel) => changeMeta({ ...meta, linkLabel })}
              />
              {meta.linkLabel.trim() && (
                <TextField
                  title=""
                  label="Opens"
                  value={meta.linkUrl}
                  max={500}
                  placeholder="This post, full size (or paste an https:// link)"
                  onChange={(linkUrl) => changeMeta({ ...meta, linkUrl })}
                />
              )}
            </div>
          )}
        </section>
      )}
      <nav className="easy-tools" aria-label="Editor tools">
        <button
          aria-pressed={sheet === "style"}
          onClick={() => setSheet(sheet === "style" ? null : "style")}
        >
          <Shapes />
          <span>Style</span>
        </button>
        <button
          className="easy-add"
          aria-pressed={sheet === "field" && field === "photos"}
          onClick={() => pick("photos")}
        >
          <ImagePlus />
          <span>Photos</span>
        </button>
        <button
          aria-pressed={sheet === "colors"}
          onClick={() => setSheet(sheet === "colors" ? null : "colors")}
        >
          <Palette />
          <span>Colors</span>
        </button>
        <button
          aria-pressed={sheet === "font"}
          onClick={() => setSheet(sheet === "font" ? null : "font")}
        >
          <Type />
          <span>Font</span>
        </button>
        <button
          aria-pressed={sheet === "button"}
          onClick={() => setSheet(sheet === "button" ? null : "button")}
        >
          <Link2 />
          <span>Caption</span>
        </button>
        <button
          aria-pressed={previewing}
          onClick={() => {
            setPreviewing((v) => !v);
            setSheet(null);
          }}
        >
          {previewing ? <Pencil /> : <Eye />}
          <span>{previewing ? "Edit" : "Preview"}</span>
        </button>
      </nav>
      <div className="easy-more">
        <button
          aria-label={device === "phone" ? "Show on a computer" : "Show on a phone"}
          title={device === "phone" ? "Show on a computer" : "Show on a phone"}
          onClick={() => setDevice((v) => (v === "phone" ? "pc" : "phone"))}
        >
          {device === "phone" ? <Monitor /> : <Smartphone />}
        </button>
        <button
          onClick={async () => {
            await save();
            onStudio(draftRef.current!.id);
          }}
        >
          <Code /> Advanced editor
        </button>
      </div>
    </div>
  );
}

function PhotoGrid({ design, onPick }: { design: PostDesign; onPick: (i: number) => void }) {
  if (!design.photos.length) return <p className="easy-note">No photos yet.</p>;
  return (
    <ul className="post-photos">
      {design.photos.map((p, i) => (
        <li key={`${p.assetId}-${i}`}>
          <button
            aria-label={`Edit ${p.videoAssetId ? "video" : "photo"} ${i + 1}`}
            onClick={() => onPick(i)}
          >
            <img src={`/api/assets/${p.assetId}`} alt="" />
            {i === 0 && <span>Cover</span>}
            {p.videoAssetId && (
              <b className="video-badge" aria-hidden="true">
                ▶
              </b>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

const friendlyErrors: Record<string, string> = {
  REVISION_CONFLICT: "This draft changed somewhere else. Close and open it again.",
  ASSET_NOT_ACCESSIBLE: "That photo can't be used. Try uploading it again.",
  VIDEO_TOO_LARGE: "That video is over 30 MB. Try a shorter one.",
  INVALID_VIDEO: "That file isn't a video we can use. Try an MP4.",
  PAYLOAD_TOO_LARGE: "That video is over 30 MB. Try a shorter one.",
  TOO_MANY_REQUESTS: "That's a lot of uploads. Wait a few minutes and try again.",
};
function friendly(e: unknown) {
  const message = String((e as Error).message ?? e);
  const code = message.split(" (")[0]!;
  return friendlyErrors[code] ?? (code === code.toUpperCase() ? "Something went wrong." : message);
}
