"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Home,
  Users,
  Bookmark,
  UserRound,
  Plus,
  Search,
  ArrowUpRight,
  Check,
  Feather,
  Layers,
  ChevronDown,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react";
import type { DraftView, PostView } from "../../../packages/contracts/src/experience";
import { api } from "./runtime";
import { Avatar, Dialog } from "./ui";
import { PostCard } from "./post-card";
import { Studio } from "./studio";
import type { Boot } from "./types";
import { ThemeToggle } from "./theme-toggle";
import { Cockpit } from "./cockpit";
import { BreakoutFeed } from "./breakout-feed";
import { ProfilePage } from "./profile-page";
export function FormaApp() {
  const [profileVisit, setProfileVisit] = useState(0);
  const [cockpit, setCockpit] = useState(false);
  const [breakout, setBreakout] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null),
    [posts, setPosts] = useState<PostView[]>([]),
    [view, setView] = useState("home"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [failure, setFailure] = useState("");
  const [toast, setToast] = useState(""),
    [studio, setStudio] = useState(false),
    [activeDraft, setActiveDraft] = useState<string | undefined>(),
    [connect, setConnect] = useState(false),
    [profile, setProfile] = useState<string | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(async () => {
    try {
      const b = await api<Boot>("/bootstrap");
      const p = await api<PostView[]>("/feed");
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
    void refresh();
    const requestedProfile = new URLSearchParams(window.location.search).get("profile");
    if (requestedProfile || new URLSearchParams(window.location.search).has("profileDraft")) {
      setProfile(requestedProfile ?? "you");
      setView("profile");
    }
    setCockpit(new URLSearchParams(window.location.search).get("mode") === "cockpit");
    setBreakout(new URLSearchParams(window.location.search).get("mode") === "breakout");
    const id = new URLSearchParams(window.location.search).get("draft");
    if (id) {
      setActiveDraft(id);
      setStudio(true);
    }
  }, [refresh]);
  async function switchUser(userId: string) {
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
  function create() {
    setActiveDraft(undefined);
    setStudio(true);
  }
  const me = boot?.users.find((u) => u.id === boot.actor.userId);
  const selectedUser = profile ? boot?.users.find((u) => u.id === profile) : me;
  const visible = posts.filter(
    (p) =>
      (view !== "following" || boot?.following.includes(p.ownerId)) &&
      (view !== "saved" || p.saved) &&
      (view !== "profile" || p.ownerId === (profile ?? boot?.actor.userId)) &&
      (filter === "all" || p.metadata.format === filter) &&
      `${p.metadata.title} ${p.metadata.caption} ${p.author.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function navigate(next: string) {
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
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Forma home">
          <span className="brand-mark">✳</span>forma<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-tagline">Life, in your own shape.</div>
        <nav className="main-nav" aria-label="Main navigation">
          {[
            ["home", Home, "Your feed"],
            ["following", Users, "Following"],
            ["saved", Bookmark, "Saved"],
            ["profile", UserRound, "My profile"],
          ].map(([key, Icon, label]) => {
            const I = Icon as typeof Home;
            return (
              <button
                key={String(key)}
                aria-label={String(label)}
                title={String(label)}
                className={view === key ? "nav-item active" : "nav-item"}
                onClick={() => navigate(String(key))}
              >
                <I size={20} />
                <span>{String(label)}</span>
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
          onClick={create}
        >
          <Plus size={19} />
          Create a post
        </button>
        <div className="sidebar-note">
          <span className="note-star">✧</span>
          <p>
            No two stories
            <br />
            have to look alike.
          </p>
          <button onClick={() => setConnect(true)}>
            Make it yours <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="local-label">
            <span />
            LOCAL PLAYGROUND
          </div>
          {me && (
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
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <span>/</span>{" "}
            <strong>
              {view === "home"
                ? "The feed"
                : view === "profile"
                  ? "Profile"
                  : view[0]?.toUpperCase() + view.slice(1)}
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className="enter-cockpit"
              onClick={() => {
                setBreakout(true);
                window.history.replaceState(null, "", "/?mode=breakout");
                window.scrollTo(0, 0);
              }}
            >
              Break the frame
            </button>
            <button className="enter-cockpit" onClick={() => changeMode(true)}>
              ✧ Enter hyperspace
            </button>
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
            {view === "profile" && selectedUser ? (
              <section className="profile-heading">
                <Avatar user={selectedUser} />
                <div>
                  <span className="eyebrow">@{selectedUser.handle}</span>
                  <h1>{selectedUser.name}</h1>
                  <p>{selectedUser.bio}</p>
                  <span className="profile-count">
                    {posts.filter((p) => p.ownerId === selectedUser.id).length} published stories
                  </span>
                </div>
              </section>
            ) : (
              <section className="feed-heading">
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
                        <span className="heading-spark">✳</span>
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
            {view === "home" && (
              <section className="composer">
                <span className="composer-symbol">
                  <Feather size={22} />
                </span>
                <button onClick={create}>
                  <strong>What does your day look like?</strong>
                  <span>A photo, a story, a whole little world.</span>
                </button>
                <button className="composer-plus" aria-label="Create a post" onClick={create}>
                  <Plus size={21} />
                </button>
              </section>
            )}
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
            {!loading && !failure && visible.length === 0 && (
              <div className="empty-state">
                <Feather size={30} />
                <h2>
                  {view === "saved"
                    ? "Keep something you love."
                    : "A little room for something new."}
                </h2>
                <p>
                  {query
                    ? "Try a different search."
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
                    onRefresh={refresh}
                    notify={notify}
                    onFollow={() => void follow(post.ownerId)}
                    onProfile={() => {
                      setProfile(post.ownerId);
                      setView("profile");
                      setFilter("all");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
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
                      const next = document.querySelectorAll<HTMLElement>(".post-card")[index + 1];
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
                <button onClick={() => setConnect(true)}>
                  Connect your creative tools <ArrowUpRight size={13} />
                </button>
              </div>
            </section>
            <footer className="side-footer">
              <span>Made for a little more expression.</span>
              <span>Forma · Local preview · No cloud required</span>
            </footer>
          </aside>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button aria-label="Your feed" onClick={() => navigate("home")}>
          <Home size={21} />
        </button>
        <button aria-label="Following" onClick={() => navigate("following")}>
          <Users size={21} />
        </button>
        <button className="mobile-create" aria-label="Create a post" onClick={create}>
          <Plus size={23} />
        </button>
        <button aria-label="Saved" onClick={() => navigate("saved")}>
          <Bookmark size={21} />
        </button>
        <button aria-label="My profile" onClick={() => navigate("profile")}>
          <UserRound size={21} />
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>✳</span>
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {studio && boot && (
        <Studio
          boot={boot}
          draftId={activeDraft}
          onClose={() => {
            setStudio(false);
            window.history.replaceState(null, "", "/");
          }}
          onPublished={async () => {
            setStudio(false);
            navigate("home");
            await refresh();
            notify("Published. Your story has a home in the feed.");
          }}
          notify={notify}
        />
      )}
      {connect && (
        <Dialog title="Bring your own imagination." onClose={() => setConnect(false)}>
          <div className="connect-content">
            <span className="connect-symbol">✳</span>
            <p>
              Forma gives your AI the tools to make a real, interactive post. You keep using the AI
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
