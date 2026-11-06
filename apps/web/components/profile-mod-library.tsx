"use client";
import { useEffect, useRef, useState } from "react";
import type { ModSummary, SharedMod } from "../../../packages/contracts/src/mod";
import { partSlots, type ProfileDraft } from "../../../packages/contracts/src/profile";
import { api } from "./runtime";
import { Dialog } from "./ui";
import { ModPreview } from "./mod-preview";

export function ProfileModLibrary({
  draft,
  actorId,
  disabled,
  onInstalled,
}: {
  draft: ProfileDraft | null;
  actorId: string;
  disabled: boolean;
  onInstalled: (draft: ProfileDraft, mixed: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"browse" | "share">("browse");
  const [mods, setMods] = useState<ModSummary[]>([]),
    [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const [slots, setSlots] = useState<string[]>([...partSlots]),
    [agree, setAgree] = useState(false);
  const [thumbnail, setThumbnail] = useState(""),
    [update, setUpdate] = useState("");
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([]);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [editions, setEditions] = useState<Record<string, SharedMod>>({});
  const retry = useRef<{ content: string; id: string } | null>(null);
  const [candidate, setCandidate] = useState<{
    draft: ProfileDraft;
    slot: string | undefined;
    name: string;
  } | null>(null);
  useEffect(() => {
    setSlots(
      draft?.package.manifest.schemaVersion === 2
        ? partSlots.filter(
            (s) => draft.package.manifest.schemaVersion === 2 && draft.package.manifest.parts[s],
          )
        : [],
    );
    setAgree(false);
    setUpdate("");
  }, [draft?.id, draft?.revision]);
  async function load() {
    const [list, boot] = await Promise.all([
      api<ModSummary[]>("/mods"),
      api<{ assets: { id: string; name: string }[] }>("/bootstrap"),
    ]);
    setMods(list);
    setEditions({});
    setVersions({});
    setAssets(boot.assets);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      const text = (e as Error).message;
      setMessage(
        text.includes("PART_FILE_CONFLICT")
          ? "These parts have conflicting source files. Try the mod as a new draft, or rename the conflicting files in source before mixing."
          : text,
      );
    } finally {
      setBusy(false);
    }
  }
  async function install(m: ModSummary, slot?: string) {
    await run(async () => {
      const d = await api<ProfileDraft>(`/mods/${m.id}/preview`, {
        version: versions[m.id] ?? m.version,
        ...(slot && draft ? { draftId: draft.id, revision: draft.revision, slot } : {}),
      });
      setCandidate({ draft: d, slot, name: m.name });
    });
  }
  async function share() {
    if (!draft) return;
    await run(async () => {
      const previous = mods.find((m) => m.id === update);
      const input = {
        draftId: draft.id,
        revision: draft.revision,
        name,
        description,
        slots,
        thumbnailAssetId: thumbnail || null,
        shareAssets: true,
        ...(previous ? { modId: previous.id, expectedVersion: previous.version } : {}),
      };
      const content = JSON.stringify(input);
      if (retry.current?.content !== content) retry.current = { content, id: crypto.randomUUID() };
      const m = await api<SharedMod>("/mods", { ...input, submissionId: retry.current.id });
      await load();
      retry.current = null;
      setAgree(false);
      setTab("browse");
      setQuery(m.name);
      setMessage(`Shared ${m.name} · version ${m.version}. Other demo accounts can now try it.`);
    });
  }
  return (
    <>
      <button
        className="mod-library-open"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          void run(load);
        }}
      >
        Browse & share mods
      </button>
      {candidate && (
        <ModPreview
          draft={candidate.draft}
          previous={draft}
          changed={
            candidate.slot
              ? `Replace ${candidate.slot} with ${candidate.name}; keep other parts`
              : `New draft with ${candidate.name}`
          }
          onClose={() => setCandidate(null)}
          onApply={async (d) => {
            await onInstalled(d, Boolean(candidate.slot));
            setCandidate(null);
            setOpen(false);
          }}
        />
      )}
      {open && !candidate && (
        <Dialog
          title="Mod library"
          wide
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="mod-library">
            <p className="mod-intro">
              Pages other people shared. <b>Try it</b> opens one as a new draft. <b>Use one part</b>{" "}
              swaps just that part into the draft you have open. Nothing goes live until you
              publish.
            </p>
            <div className="mod-tabs">
              <button aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>
                Explore mods
              </button>
              <button
                disabled={!draft || draft.package.manifest.schemaVersion !== 2}
                aria-pressed={tab === "share"}
                onClick={() => setTab("share")}
              >
                Share current draft
              </button>
            </div>
            {message && (
              <p role="status" className="mod-message">
                {message}
              </p>
            )}
            {tab === "browse" ? (
              <>
                <label className="mod-search">
                  <input
                    aria-label="Search mods"
                    type="search"
                    placeholder="Search by name or creator"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="mod-grid">
                  {mods
                    .filter((m) =>
                      `${m.name} ${m.creatorName}`.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((latest) => {
                      const edition = editions[latest.id];
                      const m = edition
                        ? {
                            ...latest,
                            ...edition,
                            capabilities: edition.package.manifest.capabilities,
                            assetCount: edition.package.manifest.assets.length,
                          }
                        : latest;
                      return (
                        <article className="mod-card" key={m.id}>
                          {m.thumbnailAssetId ? (
                            <img
                              className="mod-cover"
                              alt={`${m.name} cover`}
                              src={`/api/mods/${m.id}/assets/${m.thumbnailAssetId}?version=${m.version}`}
                            />
                          ) : (
                            <div
                              className={`mod-cover mod-cover-art ${m.name.includes("After Hours") ? "vinyl" : "paper"}`}
                              aria-hidden="true"
                            >
                              <span>{m.name}</span>
                              <i />
                            </div>
                          )}
                          <div className="mod-card-body">
                            <h3>{m.name}</h3>
                            <p className="mod-byline">
                              by{" "}
                              <a
                                href={`/?profile=${encodeURIComponent(m.bundled ? actorId : m.creatorId)}&mods=${m.bundled ? "forma" : "1"}`}
                              >
                                {m.creatorName}
                              </a>
                              {m.bundled ? " · Starter" : ""}
                            </p>
                            <p className="mod-description">{m.description}</p>
                            <div className="mod-slots" aria-label="Parts in this mod">
                              {m.slots.map((s) => (
                                <span key={s}>{s}</span>
                              ))}
                            </div>
                          </div>
                          <div className="mod-actions">
                            <button
                              className="profile-primary"
                              aria-label={`Try ${m.name}`}
                              disabled={busy}
                              onClick={() => void install(m)}
                            >
                              Try it
                            </button>
                            {draft?.package.manifest.schemaVersion === 2 && (
                              <select
                                aria-label={`Mix ${m.name}`}
                                title="Swap one part of your draft for this one"
                                disabled={busy}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) void install(m, e.target.value);
                                }}
                              >
                                <option value="">Use one part…</option>
                                {m.slots.map((s) => (
                                  <option value={s} key={s}>
                                    Just the {s}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <details className="mod-more">
                            <summary>Version and permissions</summary>
                            <label>
                              Version
                              <select
                                aria-label={`Version of ${m.name}`}
                                value={versions[m.id] ?? m.version}
                                disabled={busy}
                                onChange={(e) =>
                                  void run(async () => {
                                    const version = Number(e.target.value);
                                    const selected = await api<SharedMod>(
                                      `/mods/${m.id}?version=${version}`,
                                    );
                                    setEditions((prev) => ({ ...prev, [m.id]: selected }));
                                    setVersions((prev) => ({ ...prev, [m.id]: version }));
                                  })
                                }
                              >
                                {Array.from(
                                  { length: latest.version },
                                  (_, i) => latest.version - i,
                                ).map((v) => (
                                  <option key={v} value={v}>
                                    v{v}
                                    {v === latest.version ? " · Latest" : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p>
                              Permissions: {m.capabilities.join(", ") || "none"}. Comes with{" "}
                              {m.assetCount} {m.assetCount === 1 ? "file" : "files"}. Parts from
                              different mods may need small code fixes to work together.
                            </p>
                          </details>
                        </article>
                      );
                    })}
                </div>
                {!busy &&
                  !mods.some((m) =>
                    `${m.name} ${m.creatorName}`.toLowerCase().includes(query.toLowerCase()),
                  ) && (
                    <p className="mod-empty">
                      No matching mods. Try another name or share your own.
                    </p>
                  )}
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void share();
                }}
              >
                <fieldset disabled={busy || !draft} className="mod-share">
                  <legend>Share your draft as a mod</legend>
                  <p className="mod-intro">
                    Other people can then try it whole or take one part of it.
                  </p>
                  <label>
                    Save as
                    <select
                      aria-label="Mod publication"
                      value={update}
                      onChange={(e) => setUpdate(e.target.value)}
                    >
                      <option value="">A new mod</option>
                      {mods
                        .filter((m) => m.creatorId === actorId && !m.bundled)
                        .map((m) => (
                          <option value={m.id} key={m.id}>
                            New version of {m.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Name
                    <input
                      aria-label="Mod name"
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      aria-label="Mod description"
                      required
                      maxLength={400}
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <div className="mod-slot-checks" role="group" aria-label="Parts to share">
                    {partSlots
                      .filter(
                        (s) =>
                          draft?.package.manifest.schemaVersion === 2 &&
                          draft.package.manifest.parts[s],
                      )
                      .map((s) => (
                        <label key={s}>
                          <input
                            type="checkbox"
                            checked={slots.includes(s)}
                            onChange={(e) =>
                              setSlots(
                                e.target.checked ? [...slots, s] : slots.filter((x) => x !== s),
                              )
                            }
                          />
                          Share {s}
                        </label>
                      ))}
                  </div>
                  <label>
                    Library cover
                    <select
                      aria-label="Mod cover"
                      value={thumbnail}
                      onChange={(e) => setThumbnail(e.target.value)}
                    >
                      <option value="">Graphic cover using the mod name</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details className="mod-more">
                    <summary>What gets shared</summary>
                    <p>
                      All the code and design files in this draft, even for parts you leave
                      unticked. Your name, posts, votes and drawings stay yours.
                    </p>
                    <ul>
                      {draft?.package.manifest.assets.map((id) => (
                        <li key={id}>{assets.find((a) => a.id === id)?.name ?? id}</li>
                      ))}
                    </ul>
                  </details>
                  <label className="mod-consent">
                    <input
                      required
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                    />
                    I want to share this code and its files with other people.
                  </label>
                  <button className="profile-primary" disabled={!agree || !slots.length}>
                    Share mod
                  </button>
                </fieldset>
              </form>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
