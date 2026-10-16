"use client";
import { useEffect, useState } from "react";
import { Camera, Check, Mail, UserPlus, UserRound } from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import type { PersonView } from "../../../packages/contracts/src/community";
import { api } from "./runtime";
import { Avatar, Dialog } from "./ui";

/** A phone photo shrunk to a small square JPEG, so any camera picture fits the upload limit. */
export async function uploadFace(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo.");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(512, side);
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1]!;
  return (await api<{ id: string }>("/assets", { name: "face.jpg", mime: "image/jpeg", base64 }))
    .id;
}

/** Right after signing up: a face and a few people, so the first feed already feels like yours. */
export function Welcome({
  me,
  onDone,
}: {
  me: User;
  onDone: (followed: number) => Promise<void> | void;
}) {
  const [avatar, setAvatar] = useState(me.avatarAssetId ?? null),
    [people, setPeople] = useState<PersonView[]>([]),
    [followed, setFollowed] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<PersonView[]>("/people/suggested")
      .then((list) => setPeople(list.slice(0, 5)))
      .catch(() => setPeople([]));
  }, []);
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
  async function toggle(id: string) {
    try {
      await api(`/users/${id}/follow`, {});
      setFollowed((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog
      title={`Welcome, ${me.name.split(" ")[0]}`}
      onClose={() => void onDone(followed.length)}
    >
      <div className="welcome">
        <section>
          <h3>Add a photo of you</h3>
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
        {people.length > 0 && (
          <section>
            <h3>Follow a few people</h3>
            <p className="fineprint">Their posts fill your feed. You can change this any time.</p>
            <ul className="welcome-people">
              {people.map((p) => {
                const on = followed.includes(p.id);
                return (
                  <li key={p.id}>
                    <Avatar user={p as unknown as User} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        @{p.handle} · {p.followers} follower{p.followers === 1 ? "" : "s"}
                      </small>
                    </span>
                    <button
                      className={on ? "quiet-button" : "primary small"}
                      aria-label={`${on ? "Unfollow" : "Follow"} ${p.name}`}
                      onClick={() => void toggle(p.id)}
                    >
                      {on ? <Check size={15} /> : <UserPlus size={15} />}
                      {on ? "Following" : "Follow"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" onClick={() => void onDone(followed.length)}>
          {avatar || followed.length ? "Take me to my feed" : "Skip for now"}
        </button>
      </div>
    </Dialog>
  );
}

/** Photo, name and bio, editable from settings without opening the profile designer. */
export function ProfileBasics({
  me,
  notify,
  onChanged,
}: {
  me: User;
  notify: (m: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState(me.name),
    [bio, setBio] = useState(me.bio ?? ""),
    [avatar, setAvatar] = useState(me.avatarAssetId ?? null),
    [busy, setBusy] = useState(false);
  async function save(next: { name: string; bio: string; avatarAssetId: string | null }) {
    setBusy(true);
    try {
      await api("/me/identity", next);
      await onChanged();
      notify("Saved. Everyone sees the new version.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="identity-panel identity-form profile-basics"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ name, bio, avatarAssetId: avatar });
      }}
    >
      <h2>
        <UserRound size={18} /> Your profile
      </h2>
      <label className="welcome-face">
        <Avatar user={{ ...me, ...(avatar ? { avatarAssetId: avatar } : {}) }} />
        <span className="quiet-button">
          <Camera size={15} /> {avatar ? "Change photo" : "Add a photo"}
        </span>
        <input
          type="file"
          accept="image/*"
          aria-label="Profile photo"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const id = await uploadFace(file);
              setAvatar(id);
              await save({ name, bio, avatarAssetId: id });
            } catch (err) {
              notify((err as Error).message);
            }
          }}
        />
      </label>
      <label>
        Name
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Bio
        <textarea
          maxLength={300}
          rows={3}
          value={bio}
          placeholder="A line or two about you"
          onChange={(e) => setBio(e.target.value)}
        />
      </label>
      <button className="primary" disabled={busy}>
        Save profile
      </button>
    </form>
  );
}

/** The one switch for emails about likes, comments, follows and messages. */
export function EmailPrefsPanel({ notify }: { notify: (m: string) => void }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ activity: boolean }>("/me/email-prefs")
      .then((p) => setOn(p.activity))
      .catch(() => setOn(null));
  }, []);
  if (on === null) return null;
  return (
    <div className="identity-panel">
      <h2>
        <Mail size={18} /> Emails
      </h2>
      <label className="privacy-switch">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked;
            try {
              await api("/me/email-prefs", { activity: next });
              setOn(next);
              notify(next ? "We will email you about new activity." : "Activity emails are off.");
            } catch (err) {
              notify((err as Error).message);
            }
          }}
        />
        <span>
          <strong>Activity emails</strong>
          <small>
            Likes, comments, new followers and messages you missed. At most one every few hours.
          </small>
        </span>
      </label>
    </div>
  );
}
