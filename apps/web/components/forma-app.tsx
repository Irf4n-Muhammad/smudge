"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home,
  Compass,
  Users,
  Bookmark,
  UserRound,
  Plus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  Check,
  Feather,
  Layers,
  ChevronDown,
  Sparkles,
  RefreshCw,
  X,
  BadgeCheck,
  Palette,
  UserPlus,
  Gift,
  LogIn,
  Settings,
  Bell,
  MessageCircle,
  UserSearch,
  ShieldCheck,
  Menu,
  Globe,
} from "lucide-react";
import { MessagesPanel, ModerationPanel, NotificationsPanel, PeoplePanel } from "./community";
import { ThemeReviews } from "./theme-studio";
import type { AuthState } from "../../../packages/contracts/src/accounts";
import {
  AccountPanel,
  AuthDialog,
  AuthScreen,
  ResetPasswordForm,
  VerifyBanner,
  authApi,
  authMessage,
} from "./auth";
import type { AuthMode } from "./auth";
import type { DraftView, PostView } from "../../../packages/contracts/src/experience";
import { api } from "./runtime";
import { Avatar, ConfirmHost, Dialog } from "./ui";
import { PostCard } from "./post-card";
import { Studio } from "./studio";
import { SiteImport } from "./site-import";
import { PostEditor } from "./post-editor";
import type { Boot } from "./types";
import { ThemeToggle } from "./theme-toggle";
import { Cockpit } from "./cockpit";
import { BreakoutFeed } from "./breakout-feed";
import { ProfilePage } from "./profile-page";
import { IdentityHub } from "./identity-hub";
import { MomentComposer } from "./moment-composer";
import { DecorationsPanel } from "./decorations-panel";
import type { DecoratedPost } from "./post-decor";
import { SeasonChip, SeasonLayer } from "./season";
import { AmbientLight } from "./gallery";
import { Welcome } from "./welcome";
import { SidesBar, SidesDialog } from "./sides";
import type { SidesView } from "../../../packages/contracts/src/sides";
import { EVERYDAY } from "../../../packages/contracts/src/sides";
export function FormaApp() {
  const [profileVisit, setProfileVisit] = useState(0);
  const [cockpit, setCockpit] = useState(false);
  const [breakout, setBreakout] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null),
    [posts, setPosts] = useState<DecoratedPost[]>([]),
    [view, setView] = useState("home"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [failure, setFailure] = useState("");
  const [toast, setToast] = useState(""),
    [studio, setStudio] = useState(false),
    [activeDraft, setActiveDraft] = useState<string | undefined>(),
    [connect, setConnect] = useState(false),
    [profile, setProfile] = useState<string | null>(null),
    [momentOpen, setMomentOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [postEditor, setPostEditor] = useState<{ draftId?: string } | null>(null),
    /** The editor was opened from a published post, so publishing updates it in place. */
    [editingPost, setEditingPost] = useState(false),
    /** A single post opened from a link or a notification. */
    [focusPost, setFocusPost] = useState<string | null>(null),
    [exploreQuery, setExploreQuery] = useState(""),
    [explored, setExplored] = useState<DecoratedPost[] | null>(null),
    [auth, setAuth] = useState<AuthState | null>(null),
    [authDialog, setAuthDialog] = useState<AuthMode | null>(null),
    [resetToken, setResetToken] = useState<string | null>(null),
    [badges, setBadges] = useState({ notifications: 0, messages: 0 }),
    [messageTo, setMessageTo] = useState<string | null>(null),
    [more, setMore] = useState(false),
    [modes, setModes] = useState(false),
    [sidesOpen, setSidesOpen] = useState(false),
    /** Just signed up: a photo and a few people before the first feed. */
    [welcome, setWelcome] = useState(false);
  /** A toast can carry one way back, like Undo after blocking someone. */
  const undo = useRef<(() => void) | null>(null);
  const notify = useCallback((message: string, onUndo?: () => void) => {
    undo.current = onUndo ?? null;
    setToast(message);
  }, []);
  const refreshBadges = useCallback(async () => {
    try {
      setBadges(await api<{ notifications: number; messages: number }>("/badges"));
    } catch {
      // Signed out or offline: keep the last counts.
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(async () => {
    try {
      let state = await authApi<AuthState>("/auth/state");
      if (!state.signedIn && state.mode === "demo") {
        // The playground signs a first visit in as a demo account.
        await api<Boot>("/bootstrap").catch(() => null);
        state = await authApi<AuthState>("/auth/state");
      }
      setAuth(state);
      if (!state.signedIn) {
        setBoot(null);
        setPosts([]);
        setFailure("");
        return;
      }
      const b = await api<Boot>("/bootstrap");
      const p = await api<DecoratedPost[]>("/feed");
      setBoot(b);
      setPosts(p);
      setFailure("");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify"),
      reset = params.get("reset"),
      authError = params.get("auth_error");
    if (verify || reset || authError) window.history.replaceState(null, "", "/");
    if (authError) notify(authMessage(authError));
    if (reset) setResetToken(reset);
    if (verify)
      void authApi("/auth/verify", { token: verify })
        .then(() => {
          notify("Email confirmed. Thanks!");
          return refresh();
        })
        .catch((e: Error) => notify(e.message));
    // A share card's link (ADR 0030) lands inside that side: switch to it, joining first if open.
    const landing = params.get("side");
    void refresh().then(async () => {
      if (!landing) return;
      try {
        await api("/sides/active", { side: landing }).catch(() =>
          api(`/sides/${encodeURIComponent(landing)}/join`, {}).then(() =>
            api("/sides/active", { side: landing }),
          ),
        );
        await refresh();
      } catch {
        // Not a side you can enter from a link, or not signed in yet; the page still opens.
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("side");
      window.history.replaceState(null, "", url.pathname + url.search);
    });
    const requestedProfile = new URLSearchParams(window.location.search).get("profile");
    if (requestedProfile || new URLSearchParams(window.location.search).has("profileDraft")) {
      setProfile(requestedProfile ?? "you");
      setView("profile");
    }
    setCockpit(new URLSearchParams(window.location.search).get("mode") === "cockpit");
    setBreakout(new URLSearchParams(window.location.search).get("mode") === "breakout");
    const shared = new URLSearchParams(window.location.search).get("post");
    if (shared) {
      setFocusPost(shared);
      setView("post");
    }
    const id = new URLSearchParams(window.location.search).get("draft");
    if (id) {
      setActiveDraft(id);
      setStudio(true);
    }
  }, [refresh]);
  const loadExplore = useCallback(async (q: string) => {
    try {
      setExplored(await api<DecoratedPost[]>(`/explore?q=${encodeURIComponent(q)}`));
    } catch (e) {
      setFailure((e as Error).message);
    }
  }, []);
  // Searching waits for a pause in typing rather than asking on every key.
  useEffect(() => {
    if (view !== "explore") return;
    const timer = setTimeout(() => void loadExplore(exploreQuery), exploreQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [view, exploreQuery, loadExplore, boot?.actor.userId]);
  const signedInNow = !!auth?.signedIn;
  useEffect(() => {
    if (!signedInNow) return;
    void refreshBadges();
    const timer = setInterval(() => void refreshBadges(), 20000);
    return () => clearInterval(timer);
  }, [signedInNow, refreshBadges, boot?.actor.userId]);
  async function switchUser(userId: string) {
    // An open chat polls on its own; left open, its next poll would run as the new account and
    // mark that account's messages read before they ever saw them.
    if (view === "messages") navigate("home");
    try {
      await api("/session", { userId });
      setStudio(false);
      setProfile(null);
      await refresh();
      notify("Now viewing as a different demo account.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function follow(userId: string) {
    try {
      await api(`/users/${userId}/follow`, {});
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  /** One tap moves the whole app into that side: its feed, its composer, its colour. */
  async function switchSide(side: string) {
    if (side === boot?.sides.active) return;
    try {
      await api<SidesView>("/sides/active", { side });
      await refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function create() {
    setEditingPost(false);
    setActiveDraft(undefined);
    setStudio(true);
  }
  /** "Create a post" opens the easy post editor; the studio stays one tap away inside it. */
  function createPost() {
    setEditingPost(false);
    setPostEditor({});
  }
  /** The post's draft opens in the easy editor, which hands studio-made posts to the studio. */
  async function editPost(id: string) {
    try {
      const draft = await api<DraftView>(`/posts/${id}/edit`, {});
      setEditingPost(true);
      setPostEditor({ draftId: draft.id });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function openUser(userId: string) {
    setProfile(userId);
    setView("profile");
    setFilter("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openPost(id: string) {
    setFocusPost(id);
    setView("post");
    setFilter("all");
    setProfile(null);
    window.history.replaceState(null, "", `/?post=${encodeURIComponent(id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function signedIn(fresh: boolean) {
    setStudio(false);
    setProfile(null);
    window.history.replaceState(null, "", "/");
    await refresh();
    navigate("home");
    // Close the dialog only once the landing view is set, so nothing tapped meanwhile is undone.
    setAuthDialog(null);
    if (fresh) setWelcome(true);
  }
  async function signedOut() {
    setStudio(false);
    setProfile(null);
    setView("home");
    await refresh();
    notify("You are logged out.");
  }
  const production = auth?.mode === "production";
  if (auth && !auth.signedIn)
    return (
      <>
        <AuthScreen onSignedIn={signedIn} google={auth.google}>
          {resetToken ? (
            <ResetPasswordForm
              token={resetToken}
              onDone={async () => {
                setResetToken(null);
                await signedIn(false);
                notify("Password saved. You are logged in.");
              }}
            />
          ) : undefined}
        </AuthScreen>
        {toast && (
          <div className="toast" role="status">
            <span>✳</span>
            {toast}
          </div>
        )}
      </>
    );
  const me = boot?.users.find((u) => u.id === boot.actor.userId);
  const activeSide = boot?.sides.mine.find((s) => s.id === boot.sides.active);
  const inSide = !!activeSide && activeSide.id !== EVERYDAY;
  const selectedUser = profile ? boot?.users.find((u) => u.id === profile) : me;
  const visible = (view === "explore" ? (explored ?? []) : posts).filter(
    (p) =>
      (view !== "following" || boot?.following.includes(p.ownerId)) &&
      (view !== "saved" || p.saved) &&
      (view !== "post" || p.id === focusPost) &&
      (view !== "profile" || p.ownerId === (profile ?? boot?.actor.userId)) &&
      (filter === "all" || p.metadata.format === filter) &&
      `${p.metadata.title} ${p.metadata.caption} ${p.author.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function navigate(next: string) {
    if (view === "post") window.history.replaceState(null, "", "/");
    setView(next);
    setFilter("all");
    setProfile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (view === "profile" && boot && !studio)
    return (
      <ProfilePage
        key={`${boot.actor.userId}:${profile ?? boot.actor.userId}:${profileVisit}`}
        ownerId={profile ?? boot.actor.userId}
        boot={boot}
        posts={posts}
        onRefresh={refresh}
        onUseDraft={(draftId) => {
          window.history.replaceState(
            null,
            "",
            `/?profile=${encodeURIComponent(boot.actor.userId)}&profileDraft=${encodeURIComponent(draftId)}`,
          );
          setProfile(boot.actor.userId);
          setProfileVisit((v) => v + 1);
          window.scrollTo(0, 0);
        }}
        onNavigate={(destination) => {
          window.history.replaceState(null, "", "/");
          setCockpit(false);
          setBreakout(false);
          if (destination === "create") {
            void create();
            return;
          }
          navigate(destination);
        }}
        onBack={() => {
          setView("home");
          setProfile(null);
          setCockpit(false);
          setBreakout(false);
          window.history.replaceState(null, "", "/");
          window.scrollTo(0, 0);
        }}
      />
    );
  function changeMode(active: boolean) {
    setBreakout(false);
    setCockpit(active);
    const url = new URL(window.location.href);
    if (active) url.searchParams.set("mode", "cockpit");
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
  }
  if (breakout && boot && !studio)
    return <BreakoutFeed posts={posts} onRefresh={refresh} onExit={() => changeMode(false)} />;
  if (cockpit && boot && !studio)
    return (
      <Cockpit posts={posts} boot={boot} onRefresh={refresh} onExit={() => changeMode(false)} />
    );
  return (
    <div
      className="app-shell"
      data-view={view}
      data-side={activeSide?.id}
      style={{ "--side-accent": activeSide?.accent } as React.CSSProperties}
    >
      <AmbientLight watch={`${view}:${filter}:${visible.map((p) => p.id).join(",")}`} />
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Smudge home">
          <span className="brand-mark">s</span>smudge<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-tagline">Life, in your own shape.</div>
        <nav className="main-nav" aria-label="Main navigation">
          {[
            ["home", Home, "Your feed"],
            ["following", Users, "Following"],
            ["saved", Bookmark, "Saved"],
            ["who", BadgeCheck, "Who you are"],
            ["decor", Palette, "Themes"],
            ["profile", UserRound, "My profile"],
            ["explore", Compass, "Explore"],
            ["people", UserSearch, "Find people"],
            ["notifications", Bell, "Notifications"],
            ["messages", MessageCircle, "Messages"],
            ...(auth?.moderator ? [["moderation", ShieldCheck, "Moderation"]] : []),
          ].map(([key, Icon, label]) => {
            const I = Icon as typeof Home;
            const count =
              key === "notifications"
                ? badges.notifications
                : key === "messages"
                  ? badges.messages
                  : 0;
            return (
              <button
                key={String(key)}
                aria-label={count ? `${label} (${count} new)` : String(label)}
                title={String(label)}
                className={view === key ? "nav-item active" : "nav-item"}
                onClick={() => {
                  if (key === "messages") setMessageTo(null);
                  navigate(String(key));
                }}
              >
                <I size={20} />
                <span>{String(label)}</span>
                {count > 0 && <span className="badge nav-badge">{count > 99 ? "99+" : count}</span>}
                {view === key && <span className="nav-dot" />}
              </button>
            );
          })}
          <button className="nav-item" aria-label="My studio" title="My studio" onClick={create}>
            <Layers size={20} />
            <span>My studio</span>
          </button>
        </nav>
        <button
          className="primary create-button"
          aria-label="Create a post"
          title="Create a post"
          onClick={createPost}
        >
          <Plus size={19} />
          Create a post
        </button>
        <button
          className="quiet-button moment-button"
          title="Share a moment"
          onClick={() => setMomentOpen(true)}
        >
          <Gift size={16} />
          Share a moment
        </button>
        <button
          className="quiet-button moment-button import-button"
          title="Import a website"
          onClick={() => setImportOpen(true)}
        >
          <Globe size={16} />
          Import a website
        </button>
        <div className="sidebar-note">
          <span className="note-star">✧</span>
          <p>
            No two stories
            <br />
            have to look alike.
          </p>
          <button onClick={() => (production ? create() : setConnect(true))}>
            Make it yours <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          {production ? (
            me && (
              <button
                className="account-row"
                aria-label="Account and sign-in"
                title={`${me.name} · Account and sign-in`}
                onClick={() => navigate("account")}
              >
                <Avatar user={me} />
                <span>
                  <strong>{me.name}</strong>
                  <small>Account and sign-in</small>
                </span>
              </button>
            )
          ) : (
            <div className="local-label">
              <span />
              LOCAL PLAYGROUND
            </div>
          )}
          {!production && me && (
            <div className="account-switch">
              <Avatar user={me} />
              <label>
                <span>Preview as</span>
                <select
                  aria-label="Preview as demo account"
                  value={me.id}
                  onChange={(e) => void switchUser(e.target.value)}
                >
                  {boot!.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <ChevronDown size={14} />
            </div>
          )}
          {!production && (
            <div className="demo-auth">
              <button
                className="text-button signup-link"
                title="Create an account"
                onClick={() => setAuthDialog("signup")}
              >
                <UserPlus size={14} /> Create an account
              </button>
              <button
                className="text-button signup-link"
                title="Log in"
                onClick={() => setAuthDialog("login")}
              >
                <LogIn size={14} /> Log in
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="mobile-brand" href="/" aria-label="Smudge home">
            smudge
          </a>
          <div className="breadcrumb">
            {inSide ? activeSide.name : "Your space"} <span>/</span>{" "}
            <strong>
              {view === "home"
                ? "The feed"
                : view === "profile"
                  ? "Profile"
                  : view === "who"
                    ? "Who you are"
                    : view === "decor"
                      ? "Themes"
                      : view === "account"
                        ? "Account"
                        : view === "people"
                          ? "People"
                          : view[0]?.toUpperCase() + view.slice(1)}
            </strong>
          </div>
          <div className="topbar-right">
            <div className="post-menu-wrap modes-wrap">
              <button
                className="enter-cockpit"
                aria-expanded={modes}
                onClick={() => setModes((v) => !v)}
              >
                ✧ Ways to browse
              </button>
              {modes && (
                <div className="post-menu modes-menu">
                  <button
                    onClick={() => {
                      setModes(false);
                      setBreakout(true);
                      window.history.replaceState(null, "", "/?mode=breakout");
                      window.scrollTo(0, 0);
                    }}
                  >
                    <strong>Break the frame</strong>
                    <small>Posts float free on one long page</small>
                  </button>
                  <button
                    onClick={() => {
                      setModes(false);
                      changeMode(true);
                    }}
                  >
                    <strong>Enter hyperspace</strong>
                    <small>Fly through posts in orbit</small>
                  </button>
                </div>
              )}
            </div>
            <ThemeToggle />
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search posts"
                placeholder="Find a little inspiration"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
            <button
              className="icon-button account-button"
              aria-label="Account settings"
              title="Account settings"
              onClick={() => navigate("account")}
            >
              <Settings size={18} />
            </button>
            {me && (
              <button
                className="avatar-button"
                aria-label="Open my profile"
                onClick={() => navigate("profile")}
              >
                <Avatar user={me} small />
              </button>
            )}
          </div>
        </header>
        <div className="content-layout">
          <main id="main" className="feed-column">
            {auth && <VerifyBanner state={auth} notify={notify} />}
            {view === "account" && auth ? (
              <AccountPanel
                state={auth}
                me={me}
                handle={me?.handle ?? ""}
                isPrivate={!!me?.private}
                notify={notify}
                onSignedOut={signedOut}
                onChanged={refresh}
              />
            ) : view === "people" && boot ? (
              <PeoplePanel
                key={boot.actor.userId}
                notify={notify}
                onFollowChanged={refresh}
                onMessage={(id) => {
                  setMessageTo(id);
                  navigate("messages");
                }}
                onOpen={(id) => {
                  setProfile(id);
                  setView("profile");
                }}
              />
            ) : view === "notifications" && boot ? (
              <NotificationsPanel
                key={boot.actor.userId}
                onRead={refreshBadges}
                onOpenUser={(id) => {
                  setProfile(id);
                  setView("profile");
                }}
                onOpenPost={openPost}
              />
            ) : view === "messages" && boot ? (
              <MessagesPanel
                key={`${boot.actor.userId}:${messageTo ?? ""}`}
                initialUser={messageTo}
                meId={boot.actor.userId}
                notify={notify}
                onRead={refreshBadges}
              />
            ) : view === "moderation" && boot && auth?.moderator ? (
              <>
                <ModerationPanel notify={notify} />
                <ThemeReviews notify={notify} />
              </>
            ) : view === "who" && boot ? (
              <IdentityHub
                key={boot.actor.userId}
                boot={boot}
                notify={notify}
                demo={!production}
                onMoment={() => setMomentOpen(true)}
              />
            ) : view === "decor" && boot ? (
              <DecorationsPanel
                key={boot.actor.userId}
                me={me}
                users={boot.users}
                notify={notify}
                onChanged={refresh}
              />
            ) : (
              <>
                {view !== "profile" && <SeasonLayer />}
                {view === "explore" ? (
                  <section className="explore-heading">
                    <span className="eyebrow">EXPLORE</span>
                    <h1>Wander a little further.</h1>
                    <p>Pages from people you don’t follow yet, and a search across every post.</p>
                    <label className="explore-search">
                      <Search size={17} />
                      <input
                        type="search"
                        aria-label="Search all posts"
                        placeholder="Search posts, people or #tags"
                        value={exploreQuery}
                        maxLength={60}
                        onChange={(e) => setExploreQuery(e.target.value)}
                      />
                    </label>
                    <button className="link-button" onClick={() => navigate("people")}>
                      Looking for someone? Find people
                    </button>
                  </section>
                ) : view === "post" ? (
                  <section className="single-post-heading">
                    <button className="quiet-button" onClick={() => navigate("home")}>
                      <ArrowLeft size={15} /> Back to your feed
                    </button>
                  </section>
                ) : view === "profile" && selectedUser ? (
                  <section className="profile-heading">
                    <Avatar user={selectedUser} />
                    <div>
                      <span className="eyebrow">@{selectedUser.handle}</span>
                      <h1>{selectedUser.name}</h1>
                      <p>{selectedUser.bio}</p>
                      <span className="profile-count">
                        {posts.filter((p) => p.ownerId === selectedUser.id).length} published
                        stories
                      </span>
                    </div>
                  </section>
                ) : (
                  <section className="feed-heading">
                    <SeasonChip />
                    <div>
                      <div className="eyebrow">
                        <span className="tiny-dot" /> DIFFERENT MINDS. DIFFERENT WORLDS.
                      </div>
                      <h1>
                        {view === "saved" ? (
                          "Worth keeping."
                        ) : view === "following" ? (
                          "A little closer."
                        ) : (
                          <>
                            Life doesn’t fit <em>in a box.</em>
                          </>
                        )}
                      </h1>
                      <p>
                        {view === "saved"
                          ? "The stories you want to come back to."
                          : view === "following"
                            ? "Fresh pages from the people you follow."
                            : "Wander into someone’s world. Leave a little of yourself."}
                      </p>
                    </div>
                  </section>
                )}
                {boot && ["home", "following", "saved", "explore"].includes(view) && (
                  <SidesBar
                    sides={boot.sides}
                    onSwitch={(side) => void switchSide(side)}
                    onManage={() => setSidesOpen(true)}
                  />
                )}
                {view === "home" && (
                  <section className="composer">
                    <span className="composer-symbol">
                      <Feather size={22} />
                    </span>
                    <button onClick={createPost}>
                      <strong>{activeSide?.prompt ?? "What does your day look like?"}</strong>
                      <span>
                        {inSide
                          ? activeSide.private
                            ? `Only people in ${activeSide.name} see it.`
                            : `Posts to ${activeSide.name}. Share it to Everyday later if you like.`
                          : "A photo, a story, a whole little world."}
                      </span>
                    </button>
                    {!inSide && (
                      <button className="quiet-button" onClick={() => setMomentOpen(true)}>
                        <Gift size={15} /> Moment
                      </button>
                    )}
                    {!inSide && (
                      <button
                        className="quiet-button composer-import"
                        aria-label="Import a website"
                        title="Import a website"
                        onClick={() => setImportOpen(true)}
                      >
                        <Globe size={15} /> Website
                      </button>
                    )}
                    <button
                      className="composer-plus"
                      aria-label="Create a post"
                      onClick={createPost}
                    >
                      <Plus size={21} />
                    </button>
                  </section>
                )}
                {view !== "post" && view !== "explore" && (
                  <div className="feed-toolbar">
                    <div className="feed-tabs" aria-label="Filter post formats">
                      {[
                        ["all", "For you"],
                        ["scrapbook", "Scrapbooks"],
                        ["story", "Stories"],
                        ["collaborative", "Together"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          aria-pressed={filter === id}
                          className={filter === id ? "selected" : ""}
                          onClick={() => setFilter(id!)}
                        >
                          {id === "all" && <Sparkles size={13} />} {label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="icon-button refresh-feed"
                      aria-label="Refresh feed"
                      title="Refresh feed"
                      onClick={() => void refresh()}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                )}
                {view === "explore" && explored === null && (
                  <div className="empty-state">
                    <span className="tiny-flower">✳</span>
                    <h2>Looking around…</h2>
                  </div>
                )}
                {loading && (
                  <div className="empty-state">
                    <span className="tiny-flower">✳</span>
                    <h2>Finding your stories…</h2>
                  </div>
                )}
                {failure && (
                  <div className="empty-state">
                    <h2>We couldn’t open your space.</h2>
                    <p>{failure}</p>
                    <button className="primary" onClick={() => void refresh()}>
                      Try again
                    </button>
                  </div>
                )}
                {!loading &&
                  !failure &&
                  visible.length === 0 &&
                  (view !== "explore" || explored !== null) && (
                    <div className="empty-state">
                      <Feather size={30} />
                      <h2>
                        {view === "explore"
                          ? exploreQuery
                            ? "Nothing matches that yet."
                            : "You’ve seen everyone already."
                          : view === "post"
                            ? "This post isn’t here anymore."
                            : view === "saved"
                              ? "Keep something you love."
                              : "A little room for something new."}
                      </h2>
                      <p>
                        {query
                          ? "Try a different search."
                          : view === "post"
                            ? "It may have been deleted, or it isn’t shared with you."
                            : view === "saved"
                              ? "Tap the bookmark on a post to find it here."
                              : view === "following"
                                ? "Follow someone to bring their stories here."
                                : "Your next story could start here."}
                      </p>
                      <button
                        className="quiet-button"
                        onClick={view === "profile" ? create : () => navigate("home")}
                      >
                        {view === "profile" ? "Make your first post" : "Explore the feed"}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                <div className="post-list">
                  {boot &&
                    visible.map((post, index) => (
                      <PostCard
                        key={`${boot.actor.userId}:${post.id}`}
                        post={post}
                        boot={boot}
                        onRefresh={async () => {
                          await refresh();
                          if (view === "explore") await loadExplore(exploreQuery);
                        }}
                        notify={notify}
                        onFollow={() => void follow(post.ownerId)}
                        onProfile={() => openUser(post.ownerId)}
                        onUser={openUser}
                        onEdit={() => void editPost(post.id)}
                        openComments={view === "post"}
                        onReuse={async () => {
                          try {
                            const d = await api<DraftView>(`/posts/${post.id}/reuse`, {});
                            setActiveDraft(d.id);
                            setStudio(true);
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                        onSkip={() => {
                          const next =
                            document.querySelectorAll<HTMLElement>(".post-card")[index + 1];
                          if (next) {
                            next.scrollIntoView({ behavior: "smooth", block: "start" });
                            next.focus({ preventScroll: true });
                          } else notify("You’re all caught up. A good moment to make something.");
                        }}
                      />
                    ))}
                </div>
                {!loading && visible.length > 0 && (
                  <footer className="feed-end">
                    <span>✳</span>
                    <p>You’re all caught up.</p>
                    <small>Go make a moment worth keeping.</small>
                  </footer>
                )}
              </>
            )}
          </main>
          <aside className="right-column">
            <section className="manifesto-card">
              <span className="eyebrow">A DIFFERENT KIND OF SOCIAL</span>
              <div className="little-collage">
                <span className="collage-paper one">
                  a little
                  <br />
                  <em>more me.</em>
                  <span>✳</span>
                </span>
                <span className="collage-paper two">
                  your story,
                  <br />
                  your rules.<span>↗</span>
                </span>
              </div>
              <h2>
                Your story.
                <br />
                Your own shape.
              </h2>
              <p>A notebook, a choose-your-path story, or something nobody’s made yet.</p>
              <button onClick={create}>
                Find your format <ArrowUpRight size={16} />
              </button>
            </section>
            <section className="people-panel">
              <div className="section-title">
                <h3>People to know</h3>
                <span>✧</span>
              </div>
              {boot?.users
                .filter((u) => u.id !== boot.actor.userId)
                .map((user) => (
                  <div className="person" key={user.id}>
                    <button
                      className="person-info"
                      onClick={() => {
                        setProfile(user.id);
                        setView("profile");
                        setFilter("all");
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      <Avatar user={user} />
                      <span>
                        <strong>{user.name}</strong>
                        <small>@{user.handle}</small>
                      </span>
                    </button>
                    <button
                      className={`follow-button ${boot.following.includes(user.id) ? "is-following" : ""}`}
                      aria-label={`${boot.following.includes(user.id) ? "Unfollow" : "Follow"} ${user.name}`}
                      onClick={() => void follow(user.id)}
                    >
                      {boot.following.includes(user.id) ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                  </div>
                ))}
            </section>
            <section className="ai-card">
              <span className="ai-icon">
                <Sparkles size={19} />
              </span>
              <div>
                <h3>Your AI. Your imagination.</h3>
                <p>Bring an idea to life with the AI you already use.</p>
                <button onClick={() => (production ? create() : setConnect(true))}>
                  Connect your creative tools <ArrowUpRight size={13} />
                </button>
              </div>
            </section>
            <footer className="side-footer">
              <span>Made for a little more expression.</span>
              <span>{production ? "Smudge" : "Smudge · Local preview · No cloud required"}</span>
            </footer>
          </aside>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button aria-label="Your feed" onClick={() => navigate("home")}>
          <Home size={21} />
        </button>
        <button aria-label="Explore" onClick={() => navigate("explore")}>
          <Compass size={21} />
        </button>
        <button
          aria-label={
            badges.notifications ? `Notifications (${badges.notifications} new)` : "Notifications"
          }
          onClick={() => navigate("notifications")}
        >
          <Bell size={21} />
          {badges.notifications > 0 && (
            <span className="badge nav-badge">{badges.notifications}</span>
          )}
        </button>
        <button className="mobile-create" aria-label="Create a post" onClick={createPost}>
          <Plus size={23} />
        </button>
        <button
          aria-label={badges.messages ? `Messages (${badges.messages} new)` : "Messages"}
          onClick={() => {
            setMessageTo(null);
            navigate("messages");
          }}
        >
          <MessageCircle size={21} />
          {badges.messages > 0 && <span className="badge nav-badge">{badges.messages}</span>}
        </button>
        <button aria-label="Find people" onClick={() => navigate("people")}>
          <UserSearch size={21} />
        </button>
        <button aria-label="More" onClick={() => setMore(true)}>
          <Menu size={21} />
        </button>
      </nav>
      {more && (
        <Dialog title="More" onClose={() => setMore(false)}>
          <div className="more-menu">
            {(
              [
                ["profile", UserRound, "My profile"],
                ["following", Users, "Following"],
                ["saved", Bookmark, "Saved"],
                ["who", BadgeCheck, "Who you are"],
                ["decor", Palette, "Themes"],
                ["account", Settings, "Account settings"],
                ...(auth?.moderator ? [["moderation", ShieldCheck, "Moderation"]] : []),
              ] as [string, typeof Home, string][]
            ).map(([key, I, label]) => (
              <button
                key={key}
                className="quiet-button"
                onClick={() => {
                  setMore(false);
                  navigate(key);
                }}
              >
                <I size={18} /> {label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✳</span>
          {toast}
          {undo.current && (
            <button
              className="toast-undo"
              onClick={() => {
                const back = undo.current;
                undo.current = null;
                setToast("");
                back?.();
              }}
            >
              Undo
            </button>
          )}
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <ConfirmHost />
      {studio && boot && (
        <Studio
          boot={boot}
          draftId={activeDraft}
          onClose={() => {
            setStudio(false);
            setEditingPost(false);
            window.history.replaceState(null, "", "/");
          }}
          editing={editingPost}
          onPublished={async () => {
            setStudio(false);
            setEditingPost(false);
            if (!editingPost) navigate("home");
            await refresh();
            notify(
              editingPost
                ? "Updated. Everyone sees the new version."
                : "Published. Your story has a home in the feed.",
            );
          }}
          notify={notify}
          onImport={() => {
            setStudio(false);
            setImportOpen(true);
          }}
        />
      )}
      {postEditor && (
        <PostEditor
          draftId={postEditor.draftId}
          editing={editingPost}
          side={inSide ? { id: activeSide.id, name: activeSide.name } : undefined}
          onClose={() => {
            setPostEditor(null);
            setEditingPost(false);
          }}
          onPublished={async () => {
            setPostEditor(null);
            setEditingPost(false);
            if (!editingPost) navigate("home");
            await refresh();
            notify(
              editingPost
                ? "Updated. Everyone sees the new version."
                : "Published. Your post is in the feed.",
            );
          }}
          onStudio={(id) => {
            setPostEditor(null);
            setActiveDraft(id);
            setStudio(true);
          }}
          onImport={() => {
            setPostEditor(null);
            setImportOpen(true);
          }}
        />
      )}
      {importOpen && (
        <SiteImport
          onClose={() => setImportOpen(false)}
          onPublished={async () => {
            setImportOpen(false);
            navigate("home");
            await refresh();
            notify("Published. Your imported page opens right in the feed.");
          }}
        />
      )}
      {sidesOpen && boot && (
        <SidesDialog
          sides={boot.sides}
          notify={notify}
          onChange={async () => {
            await refresh();
          }}
          onClose={() => setSidesOpen(false)}
        />
      )}
      {momentOpen && (
        <MomentComposer
          notify={notify}
          onClose={() => setMomentOpen(false)}
          onProve={() => {
            setMomentOpen(false);
            navigate("who");
          }}
          onPublished={async () => {
            setMomentOpen(false);
            navigate("home");
            await refresh();
            notify("Moment published. Visitors can leave one sticker each.");
          }}
        />
      )}
      {welcome && me && (
        <Welcome
          me={me}
          onDone={async () => {
            setWelcome(false);
            await refresh();
            notify("Welcome to Smudge. We sent you an email to confirm your address.");
          }}
        />
      )}
      {authDialog && (
        <AuthDialog
          initial={authDialog}
          google={!!auth?.google}
          onClose={() => setAuthDialog(null)}
          onSignedIn={signedIn}
        />
      )}
      {resetToken && auth?.signedIn && (
        <Dialog title="New password" onClose={() => setResetToken(null)}>
          <ResetPasswordForm
            token={resetToken}
            onDone={async () => {
              setResetToken(null);
              await refresh();
              notify("Password saved. Other devices were signed out.");
            }}
          />
        </Dialog>
      )}
      {connect && (
        <Dialog title="Bring your own imagination." onClose={() => setConnect(false)}>
          <div className="connect-content">
            <span className="connect-symbol">✳</span>
            <p>
              Smudge gives your AI the tools to make a real, interactive post. You keep using the AI
              you already have.
            </p>
            <ol>
              <li>Keep this local app running.</li>
              <li>
                Connect a local MCP client using the setup in <code>docs/mcp.md</code>.
              </li>
              <li>Ask it to create a draft, preview it here, then publish when you’re ready.</li>
            </ol>
            <div className="prompt-example">
              “Make a notebook from my weekend photos. Let Maya add her memories, too.”
            </div>
            <p className="fineprint">
              The MCP server works over local stdio. It acts as Alex’s demo account. A hosted
              ChatGPT connection is not configured.
            </p>
            <button
              className="primary"
              onClick={() => {
                setConnect(false);
                create();
              }}
            >
              Explore the studio <ArrowUpRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
