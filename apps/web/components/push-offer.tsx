"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { api } from "./runtime";

type State = "unsupported" | "loading" | "off" | "on" | "blocked";

const key = (b64: string) => {
  const raw = atob(
    b64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(b64.length / 4) * 4, "="),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** This device's push subscription, made against the server's key and sent to it. */
export async function turnOnPush() {
  const { key: publicKey } = await api<{ key: string }>("/push");
  if ((await Notification.requestPermission()) !== "granted") return "blocked" as const;
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key(publicKey),
    }));
  await api("/push", sub.toJSON());
  return "on" as const;
}

/**
 * The ask to turn on notifications, at the moment it makes sense: right after you answered, or at
 * the top of Notifications. Says what you'd get, and disappears once it is on or refused.
 */
export function PushOffer({ reason, compact = false }: { reason: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("blocked");
    api<{ on: boolean }>("/push")
      .then(async (r) => {
        if (!live) return;
        const here = await navigator.serviceWorker
          .getRegistration("/")
          .then((g) => g?.pushManager.getSubscription());
        if (live) setState(r.on && here && Notification.permission === "granted" ? "on" : "off");
      })
      .catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, []);
  if (state !== "off") return null;
  return (
    <div
      className={`push-offer ${compact ? "compact" : ""}`}
      role="region"
      aria-label="Notifications on this device"
    >
      <BellRing size={16} aria-hidden="true" />
      <span>{error || reason}</span>
      <button
        className="primary small"
        onClick={async () => {
          setError("");
          try {
            setState(await turnOnPush());
          } catch (e) {
            setError((e as Error).message || "Notifications could not be turned on here.");
          }
        }}
      >
        Turn on
      </button>
    </div>
  );
}
