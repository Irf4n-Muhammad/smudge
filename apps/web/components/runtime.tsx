"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Experience } from "../../../packages/contracts/src/experience";
import { RotateCcw, ArrowDown, AlertCircle } from "lucide-react";
import { bridgeRequestSchema } from "../../../packages/contracts/src/experience";
import { profileRequestSchema, profileSizeSchema } from "../../../packages/contracts/src/profile";

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(`${value.error}${value.traceId ? ` (${value.traceId.slice(0, 8)})` : ""}`);
  return value;
}
export function Runtime({
  target,
  preview = false,
  version = 1,
  height = 510,
  mobileHeight,
  autoHeight = false,
  stage,
  onSkip,
  kind = "post",
  reducedMotion = false,
  onOpenPost,
  onSocialChange,
  editing = false,
  onEdit,
  onReady,
}: {
  target: string;
  preview?: boolean;
  version?: number;
  height?: number;
  mobileHeight?: number | undefined;
  autoHeight?: boolean | undefined;
  stage?: Extract<Experience["manifest"], { schemaVersion: 2 }>["stage"];
  onSkip?: () => void;
  kind?: "post" | "profile";
  reducedMotion?: boolean;
  onOpenPost?: (id: string) => void;
  onSocialChange?: () => Promise<void>;
  /** Draft previews only: the frame outlines editable parts and reports which one was tapped. */
  editing?: boolean;
  onEdit?: (field: string) => void;
  /** Called once the frame has drawn (and, with autoHeight, measured itself) or failed. */
  onReady?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  const openPost = useRef(onOpenPost);
  const socialChange = useRef(onSocialChange);
  socialChange.current = onSocialChange;
  openPost.current = onOpenPost;
  const edit = useRef(onEdit);
  edit.current = onEdit;
  const editingNow = useRef(editing);
  editingNow.current = editing;
  const motion = useRef(reducedMotion);
  motion.current = reducedMotion;
  const readyNow = useRef(onReady);
  readyNow.current = onReady;
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [visible, setVisible] = useState(false),
    [ticket, setTicket] = useState<{ ticket: string; nonce: string; url: string } | null>(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    // A profile is the current page, not a feed tile. Keep its canvas and unsaved work mounted
    // across editor scroll/viewport changes; only feed posts need viewport-based disposal.
    if (kind === "profile") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      rootMargin: "160px",
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [kind]);
  useEffect(() => {
    let disposed = false;
    setTicket(null);
    setMeasuredHeight(null);
    setReady(false);
    setError("");
    if (!visible) return;
    api("/runtime", { target, preview, kind })
      .then((value) => {
        if (!disposed) setTicket(value);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [target, preview, version, visible, retry, kind]);
  useEffect(() => {
    if (!ticket) return;
    let active = true;
    let sizeTimer: ReturnType<typeof setTimeout> | undefined;
    let nextHeight = 600;
    let requests = 0;
    let resetAt = Date.now();
    const sendAppearance = () =>
      frame.current?.contentWindow?.postMessage(
        {
          type: "forma:appearance",
          nonce: ticket.nonce,
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
          season: document.documentElement.dataset.season === "halloween" ? "halloween" : "paint",
          reducedMotion: motion.current,
        },
        "*",
      );
    const appearanceObserver = new MutationObserver(sendAppearance);
    appearanceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-season"],
    });
    const timeout = setTimeout(() => {
      if (active) setError("This experience is taking too long to open.");
    }, 12000);
    const receive = async (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        !event.data ||
        event.data.nonce !== ticket.nonce
      )
        return;
      if (event.data.type === "forma:ready") {
        clearTimeout(timeout);
        sendAppearance();
        if (kind === "profile" && autoHeight)
          frame.current?.contentWindow?.postMessage(
            { type: "forma:layout", nonce: ticket.nonce, autoHeight: true },
            "*",
          );
        if (preview)
          frame.current?.contentWindow?.postMessage(
            { type: "forma:editing", nonce: ticket.nonce, on: editingNow.current },
            "*",
          );
        setReady(true);
        return;
      }
      if (event.data.type === "forma:edit") {
        // Only a draft preview may steer the editor, and only with a short field name.
        if (
          preview &&
          editingNow.current &&
          typeof event.data.field === "string" &&
          /^[a-z][a-z0-9-]{0,30}$/.test(event.data.field)
        )
          edit.current?.(event.data.field);
        return;
      }
      if (event.data.type === "forma:size") {
        const size = profileSizeSchema.safeParse(event.data);
        if (kind === "profile" && autoHeight && size.success) {
          nextHeight = size.data.height;
          // Coalesce untrusted size messages, rather than rendering at the sender's rate.
          if (!sizeTimer)
            sizeTimer = setTimeout(() => {
              if (active) setMeasuredHeight(nextHeight);
              sizeTimer = undefined;
            }, 100);
        }
        return;
      }
      if (event.data.type === "forma:error") {
        setError("Something went wrong inside this experience.");
        return;
      }
      const parsed = (kind === "profile" ? profileRequestSchema : bridgeRequestSchema).safeParse(
        event.data.request,
      );
      if (!parsed.success) return;
      if (Date.now() - resetAt > 1000) {
        requests = 0;
        resetAt = Date.now();
      }
      if (++requests > 20) return;
      const source = event.source as Window;
      try {
        const result = await api("/capability", { ticket: ticket.ticket, request: parsed.data });
        if (
          active &&
          kind === "profile" &&
          ["profile.social.toggle", "profile.openPost"].includes(parsed.data.method)
        )
          await socialChange.current?.();
        if (
          active &&
          kind === "profile" &&
          parsed.data.method === "profile.openPost" &&
          typeof result.value?.postId === "string"
        )
          openPost.current?.(result.value.postId);
        if (active)
          source.postMessage(
            { type: "forma:result", nonce: ticket.nonce, id: parsed.data.id, value: result.value },
            "*",
          );
      } catch (e) {
        if (active)
          source.postMessage(
            {
              type: "forma:result",
              nonce: ticket.nonce,
              id: parsed.data.id,
              error: (e as Error).message.split(" (")[0],
            },
            "*",
          );
      }
    };
    window.addEventListener("message", receive);
    return () => {
      active = false;
      clearTimeout(timeout);
      clearTimeout(sizeTimer);
      appearanceObserver.disconnect();
      window.removeEventListener("message", receive);
    };
  }, [ticket, kind, autoHeight, preview]);
  useEffect(() => {
    if (error || (ready && (!autoHeight || kind !== "profile" || measuredHeight !== null)))
      readyNow.current?.();
  }, [ready, error, measuredHeight, autoHeight, kind]);
  useEffect(() => {
    if (ticket && preview)
      frame.current?.contentWindow?.postMessage(
        { type: "forma:editing", nonce: ticket.nonce, on: editing },
        "*",
      );
  }, [ticket, kind, preview, editing]);
  useEffect(() => {
    if (ticket)
      frame.current?.contentWindow?.postMessage(
        {
          type: "forma:appearance",
          nonce: ticket.nonce,
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
          season: document.documentElement.dataset.season === "halloween" ? "halloween" : "paint",
          reducedMotion,
        },
        "*",
      );
  }, [ticket, reducedMotion]);
  return (
    <div
      ref={container}
      className={`runtime ${stage ? "runtime-stage" : ""} ${mobileHeight ? "runtime-responsive" : ""}`}
      style={
        {
          minHeight: measuredHeight ?? `var(--runtime-height, ${height}px)`,
          ...(mobileHeight ? { "--runtime-mobile-height": `${mobileHeight}px` } : {}),
          ...(stage
            ? { "--runtime-bg": stage.background, "--runtime-night": stage.nightBackground }
            : {}),
        } as CSSProperties
      }
      data-ready={ready}
    >
      {!error && ticket && visible && (
        <iframe
          ref={frame}
          title={preview ? "Draft experience preview" : "Interactive post"}
          src={ticket.url}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          allow="camera 'none'; microphone 'none'; geolocation 'none'; autoplay 'none'"
          style={{
            height: measuredHeight ?? `var(--runtime-height, ${height}px)`,
            colorScheme: "normal",
            background: "transparent",
          }}
        />
      )}
      {!error && (!ticket || !ready) && (
        <div className="runtime-loading">
          <span className="tiny-flower">✳</span>
          <span>{visible ? "Opening a little world…" : "A story is waiting here"}</span>
        </div>
      )}
      {error && (
        <div className="runtime-error">
          <AlertCircle size={26} />
          <strong>This story needs a moment.</strong>
          <p>{error}</p>
          <div>
            <button className="quiet-button" onClick={() => setRetry((v) => v + 1)}>
              <RotateCcw size={15} />
              Try again
            </button>
            {onSkip && (
              <button className="quiet-button" onClick={onSkip}>
                <ArrowDown size={15} />
                Next post
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
