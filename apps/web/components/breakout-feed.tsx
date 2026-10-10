"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, Heart, Bookmark, Maximize2, X } from "lucide-react";
import type { PostView } from "../../../packages/contracts/src/experience";
import { api, Runtime } from "./runtime";
import { Dialog } from "./ui";
import { ThemeToggle } from "./theme-toggle";

function Starfighter() {
  return (
    <svg viewBox="0 0 600 450" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ship-metal" x2=".8" y2="1">
          <stop stopColor="#f3efe2" />
          <stop offset=".45" stopColor="#9aaeb2" />
          <stop offset="1" stopColor="#32474d" />
        </linearGradient>
        <linearGradient id="ship-glass" x2="1" y2="1">
          <stop stopColor="#8be7ed" />
          <stop offset="1" stopColor="#071923" />
        </linearGradient>
      </defs>
      <g stroke="#172d36" strokeWidth="4" strokeLinejoin="round">
        <path d="M285 112 69 280 66 330 273 251 342 343 380 326 344 188Z" fill="url(#ship-metal)" />
        <path d="m292 141 199-22 50 37-205 68Z" fill="url(#ship-metal)" />
        <path
          d="m283 181-121 95 44 5 91-55M350 176l139-34-90 43"
          stroke="#b24130"
          strokeWidth="14"
        />
        <path d="m301 46-56 259 60 23 37-30Z" fill="url(#ship-metal)" />
        <path d="m297 137-23 94 38 13 7-44Z" fill="url(#ship-glass)" />
        <path d="m82 242-17 123 22 6 19-136ZM475 100l38 90 19-8-36-89Z" fill="#bcc7c6" />
        <path d="m82 230 9-45m397-78-12-46" stroke="#d0e2df" strokeWidth="6" />
        <path d="m247 282-11 62 34 8 19-59m21 10 4 53 30-8-5-54" fill="#354c56" />
        <path d="m238 340 30 8m47 4 27-8" stroke="#8feefa" strokeWidth="12" />
      </g>
    </svg>
  );
}
function WebHero() {
  return (
    <svg viewBox="0 0 420 690" aria-hidden="true">
      <defs>
        <pattern id="suit-web" width="36" height="36" patternUnits="userSpaceOnUse">
          <path
            d="M0 0 36 36M36 0 0 36M18 0v36M0 18h36"
            fill="none"
            stroke="#571a2b"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <g stroke="#201b30" strokeWidth="6" strokeLinejoin="round">
        <path
          d="m151 278-58 115 56 76 30-14-33-68 64-66m44-13 61 100-16 113 35 7 33-128-62-123"
          fill="#244762"
        />
        <path
          d="m170 216-67 12-66 105 23 20 74-82 44 19m87-70 61-72 22-99-27-7-34 92-59 40"
          fill="#e33842"
        />
        <path d="m174 198-35 91 46 74 81-19 19-119-43-40Z" fill="#e33842" />
        <path d="m174 198-35 91 46 74 81-19 19-119-43-40Z" fill="url(#suit-web)" />
        <path d="m183 160c-13-62 65-90 86-29 16 48-12 83-45 73Z" fill="#e33842" />
        <path d="m186 135 30 13-9 24-16-10Zm73-11-32 24 16 15 15-12Z" fill="#fff6dd" />
        <path
          d="m297 515-10 87-58 24 3 22 93-15 6-114M144 450l25 51-16 68 29 10 30-79-37-67"
          fill="#e33842"
        />
        <path d="m335 59 3-30 27-16 8 17-19 32M39 331 21 358l6 27 28-4 8-35" fill="#e33842" />
        <path
          d="m208 247 29 26-23 24-10-25 4-25m9 22-34-17m37 23-41 8m43-8 38-28m-33 33 27 14"
          fill="#201b30"
          strokeWidth="4"
        />
      </g>
    </svg>
  );
}

