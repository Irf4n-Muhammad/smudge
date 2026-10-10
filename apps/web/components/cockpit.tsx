"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Heart,
  MessageCircle,
  Orbit,
  Radio,
  X,
} from "lucide-react";
import type { PostView } from "../../../packages/contracts/src/experience";
import type { Boot } from "./types";
import { api, Runtime } from "./runtime";
import { Dialog } from "./ui";

const palettes = ["#c99765", "#8ec5d5", "#b69ed8", "#78ae9b", "#d89e8c"];
const wrap = (n: number, length: number) => ((n % length) + length) % length;

/** Host-owned navigation experiment. Post code still runs only in the isolated Runtime. */
export function Cockpit({
  posts,
  boot,
  onExit,
  onRefresh,
}: {
  posts: PostView[];
  boot: Boot;
  onExit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(0),
    [rotation, setRotation] = useState(0);
  const [motion, setMotion] = useState(true),
    [opened, setOpened] = useState(false);
  const [channel, setChannel] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const drag = useRef<{ x: number; rotation: number } | null>(null);
  const post = posts[wrap(selected, posts.length || 1)];
  const step = 360 / Math.max(posts.length, 1);
  const select = (next: number) => {
    setSelected(wrap(next, posts.length || 1));
    setRotation(-next * step);
    setChannel(false);
    setError("");
  };
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    setMotion(!media.matches);
    const change = () => setMotion(!media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  async function action(kind: "like" | "save") {
    if (!post || busy) return;
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
    <main
      className={`cockpit ${motion ? "motion-on" : ""}`}
      style={{ "--planet-tone": palettes[selected % palettes.length] } as CSSProperties}
    >
      <div className="space-dust" aria-hidden="true">
        {Array.from({ length: 95 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 73.17) % 100}%`,
              top: `${(i * 37.91) % 100}%`,
              opacity: 0.2 + (i % 5) * 0.15,
              width: i % 7 === 0 ? 3 : 1,
              height: i % 7 === 0 ? 3 : 1,
            }}
          />
        ))}
      </div>
      <div className="nebula" aria-hidden="true" />
      <div className="canopy-frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className="flight-header">
        <button className="flight-brand" onClick={onExit} aria-label="Return to feed">
          <span>✳</span> FORMA <small>EXPERIMENT 02</small>
        </button>
        <span className="flight-coordinate">OUTER RIM / PERSONAL SPACE</span>
        <button className="flight-exit" onClick={onExit}>
          <ArrowLeft size={15} /> Back to feed
        </button>
      </header>
      <div className="flight-heading">
        <span className="signal-label">
          <i /> SOCIAL EXPLORER — ONLINE
        </span>
        <h1>
          Everyone is
          <br />a universe.
        </h1>
        <p>Find a signal. Enter their world.</p>
      </div>
      <div className="sector-label" aria-hidden="true">
        SECTOR 07 <span>///</span> YOUR ORBIT
      </div>
      <div className="galaxy" aria-label="Post navigation">
        <div className="orbit-track track-outer" aria-hidden="true" />
        <div className="orbit-track track-inner" aria-hidden="true" />
        <div className="orbital-plane" aria-hidden="true" />
        <div className="planet-shadow" aria-hidden="true" />
        <div className="main-planet" aria-hidden="true">
          <div className="planet-bands" />
          <div className="planet-shade" />
        </div>
        <div className="planet-ring" aria-hidden="true" />
        <div className="planet-moon" aria-hidden="true" />
        <div
          className="orbit-dial"
          role="slider"
          tabIndex={0}
          aria-label="Rotate post orbit"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, posts.length)}
          aria-valuenow={selected + 1}
          aria-valuetext={post?.metadata.title ?? "No signals"}
          onKeyDown={(e) => {
            if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              select(
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? posts.length - 1
                    : selected + (e.key === "ArrowRight" ? 1 : -1),
              );
            }
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, rotation };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setRotation(drag.current.rotation + (e.clientX - drag.current.x) * 0.45);
          }}
          onPointerUp={(e) => {
            if (!drag.current) return;
            const next = drag.current.rotation + (e.clientX - drag.current.x) * 0.45;
            drag.current = null;
            select(Math.round(-next / step));
          }}
          onPointerCancel={() => {
            drag.current = null;
            setRotation(-selected * step);
          }}
        >
          <span className="dial-hint">
            DRAG TO ORBIT <span>↔</span>
          </span>
        </div>
        <div
          className={posts.length > 8 ? "orbit-catalog" : "orbit-nodes"}
          aria-label="Available transmissions"
        >
          {posts.map((p, i) => {
            const angle = ((i * step + rotation - 90) * Math.PI) / 180;
            return (
              <button
                key={p.id}
                className={`orbit-node ${i === selected ? "active" : ""}`}
                aria-label={`Select ${p.metadata.title}`}
                aria-pressed={i === selected}
                onClick={() => select(i)}
                style={
                  {
                    left: `${50 + Math.cos(angle) * 46}%`,
                    top: `${50 + Math.sin(angle) * 43}%`,
                    "--node-tone": palettes[i % palettes.length],
                  } as CSSProperties
                }
              >
                <span className="node-planet" />
                <span className="node-caption">
                  {p.author.name.split(" ")[0]}
                  <small>{String(i + 1).padStart(2, "0")}</small>
                </span>
              </button>
            );
          })}
        </div>
        <span className="orbital-caption" aria-hidden="true">
          A SMALL PART OF AN INFINITE SOMETHING
        </span>
      </div>
      {post ? (
        <section
          className="signal-console"
          aria-label="Selected transmission"
          key={`signal:${post.id}`}
        >
          <div className="signal-line">
            <span />
            <small>INCOMING TRANSMISSION</small>
            <Radio size={16} />
          </div>
          <div className="signal-number">
            {String(selected + 1).padStart(2, "0")}
            <span> / {String(posts.length).padStart(2, "0")}</span>
          </div>
          <p className="signal-author">
            FROM <strong>{post.author.name}</strong> <span>↗</span>
          </p>
          <h2>{post.metadata.title}</h2>
          <p className="signal-caption">
            {post.metadata.caption || "A new world is waiting on the other side."}
          </p>
          <button className="launch-world" onClick={() => setOpened(true)}>
            <Orbit size={20} />
            <span>
              Enter this world<small>OPEN HOLOGRAM</small>
            </span>
            <ArrowRight size={21} />
          </button>
          <div className="signal-actions">
            <button
              aria-label={post.liked ? "Unlike transmission" : "Like transmission"}
              aria-pressed={post.liked}
              disabled={busy}
              onClick={() => void action("like")}
            >
              <Heart size={18} fill={post.liked ? "currentColor" : "none"} /> {post.likes}
            </button>
            <button
              aria-label="Open transmission comments"
              aria-expanded={channel}
              onClick={() => setChannel((v) => !v)}
            >
              <MessageCircle size={18} /> {post.comments}
            </button>
            <button
              aria-label={post.saved ? "Unsave transmission" : "Save transmission"}
              aria-pressed={post.saved}
              disabled={busy}
              onClick={() => void action("save")}
            >
              <Bookmark size={18} fill={post.saved ? "currentColor" : "none"} />
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
      ) : (
        <section className="signal-console">
          <h2>No signals yet.</h2>
          <button onClick={onExit}>Return to the feed</button>
        </section>
      )}
      <footer className="flight-deck">
        <div className="deck-status">
          <span className="radar-icon" aria-hidden="true" />
          <div>
            YOUR SOCIAL GALAXY<small>{posts.length} worlds in range · local connection</small>
          </div>
        </div>
        <div className="orbit-controls">
          <button
            aria-label="Previous transmission"
            disabled={!posts.length}
            onClick={() => select(selected - 1)}
          >
            <ArrowLeft size={19} />
          </button>
          <span>EXPLORE THE ORBIT</span>
          <button
            aria-label="Next transmission"
            disabled={!posts.length}
            onClick={() => select(selected + 1)}
          >
            <ArrowRight size={19} />
          </button>
        </div>
        <button
          className="motion-toggle"
          aria-pressed={motion}
          onClick={() => setMotion((v) => !v)}
        >
          {motion ? "Pause ambient motion" : "Resume ambient motion"}
          <span>{motion ? "Ⅱ" : "▷"}</span>
        </button>
      </footer>
      {channel && post && (
        <TransmissionComments
          key={`comments:${post.id}`}
          post={post}
          boot={boot}
          onClose={() => setChannel(false)}
          onRefresh={onRefresh}
        />
      )}
      {opened && post && (
        <div className="hologram-overlay">
          <Dialog title={post.metadata.title} wide onClose={() => setOpened(false)}>
            <div className="hologram-label">
              HOLOGRAPHIC LINK ESTABLISHED / @{post.author.handle}
            </div>
            <Runtime
              key={post.id}
              target={post.id}
              height={
                post.manifest.schemaVersion === 2 ? (post.manifest.stage?.height ?? 510) : 510
              }
              stage={post.manifest.schemaVersion === 2 ? post.manifest.stage : undefined}
            />
          </Dialog>
        </div>
      )}
    </main>
  );
}

function TransmissionComments({
  post,
  boot,
  onClose,
  onRefresh,
}: {
  post: PostView;
  boot: Boot;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [comments, setComments] = useState<{ id: string; userId: string; text: string }[]>([]);
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    close.current?.focus();
    let active = true;
    api<typeof comments>(`/posts/${post.id}/comments`)
      .then((v) => {
        if (active) setComments(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      previous?.focus();
    };
  }, [post.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
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
  }
  return (
    <aside
      className="transmission-panel"
      aria-label="Transmission comments"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header>
        <Radio size={20} />
        <div>
          OPEN CHANNEL
          <small>
            {post.author.name} / {post.metadata.title}
          </small>
        </div>
        <button ref={close} aria-label="Close transmission comments" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="transmission-messages" aria-live="polite">
        {loading ? (
          <p>Connecting to this world…</p>
        ) : !comments.length ? (
          <p>
            No transmissions yet.
            <br />
            Send the first signal.
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id}>
              <small>{boot.users.find((u) => u.id === c.userId)?.name ?? "Explorer"}</small>
              <p>{c.text}</p>
            </div>
          ))
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={submit}>
        <label htmlFor="transmission-text">YOUR TRANSMISSION</label>
        <textarea
          id="transmission-text"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A thought from your corner of the universe…"
        />
        <button disabled={busy || !text.trim()} type="submit">
          {busy ? "Sending…" : "Send transmission"}
          <ArrowRight size={17} />
        </button>
      </form>
    </aside>
  );
}
