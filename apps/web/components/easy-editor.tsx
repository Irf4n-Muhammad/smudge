"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "../../../packages/contracts/src/experience";
import type {
  ProfileDraft,
  ProfileIdentity,
  ProfilePackage,
  ProfilePublication,
  ProfileState,
} from "../../../packages/contracts/src/profile";
import {
  applySmudgeSettings,
  readSmudgeSettings,
  smudgePalettes,
  supportsSmudgeDesign,
  defaultSmudgeSettings,
  type SmudgePalette,
  type SmudgeSection,
  type SmudgeSettings,
} from "../../../packages/core/src/smudge-design";
import {
  applyProfileDesign,
  defaultProfileDesign,
  readProfileDesign,
  supportsProfileDesign,
  type ProfileDesign,
} from "../../../packages/core/src/profile-design";
import {
  applyLook,
  defaultLook,
  lookKind,
  lookTints,
  readLook,
  type LookKind,
  type LookSettings,
} from "../../../packages/core/src/easy-look";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Code,
  Dices,
  Eye,
  EyeOff,
  ListOrdered,
  Monitor,
  Palette,
  Pencil,
  Plus,
  Smartphone,
  X,
} from "lucide-react";
import { api, Runtime } from "./runtime";

type History = { state: ProfileState; publications: ProfilePublication[] };
/** Which easy controls a profile has: Paint wall settings, Ink & Paper layout, or a simple look. */
type Kind = "smudge" | "design" | LookKind | null;
function kindOf(pkg: ProfilePackage): Kind {
  if (supportsSmudgeDesign(pkg)) return "smudge";
  if (supportsProfileDesign(pkg)) return "design";
  return lookKind(pkg);
}
type Part = ProfileDesign["order"][number];
const partNames: Record<Part, string> = {
  profile: "Name & photo",
  story: "Highlights",
  feature: "Drawing wall",
  post: "Posts",
};
const accents = [
  ["#e93122", "Red"],
  ["#2b3cff", "Blue"],
  ["#19c37d", "Green"],
  ["#ff4f9a", "Pink"],
  ["#f2a516", "Amber"],
  ["#101010", "Ink"],
] as const;
type Sheet = "field" | "colors" | "section" | "order" | null;

/** The starting points people pick from, shown as pictures of real profiles built with them. */
const vibes = [
  {
    key: "smudge",
    name: "Paint wall",
    image: "/vibes/paint-wall.jpg",
    note: "A giant painted name, tap-to-throw paint and sections you pick.",
  },
  {
    key: "raka",
    name: "Ink & Paper",
    image: "/vibes/ink-paper.jpg",
    note: "Hand-drawn comic with a drawing wall friends add to.",
  },
  {
    key: "basic",
    name: "Essentials",
    image: "/vibes/essentials.jpg",
    note: "Clean and simple. Your name, your posts.",
  },
  {
    key: "room",
    name: "Room",
    image: "/vibes/room.jpg",
    note: "A little room with your photos pinned up.",
  },
  {
    key: "comic",
    name: "Comic",
    image: "/vibes/comic.jpg",
    note: "Your posts laid out like a vertical comic.",
  },
] as const;

const paletteNames: Record<SmudgePalette, string> = {
  paint: "Paint",
  electric: "Electric",
  sunset: "Sunset",
  ocean: "Ocean",
  mono: "Mono",
};
const sectionInfo: Record<SmudgeSection, { name: string; note: string }> = {
  now: { name: "Now doing", note: "What you're up to, with progress" },
  selected: { name: "Gallery", note: "Swipe through your best posts" },
  wall: { name: "The Wall", note: "Friends leave notes" },
  quote: { name: "Big quote", note: "One line, huge" },
  repeat: { name: "On repeat", note: "Your song right now" },
  countdown: { name: "Countdown", note: "For drops and events" },
  latest: { name: "Latest", note: "Your newest post, big" },
  posts: { name: "All posts", note: "Grid with tabs" },
};
const addable: SmudgeSection[] = [
  "now",
  "selected",
  "wall",
  "quote",
  "repeat",
  "countdown",
  "latest",
  "posts",
];
/** Fields the profile frame can report when its outlined parts are tapped. */
const fieldTitles: Record<string, string> = {
  name: "Your big name",
  tagline: "Your line",
  place: "Top corner",
  about: "Name & bio",
  photo: "Your photo",
  marquee: "The ribbon",
  story: "Highlights",
  post: "Posts",
  feature: "Drawing wall",
  line: "Your big line",
};

