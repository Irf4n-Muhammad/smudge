"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Upload, Feather, Eye, Code2, Check, RefreshCw, ArrowUpRight } from "lucide-react";
import type { DraftView, Experience } from "../../../packages/contracts/src/experience";
import { api, Runtime } from "./runtime";
import { Avatar, Dialog } from "./ui";
import { labels } from "./types";
import type { Boot } from "./types";
export function Studio({
  boot,
  draftId,
  onClose,
  onPublished,
  notify,
}: {
  boot: Boot;
  draftId?: string;
  onClose: () => void;
  onPublished: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [drafts, setDrafts] = useState<DraftView[]>([]),
    [draft, setDraft] = useState<DraftView | null>(null),
    [source, setSource] = useState(""),
    [title, setTitle] = useState(""),
    [caption, setCaption] = useState(""),
    [coverAssetId, setCoverAssetId] = useState<string | undefined>(),
    [contributors, setContributors] = useState<string[]>([]),
    [tab, setTab] = useState("preview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [assets, setAssets] = useState(boot.assets),
    [dirty, setDirty] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    packageInput = useRef<HTMLInputElement>(null),
    photoInput = useRef<HTMLInputElement>(null);
  function choose(d: DraftView) {
    setDraft(d);
    setTitle(d.metadata.title);
    setCaption(d.metadata.caption);
    setCoverAssetId(d.metadata.coverAssetId);
    setContributors(d.metadata.contributors);
    setSource(JSON.stringify(d.package, null, 2));
    setDirty(false);
    setError("");
  }
  const load = async () => {
    const ds = await api<DraftView[]>("/drafts");
    setDrafts(ds);
    return ds;
  };
  useEffect(() => {
    let active = true;
    setBusy(true);
    load()
      .then((ds) => {
        if (!active) return;
        const found = draftId ? ds.find((d) => d.id === draftId) : ds[0];
        if (found) choose(found);
        else if (draftId)
          setError("This draft belongs to another demo account, or no longer exists.");
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const safely = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  async function newDraft() {
    await safely(async () => {
      const spec = await api("/spec");
      const d = await api<DraftView>("/drafts", {
        package: {
          ...spec.example,
          manifest: { ...spec.example.manifest, name: "My little world" },
          files: {
            "index.html":
              "<style>body{background:#efe6d8;color:#433b31}main{padding:48px}h1{font:italic 48px Georgia}button{padding:12px 20px;border:0;border-radius:24px;background:#d85538;color:white}</style><main><small>A PAGE FROM MY DAY</small><h1>My little world.</h1><p id='note'>Something worth keeping.</p><button onclick=\"document.getElementById('note').textContent='A little surprise, just for you.'\">Open a little surprise ↗</button></main>",
          },
        },
        metadata: { title: "My little world", caption: "", format: "custom", contributors: [] },
      });
      choose(d);
      await load();
    });
  }
  async function save() {
    if (!draft) throw new Error("Choose a draft first.");
    const pkg = JSON.parse(source);
    const validation = await api("/validate", pkg);
    if (!validation.valid)
      throw new Error(
        validation.issues
          .map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
          .join("; "),
      );
    const d = await api<DraftView>(
      `/drafts/${draft.id}`,
      {
        revision: draft.revision,
        package: pkg,
        metadata: { ...draft.metadata, title, caption, contributors, coverAssetId },
      },
      "PUT",
    );
    choose(d);
    await load();
    return d;
  }
  async function upload(file: File, asNew = false) {
    if (!draft && !asNew) return;
    await safely(async () => {
      if (file.size > 3000000) throw new Error("Choose an image smaller than 3 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]!);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const asset = await api("/assets", { name: file.name, mime: file.type, base64 });
      setAssets((a) => [...a, asset]);
      if (asNew) {
        const d = await api<DraftView>("/drafts", {
          package: {
            manifest: {
              schemaVersion: 2,
              runtimeVersion: "web-v1",
              name: "Photo post",
              entrypoint: "index.html",
              capabilities: [],
              assets: [asset.id],
            },
            files: {
              "index.html": `<style>body{margin:0;background:transparent}img{display:block;width:100%;height:100vh;object-fit:contain}</style><img src="asset:${asset.id}" alt="Uploaded photo">`,
            },
          },
          metadata: {
            title: file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "My photo",
            caption: "",
            format: "photo",
            contributors: [],
            coverAssetId: asset.id,
          },
        });
        choose(d);
        setTab("preview");
        await load();
        notify("Photo ready. Add your title and caption, then publish.");
      } else {
        addAsset(asset.id);
      }
    });
  }
  function addAsset(id: string) {
    try {
      const pkg = JSON.parse(source) as Experience;
      if (pkg.manifest.schemaVersion === 1)
        pkg.manifest = { ...pkg.manifest, schemaVersion: 2, assets: [] };
      if (!pkg.manifest.assets.includes(id)) pkg.manifest.assets.push(id);
      pkg.files["index.html"] +=
        `<img src="asset:${id}" alt="A moment from my day" style="display:block;max-width:100%;height:auto">`;
      setSource(JSON.stringify(pkg, null, 2));
      if (!coverAssetId) setCoverAssetId(id);
      setDirty(true);
      notify("Photo added. Save & preview to see it.");
    } catch {
      setError("Fix the package JSON before adding a photo.");
    }
  }
  async function importPackage(file: File) {
    await safely(async () => {
      if (file.size > 2500000) throw new Error("Package is too large.");
      const pkg = JSON.parse(await file.text());
      const result = await api("/validate", pkg);
      if (!result.valid)
        throw new Error("This package has invalid fields. Check the package contract.");
      if (!draft) {
        const d = await api<DraftView>("/drafts", {
          package: pkg,
          metadata: { title: pkg.manifest.name, caption: "", format: "custom", contributors: [] },
        });
        choose(d);
        await load();
      } else {
        setSource(JSON.stringify(pkg, null, 2));
        setDirty(true);
      }
      notify("Package imported. Preview before publishing.");
    });
  }
  return (
    <Dialog title="Your creative studio." onClose={onClose} wide>
      <div className="studio-layout">
        <aside className="draft-sidebar">
          <div className="section-title">
            <h3>Your drafts</h3>
            <button
              className="icon-button"
              aria-label="New draft"
              onClick={() => void newDraft()}
              disabled={busy}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            className="primary"
            disabled={busy || dirty}
            onClick={() => photoInput.current?.click()}
          >
            <Plus size={16} /> New photo post
          </button>
          {dirty && <p className="fineprint">Save your changes before starting another post.</p>}
          <input
            ref={photoInput}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file, true);
              e.target.value = "";
            }}
          />
          {drafts.map((d) => (
            <button
              className={draft?.id === d.id ? "draft-item selected" : "draft-item"}
              key={d.id}
              disabled={busy}
              onClick={() => {
                if (dirty) {
                  setError("Save your changes before switching drafts.");
                  return;
                }
                choose(d);
              }}
            >
              <Feather size={16} />
              <span>
                <strong>{d.metadata.title}</strong>
                <small>
                  Revision {d.revision} · {labels[d.metadata.format]}
                </small>
              </span>
            </button>
          ))}
          <button
            className="import-button"
            onClick={() => packageInput.current?.click()}
            disabled={busy}
          >
            <Upload size={15} />
            Import a package
          </button>
          <input
            ref={packageInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importPackage(f);
              e.target.value = "";
            }}
          />
          <p className="fineprint">
            AI-created drafts appear here. Each published revision stays unchanged.
          </p>
        </aside>
        <div className="studio-main">
          {!draft ? (
            <div className="empty-state">
              <Feather size={30} />
              <h2>Start with a little idea.</h2>
              <p>Create a draft or import a package from your AI.</p>
              <button className="primary" disabled={busy} onClick={() => void newDraft()}>
                Create a draft <Plus size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="draft-fields">
                <label>
                  Story title
                  <input
                    disabled={busy}
                    value={title}
                    maxLength={100}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  A few words about it
                  <textarea
                    disabled={busy}
                    value={caption}
                    maxLength={1000}
                    rows={2}
                    placeholder="What’s the story?"
                    onChange={(e) => {
                      setCaption(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
              <div className="studio-tabs">
                <div>
                  {[
                    ["preview", Eye, "Preview"],
                    ["source", Code2, "Experience source"],
                    ["media", Upload, "Photos & people"],
                  ].map(([id, Icon, label]) => {
                    const I = Icon as typeof Eye;
                    return (
                      <button
                        key={String(id)}
                        className={tab === id ? "selected" : ""}
                        onClick={() => setTab(String(id))}
                      >
                        <I size={15} />
                        {String(label)}
                      </button>
                    );
                  })}
                </div>
                <span>{dirty ? "Unsaved changes" : "Saved locally"}</span>
              </div>
              {tab === "preview" && (
                <div className="studio-preview">
                  <div className="preview-caption">
                    Your audience’s view{" "}
                    <span>Preview interactions are separate from your published post.</span>
                  </div>
                  {dirty && (
                    <div className="unsaved-hint">
                      Showing the last saved version. Save & preview to apply your changes.
                    </div>
                  )}
                  <Runtime
                    stage={
                      draft.package.manifest.schemaVersion === 2
                        ? draft.package.manifest.stage
                        : undefined
                    }
                    key={`${draft.id}:${draft.revision}`}
                    target={draft.id}
                    preview
                    version={draft.revision}
                    height={
                      draft.package.manifest.schemaVersion === 2
                        ? (draft.package.manifest.stage?.height ?? 510)
                        : 510
                    }
                  />
                </div>
              )}
              {tab === "source" && (
                <div className="source-pane">
                  <p>
                    HTML, CSS, and JavaScript shape how your story works. Import a package from your
                    AI, or edit it here.
                  </p>
                  <textarea
                    disabled={busy}
                    aria-label="Experience package JSON"
                    spellCheck={false}
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value);
                      setDirty(true);
                    }}
                  />
                  <button
                    className="quiet-button"
                    onClick={() =>
                      void safely(async () => {
                        const result = await api("/validate", JSON.parse(source));
                        if (!result.valid)
                          throw new Error(
                            result.issues.map((i: { message: string }) => i.message).join("; "),
                          );
                        notify("Package is valid. Preview it to check how it behaves.");
                      })
                    }
                  >
                    <Check size={15} />
                    Validate package
                  </button>
                </div>
              )}
              {tab === "media" && (
                <div className="media-pane">
                  <div className="section-title">
                    <h3>Photos for this story</h3>
                    <button
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload size={15} />
                      Upload photo
                    </button>
                  </div>
                  <input
                    ref={fileInput}
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = "";
                    }}
                  />
                  <p className="fineprint">
                    JPEG, PNG or WebP · Up to 3 MB · Stored on this computer
                  </p>
                  <label>
                    Profile cover
                    <select
                      aria-label="Profile cover"
                      disabled={busy}
                      value={coverAssetId ?? ""}
                      onChange={(e) => {
                        try {
                          const id = e.target.value;
                          const pkg = JSON.parse(source) as Experience;
                          if (id) {
                            if (pkg.manifest.schemaVersion === 1)
                              pkg.manifest = { ...pkg.manifest, schemaVersion: 2, assets: [] };
                            if (!pkg.manifest.assets.includes(id)) pkg.manifest.assets.push(id);
                          }
                          setSource(JSON.stringify(pkg, null, 2));
                          setCoverAssetId(id || undefined);
                          setDirty(true);
                        } catch {
                          setError("Fix the package JSON before selecting a cover.");
                        }
                      }}
                    >
                      <option value="">No cover</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="fineprint">
                    This photo represents your post in compatible profile layouts, including Cutouts
                    and Photo stack. Click a photo below to also add it inside your experience.
                  </p>
                  <div className="asset-grid">
                    {assets.map((a) => (
                      <button key={a.id} disabled={busy} onClick={() => addAsset(a.id)}>
                        <img src={`/api/assets/${a.id}`} alt={a.name} />
                        <span>
                          <Plus size={12} />
                          {a.name}
                        </span>
                      </button>
                    ))}
                  </div>
                  <h3>Who can add a memory?</h3>
                  <p className="fineprint">
                    Applies when this experience uses contributions. You can always contribute to
                    your own post.
                  </p>
                  <div className="contributor-list">
                    {boot.users
                      .filter((u) => u.id !== boot.actor.userId)
                      .map((u) => (
                        <label key={u.id}>
                          <input
                            type="checkbox"
                            checked={contributors.includes(u.id)}
                            onChange={(e) => {
                              setContributors((current) =>
                                e.target.checked
                                  ? [...current, u.id]
                                  : current.filter((id) => id !== u.id),
                              );
                              setDirty(true);
                            }}
                          />
                          <Avatar user={u} small />
                          {u.name}
                        </label>
                      ))}
                  </div>
                </div>
              )}
              <footer className="studio-actions">
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() =>
                    void safely(async () => {
                      await save();
                      setTab("preview");
                      notify("Saved. Your preview is up to date.");
                    })
                  }
                >
                  {busy ? <RefreshCw size={15} /> : <Check size={15} />}Save & preview
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void safely(async () => {
                      const current = dirty ? await save() : draft;
                      await api(`/drafts/${current.id}/publish`, { revision: current.revision });
                      await onPublished();
                    })
                  }
                >
                  Publish story <ArrowUpRight size={16} />
                </button>
              </footer>
            </>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
