/**
 * Only one feed post runs at a time: the one taking up the most of the screen. The others stay
 * mounted, so a fast scroll still meets finished posts, but their timers and animations hold
 * still until they come into focus again. A post opened over the feed holds every feed post.
 */
type Entry = { seen: number; set: (live: boolean) => void };

const entries = new Map<symbol, Entry>();
let live: symbol | null = null;
let holds = 0;

function pick() {
  let best: symbol | null = null;
  let most = 0;
  if (holds === 0)
    for (const [key, entry] of entries)
      if (entry.seen > most) {
        best = key;
        most = entry.seen;
      }
  if (best === live) return;
  if (live) entries.get(live)?.set(false);
  live = best;
  if (best) entries.get(best)?.set(true);
}

const steps = Array.from({ length: 21 }, (_, i) => i / 20);

/** Joins a feed frame to the focus race; `set` hears whether it may run. Returns a leave. */
export function joinFeedFocus(element: Element, set: (live: boolean) => void) {
  const key = Symbol("feed post");
  entries.set(key, { seen: 0, set });
  const observer = new IntersectionObserver(
    ([entry]) => {
      const mine = entries.get(key);
      if (!mine || !entry) return;
      mine.seen = entry.isIntersecting ? entry.intersectionRect.height : 0;
      pick();
    },
    { threshold: steps },
  );
  observer.observe(element);
  return () => {
    observer.disconnect();
    entries.delete(key);
    if (live === key) live = null;
    pick();
  };
}

/** A post opened over the feed: every feed post holds still until it closes. */
export function holdFeed() {
  holds++;
  pick();
  return () => {
    holds--;
    pick();
  };
}
