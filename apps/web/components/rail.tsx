"use client";
import { useRef } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A row of cards picked by swiping. A finger swipes it natively; a mouse can drag it, use the
 * arrows or the dots, and the keyboard's left and right keys move one card.
 */
export function useRail(count: number, index: number, setIndex: (i: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    setIndex(next);
    ref.current?.children[next]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  };
  const handlers = {
    ref,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(index + 1);
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else return;
      e.preventDefault();
    },
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
      e.currentTarget.classList.add("dragging");
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 5) d.moved = true;
      e.currentTarget.scrollLeft = d.left - dx;
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => endDrag(e.currentTarget),
    onPointerLeave: (e: PointerEvent<HTMLDivElement>) => endDrag(e.currentTarget),
    // A drag ends on a card; that release is not a tap on it.
    onClickCapture: (e: MouseEvent) => {
      if (moved.current) {
        e.stopPropagation();
        e.preventDefault();
        moved.current = false;
      }
    },
  };
  const moved = useRef(false);
  function endDrag(row: HTMLDivElement) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    moved.current = d.moved;
    row.classList.remove("dragging");
    // Let the snap settle on the card nearest the middle.
    const mid = row.scrollLeft + row.clientWidth / 2;
    let best = 0;
    Array.from(row.children).forEach((c, i) => {
      const el = c as HTMLElement,
        b = row.children[best] as HTMLElement;
      if (
        Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) <
        Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid)
      )
        best = i;
    });
    goTo(best);
  }
  return { handlers, goTo };
}

/** Previous and next arrows beside the row, for a mouse. Hidden on touch screens. */
export function RailArrows({
  index,
  count,
  goTo,
}: {
  index: number;
  count: number;
  goTo: (i: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="rail-arrow prev"
        aria-label="Previous"
        disabled={index === 0}
        onClick={() => goTo(index - 1)}
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        className="rail-arrow next"
        aria-label="Next"
        disabled={index >= count - 1}
        onClick={() => goTo(index + 1)}
      >
        <ChevronRight />
      </button>
    </>
  );
}

/** The dots under the row, each one a way to jump to its card. */
export function RailDots({
  names,
  index,
  goTo,
}: {
  names: readonly string[];
  index: number;
  goTo: (i: number) => void;
}) {
  return (
    <span className="easy-dots">
      {names.map((name, i) => (
        <button
          key={name}
          type="button"
          aria-label={`Show ${name}`}
          aria-current={i === index ? "true" : undefined}
          className={i === index ? "on" : ""}
          onClick={() => goTo(i)}
        />
      ))}
    </span>
  );
}

/**
 * The swipe row of picture cards with its arrows. `below` draws what sits under the row (the
 * name, the note, the dots), handed the same goTo so the dots can move the row.
 */
export function PictureRail({
  label,
  items,
  index,
  setIndex,
  below,
}: {
  label: string;
  items: readonly { key: string; name: string; image: string }[];
  index: number;
  setIndex: (i: number) => void;
  below: (goTo: (i: number) => void) => ReactNode;
}) {
  const { handlers, goTo } = useRail(items.length, index, setIndex);
  return (
    <>
      <div className="easy-rail">
        <div
          {...handlers}
          className="easy-vibes"
          role="listbox"
          aria-label={label}
          onScroll={(e) => {
            // Swiping picks the card nearest the middle.
            const row = e.currentTarget;
            const mid = row.scrollLeft + row.clientWidth / 2;
            let best = 0;
            Array.from(row.children).forEach((c, i) => {
              const el = c as HTMLElement,
                b = row.children[best] as HTMLElement;
              if (
                Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) <
                Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid)
              )
                best = i;
            });
            if (best !== index) setIndex(best);
          }}
        >
          {items.map((v, i) => (
            <button
              key={v.key}
              role="option"
              aria-selected={i === index}
              aria-label={v.name}
              className={`easy-vibe ${i === index ? "on" : ""}`}
              onClick={() => goTo(i)}
            >
              <img src={v.image} alt="" draggable={false} />
            </button>
          ))}
        </div>
        <RailArrows index={index} count={items.length} goTo={goTo} />
      </div>
      {below(goTo)}
    </>
  );
}