/** Explicit host-authored demo of bounded inter-post overlap; no untrusted host CSS. */
export function BreakoutFeed({
  posts,
  onExit,
  onRefresh,
}: {
  posts: PostView[];
  onExit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const root = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState(false),
    [boost, setBoost] = useState(false),
    [swing, setSwing] = useState(false);
  const [opened, setOpened] = useState<PostView | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Stable demos remain attached to the same existing publications after new posts are added.
  const titles = [
    "A beautiful little mess",
    "Somewhere between midnights",
    "A letter for slower days",
  ];
  const worlds = titles
    .map((title, i) => posts.find((p) => p.metadata.title === title) ?? posts[i])
    .filter((p): p is PostView => !!p);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      root.current?.querySelectorAll<HTMLElement>(".break-post").forEach((el) => {
        const y = el.getBoundingClientRect().top;
        el.style.setProperty(
          "--drift",
          `${media.matches ? 0 : Math.max(-22, Math.min(22, (innerHeight / 2 - y) * 0.055))}px`,
        );
      });
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", scroll, { passive: true });
    media.addEventListener("change", scroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scroll);
      media.removeEventListener("change", scroll);
    };
  }, []);
  async function action(post: PostView, kind: "like" | "save") {
    if (busy) return;
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
      ref={root}
      className={`breakout-feed ${bounds ? "show-bounds" : ""} ${boost ? "engines-on" : ""} ${swing ? "web-swing" : ""}`}
    >
      <header className="break-nav">
        <button onClick={onExit}>
          <ArrowLeft size={16} /> Feed
        </button>
        <a href="#break-start" className="break-brand">
          forma<span>✳</span>
        </a>
        <div>
          <ThemeToggle />
          <button
            aria-pressed={bounds}
            onClick={() => setBounds((v) => !v)}
            className="boundary-toggle"
          >
            <Maximize2 size={15} />
            {bounds ? "Hide boundaries" : "Show boundaries"}
          </button>
        </div>
      </header>
      <section className="break-intro" id="break-start">
        <span>EXPERIMENT 03 / THE SCROLL CONTINUES</span>
        <h1>
          Some stories
          <br />
          <em>won’t stay inside.</em>
        </h1>
        <p>Different worlds. A little collision. Keep scrolling.</p>
        <ArrowDown size={22} />
      </section>
      {bounds && (
        <aside className="boundary-legend" role="status">
          <span>Orange: visible frame</span>
          <span>Cyan: actual extension limit</span>
        </aside>
      )}
      <div className="break-stream">
        {worlds.map((post, i) => (
          <article
            key={post.id}
            className={`break-post break-${i}`}
            aria-label={`${["Comic", "Space", "Quiet"][i]} world by ${post.author.name}`}
          >
            <div className="break-core">
              <header className="break-author">
                <span className="break-avatar">{post.author.initials}</span>
                <div>
                  <strong>{post.author.name}</strong>
                  <small>
                    {
                      [
                        "ISSUE 001 · MY CITY, MY RULES",
                        "FLIGHT LOG · A LONG WAY FROM HOME",
                        "FIELD NOTES · BACK ON EARTH",
                      ][i]
                    }
                  </small>
                </div>
                <span className="break-edition">0{i + 1}</span>
              </header>
              {i === 0 ? (
                <>
                  <div className="comic-city" aria-hidden="true">
                    {Array.from({ length: 9 }, (_, n) => (
                      <i key={n} style={{ height: `${80 + ((n * 47) % 140)}px` }} />
                    ))}
                  </div>
                  <div className="comic-copy">
                    <span className="comic-kicker">MEANWHILE, SOMEWHERE ABOVE THE FEED…</span>
                    <h2>
                      OFF
                      <br />
                      <em>SCRIPT.</em>
                    </h2>
                    <p>
                      Same city.
                      <br />
                      Absolutely no rules.
                    </p>
                  </div>
                  <span className="comic-stamp">
                    TO BE
                    <br />
                    CONTINUED ↘
                  </span>
                </>
              ) : i === 1 ? (
                <>
                  <div className="space-stars" />
                  <div className="break-planet" />
                  <div className="space-copy">
                    <span>TRANSMISSION / 024</span>
                    <h2>
                      Never tell me
                      <br />
                      the odds.
                    </h2>
                    <p>
                      Taking the scenic route
                      <br />
                      through someone else’s universe.
                    </p>
                    <button
                      className="engine-switch"
                      aria-pressed={boost}
                      onClick={() => setBoost((v) => !v)}
                    >
                      {boost ? "Cool the engines" : "Fire thrusters"}
                      <span>↗</span>
                    </button>
                  </div>
                  <div className="space-coordinates">
                    27.04 N / 86.92 E <span>● SIGNAL FOUND</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="quiet-sun" />
                  <div className="quiet-copy">
                    <span>AFTER ALL THAT NOISE</span>
                    <h2>
                      A softer
                      <br />
                      <em>landing.</em>
                    </h2>
                    <p>Even galaxies need somewhere to slow down.</p>
                  </div>
                  <div className="quiet-hills" />
                  <div className="quiet-moon" />
                </>
              )}
            </div>
            <div className="break-extension" data-testid={`extension-${i}`}>
              {i === 0 ? (
                <>
                  <svg
                    className="cross-web"
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <g fill="none" stroke="currentColor">
                      <path d="M775 240 800 690 210 1000M775 240 725 750 210 1000M800 690 725 750M792 590 737 650M785 490 750 550M740 755 750 715 786 701M500 875 510 838 550 832M350 945 360 912 400 902" />
                      <path d="m210 1000 12-30m-12 30 35-6" />
                    </g>
                  </svg>
                  <div className="web-hero">
                    <WebHero />
                  </div>
                  <button
                    className="swing-tag"
                    aria-pressed={swing}
                    onClick={() => setSwing((v) => !v)}
                  >
                    {swing ? "HANG TIGHT!" : "GIVE ME A PUSH ↗"}
                  </button>
                  <div className="comic-burst" aria-hidden="true">
                    THWIP!
                  </div>
                </>
              ) : i === 1 ? (
                <>
                  <div className="ship-exhaust" aria-hidden="true" />
                  <div className="cross-ship">
                    <Starfighter />
                  </div>
                  <div className="engine-sparks" aria-hidden="true">
                    ✦<span>✧</span>✦
                  </div>
                </>
              ) : (
                <>
                  <div className="leaf leaf-one" />
                  <div className="leaf leaf-two" />
                </>
              )}
            </div>
            <footer className="break-social">
              <div>
                <button
                  disabled={busy}
                  aria-label={`${post.liked ? "Unlike" : "Like"} ${post.metadata.title}`}
                  aria-pressed={post.liked}
                  onClick={() => void action(post, "like")}
                >
                  <Heart size={18} fill={post.liked ? "currentColor" : "none"} />
                  {post.likes}
                </button>
                <button
                  disabled={busy}
                  aria-label={`${post.saved ? "Unsave" : "Save"} ${post.metadata.title}`}
                  aria-pressed={post.saved}
                  onClick={() => void action(post, "save")}
                >
                  <Bookmark size={18} fill={post.saved ? "currentColor" : "none"} />
                </button>
                <span>{post.metadata.title}</span>
              </div>
              <button onClick={() => setOpened(post)}>Open story ↗</button>
            </footer>
          </article>
        ))}
      </div>
      <footer className="break-end">
        ✳
        <p>
          The feed keeps going.
          <br />
          The frames don’t get the final word.
        </p>
        <button onClick={onExit}>Back to your feed ↗</button>
      </footer>
      {error && (
        <div role="alert" className="toast">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {opened && (
        <Dialog title={opened.metadata.title} wide onClose={() => setOpened(null)}>
          <Runtime
            target={opened.id}
            height={
              opened.manifest.schemaVersion === 2 ? (opened.manifest.stage?.height ?? 510) : 510
            }
            stage={opened.manifest.schemaVersion === 2 ? opened.manifest.stage : undefined}
          />
        </Dialog>
      )}
    </main>
  );
}
