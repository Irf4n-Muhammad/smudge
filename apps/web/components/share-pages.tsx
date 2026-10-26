"use client";
import { useEffect, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { ProfilePackage } from "../../../packages/contracts/src/profile";
import type { Experience } from "../../../packages/contracts/src/experience";
import type { SideHome } from "../../../packages/contracts/src/sides";
import { api, Runtime } from "./runtime";
import { Avatar } from "./ui";
import { CommentList } from "./comments";
import type { CommentItem } from "./comments";
import { MentionText } from "./mention-text";
import { NowBar } from "./now";
import { PageHead, PageStrip, PostsCollage, Stories } from "./pages";
import type { FixedPage, PostTile } from "../../../packages/contracts/src/pages";

interface Person {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  avatarAssetId?: string;
}
interface SharedPostView {
  id: string;
  author: Person;
  title: string;
  caption: string;
  createdAt: string;
  editedAt?: string;
  revision: number;
  stage: Extract<Experience["manifest"], { schemaVersion: 2 }>["stage"] | null;
  likes: number;
  comments: CommentItem[];
}
interface SharedProfileView {
  user: Person & { bio: string };
  followers: number;
  following: number;
  profile: { publicationId: string; manifest: ProfilePackage["manifest"] | null } | null;
  posts: PostTile[];
}
const asUser = (p: Person) => ({ ...p, bio: "" });

/** Members who open a share link go straight into the app, where they can like and reply. */
function useMemberRedirect(to: string) {
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/state")
      .then((r) => r.json())
      .then((state: { signedIn?: boolean }) => {
        if (state.signedIn) window.location.replace(to);
        else setGuest(true);
      })
      .catch(() => setGuest(true));
  }, [to]);
  return guest;
}
function ShareBar() {
  return (
    <header className="share-bar">
      <a className="brand" href="/" aria-label="Smudge home">
        smudge.
      </a>
      <nav>
        <a href="/">Log in</a>
        <a className="join" href="/">
          Join Smudge
        </a>
      </nav>
    </header>
  );
}
type SideLanding = { id: string; name: string; tagline: string; accent: string };
function Invite({ name, side }: { name: string; side?: SideLanding | null }) {
  if (side)
    return (
      <section
        className="share-cta"
        style={{ "--side-accent": side.accent } as React.CSSProperties}
      >
        <h2>
          Join {name} in {side.name}
        </h2>
        <p>
          {side.tagline}. Make an account and you land in {side.name} with {name}.
        </p>
        <a href={`/?side=${encodeURIComponent(side.id)}`}>Join {side.name} on Smudge</a>
      </section>
    );
  return (
    <section className="share-cta">
      <h2>Say something to {name}</h2>
      <p>Join Smudge to like, comment and make a page that looks like you.</p>
      <a href="/">Join Smudge</a>
    </section>
  );
}
function Missing({ what }: { what: string }) {
  return (
    <div className="share-page">
      <ShareBar />
      <main className="share-missing">
        <h1>This {what} isn’t available.</h1>
        <p>It may have been deleted, or it isn’t shared publicly.</p>
      </main>
    </div>
  );
}

