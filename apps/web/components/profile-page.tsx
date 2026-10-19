"use client";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { PostView, User } from "../../../packages/contracts/src/experience";
import type {
  ProfileDraft,
  ProfilePackage,
  ProfilePublication,
  ProfileState,
  ProfileIdentity,
} from "../../../packages/contracts/src/profile";
import { api, Runtime } from "./runtime";
import { PostLink } from "./post-link";
import { Dialog, Avatar } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import type { Boot } from "./types";
import { ProfilePartPicker } from "./profile-part-picker";
import { ProfilePersonalizer } from "./profile-personalizer";
import { ProfilePhotoComposer } from "./profile-photo-composer";
import { ProfileModLibrary } from "./profile-mod-library";
import { ProfileDiscovery } from "./profile-discovery";
import { EasyEditor } from "./easy-editor";
import {
  applyProfileDesign,
  defaultProfileDesign,
} from "../../../packages/core/src/profile-design";
import {
  Home,
  Search,
  Bell,
  MessageCircle,
  Plus,
  UserRound,
  BadgeCheck,
  Pencil,
  Lock,
} from "lucide-react";
import type { Chapter } from "../../../packages/contracts/src/identity";
import { ChapterList } from "./identity-hub";
import { DecorFrame, themeStyle } from "./post-decor";
import type { DecoratedPost } from "./post-decor";