function inTwoWeeks() {
  const d = new Date(Date.now() + 14 * 864e5);
  return d.toISOString().slice(0, 10);
}
/** A new section starts with a short example, so it shows straight away and invites an edit. */
function withStarter(s: SmudgeSettings, kind: SmudgeSection): SmudgeSettings {
  const next = { ...s, sections: [...s.sections, kind] };
  if (kind === "quote" && !s.quote.text) next.quote = { text: "Say it in *one* line." };
  if (kind === "now" && !s.now.text)
    next.now = { text: "Working on something new", place: s.place, progress: 30 };
  if (kind === "repeat" && !s.repeat.song) next.repeat = { song: "Song title", artist: "Artist" };
  if (kind === "countdown" && !s.countdown.date)
    next.countdown = { label: "Something's coming", date: inTwoWeeks() };
  return next;
}

export function EasyEditor({
  owner,
  draftId,
  onClose,
  onPublished,
  onAdvanced,
}: {
  owner: User;
  draftId?: string | undefined;
  onClose: () => void;
  onPublished: () => Promise<void>;
  onAdvanced: (draftId: string) => void;
}) {
  const [step, setStep] = useState<"loading" | "pick" | "edit">("loading");
  const [templates, setTemplates] = useState<Record<string, ProfilePackage>>({});
  const [history, setHistory] = useState<History | null>(null);
  const [vibe, setVibe] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [settings, setSettings] = useState<SmudgeSettings>(defaultSmudgeSettings);
  const [design, setDesign] = useState<ProfileDesign>(defaultProfileDesign);
  const [look, setLook] = useState<LookSettings | null>(null);
  // An untouched Ink & Paper original keeps its hand-drawn header until a layout control is used.
  const designTouched = useRef(false);
  const [identity, setIdentity] = useState<ProfileIdentity>({
    name: owner.name,
    bio: owner.bio,
    avatarAssetId: owner.avatarAssetId ?? null,
  });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [field, setField] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [device, setDevice] = useState<"phone" | "pc">("phone");
  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<ProfileDraft | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ settings, identity, design, look });
  latest.current = { settings, identity, design, look };
  const kind = draft ? kindOf(draft.package) : null;
  const easy = kind !== null;
  const smudge = kind === "smudge";

  const open = useCallback((d: ProfileDraft) => {
    draftRef.current = d;
    setDraft(d);
    setSettings(readSmudgeSettings(d.package));
    const savedDesign = readProfileDesign(d.package);
    designTouched.current = Boolean(savedDesign);
    setDesign(savedDesign ?? defaultProfileDesign);
    setLook(readLook(d.package));
    setIdentity(
      d.identity ?? {
        name: owner.name,
        bio: owner.bio,
        avatarAssetId: owner.avatarAssetId ?? null,
      },
    );
    setStep("edit");
    setSheet(null);
    setField(null);
  }, []);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const [t, h] = await Promise.all([
          api<Record<string, ProfilePackage>>("/profile-templates"),
          api<History>("/profile-history"),
        ]);
        if (gone) return;
        setTemplates(t);
        setHistory(h);
        if (draftId) return open(await api<ProfileDraft>(`/profile-drafts/${draftId}`));
        const live = h.publications.find((p) => p.id === h.state.publicationId);
        // A profile with easy controls is edited in place: start from a private copy of what
        // visitors see now.
        if (live && kindOf(live.package))
          return open(
            await api<ProfileDraft>(`/profiles/${owner.id}/combination`, {
              publicationId: live.id,
            }),
          );
        setStep("pick");
      } catch (e) {
        if (!gone) {
          setMessage((e as Error).message);
          setStep("pick");
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [draftId, owner.id, open]);
  useEffect(() => {
    if (window.matchMedia("(min-width: 900px)").matches) setDevice("pc");
  }, []);

  // Saves run one after another, each on the newest revision, so quick edits never conflict.
  const save = useCallback(() => {
    clearTimeout(timer.current);
    setSaving("saving");
    queue.current = queue.current.then(async () => {
      const current = draftRef.current;
      if (!current) return;
      try {
        const { settings: s, identity: id, design: d, look: l } = latest.current;
        const k = kindOf(current.package);
        const pkg =
          k === "smudge"
            ? applySmudgeSettings(current.package, s, templates.smudge)
            : k === "design" && designTouched.current
              ? applyProfileDesign(current.package, d)
              : (k === "room" || k === "comic") && l
                ? applyLook(current.package, l)
                : current.package;
        const next = await api<ProfileDraft>(
          `/profile-drafts/${current.id}`,
          { package: pkg, revision: current.revision, identity: { ...id, name: id.name.trim() } },
          "PUT",
        );
        draftRef.current = next;
        setDraft(next);
        setSaving("saved");
      } catch (e) {
        setSaving("error");
        setMessage(friendly((e as Error).message));
      }
    });
    return queue.current;
  }, [templates]);
  const later = useCallback(() => {
    setSaving("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  }, [save]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function change(next: SmudgeSettings, now = false) {
    setSettings(next);
    latest.current = { ...latest.current, settings: next };
    if (now) void save();
    else later();
  }
  function changeDesign(next: ProfileDesign) {
    designTouched.current = true;
    setDesign(next);
    latest.current = { ...latest.current, design: next };
    void save();
  }
  function changeLook(next: LookSettings, now = false) {
    setLook(next);
    latest.current = { ...latest.current, look: next };
    if (now) void save();
    else later();
  }
  function movePart(part: Part, by: -1 | 1) {
    const m = draft?.package.manifest;
    const present = design.order.filter((p) => m?.schemaVersion === 2 && m.parts?.[p]);
    const i = present.indexOf(part),
      j = i + by;
    if (i < 0 || j < 0 || j >= present.length) return;
    [present[i], present[j]] = [present[j]!, present[i]!];
    changeDesign({
      ...design,
      order: [...present, ...design.order.filter((p) => !present.includes(p))],
    });
  }
  function changeIdentity(next: ProfileIdentity) {
    setIdentity(next);
    latest.current = { ...latest.current, identity: next };
    if (next.name.trim()) later();
  }

  async function chooseVibe(key: string) {
    const template = templates[key];
    if (!template) return;
    setBusy(true);
    setMessage("");
    try {
      const k = kindOf(template);
      const pkg =
        k === "smudge"
          ? applySmudgeSettings(template, settings)
          : k === "design"
            ? applyProfileDesign(template, defaultProfileDesign)
            : k === "room" || k === "comic"
              ? applyLook(template, defaultLook[k])
              : template;
      open(await api<ProfileDraft>("/profile-drafts", pkg));
    } catch (e) {
      setMessage(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!draftRef.current || !history) return;
    setBusy(true);
    setMessage("");
    try {
      await save();
      const d = draftRef.current!;
      const h = await api<History>("/profile-history");
      await api(`/profile-drafts/${d.id}/publish`, {
        revision: d.revision,
        expectedVersion: h.state.version,
      });
      await onPublished();
    } catch (e) {
      setMessage(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setMessage("");
    try {
      if (file.size > 3_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG or WebP under 3 MB.");
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
      changeIdentity({ ...latest.current.identity, avatarAssetId: asset.id });
    } catch (e) {
      setMessage(friendly((e as Error).message));
    }
  }
  function pick(next: string) {
    setField(next);
    setSheet("field");
    setPreviewing(false);
  }
  function move(kind: SmudgeSection, by: -1 | 1) {
    const list = [...settings.sections];
    const i = list.indexOf(kind),
      j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    change({ ...settings, sections: list }, true);
  }
  function remove(kind: SmudgeSection) {
    change({ ...settings, sections: settings.sections.filter((k) => k !== kind) }, true);
    if (field === kind) setSheet(null);
  }

  if (step === "loading")
    return (
      <div className="easy-editor" role="dialog" aria-label="Edit your profile">
        <p className="easy-loading">Opening your profile…</p>
      </div>
    );

  if (step === "pick") {
    const current = vibes[vibe]!;
    const photos = history?.publications.length ?? 0;
    return (
      <div className="easy-editor easy-pick" role="dialog" aria-label="Pick your vibe">
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
        <div className="easy-chips" aria-label="Already filled in">
          <span>✓ {owner.name}</span>
          {photos > 0 && <span>✓ your posts</span>}
          <em>it&apos;s already you ↓</em>
        </div>
        <h1 className="easy-title">
          Pick your <em>vibe,</em>
        </h1>
        <p className="easy-sub">We fill it with your stuff. Swipe to try others.</p>
        <div
          className="easy-vibes"
          role="listbox"
          aria-label="Profile vibes"
          onScroll={(e) => {
            // Swiping picks the card nearest the middle.
            const row = e.currentTarget;
            const mid = row.scrollLeft + row.clientWidth / 2;
            let best = 0;
            Array.from(row.children).forEach((c, i) => {
              const el = c as HTMLElement;
              const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
              const b = row.children[best] as HTMLElement;
              if (d < Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid)) best = i;
            });
            if (best !== vibe) setVibe(best);
          }}
        >
          {vibes.map((v, i) => (
            <button
              key={v.key}
              role="option"
              aria-selected={i === vibe}
              aria-label={v.name}
              className={`easy-vibe ${i === vibe ? "on" : ""}`}
              onClick={(e) => {
                setVibe(i);
                e.currentTarget.scrollIntoView({ inline: "center", block: "nearest" });
              }}
            >
              <img src={v.image} alt="" />
            </button>
          ))}
        </div>
        <div className="easy-vibe-name">
          <strong>{current.name}</strong>
          <span>{current.note}</span>
          <span className="easy-dots" aria-hidden="true">
            {vibes.map((v, i) => (
              <i key={v.key} className={i === vibe ? "on" : ""} />
            ))}
          </span>
        </div>
        {message && (
          <p className="easy-message" role="status">
            {message}
          </p>
        )}
        <footer className="easy-pick-actions">
          <button
            className="easy-dice"
            aria-label="Surprise me"
            title="Surprise me"
            onClick={() => {
              const next =
                (vibe + 1 + Math.floor(Math.random() * (vibes.length - 1))) % vibes.length;
              setVibe(next);
              document
                .querySelectorAll(".easy-vibe")
                [next]?.scrollIntoView({ inline: "center", block: "nearest" });
            }}
          >
            <Dices />
          </button>
          <button
            className="easy-go"
            disabled={busy || !templates[current.key]}
            onClick={() => void chooseVibe(current.key)}
          >
            Use this vibe <ArrowRight />
          </button>
        </footer>
      </div>
    );
  }

  const manifest = draft!.package.manifest;
  const heights =
    manifest.schemaVersion === 2
      ? { autoHeight: manifest.autoHeight, mobileHeight: manifest.mobileHeight }
      : {};
  const sectionField =
    smudge && (addable as string[]).includes(field ?? "") ? (field as SmudgeSection) : null;
  const designPart =
    kind === "design" && ["story", "post", "feature"].includes(field ?? "")
      ? (field as Part)
      : null;
  const parts = manifest.schemaVersion === 2 ? manifest.parts : undefined;
  const presentParts = design.order.filter((p) => parts?.[p]);
  return (
    <div
      className={`easy-editor easy-edit ${sheet ? "has-sheet" : ""} ${previewing ? "is-previewing" : ""}`}
      role="dialog"
      aria-label="Edit your profile"
    >
      <header className="easy-bar">
        <button onClick={onClose}>Cancel</button>
        <div>
          <strong>Editing your profile</strong>
          <small role="status">
            {saving === "saving"
              ? "Saving…"
              : saving === "error"
                ? "Not saved"
                : "Draft saved · only you see it"}
          </small>
        </div>
        <button className="easy-publish" disabled={busy} onClick={() => void publish()}>
          Publish
        </button>
      </header>
      <div className="easy-stage">
        {!previewing && easy && <p className="easy-hint">tap anything to change it</p>}
        <div className={`easy-frame ${device}`}>
          <SmoothPreview
            draft={draft!}
            height={manifest.height}
            heights={heights}
            editing={easy && !previewing}
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
        <section
          className={`easy-sheet sheet-${sheet}`}
          aria-label={
            sheet === "field"
              ? (fieldTitles[field ?? ""] ?? sectionInfo[sectionField ?? "latest"]?.name ?? "Edit")
              : sheet === "colors"
                ? "Colors"
                : sheet === "section"
                  ? "Add a section"
                  : "Section order"
          }
        >
          <button className="easy-sheet-close" aria-label="Done" onClick={() => setSheet(null)}>
            <X />
          </button>
          {sheet === "field" && !easy && (
            <AboutFields identity={identity} onChange={changeIdentity} onUpload={upload} />
          )}
          {sheet === "field" && smudge && field === "name" && (
            <div className="easy-field">
              <h2>Your big name</h2>
              <label className="easy-input">
                <span className="sr-only">Your big name</span>
                <input
                  maxLength={settings.bigName === "nickname" ? 24 : 80}
                  value={settings.bigName === "nickname" ? settings.nickname : identity.name}
                  onChange={(e) =>
                    settings.bigName === "nickname"
                      ? change({ ...settings, nickname: e.target.value })
                      : changeIdentity({ ...identity, name: e.target.value })
                  }
                />
              </label>
              <div className="easy-chips-row" role="group" aria-label="Which name">
                {(
                  [
                    ["first", "First name"],
                    ["full", "Full name"],
                    ["nickname", "Nickname"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={settings.bigName === key}
                    onClick={() =>
                      change(
                        {
                          ...settings,
                          bigName: key,
                          nickname:
                            key === "nickname" && !settings.nickname
                              ? identity.name.split(" ")[0]!.slice(0, 24)
                              : settings.nickname,
                        },
                        true,
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sheet === "field" && smudge && field === "tagline" && (
            <TextField
              title="Your line"
              hint="Wrap words in *stars* to make them italic. Empty shows your @handle."
              value={settings.tagline}
              max={60}
              placeholder={`*${owner.handle}* on Smudge`}
              onChange={(v) => change({ ...settings, tagline: v })}
            />
          )}
          {sheet === "field" && smudge && field === "place" && (
            <TextField
              title="Top corner"
              hint="A city, a mood, anything short. Empty shows your @handle."
              value={settings.place}
              max={30}
              placeholder="OSAKA, JP"
              onChange={(v) => change({ ...settings, place: v })}
            />
          )}
          {sheet === "field" && smudge && field === "marquee" && (
            <TextField
              title="The ribbon"
              hint="Separate words with &. Empty shows your followers and posts."
              value={settings.marquee}
              max={80}
              placeholder="Skater & film nerd & bad tapes"
              onChange={(v) => change({ ...settings, marquee: v })}
            />
          )}
          {sheet === "field" && easy && (field === "about" || field === "photo") && (
            <AboutFields
              identity={identity}
              onChange={changeIdentity}
              onUpload={upload}
              photoFirst={field === "photo"}
            />
          )}
          {sheet === "field" && kind === "design" && field === "about" && (
            <div className="easy-field">
              <div className="easy-chips-row" role="group" aria-label="Line up">
                {(
                  [
                    ["left", "Left"],
                    ["center", "Center"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={design.alignment === key}
                    onClick={() => changeDesign({ ...design, alignment: key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sheet === "field" && kind === "design" && designPart && designPart !== "profile" && (
            <div className="easy-field">
              <h2>{partNames[designPart]}</h2>
              {designPart === "story" && (
                <>
                  <ChipRow
                    label="Shape"
                    value={design.story}
                    options={[
                      ["circles", "Circles"],
                      ["tiles", "Tiles"],
                    ]}
                    onChange={(story) => changeDesign({ ...design, story })}
                  />
                  <ChipRow
                    label="Order"
                    value={design.storyOrder}
                    options={[
                      ["original", "Newest first"],
                      ["reverse", "Oldest first"],
                    ]}
                    onChange={(storyOrder) => changeDesign({ ...design, storyOrder })}
                  />
                </>
              )}
              {designPart === "post" && (
                <>
                  <ChipRow
                    label="Columns"
                    value={String(design.columns) as "1" | "2" | "3"}
                    options={[
                      ["1", "1"],
                      ["2", "2"],
                      ["3", "3"],
                    ]}
                    onChange={(c) => changeDesign({ ...design, columns: Number(c) })}
                  />
                  <ChipRow
                    label="Card"
                    value={design.card}
                    options={[
                      ["cutout", "Cut paper"],
                      ["straight", "Straight"],
                      ["round", "Round"],
                    ]}
                    onChange={(card) => changeDesign({ ...design, card })}
                  />
                </>
              )}
              {designPart === "feature" && (
                <p className="easy-note">
                  Friends add to your drawing wall. Change how it works in the advanced editor.
                </p>
              )}
              <div className="easy-row">
                <button onClick={() => movePart(designPart, -1)}>
                  <ArrowUp /> Move up
                </button>
                <button onClick={() => movePart(designPart, 1)}>
                  <ArrowDown /> Move down
                </button>
              </div>
            </div>
          )}
          {sheet === "field" && look && field === "line" && (
            <TextField
              title={kind === "room" ? "Your pinned note" : "Your big line"}
              hint="Empty brings back the original."
              value={look.line}
              max={60}
              placeholder={
                kind === "room" ? "a few things I keep coming back to." : "STILL FIGURING IT OUT."
              }
              onChange={(v) => changeLook({ ...look, line: v })}
            />
          )}
          {sheet === "field" && smudge && sectionField && (
            <div className="easy-field">
              <h2>{sectionInfo[sectionField].name}</h2>
              {sectionField === "quote" && (
                <TextField
                  title=""
                  label="Your quote"
                  hint="Wrap words in *stars* to make them italic."
                  value={settings.quote.text}
                  max={120}
                  area
                  onChange={(v) => change({ ...settings, quote: { text: v } })}
                />
              )}
              {sectionField === "now" && (
                <>
                  <TextField
                    title=""
                    label="What are you doing?"
                    value={settings.now.text}
                    max={60}
                    onChange={(v) => change({ ...settings, now: { ...settings.now, text: v } })}
                  />
                  <TextField
                    title=""
                    label="Where"
                    value={settings.now.place}
                    max={30}
                    onChange={(v) => change({ ...settings, now: { ...settings.now, place: v } })}
                  />
                  <label className="easy-range">
                    How far along · {settings.now.progress}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={settings.now.progress}
                      onChange={(e) =>
                        change({
                          ...settings,
                          now: { ...settings.now, progress: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                </>
              )}
              {sectionField === "repeat" && (
                <>
                  <TextField
                    title=""
                    label="Song"
                    value={settings.repeat.song}
                    max={50}
                    onChange={(v) =>
                      change({ ...settings, repeat: { ...settings.repeat, song: v } })
                    }
                  />
                  <TextField
                    title=""
                    label="Artist"
                    value={settings.repeat.artist}
                    max={50}
                    onChange={(v) =>
                      change({ ...settings, repeat: { ...settings.repeat, artist: v } })
                    }
                  />
                </>
              )}
              {sectionField === "countdown" && (
                <>
                  <TextField
                    title=""
                    label="What's coming"
                    value={settings.countdown.label}
                    max={40}
                    onChange={(v) =>
                      change({ ...settings, countdown: { ...settings.countdown, label: v } })
                    }
                  />
                  <label className="easy-input">
                    Date
                    <input
                      type="date"
                      value={settings.countdown.date}
                      onChange={(e) =>
                        change({
                          ...settings,
                          countdown: { ...settings.countdown, date: e.target.value },
                        })
                      }
                    />
                  </label>
                </>
              )}
              {sectionField === "wall" && (
                <>
                  <TextField
                    title=""
                    label="Title"
                    value={settings.wall.title}
                    max={40}
                    onChange={(v) => change({ ...settings, wall: { title: v } })}
                  />
                  <p className="easy-note">
                    Visitors can stick short notes here. You can take any note down from the wall
                    itself.
                  </p>
                </>
              )}
              {["latest", "selected", "posts"].includes(sectionField) && (
                <p className="easy-note">
                  This fills itself from your posts. Move it or hide it below.
                </p>
              )}
              <div className="easy-row">
                <button onClick={() => move(sectionField, -1)}>
                  <ArrowUp /> Move up
                </button>
                <button onClick={() => move(sectionField, 1)}>
                  <ArrowDown /> Move down
                </button>
                <button className="danger" onClick={() => remove(sectionField)}>
                  <EyeOff /> Hide
                </button>
              </div>
            </div>
          )}
          {sheet === "colors" && kind === "design" && (
            <div className="easy-field">
              <h2>Colors</h2>
              <div className="easy-palettes" role="radiogroup" aria-label="Accent color">
                {accents.map(([hex, name]) => (
                  <button
                    key={hex}
                    role="radio"
                    aria-checked={design.accent.toLowerCase() === hex}
                    onClick={() => changeDesign({ ...design, accent: hex })}
                  >
                    <span className="easy-swatch" aria-hidden="true">
                      <i style={{ background: hex }} />
                    </span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sheet === "colors" && look && (kind === "room" || kind === "comic") && (
            <div className="easy-field">
              <h2>Colors</h2>
              <div className="easy-palettes" role="radiogroup" aria-label="Colors">
                {Object.entries(
                  lookTints[kind] as Record<string, { name: string; colors: readonly string[] }>,
                ).map(([key, tint]) => (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={look.tint === key}
                    onClick={() => changeLook({ ...look, tint: key }, true)}
                  >
                    <span className="easy-swatch" aria-hidden="true">
                      {tint.colors.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    {tint.name}
                  </button>
                ))}
              </div>
              <p className="easy-note">Dark mode keeps its own night colours.</p>
            </div>
          )}
          {sheet === "colors" && smudge && (
            <div className="easy-field">
              <h2>Colors</h2>
              <div className="easy-palettes" role="radiogroup" aria-label="Paint colors">
                {(Object.keys(smudgePalettes) as SmudgePalette[]).map((key) => (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={settings.palette === key}
                    onClick={() => change({ ...settings, palette: key }, true)}
                  >
                    <span className="easy-swatch" aria-hidden="true">
                      {smudgePalettes[key].map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    {paletteNames[key]}
                  </button>
                ))}
              </div>
              <p className="easy-note">In October, Halloween paints take over for everyone.</p>
            </div>
          )}
          {sheet === "section" && (
            <div className="easy-field">
              <h2>
                Add a <em>section</em>
              </h2>
              <p className="easy-note">Each one already matches your vibe.</p>
              <div className="easy-sections">
                {addable.map((kind) => {
                  const added = settings.sections.includes(kind);
                  return (
                    <button
                      key={kind}
                      className={`easy-section-card card-${kind}`}
                      disabled={added}
                      onClick={() => {
                        change(withStarter(settings, kind), true);
                        pick(kind);
                      }}
                    >
                      <strong>{sectionInfo[kind].name}</strong>
                      <small>{added ? "On your profile ✓" : sectionInfo[kind].note}</small>
                      {kind === "wall" && !added && <b className="easy-new">NEW</b>}
                      <span className="easy-mini" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {sheet === "order" && kind === "design" && (
            <div className="easy-field">
              <h2>Order</h2>
              <ol className="easy-order">
                {presentParts.map((part, i) => (
                  <li key={part}>
                    <span>{partNames[part]}</span>
                    <button
                      aria-label={`Move ${partNames[part]} up`}
                      disabled={i === 0}
                      onClick={() => movePart(part, -1)}
                    >
                      <ArrowUp />
                    </button>
                    <button
                      aria-label={`Move ${partNames[part]} down`}
                      disabled={i === presentParts.length - 1}
                      onClick={() => movePart(part, 1)}
                    >
                      <ArrowDown />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {sheet === "order" && smudge && (
            <div className="easy-field">
              <h2>Order</h2>
              <ol className="easy-order">
                {settings.sections.map((kind, i) => (
                  <li key={kind}>
                    <span>{sectionInfo[kind].name}</span>
                    <button
                      aria-label={`Move ${sectionInfo[kind].name} up`}
                      disabled={i === 0}
                      onClick={() => move(kind, -1)}
                    >
                      <ArrowUp />
                    </button>
                    <button
                      aria-label={`Move ${sectionInfo[kind].name} down`}
                      disabled={i === settings.sections.length - 1}
                      onClick={() => move(kind, 1)}
                    >
                      <ArrowDown />
                    </button>
                    <button
                      aria-label={`Hide ${sectionInfo[kind].name}`}
                      onClick={() => remove(kind)}
                    >
                      <EyeOff />
                    </button>
                  </li>
                ))}
              </ol>
              <p className="easy-note">Your name and photo always stay at the top.</p>
            </div>
          )}
        </section>
      )}
      <nav className="easy-tools" aria-label="Editor tools">
        <button onClick={() => setStep("pick")}>
          <Dices />
          <span>Vibe</span>
        </button>
        <button
          disabled={!easy}
          aria-pressed={sheet === "colors"}
          onClick={() => setSheet(sheet === "colors" ? null : "colors")}
        >
          <Palette />
          <span>Colors</span>
        </button>
        {smudge && (
          <button
            className="easy-add"
            aria-pressed={sheet === "section"}
            onClick={() => setSheet(sheet === "section" ? null : "section")}
          >
            <Plus />
            <span>Section</span>
          </button>
        )}
        {(smudge || kind === "design") && (
          <button
            aria-pressed={sheet === "order"}
            onClick={() => setSheet(sheet === "order" ? null : "order")}
          >
            <ListOrdered />
            <span>Order</span>
          </button>
        )}
        {easy && !smudge && (
          <button onClick={() => pick("about")}>
            <Pencil />
            <span>Name</span>
          </button>
        )}
        {easy ? (
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
        ) : (
          <button onClick={() => pick("about")}>
            <Pencil />
            <span>Name</span>
          </button>
        )}
      </nav>
      <div className="easy-more">
        <button
          aria-label={device === "phone" ? "Show on a computer" : "Show on a phone"}
          title={device === "phone" ? "Show on a computer" : "Show on a phone"}
          onClick={() => setDevice((d) => (d === "phone" ? "pc" : "phone"))}
        >
          {device === "phone" ? <Monitor /> : <Smartphone />}
        </button>
        <button onClick={() => onAdvanced(draft!.id)}>
          <Code /> Advanced editor
        </button>
      </div>
    </div>
  );
}

/**
 * Each save produces a new draft revision, and the frame has to load it again. The new frame loads
 * hidden behind the current one and takes its place only once it has drawn, so editing never
 * flashes a blank or loading screen.
 */
export function SmoothPreview({
  kind = "profile",
  draft,
  height,
  heights,
  editing,
  onEdit,
}: {
  kind?: "profile" | "post";
  draft: { id: string; revision: number };
  height: number;
  heights: { autoHeight?: boolean | undefined; mobileHeight?: number | undefined };
  editing: boolean;
  onEdit: (field: string) => void;
}) {
  const key = `${draft.id}:${draft.revision}`;
  const [layers, setLayers] = useState([{ key, revision: draft.revision }]);
  useEffect(() => {
    setLayers((now) =>
      now.some((l) => l.key === key)
        ? now
        : // Only the newest pending revision matters; one still loading is replaced.
          [now[0]!, { key, revision: draft.revision }],
    );
  }, [key, draft.revision]);
  const promote = useCallback(
    (k: string) => setLayers((now) => (now[1]?.key === k ? [now[1]] : now)),
    [],
  );
  useEffect(() => {
    const pending = layers[1];
    if (!pending) return;
    // A frame that never reports back still shows up, rather than freezing the old one.
    const t = setTimeout(() => promote(pending.key), 6000);
    return () => clearTimeout(t);
  }, [layers, promote]);
  return (
    <div className="easy-layers">
      {layers.map((layer, i) => (
        <div
          key={layer.key}
          className={`easy-layer ${i === 0 ? "shown" : "incoming"}`}
          aria-hidden={i === 0 ? undefined : true}
        >
          <Runtime
            kind={kind}
            preview
            target={draft.id}
            version={layer.revision}
            height={height}
            {...heights}
            editing={editing}
            onEdit={i === 0 ? onEdit : undefined}
            onReady={i === 0 ? undefined : () => promote(layer.key)}
          />
        </div>
      ))}
    </div>
  );
}

export function ChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="easy-text">
      <p className="easy-label">{label}</p>
      <div className="easy-chips-row" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button key={key} aria-pressed={value === key} onClick={() => onChange(key)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TextField({
  title,
  label,
  hint,
  value,
  max,
  placeholder,
  area = false,
  onChange,
}: {
  title: string;
  label?: string;
  hint?: string;
  value: string;
  max: number;
  placeholder?: string;
  area?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="easy-text">
      {title && <h2>{title}</h2>}
      <label className="easy-input">
        {label ?? <span className="sr-only">{title}</span>}
        {area ? (
          <textarea
            maxLength={max}
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            maxLength={max}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </label>
      {hint && <p className="easy-note">{hint}</p>}
    </div>
  );
}

function AboutFields({
  identity,
  onChange,
  onUpload,
  photoFirst = false,
}: {
  identity: ProfileIdentity;
  onChange: (next: ProfileIdentity) => void;
  onUpload: (file: File) => Promise<void>;
  photoFirst?: boolean;
}) {
  const photo = (
    <div className="easy-photo">
      <label className="easy-upload">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Upload a profile photo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onUpload(file);
          }}
        />
        {identity.avatarAssetId ? "Change photo" : "Add a photo"}
      </label>
      {identity.avatarAssetId && (
        <button onClick={() => onChange({ ...identity, avatarAssetId: null })}>
          Use my initials
        </button>
      )}
    </div>
  );
  return (
    <div className="easy-field">
      <h2>{photoFirst ? "Your photo" : "Name & bio"}</h2>
      {photoFirst && photo}
      <label className="easy-input">
        Name
        <input
          maxLength={80}
          value={identity.name}
          onChange={(e) => onChange({ ...identity, name: e.target.value })}
        />
      </label>
      <label className="easy-input">
        Bio
        <textarea
          maxLength={300}
          rows={3}
          value={identity.bio}
          onChange={(e) => onChange({ ...identity, bio: e.target.value })}
        />
      </label>
      {!photoFirst && photo}
    </div>
  );
}

const friendlyErrors: Record<string, string> = {
  REVISION_CONFLICT: "This draft changed somewhere else. Close and open the editor again.",
  PROFILE_CONFLICT: "Your profile changed somewhere else. Close and open the editor again.",
  ASSET_NOT_ACCESSIBLE: "That photo can't be used. Try uploading it again.",
};
function friendly(message: string) {
  const code = message.split(" (")[0]!;
  return friendlyErrors[code] ?? (code === code.toUpperCase() ? "Something went wrong." : message);
}
