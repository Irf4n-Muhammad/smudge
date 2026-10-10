"use client";
import { useState } from "react";
import { partSlots, type ProfileDraft } from "../../../packages/contracts/src/profile";
import { api, Runtime } from "./runtime";
import { Dialog } from "./ui";

export function ModPreview({
  draft,
  previous,
  changed,
  onClose,
  onApply,
}: {
  draft: ProfileDraft;
  previous?: ProfileDraft | null;
  changed: string;
  onClose: () => void;
  onApply: (draft: ProfileDraft) => Promise<void>;
}) {
  const [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const grants = draft.package.manifest.capabilities;
  const labels: Record<string, string> = {
    "profile.read": "Read your public profile and posts",
    "profile.cover": "Show public post photos",
    "profile.openPost": "Open your published posts",
    "profile.social.read": "Read visitor social counts",
    "profile.social.toggle": "Follow, like and save as the visitor",
    "relay.read": "Read shared drawings",
    "relay.add": "Add visitor drawings",
    "profile.poll.read": "Read voting results",
    "profile.poll.vote": "Save a visitor's vote",
  };
  return (
    <Dialog
      title="Preview with your content"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="mod-preview-summary">
        <p>
          <strong>{changed}</strong> · Your identity and published posts. Your live profile stays
          unchanged.
        </p>
        <p>
          This is a separate private draft. Practice interactions stay in this preview. Closing
          leaves your current draft unchanged.
        </p>
        <ul>
          {partSlots.map((slot) => (
            <li key={slot}>
              {slot}:{" "}
              {draft.package.manifest.schemaVersion === 2
                ? (draft.package.manifest.parts[slot]?.name ?? "Not included")
                : "Custom layout"}
            </li>
          ))}
        </ul>
        <details>
          <summary>Permissions in this combination ({grants.length})</summary>
          <ul>
            {grants.map((g) => (
              <li key={g}>
                {labels[g] ?? g}
                {previous && !previous.package.manifest.capabilities.includes(g as never)
                  ? " · Added"
                  : ""}
              </li>
            ))}
          </ul>
          <p>
            All parts share these permissions and one runtime. A preview is not a safety
            certification.
          </p>
        </details>
        <div className="mod-preview-actions">
          <button aria-pressed={mobile} onClick={() => setMobile(!mobile)}>
            Phone preview
          </button>
          <button
            disabled={busy}
            className="profile-primary"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const accepted = await api<ProfileDraft>(`/mod-previews/${draft.id}/apply`, {});
                await onApply(accepted);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Use this preview
          </button>
          <button disabled={busy} onClick={onClose}>
            Back without applying
          </button>
        </div>
        {error && (
          <p role="alert">
            {error.includes("REVISION_CONFLICT")
              ? "Your draft changed. Close this preview and try again with its latest revision."
              : error}
          </p>
        )}
      </div>
      <div className={`mod-live-preview ${mobile ? "phone" : ""}`}>
        <Runtime
          target={draft.id}
          kind="profile"
          preview
          version={draft.revision}
          height={1000}
          reducedMotion
          onOpenPost={() =>
            setError("Post navigation is available after opening this draft in the editor.")
          }
        />
      </div>
    </Dialog>
  );
}
