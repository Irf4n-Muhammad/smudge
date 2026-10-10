"use client";
import { useEffect, useState } from "react";
import type { ProfileDraft } from "../../../packages/contracts/src/profile";
import type { ModSummary } from "../../../packages/contracts/src/mod";
import { api } from "./runtime";
import { Dialog } from "./ui";
import { ModPreview } from "./mod-preview";

type Credits = {
  publicationId: string | null;
  parts: {
    slot: string;
    present: boolean;
    name: string | null;
    origin: {
      modId: string;
      version: number;
      modified: boolean;
      name: string;
      creatorId: string;
      creatorName: string;
    } | null;
  }[];
};
type Creator = {
  id: string;
  name: string;
  bio: string;
  handle: string | null;
  profileCount: number;
  mods: (ModSummary & { profileCount: number })[];
};
export function ProfileDiscovery({
  ownerId,
  publicationId,
  requested,
  onClose,
  onUseDraft,
}: {
  ownerId: string;
  publicationId: string | null;
  requested: "credits" | "creator" | null;
  onClose: () => void;
  onUseDraft: (id: string) => void;
}) {
  const [panel, setPanel] = useState<"credits" | "creator" | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null),
    [creator, setCreator] = useState<Creator | null>(null);
  const [candidate, setCandidate] = useState<ProfileDraft | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const showCredits = () => {
    setPanel("credits");
    void run(async () => setCredits(await api(`/profiles/${encodeURIComponent(ownerId)}/mods`)));
  };
  const showCreator = (id: string) => {
    setPanel("creator");
    void run(async () => setCreator(await api(`/mod-creators/${encodeURIComponent(id)}`)));
  };
  useEffect(() => {
    if (requested === "credits") showCredits();
    if (requested === "creator") showCreator(ownerId);
  }, [requested]);
  useEffect(() => {
    const id = new URL(location.href).searchParams.get("mods");
    if (id) showCreator(id === "forma" ? "forma" : ownerId);
  }, [ownerId]);
  function close() {
    if (busy) return;
    setPanel(null);
    onClose();
    const url = new URL(location.href);
    url.searchParams.delete("mods");
    history.replaceState(null, "", url);
  }
  async function combination() {
    await run(async () => {
      if (!publicationId) return;
      setCandidate(
        await api(`/profiles/${encodeURIComponent(ownerId)}/combination`, { publicationId }),
      );
    });
  }
  return (
    <>
      {candidate ? (
        <ModPreview
          draft={candidate}
          changed="Use this combination as a new draft"
          onClose={() => setCandidate(null)}
          onApply={async (draft) => {
            onUseDraft(draft.id);
          }}
        />
      ) : (
        panel && (
          <Dialog title={panel === "credits" ? "Made with" : "Creator's mods"} wide onClose={close}>
            <div className="mod-discovery-body">
              {error && <p role="alert">{error}</p>}
              {busy && <p role="status">Loading…</p>}
              {panel === "credits" && credits && (
                <>
                  <p>
                    The parts behind this published profile. Versions stay pinned when a creator
                    releases an update.
                  </p>
                  <div className="mod-credit-list">
                    {credits.parts.map((p) => (
                      <article key={p.slot}>
                        <small>{p.slot}</small>
                        <h3>{p.name ?? (p.present ? "Custom part" : "No separate part")}</h3>
                        {p.origin ? (
                          <>
                            <p>
                              {p.origin.name} · v{p.origin.version}
                              {p.origin.modified ? " · Modified" : ""}
                            </p>
                            <button onClick={() => showCreator(p.origin!.creatorId)}>
                              By {p.origin.creatorName}
                            </button>
                          </>
                        ) : (
                          <p>
                            {p.present
                              ? "Custom or older design — source not recorded."
                              : "No mod attribution recorded."}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                  <p>
                    Copy the actual published design, including its declared design assets. Names,
                    avatars, posts, drawings and votes stay with their owners. Text or images
                    embedded in the design source remain part of the design.
                  </p>
                  <button
                    disabled={busy || !publicationId}
                    className="profile-primary"
                    onClick={() => void combination()}
                  >
                    Use this combination
                  </button>
                </>
              )}
              {panel === "creator" && creator && (
                <>
                  <button onClick={showCredits}>← Back to profile credits</button>
                  <header className="mod-creator-heading">
                    <h2>{creator.name}</h2>
                    <p>{creator.bio}</p>
                    {creator.handle && (
                      <a href={`/?profile=${encodeURIComponent(creator.id)}`}>
                        Visit @{creator.handle}
                      </a>
                    )}
                    <p>
                      <strong>{creator.profileCount}</strong> public profiles use this creator's
                      mods · {creator.mods.length} shared mods
                    </p>
                    <small>
                      Counts include current public profiles only, once per profile. Drafts and
                      historical versions do not count.
                    </small>
                  </header>
                  <div className="mod-grid">
                    {creator.mods.map((m) => (
                      <article className="mod-card" key={m.id}>
                        <h3>{m.name}</h3>
                        <p>
                          v{m.version} · {m.slots.join(" / ")}
                        </p>
                        <p>{m.description}</p>
                        <p>{m.profileCount} public profiles using this mod</p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () =>
                              setCandidate(
                                await api(`/mods/${m.id}/preview`, { version: m.version }),
                              ),
                            )
                          }
                        >
                          Preview {m.name}
                        </button>
                      </article>
                    ))}
                  </div>
                  {!creator.mods.length && (
                    <p>
                      No shared mods yet. Published designs and shared library mods are separate.
                    </p>
                  )}
                </>
              )}
            </div>
          </Dialog>
        )
      )}
    </>
  );
}