type PublicProfile = ProfileState & { manifest: ProfilePackage["manifest"] | null };
type History = { state: ProfileState; publications: ProfilePublication[] };
export function ProfilePage({
  ownerId,
  boot,
  posts,
  onBack,
  onRefresh,
  onNavigate,
  onUseDraft,
  more,
}: {
  ownerId: string;
  boot: Boot;
  posts: PostView[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onNavigate: (
    destination:
      | "home"
      | "following"
      | "create"
      | "saved"
      | "profile"
      | "explore"
      | "messages"
      | "notifications",
  ) => void;
  onUseDraft: (id: string) => void;
  /** The app's More menu (Saved, Themes, settings…), shown behind ☰ on your own profile. */
  more?: ReactNode;
}) {
  const owner = boot.users.find((u) => u.id === ownerId),
    mine = ownerId === boot.actor.userId;
  const [profile, setProfile] = useState<PublicProfile | null>(null),
    [error, setError] = useState("");
  const [panel, setPanel] = useState<"search" | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false),
    [open, setOpen] = useState<PostView | null>(null),
    [motion, setMotion] = useState(false),
    [busy, setBusy] = useState(false);
  const [draftLink, setDraftLink] = useState<string | undefined>();
  const [easy, setEasy] = useState(false);
  const [discovery, setDiscovery] = useState<"credits" | "creator" | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]),
    [showChapters, setShowChapters] = useState(false);
  const [theme, setTheme] = useState<DecoratedPost["decoration"] | null>(null);
  useEffect(() => {
    api<Chapter[]>(`/users/${encodeURIComponent(ownerId)}/chapters`).then(setChapters, () =>
      setChapters([]),
    );
  }, [ownerId]);
  const loadTheme = useCallback(
    () =>
      api<{ theme: DecoratedPost["decoration"] | null }>(
        `/users/${encodeURIComponent(ownerId)}/theme`,
      ).then(
        (r) => setTheme(r.theme),
        () => setTheme(null),
      ),
    [ownerId],
  );
  useEffect(() => {
    void loadTheme();
  }, [loadTheme]);
  const refresh = useCallback(async () => {
    try {
      setProfile(await api(`/profiles/${encodeURIComponent(ownerId)}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ownerId]);
  useEffect(() => {
    void refresh();
    const url = new URL(location.href);
    const d = url.searchParams.get("profileDraft");
    if (d && mine) {
      setEditing(true);
      setDraftLink(d);
    }
    url.searchParams.delete("mode");
    url.searchParams.set("profile", ownerId);
    history.replaceState(null, "", url);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const saved = localStorage.getItem("forma-profile-motion");
    setMotion(media.matches || saved === "reduce");
    const change = () =>
      setMotion(media.matches || localStorage.getItem("forma-profile-motion") === "reduce");
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [refresh, mine, ownerId]);
  const openPost = useCallback(
    (id: string) => {
      const post = posts.find((p) => p.id === id && p.ownerId === ownerId);
      if (post) setOpen(post);
      else setError("This post is no longer available. Refresh the profile.");
    },
    [posts, ownerId],
  );
  async function follow() {
    setBusy(true);
    try {
      await api(`/users/${ownerId}/follow`, {});
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!owner)
    return (
      <main className="profile-page">
        <button onClick={onBack}>Back to feed</button>
        <p>Profile not found.</p>
      </main>
    );
  const chapterDialog = showChapters && (
    <Dialog
      title={mine ? "Who you are" : `Who ${owner.name} is`}
      onClose={() => setShowChapters(false)}
    >
      <ChapterList chapters={chapters} />
      <p className="fineprint">
        Each chapter was proven by email, an organisation, a partner or a photo.
      </p>
    </Dialog>
  );
  return (
    <main
      className={`profile-page ${profile?.manifest?.schemaVersion === 2 ? "profile-illustrated" : ""} ${profile?.manifest?.schemaVersion === 2 && profile.manifest.headerOverlay && !editing ? "profile-overlay" : ""} ${!editing ? "has-side-nav" : ""}`}
    >
      <header className="profile-controls">
        <button className="profile-back" aria-label="Back to feed" onClick={onBack}>
          ← Feed
        </button>
        {profile?.manifest?.schemaVersion === 2 && (
          <span className="profile-brand" aria-hidden="true">
            smudge
          </span>
        )}
        <div className="profile-identity">
          <Avatar user={owner} small />
          <span>
            <strong>{owner.name}</strong>
            <small>@{owner.handle}</small>
          </span>
          {chapters.length > 0 && (
            <button
              className="chapter-chip"
              aria-label={`Who ${mine ? "you are" : "they are"}: ${chapters.length} proven chapters`}
              onClick={() => setShowChapters(true)}
            >
              <BadgeCheck size={13} /> {chapters.length}
            </button>
          )}
        </div>
        {theme && (
          <span
            className="profile-theme-chip"
            style={themeStyle(theme)}
            title={`Theme ${theme.name} by @${theme.creator}`}
          >
            {theme.name}
            {theme.event && <small>{theme.event}</small>}
          </span>
        )}
        {mine && !editing && (
          <button className="profile-edit" aria-label="Edit profile" onClick={() => setEasy(true)}>
            <Pencil size={16} /> Edit<span className="profile-edit-long"> profile</span>
          </button>
        )}
        {profile?.manifest?.schemaVersion === 2 ? (
          <button
            className="profile-search"
            aria-label="Search posts"
            onClick={() => setPanel("search")}
          >
            <Search />
          </button>
        ) : (
          !mine && <ThemeToggle />
        )}
        <details
          className="profile-options"
          open={profile?.manifest?.schemaVersion !== 2 ? true : undefined}
        >
          <summary aria-label="Profile options">☰</summary>
          <div className="profile-control-actions">
            {profile?.manifest?.schemaVersion === 2 && !mine && <ThemeToggle />}
            <button
              aria-pressed={motion}
              onClick={() => {
                const next = !motion;
                setMotion(next);
                localStorage.setItem("forma-profile-motion", next ? "reduce" : "normal");
              }}
            >
              Reduce motion
            </button>
            <button
              hidden={editing}
              onClick={async (e) => {
                if (profile?.manifest?.schemaVersion === 2)
                  if (profile?.manifest?.schemaVersion === 2)
                    e.currentTarget.closest("details")?.removeAttribute("open");
                const url = `${window.location.origin}/u/${encodeURIComponent(owner.handle)}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setError("Profile link copied. Anyone with it can see this page.");
                } catch {
                  setError(url);
                }
              }}
            >
              Copy profile link
            </button>
            <button
              hidden={editing}
              onClick={(e) => {
                setDiscovery("credits");
                if (profile?.manifest?.schemaVersion === 2)
                  if (profile?.manifest?.schemaVersion === 2)
                    e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Made with
            </button>
            {!editing && (
              <button
                onClick={(e) => {
                  setDiscovery("creator");
                  if (profile?.manifest?.schemaVersion === 2)
                    if (profile?.manifest?.schemaVersion === 2)
                      e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                Creator's mods
              </button>
            )}
            {mine ? (
              <button
                className="profile-primary"
                onClick={(e) => {
                  setEditing((v) => !v);
                  if (profile?.manifest?.schemaVersion === 2)
                    if (profile?.manifest?.schemaVersion === 2)
                      e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {editing ? "View published profile" : "Customize profile"}
              </button>
            ) : (
              <button disabled={busy} className="profile-primary" onClick={() => void follow()}>
                {boot.following.includes(ownerId)
                  ? "Unfollow"
                  : boot.requested.includes(ownerId)
                    ? "Requested"
                    : "Follow"}
              </button>
            )}
            {!mine && ownerId === "raka" && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const templates =
                      await api<Record<string, ProfilePackage>>("/profile-templates");
                    const d = await api<ProfileDraft>(
                      "/profile-drafts",
                      applyProfileDesign(templates.raka!, defaultProfileDesign),
                    );
                    const url = new URL(location.href);
                    url.searchParams.set("profile", boot.actor.userId);
                    url.searchParams.set("profileDraft", d.id);
                    window.location.assign(url.toString());
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Use this design
              </button>
            )}
            <button
              hidden={mine}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/profiles/${ownerId}/report`, {});
                  setError("Report recorded locally.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Report profile
            </button>
            {mine && profile?.manifest?.schemaVersion === 2 && more}
          </div>
        </details>
        {mine && more && profile?.manifest?.schemaVersion !== 2 && (
          // Plain profiles keep their actions in the header; More is the ☰ beside them.
          <details className="profile-more">
            <summary aria-label="More options">☰</summary>
            <div className="profile-more-menu">{more}</div>
          </details>
        )}
      </header>
      {owner.private && !mine && !boot.following.includes(ownerId) && (
        <div className="profile-message private-note" role="note">
          <Lock size={15} />
          <span>
            {boot.requested.includes(ownerId)
              ? `Your request is waiting for ${owner.name}.`
              : `${owner.name}'s posts are private. Follow to ask to see them.`}
          </span>
          <button className="text-button" disabled={busy} onClick={() => void follow()}>
            {boot.requested.includes(ownerId) ? "Cancel request" : "Follow"}
          </button>
        </div>
      )}
      {error && (
        <p className="profile-message" role="status">
          {error}
        </p>
      )}
      {editing && mine ? (
        <ProfileEditor
          key={ownerId}
          draftId={draftLink}
          reducedMotion={motion}
          owner={owner}
          onOpenPost={openPost}
          onChanged={async () => {
            await Promise.all([refresh(), onRefresh()]);
          }}
        />
      ) : profile ? (
        <div
          className={`profile-theme-frame ${theme ? "has-decor" : ""}`}
          style={themeStyle(theme ?? undefined)}
        >
          <DecorFrame post={{ decoration: theme ?? undefined } as DecoratedPost}>
            {profile?.publicationId && profile.manifest ? (
              <section aria-label="Public profile world" className="profile-world">
                <Runtime
                  key={`${ownerId}:${profile.publicationId}`}
                  kind="profile"
                  target={profile.publicationId}
                  height={profile.manifest.height}
                  autoHeight={profile.manifest.schemaVersion === 2 && profile.manifest.autoHeight}
                  mobileHeight={
                    profile.manifest.schemaVersion === 2 ? profile.manifest.mobileHeight : undefined
                  }
                  reducedMotion={motion}
                  onOpenPost={openPost}
                  onSocialChange={onRefresh}
                />
              </section>
            ) : (
              <section className="profile-default">
                <header className="profile-default-head">
                  <Avatar user={owner} />
                  <div>
                    <h1>{owner.name}</h1>
                    <span className="profile-default-handle">@{owner.handle}</span>
                    {owner.bio && <p>{owner.bio}</p>}
                    <span className="profile-default-count">
                      {posts.filter((p) => p.ownerId === ownerId).length} posts
                    </span>
                  </div>
                  {!mine && (
                    <button
                      disabled={busy}
                      className={boot.following.includes(ownerId) ? "quiet-button" : "primary"}
                      onClick={() => void follow()}
                    >
                      {boot.following.includes(ownerId)
                        ? "Following"
                        : boot.requested.includes(ownerId)
                          ? "Requested"
                          : "Follow"}
                    </button>
                  )}
                </header>
                {mine && (
                  <p className="profile-default-hint">
                    Make this page yours: a painted wall, a comic, a scrapbook.{" "}
                    <button className="text-button" onClick={() => setEasy(true)}>
                      Pick a style
                    </button>
                  </p>
                )}
                <div className="profile-default-grid">
                  {posts
                    .filter((p) => p.ownerId === ownerId)
                    .map((p) => (
                      <button key={p.id} onClick={() => setOpen(p)}>
                        {p.metadata.coverAssetId ? (
                          <img
                            src={`/api/assets/${p.metadata.coverAssetId}`}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span className="profile-default-blank" aria-hidden="true">
                            ✳
                          </span>
                        )}
                        <strong>{p.metadata.title}</strong>
                      </button>
                    ))}
                </div>
                {!posts.some((p) => p.ownerId === ownerId) && (
                  <p className="fineprint">
                    {mine ? "Your posts will show up here." : "No posts yet."}
                  </p>
                )}
              </section>
            )}
          </DecorFrame>
        </div>
      ) : (
        <p className="profile-message">Opening profile…</p>
      )}
      {!editing && profile && (
        <ProfileDiscovery
          ownerId={ownerId}
          onUseDraft={onUseDraft}
          publicationId={profile.publicationId}
          requested={discovery}
          onClose={() => setDiscovery(null)}
        />
      )}
      {easy && mine && (
        <EasyEditor
          owner={owner}
          onClose={() => setEasy(false)}
          onPublished={async () => {
            setEasy(false);
            await Promise.all([refresh(), onRefresh()]);
            setError("Profile published. This is what visitors see now.");
          }}
          onAdvanced={(id) => {
            setEasy(false);
            setDraftLink(id);
            setEditing(true);
          }}
        />
      )}
      {!editing && (
        // The same tabs as the feed: a bottom bar on phones, the left sidebar on wider screens.
        <nav className="profile-bottom-nav" aria-label="Profile navigation">
          <a className="profile-nav-brand" href="/" aria-label="Smudge home">
            smudge
          </a>
          <button onClick={() => onNavigate("home")}>
            <Home />
            <span>Home</span>
          </button>
          <button onClick={() => onNavigate("explore")}>
            <Search />
            <span>Search</span>
          </button>
          <button className="wide-only" onClick={() => onNavigate("messages")}>
            <MessageCircle />
            <span>Messages</span>
          </button>
          <button className="wide-only" onClick={() => onNavigate("notifications")}>
            <Bell />
            <span>Notifications</span>
          </button>
          <button className="nav-create" onClick={() => onNavigate("create")}>
            <Plus />
            <span>Create</span>
          </button>
          <button
            className={ownerId === boot.actor.userId ? "active" : undefined}
            aria-current={ownerId === boot.actor.userId ? "page" : undefined}
            onClick={() => onNavigate("profile")}
          >
            <UserRound />
            <span>Profile</span>
          </button>
        </nav>
      )}
      {panel && (
        <Dialog title="Search posts" onClose={() => setPanel(null)}>
          <div className="profile-discovery">
            <input
              aria-label="Search published posts"
              placeholder="Search titles, captions or people"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {posts
              .filter((p) =>
                `${p.metadata.title} ${p.metadata.caption} ${p.author.name}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPanel(null);
                    setOpen(p);
                  }}
                >
                  <strong>{p.metadata.title}</strong>
                  <span>
                    {p.author.name} · {p.likes} likes · {p.comments} comments
                    {p.saved ? " · Saved" : ""}
                  </span>
                </button>
              ))}
          </div>
        </Dialog>
      )}
      {open && (
        <Dialog title={open.metadata.title} wide onClose={() => setOpen(null)}>
          <p className="profile-message">{open.metadata.caption}</p>
          <ProfilePostActions
            post={posts.find((p) => p.id === open.id) ?? open}
            onRefresh={onRefresh}
          />
          <PostLink post={open} notify={setError} />
          <Runtime
            target={open.id}
            height={open.manifest.schemaVersion === 2 ? (open.manifest.stage?.height ?? 510) : 510}
            stage={open.manifest.schemaVersion === 2 ? open.manifest.stage : undefined}
            reducedMotion={motion}
          />
        </Dialog>
      )}
      {chapterDialog}
    </main>
  );
}

function ProfilePostActions({
  post,
  onRefresh,
}: {
  post: PostView;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [text, setText] = useState("");
  const [comments, setComments] = useState<{ id: string; userId: string; text: string }[] | null>(
    null,
  );
  async function action(kind: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${post.id}/${kind}`, {});
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-post-actions" aria-label="Post actions">
      <button disabled={busy} aria-pressed={post.liked} onClick={() => void action("like")}>
        {post.liked ? "Unlike" : "Like"} · {post.likes}
      </button>
      <button disabled={busy} aria-pressed={post.saved} onClick={() => void action("save")}>
        {post.saved ? "Unsave" : "Save post"}
      </button>
      <button
        onClick={async () => {
          try {
            setComments(await api(`/posts/${post.id}/comments`));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Comments · {post.comments}
      </button>
      {comments && (
        <div className="profile-comment-list">
          {comments.map((c) => (
            <p key={c.id}>{c.text}</p>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              setBusy(true);
              try {
                await api(`/posts/${post.id}/comments`, { text });
                setText("");
                setComments(await api(`/posts/${post.id}/comments`));
                await onRefresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              aria-label="Write a comment"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button disabled={busy || !text.trim()}>Post comment</button>
          </form>
        </div>
      )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}

function ProfileEditor({
  draftId,
  reducedMotion,
  onOpenPost,
  onChanged,
  owner,
}: {
  draftId?: string | undefined;
  reducedMotion: boolean;
  onOpenPost: (id: string) => void;
  onChanged: () => Promise<void>;
  owner: User;
}) {
  const [drafts, setDrafts] = useState<ProfileDraft[]>([]),
    [templates, setTemplates] = useState<Record<string, ProfilePackage>>({}),
    [history, setHistory] = useState<History | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null),
    [source, setSource] = useState(""),
    [filename, setFilename] = useState("index.html"),
    [manifest, setManifest] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [mobile, setMobile] = useState(false),
    [preview, setPreview] = useState(false),
    [template, setTemplate] = useState("smudge");
  const [undoPackage, setUndoPackage] = useState<ProfilePackage | null>(null);
  const [undoIdentity, setUndoIdentity] = useState<ProfileIdentity | undefined>();
  const [undoLabel, setUndoLabel] = useState("Undo last part change");
  const [visualDirty, setVisualDirty] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);
  const [compare, setCompare] = useState(false);
  const load = useCallback(async () => {
    const [d, h, t] = await Promise.all([
      api<ProfileDraft[]>("/profile-drafts"),
      api<History>("/profile-history"),
      api<Record<string, ProfilePackage>>("/profile-templates"),
    ]);
    setDrafts(d);
    setHistory(h);
    setTemplates(t);
  }, []);
  function select(d: ProfileDraft) {
    setDraft(d);
    setFiles(d.package.files);
    setSource(d.package.files["index.html"]!);
    setManifest(JSON.stringify(d.package.manifest, null, 2));
    setFilename("index.html");
    setDirty(false);
    setPreview(d.package.manifest.schemaVersion === 2);
    setUndoPackage(null);
    setUndoIdentity(undefined);
    setVisualDirty(false);
    setCompare(false);
    setMessage("");
    const url = new URL(location.href);
    url.searchParams.set("profileDraft", d.id);
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
    if (draftId)
      void api<ProfileDraft>(`/profile-drafts/${encodeURIComponent(draftId)}`)
        .then((d) => {
          select(d);
          setPreview(true);
        })
        .catch((e) => setMessage(e.message));
  }, [load, draftId]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const packageValue = () => ({
    manifest: JSON.parse(manifest),
    files: { ...files, [filename]: source },
  });
  async function create() {
    await run(async () => {
      const pkg = templates[template];
      if (!pkg) throw new Error("Template is still loading.");
      const d = await api<ProfileDraft>("/profile-drafts", pkg);
      select(d);
      await load();
    });
  }
  async function save() {
    if (!draft) return;
    await run(async () => {
      const d = await api<ProfileDraft>(
        `/profile-drafts/${draft.id}`,
        { package: packageValue(), revision: draft.revision },
        "PUT",
      );
      select(d);
      await load();
      setMessage("Draft saved. Published profile is unchanged.");
    });
  }
  const previewManifest =
    (compare
      ? history?.publications.find((p) => p.id === history.state.publicationId)?.package.manifest
      : undefined) ?? draft?.package.manifest;
  return (
    <section className="profile-editor" aria-label="Profile editor">
      <aside className="profile-editor-sidebar">
        <h1>Your profile, your rules.</h1>
        <ProfileModLibrary
          draft={draft}
          actorId={owner.id}
          disabled={busy || dirty || visualDirty}
          onInstalled={async (next, mixed) => {
            const previous = draft;
            select(next);
            if (mixed && previous) {
              setUndoPackage(previous.package);
              setUndoIdentity(
                previous.identity ?? {
                  name: owner.name,
                  bio: owner.bio,
                  avatarAssetId: owner.avatarAssetId ?? null,
                },
              );
              setUndoLabel("Undo last part change");
            }
            await load();
            setPreview(true);
            setMessage("Mod installed in your private draft. Preview it, then publish when ready.");
          }}
        />
        <p>
          Start with a structure, then change the HTML, CSS and behavior. Your AI can edit the same
          drafts through MCP.
        </p>
        <label>
          Starting point
          <select
            aria-label="Profile starting point"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="smudge">Smudge · Paint wall</option>
            <option value="room">Interactive room</option>
            <option value="comic">Vertical comic</option>
            <option value="raka">Ink &amp; Paper · Comic + Drawing Relay</option>
            <option value="basic">Smudge · Modular essentials</option>
          </select>
        </label>
        <button disabled={busy || !templates[template]} onClick={() => void create()}>
          Create profile draft
        </button>
        <label className="profile-import">
          Import package JSON
          <input
            aria-label="Import profile package"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void run(async () => {
                  if (file.size > 3_000_000) throw new Error("Package exceeds 3 MB import limit.");
                  const d = await api<ProfileDraft>(
                    "/profile-drafts",
                    JSON.parse(await file.text()),
                  );
                  select(d);
                  await load();
                });
            }}
          />
        </label>
        {history?.state.publicationId && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const current = history.publications.find(
                  (p) => p.id === history.state.publicationId,
                );
                if (!current)
                  throw new Error("Published version unavailable. Refresh and try again.");
                const d = await api<ProfileDraft>(`/profiles/${owner.id}/combination`, {
                  publicationId: current.id,
                });
                select(d);
                await load();
                setPreview(true);
                setMessage(
                  "Working copy created. Your live profile stays unchanged until you publish.",
                );
              })
            }
          >
            Edit a copy of live profile
          </button>
        )}
        <details
          className="profile-library"
          open={draft?.package.manifest.schemaVersion === 1 ? true : undefined}
        >
          <summary>Drafts &amp; version history ({drafts.length})</summary>
          <h2>Your drafts</h2>
          {drafts.map((d) => (
            <button
              key={d.id}
              disabled={busy}
              aria-pressed={draft?.id === d.id}
              onClick={() => select(d)}
            >
              {d.package.manifest.name}
              <small>Draft revision {d.revision}</small>
            </button>
          ))}
          <h2>Published versions</h2>
          {history?.publications.map((p) => (
            <div className="profile-version" key={p.id}>
              <span>
                {p.package.manifest.name}
                <small>
                  {new Date(p.createdAt).toLocaleString()} · r{p.revision}
                </small>
              </span>
              <button
                disabled={busy || history.state.publicationId === p.id}
                onClick={() =>
                  void run(async () => {
                    await api("/profile-restore", {
                      publicationId: p.id,
                      expectedVersion: history.state.version,
                    });
                    await load();
                    await onChanged();
                    setMessage("Previous version restored.");
                  })
                }
              >
                {history.state.publicationId === p.id ? "Active" : "Restore"}
              </button>
            </div>
          ))}
          <button
            disabled={busy || !history?.state.publicationId}
            onClick={() =>
              void run(async () => {
                await api("/profile-restore", {
                  publicationId: null,
                  expectedVersion: history!.state.version,
                });
                await load();
                await onChanged();
                setMessage("Default profile restored; published versions remain in history.");
              })
            }
          >
            Use default profile
          </button>
        </details>
      </aside>
      <div
        className={`profile-editor-main ${draft?.package.manifest.schemaVersion === 2 && preview ? "visual-mode" : ""}`}
      >
        {message && (
          <p role="status" className="profile-message">
            {message}
          </p>
        )}
        {draft ? (
          <>
            <header className="profile-edit-bar">
              <div>
                <strong>{draft.package.manifest.name}</strong>
                <small>
                  Revision {draft.revision} {dirty ? "· Unsaved changes" : ""}
                </small>
              </div>
              <button disabled={busy || !dirty} onClick={() => void save()}>
                Save profile draft
              </button>
              <button disabled={busy || dirty || visualDirty} onClick={() => setPreview((v) => !v)}>
                {preview ? "Edit source" : "Preview as visitor"}
              </button>
              <button
                className="profile-primary"
                disabled={busy || dirty || visualDirty || !history}
                onClick={() =>
                  void run(async () => {
                    await api(`/profile-drafts/${draft.id}/publish`, {
                      revision: draft.revision,
                      expectedVersion: history!.state.version,
                    });
                    await load();
                    await onChanged();
                    setMessage("Profile published. Visitors now see this version.");
                  })
                }
              >
                Publish profile
              </button>
            </header>
            <div className="profile-authoring-controls">
              {preview && (
                <ProfilePersonalizer
                  key={`${draft.id}:${draft.revision}`}
                  draft={draft}
                  owner={owner}
                  disabled={busy || dirty || compare}
                  onDirtyChange={setVisualDirty}
                  onApply={(identity, design) =>
                    void run(async () => {
                      const previous = draft.package,
                        previousIdentity = draft.identity ?? {
                          name: owner.name,
                          bio: owner.bio,
                          avatarAssetId: owner.avatarAssetId ?? null,
                        };
                      const d = await api<ProfileDraft>(
                        `/profile-drafts/${draft.id}`,
                        {
                          revision: draft.revision,
                          package: design
                            ? applyProfileDesign(draft.package, design)
                            : draft.package,
                          identity,
                        },
                        "PUT",
                      );
                      select(d);
                      setUndoPackage(previous);
                      setUndoIdentity(previousIdentity);
                      setUndoLabel("Undo last edit");
                      await load();
                      setPreview(true);
                      setMessage(
                        "Identity and composition saved in your draft. Preview is ready; publish when it looks right.",
                      );
                    })
                  }
                />
              )}
              <ProfilePartPicker
                pkg={draft.package}
                templates={templates}
                disabled={busy || dirty || visualDirty}
                onChoose={(slot, donor) =>
                  void run(async () => {
                    const previous = draft.package;
                    const previousIdentity = draft.identity ?? {
                      name: owner.name,
                      bio: owner.bio,
                      avatarAssetId: owner.avatarAssetId ?? null,
                    };
                    const d = await api<ProfileDraft>(`/profile-drafts/${draft.id}/compose`, {
                      revision: draft.revision,
                      slot,
                      donor,
                    });
                    select(d);
                    setUndoPackage(previous);
                    setUndoIdentity(previousIdentity);
                    setUndoLabel("Undo last part change");
                    await load();
                    setPreview(true);
                    setMessage(`Changed ${slot} in your draft. Your live profile is unchanged.`);
                  })
                }
              />
              <ProfilePhotoComposer
                disabled={busy || dirty || visualDirty}
                onPublished={async () => {
                  await onChanged();
                  setContentVersion((v) => v + 1);
                }}
              />
              {undoPackage && (
                <button
                  className="part-undo"
                  disabled={busy || dirty || visualDirty}
                  onClick={() =>
                    void run(async () => {
                      const d = await api<ProfileDraft>(
                        `/profile-drafts/${draft.id}`,
                        {
                          package: undoPackage,
                          revision: draft.revision,
                          ...(undoIdentity ? { identity: undoIdentity } : {}),
                        },
                        "PUT",
                      );
                      select(d);
                      await load();
                      setPreview(true);
                      setMessage("Last edit undone. Your live profile is unchanged.");
                    })
                  }
                >
                  {undoLabel}
                </button>
              )}
            </div>
            {preview ? (
              <>
                <div className="profile-preview-toolbar">
                  <span>
                    {compare
                      ? "Currently published · read-only comparison"
                      : `Visitor preview · saved revision ${draft.revision}`}
                  </span>
                  {history?.state.publicationId && (
                    <button aria-pressed={compare} onClick={() => setCompare((v) => !v)}>
                      {compare ? "Back to draft" : "Compare with live"}
                    </button>
                  )}
                  <button aria-pressed={mobile} onClick={() => setMobile((v) => !v)}>
                    {mobile ? "Desktop preview" : "Mobile preview"}
                  </button>
                </div>
                <div className={`profile-preview ${mobile ? "phone" : ""}`} inert={compare}>
                  <Runtime
                    key={
                      compare
                        ? history!.state.publicationId!
                        : `${draft.id}:${draft.revision}:${contentVersion}`
                    }
                    kind="profile"
                    preview={!compare}
                    target={compare ? history!.state.publicationId! : draft.id}
                    version={draft.revision}
                    height={previewManifest!.height}
                    autoHeight={previewManifest?.schemaVersion === 2 && previewManifest.autoHeight}
                    mobileHeight={
                      previewManifest?.schemaVersion === 2
                        ? previewManifest.mobileHeight
                        : undefined
                    }
                    reducedMotion={reducedMotion}
                    onOpenPost={onOpenPost}
                  />
                </div>
              </>
            ) : (
              <>
                <label className="profile-source-label">
                  Profile manifest
                  <textarea
                    aria-label="Profile manifest JSON"
                    value={manifest}
                    spellCheck={false}
                    onChange={(e) => {
                      setManifest(e.target.value);
                      setDirty(true);
                    }}
                    rows={13}
                  />
                </label>
                <label className="profile-source-label">
                  Source file
                  <select
                    aria-label="Profile source file"
                    value={filename}
                    onChange={(e) => {
                      setFiles({ ...files, [filename]: source });
                      setFilename(e.target.value);
                      setSource(files[e.target.value]!);
                    }}
                  >
                    {Object.keys(files).map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <textarea
                    aria-label="Profile source code"
                    value={source}
                    spellCheck={false}
                    onChange={(e) => {
                      setSource(e.target.value);
                      setDirty(true);
                    }}
                    rows={28}
                  />
                </label>
                <p className="profile-editor-help">
                  Save before preview or publish. Import JSON or use MCP to add files. Profile code
                  runs separately from the app; use forma.profile.read() and
                  forma.profile.openPost(id) for real content.
                </p>
              </>
            )}
          </>
        ) : (
          <div className="profile-editor-empty">
            <h2>Make a place people can visit.</h2>
            <p>
              Create a room or comic draft, import a package, or ask your connected AI to build a
              new structure.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
