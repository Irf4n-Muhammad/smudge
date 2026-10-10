"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
export function Avatar({ user, small = false }: { user: User; small?: boolean }) {
  return (
    <span className={`avatar ${small ? "small" : ""}`} style={{ background: user.color }}>
      {user.avatarAssetId ? (
        <img
          src={`/api/users/${encodeURIComponent(user.id)}/avatar?v=${user.avatarAssetId}`}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
        />
      ) : (
        user.initials
      )}
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const elements = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
      const first = elements[0],
        last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">YOUR LITTLE CORNER</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