export function SharedPost({ id }: { id: string }) {
  const guest = useMemberRedirect(`/?post=${encodeURIComponent(id)}`);
  const [post, setPost] = useState<SharedPostView | null | "missing">(null);
  useEffect(() => {
    if (!guest) return;
    api<SharedPostView>(`/public/posts/${encodeURIComponent(id)}`)
      .then(setPost)
      .catch(() => setPost("missing"));
  }, [guest, id]);
  if (post === "missing") return <Missing what="post" />;
  if (!post) return <div className="share-page" aria-busy="true" />;
  return (
    <div className="share-page">
      <ShareBar />
      <main className="share-main">
        <a className="share-author" href={`/u/${encodeURIComponent(post.author.handle)}`}>
          <Avatar user={asUser(post.author)} />
          <span>
            <strong>{post.author.name}</strong>
            <small>@{post.author.handle}</small>
          </span>
        </a>
        <article className="share-post" aria-label={`${post.title} by ${post.author.name}`}>
          <Runtime
            guest
            target={post.id}
            version={post.revision}
            height={post.stage?.height ?? 460}
            {...(post.stage ? { stage: post.stage } : {})}
          />
          <div className="share-post-body">
            <h1>{post.title}</h1>
            {post.caption && (
              <p>
                <MentionText text={post.caption} known={() => true} />
              </p>
            )}
            <p className="meta">
              <Heart size={13} /> {post.likes} · <MessageCircle size={13} /> {post.comments.length}{" "}
              ·{" "}
              {new Date(post.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {post.editedAt ? " · Edited" : ""}
            </p>
            {post.comments.length > 0 && (
              <section className="comments" aria-label="Comments">
                <CommentList comments={post.comments} known={() => true} />
              </section>
            )}
          </div>
        </article>
        <Invite name={post.author.name} />
      </main>
    </div>
  );
}

/**
 * Someone's page for a visitor without an account: the landing page they made, and the fixed
 * Posts and Stories pages (ADR 0045) at /u/<handle>/posts and /u/<handle>/stories. Members are
 * sent to the same page inside the app.
 */
export function SharedProfile({
  handle,
  page = "page",
}: {
  handle: string;
  page?: FixedPage | "page";
}) {
  const [view, setView] = useState<SharedProfileView | null | "missing">(null);
  const [guest, setGuest] = useState(false);
  const [side, setSide] = useState<SideLanding | null>(null);
  useEffect(() => {
    // A share card's link names the side it came from (ADR 0030).
    const landing = new URLSearchParams(window.location.search).get("side");
    void api<SharedProfileView>(`/public/users/${encodeURIComponent(handle)}`)
      .then(async (v) => {
        const state = await api<{ signedIn?: boolean }>("/auth/state").catch(() => ({}));
        if ((state as { signedIn?: boolean }).signedIn)
          return window.location.replace(
            `/?profile=${encodeURIComponent(v.user.id)}${landing ? `&side=${encodeURIComponent(landing)}` : ""}${page === "page" ? "" : `&page=${page}`}`,
          );
        if (landing)
          setSide(
            await api<SideLanding>(`/public/sides/${encodeURIComponent(landing)}`).catch(
              () => null,
            ),
          );
        setView(v);
        setGuest(true);
      })
      .catch(() => setView("missing"));
  }, [handle, page]);
  if (view === "missing") return <Missing what="profile" />;
  if (!view || !guest) return <div className="share-page" aria-busy="true" />;
  const manifest = view.profile?.manifest;
  const base = `/u/${encodeURIComponent(handle)}`;
  const strip = (
    <PageStrip
      current={page}
      posts={view.posts.length}
      href={(tab) => (tab === "page" ? base : `${base}/${tab}`)}
    />
  );
  const cover = (p: PostTile) => `/api/public/posts/${encodeURIComponent(p.id)}/cover`;
  const postHref = (p: PostTile) => `/p/${encodeURIComponent(p.id)}`;
  if (page !== "page")
    return (
      <div className="share-page">
        <ShareBar />
        <main className="share-main page-fixed" aria-label={`${view.user.name}'s ${page}`}>
          <PageHead user={{ ...view.user, bio: view.user.bio }} page={page} />
          {page === "posts" ? (
            <PostsCollage posts={view.posts} cover={cover} href={postHref} empty="No posts yet." />
          ) : (
            <Stories
              path={`/public/users/${encodeURIComponent(handle)}/timeline`}
              cover={cover}
              postHref={postHref}
              empty="Nothing yet."
            />
          )}
          <Invite name={view.user.name} side={side} />
        </main>
        {strip}
      </div>
    );
  // The landing page says who this is; the plain head only stands in when there is no page yet.
  return (
    <div className="share-page">
      <ShareBar />
      <main className="share-main">
        {!(view.profile && manifest) && (
          <section className="share-profile-head">
            <Avatar user={view.user} />
            <div>
              <h1>{view.user.name}</h1>
              <small>@{view.user.handle}</small>
              {view.user.bio && <p>{view.user.bio}</p>}
            </div>
          </section>
        )}
        <NowBar ownerId={view.user.id} mine={false} guestHandle={handle} />
        {view.profile && manifest && (
          <section className="share-profile-world" aria-label={`${view.user.name}'s page`}>
            <Runtime
              guest
              kind="profile"
              target={view.profile.publicationId}
              height={manifest.height}
              autoHeight={manifest.schemaVersion === 2 && manifest.autoHeight}
              mobileHeight={manifest.schemaVersion === 2 ? manifest.mobileHeight : undefined}
              onOpenPost={(id) => window.location.assign(`/p/${encodeURIComponent(id)}`)}
            />
          </section>
        )}
        {!(view.profile && manifest) && (
          <PostsCollage posts={view.posts} cover={cover} href={postHref} empty="No posts yet." />
        )}
        <Invite name={view.user.name} side={side} />
      </main>
      {strip}
    </div>
  );
}

interface SharedSideView extends SideHome {
  recent: {
    id: string;
    title: string;
    caption: string;
    hasCover: boolean;
    author: Person | null;
  }[];
}
/**
 * A side's link (ADR 0035): the side's home for someone without an account, the way a WhatsApp
 * group would see it, and one way in. Members are sent into the side inside the app.
 */
export function SharedSide({ id }: { id: string }) {
  const guest = useMemberRedirect(`/?side=${encodeURIComponent(id)}`);
  const [view, setView] = useState<SharedSideView | null | "missing">(null);
  useEffect(() => {
    if (!guest) return;
    api<SharedSideView>(`/public/sides/${encodeURIComponent(id)}/home`)
      .then(setView)
      .catch(() => setView("missing"));
  }, [guest, id]);
  if (view === "missing") return <Missing what="side" />;
  if (!view) return <div className="share-page" aria-busy="true" />;
  const { side, members, plans, regulars, recent } = view;
  const more = members.count - members.people.length;
  return (
    <div className="share-page share-side">
      <ShareBar />
      <main className="share-main">
        <section
          className="side-home"
          aria-label={`${side.name} home`}
          style={{ "--side-accent": side.accent } as React.CSSProperties}
        >
          <div className="side-home-band" aria-hidden="true">
            <span className="side-home-mark">{side.name[0]}</span>
          </div>
          <div className="side-home-body">
            <header className="side-home-head">
              <div>
                <h1>{side.name}</h1>
                <p className="side-home-tag">{side.tagline}</p>
              </div>
            </header>
            <p className="side-home-meta">
              <strong>{members.count}</strong> {members.count === 1 ? "member" : "members"} ·{" "}
              <strong>{view.posts}</strong> {view.posts === 1 ? "post" : "posts"}
            </p>
            <ul className="side-home-people" aria-label={`People in ${side.name}`}>
              {members.people.map((p) => (
                <li key={p.id}>
                  <a
                    className="avatar-button"
                    href={`/u/${encodeURIComponent(p.handle)}`}
                    title={p.name}
                    aria-label={p.name}
                  >
                    <Avatar user={asUser(p)} small />
                  </a>
                </li>
              ))}
              {more > 0 && <li className="side-home-more">+{more}</li>}
            </ul>
            {plans.length > 0 && (
              <div className="side-home-plans">
                <h3>Plans</h3>
                <ul>
                  {plans.map((p) => (
                    <li key={p.postId}>
                      <a className="side-home-plan" href={`/p/${encodeURIComponent(p.postId)}`}>
                        <strong>{p.title}</strong>
                        <span>
                          {p.ownerName && `${p.ownerName} · `}
                          {p.count} in
                          {p.cameCount > 0 && ` · ${p.cameCount} came`}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {regulars.length > 0 && (
              <div className="side-home-regulars">
                <h3>Most often there</h3>
                <ol aria-label={`Regulars in ${side.name}`}>
                  {regulars.map((r, i) => (
                    <li key={r.id}>
                      <a className="side-home-regular" href={`/u/${encodeURIComponent(r.handle)}`}>
                        <span className="side-home-rank">{i + 1}</span>
                        <Avatar user={asUser(r)} small />
                        <strong>{r.name}</strong>
                        <span className="side-home-came">
                          {r.came === 1 ? "once" : `${r.came} times`}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>
        {recent.length > 0 && (
          <ul className="share-grid" aria-label="Posts">
            {recent.map((p) => (
              <li key={p.id}>
                <a href={`/p/${encodeURIComponent(p.id)}`}>
                  {p.hasCover ? (
                    <img src={`/api/public/posts/${encodeURIComponent(p.id)}/cover`} alt="" />
                  ) : (
                    <div className="no-cover">{p.title}</div>
                  )}
                  <span>{p.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <section
          className="share-cta"
          style={{ "--side-accent": side.accent } as React.CSSProperties}
        >
          <h2>Join {side.name}</h2>
          <p>
            {side.tagline}. Make an account and you land in {side.name}.
          </p>
          <a href={`/?side=${encodeURIComponent(side.id)}`}>Join {side.name} on Smudge</a>
        </section>
      </main>
    </div>
  );
}
