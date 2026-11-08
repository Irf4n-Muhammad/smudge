"use client";
import { useEffect, useState } from "react";
import { Camera, Check, Disc3 } from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import { api } from "./runtime";
import { Avatar, Dialog } from "./ui";
import { uploadFace } from "./welcome";

interface Vibe {
  key: string;
  name: string;
  colours: { key: string; colors: string[] }[];
}
/** The two looks a new page can start from, with pictures of real pages built with them. */
const looks: Record<string, { name: string; image: string; note: string }> = {
  smudge: {
    name: "Paint wall",
    image: "/vibes/paint-wall.jpg",
    note: "A giant painted name and sections you pick.",
  },
  track: {
    name: "Track",
    image: "/vibes/track.jpg",
    note: "Cream ground, one lime, and you cut out in front of your name.",
  },
};
const colourNames: Record<string, string> = {
  paint: "Paint",
  electric: "Electric",
  sunset: "Sunset",
  ocean: "Ocean",
  mono: "Mono",
};
const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * Right after signing up (ADR 0041): five answers and a page exists. A photo, one line about
 * you, a look, a colour, and what is playing or going on right now. Each step can be skipped;
 * finishing still publishes a page, so the first thing you open is already yours.
 */
export function Setup({
  me,
  onDone,
}: {
  me: User;
  /** Called with the published page's id, or null when the setup was skipped. */
  onDone: (publicationId: string | null) => Promise<void> | void;
}) {
  const [step, setStep] = useState(0),
    [avatar, setAvatar] = useState(me.avatarAssetId ?? null),
    [bio, setBio] = useState(""),
    [vibes, setVibes] = useState<Vibe[]>([]),
    [vibe, setVibe] = useState("smudge"),
    [colour, setColour] = useState(""),
    [song, setSong] = useState(""),
    [artist, setArtist] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<Vibe[]>("/setup/vibes")
      .then((list) => setVibes(list.filter((v) => looks[v.key])))
      .catch(() => setVibes([]));
  }, []);
  const chosen = vibes.find((v) => v.key === vibe);
  const colours = chosen?.colours ?? [];
  const steps = ["Photo", "One line", "Look", ...(colours.length ? ["Colour"] : []), "Right now"];
  const last = step === steps.length - 1;
  const stepName = steps[step]!;
  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const id = await uploadFace(file);
      await api("/me/identity", { name: me.name, bio: me.bio ?? "", avatarAssetId: id });
      setAvatar(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      const { publicationId } = await api<{ publicationId: string }>("/me/setup", {
        bio: bio.trim(),
        vibe,
        ...(colour ? { colour } : {}),
        ...(song.trim() ? { song: { title: song.trim(), artist: artist.trim() } } : {}),
      });
      await onDone(publicationId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Welcome, ${me.name.split(" ")[0]}`} onClose={() => void onDone(null)}>
      <div className="setup">
        <ol className="setup-steps" aria-label="Steps">
          {steps.map((name, i) => (
            <li
              key={name}
              aria-current={i === step ? "step" : undefined}
              className={i < step ? "done" : undefined}
            >
              {name}
            </li>
          ))}
        </ol>
        {stepName === "Photo" && (
          <section>
            <h3>A photo of you</h3>
            <p className="fineprint">So friends know it’s really you.</p>
            <label className="welcome-face">
              <Avatar user={{ ...me, ...(avatar ? { avatarAssetId: avatar } : {}) }} />
              <span className="quiet-button">
                <Camera size={15} />{" "}
                {busy ? "Uploading…" : avatar ? "Change photo" : "Choose a photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                aria-label="Profile photo"
                disabled={busy}
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
            </label>
          </section>
        )}
        {stepName === "One line" && (
          <section>
            <h3>One line about you</h3>
            <p className="fineprint">It goes on your page. Change it whenever.</p>
            <input
              autoFocus
              maxLength={300}
              value={bio}
              placeholder="Drawing people on trains"
              aria-label="One line about you"
              onChange={(e) => setBio(e.target.value)}
            />
          </section>
        )}
        {stepName === "Look" && (
          <section>
            <h3>Pick a look</h3>
            <p className="fineprint">Your page starts here. Everything can change later.</p>
            <div className="setup-vibes" role="radiogroup" aria-label="Look">
              {vibes.map((v) => {
                const look = looks[v.key]!;
                const on = v.key === vibe;
                return (
                  <button
                    key={v.key}
                    role="radio"
                    aria-checked={on}
                    className={`setup-vibe ${on ? "on" : ""}`}
                    onClick={() => {
                      setVibe(v.key);
                      setColour("");
                    }}
                  >
                    <img src={look.image} alt="" />
                    <strong>{look.name}</strong>
                    <small>{look.note}</small>
                    {on && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {stepName === "Colour" && (
          <section>
            <h3>Pick a colour</h3>
            <p className="fineprint">The {looks[vibe]?.name ?? "page"} in your colours.</p>
            <div className="setup-colours" role="radiogroup" aria-label="Colour">
              {colours.map((c) => {
                const on = c.key === colour;
                return (
                  <button
                    key={c.key}
                    role="radio"
                    aria-checked={on}
                    className={`setup-colour ${on ? "on" : ""}`}
                    onClick={() => setColour(on ? "" : c.key)}
                  >
                    <span className="setup-swatch" aria-hidden="true">
                      {c.colors.slice(0, 3).map((hex) => (
                        <i key={hex} style={{ background: hex }} />
                      ))}
                    </span>
                    {colourNames[c.key] ?? title(c.key)}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {stepName === "Right now" && (
          <section className="setup-now">
            <h3>A song on repeat</h3>
            <p className="fineprint">
              Optional. It goes on your page as the first thing you are listening to. Later your
              page fills this by itself.
            </p>
            <div className="setup-song">
              <Disc3 size={18} aria-hidden="true" />
              <input
                autoFocus
                maxLength={50}
                value={song}
                placeholder="Song"
                aria-label="Song"
                onChange={(e) => setSong(e.target.value)}
              />
              <input
                maxLength={50}
                value={artist}
                placeholder="Artist"
                aria-label="Artist"
                onChange={(e) => setArtist(e.target.value)}
              />
            </div>
          </section>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="setup-actions">
          {step > 0 ? (
            <button className="quiet-button" disabled={busy} onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <button className="quiet-button" disabled={busy} onClick={() => void onDone(null)}>
              Skip for now
            </button>
          )}
          {last ? (
            <button
              className="primary"
              disabled={busy || !vibes.length}
              onClick={() => void finish()}
            >
              {busy ? "Making your page…" : "Make my page"}
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => setStep(step + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
