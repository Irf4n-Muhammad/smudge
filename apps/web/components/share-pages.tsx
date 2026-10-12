"use client";
import { useEffect, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { ProfilePackage } from "../../../packages/contracts/src/profile";
import type { Experience } from "../../../packages/contracts/src/experience";
import { api, Runtime } from "./runtime";
import { Avatar } from "./ui";
import { CommentList } from "./comments";
import type { CommentItem } from "./comments";
import { MentionText } from "./mention-text";

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
  posts: { id: string; title: string; caption: string; hasCover: boolean }[];
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
function Invite({ name }: { name: string }) {
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

export function SharedProfile({ handle }: { handle: string }) {
  const [view, setView] = useState<SharedProfileView | null | "missing">(null);
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    void api<SharedProfileView>(`/public/users/${encodeURIComponent(handle)}`)
      .then(async (v) => {
        const state = await api<{ signedIn?: boolean }>("/auth/state").catch(() => ({}));
        if ((state as { signedIn?: boolean }).signedIn)
          return window.location.replace(`/?profile=${encodeURIComponent(v.user.id)}`);
        setView(v);
        setGuest(true);
      })
      .catch(() => setView("missing"));
  }, [handle]);
  if (view === "missing") return <Missing what="profile" />;
  if (!view || !guest) return <div className="share-page" aria-busy="true" />;
  const manifest = view.profile?.manifest;
  return (
    <div className="share-page">
      <ShareBar />
      <main className="share-main">
        <section className="share-profile-head">
          <Avatar user={view.user} />
          <div>
            <h1>{view.user.name}</h1>
            <small>@{view.user.handle}</small>
            {view.user.bio && <p>{view.user.bio}</p>}
            <div className="share-counts">
              <span>
                <strong>{view.posts.length}</strong> posts
              </span>
              <span>
                <strong>{view.followers}</strong> followers
              </span>
              <span>
                <strong>{view.following}</strong> following
              </span>
            </div>
          </div>
        </section>
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
        {view.posts.length > 0 && (
          <ul className="share-grid" aria-label="Posts">
            {view.posts.map((p) => (
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
        <Invite name={view.user.name} />
      </main>
    </div>
  );
}
