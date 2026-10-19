"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gift, Lock, PenLine } from "lucide-react";
import type { User } from "../../../packages/contracts/src/experience";
import type { OverlayPiece, Sticker, ThemeFont } from "../../../packages/contracts/src/identity";
import { api } from "./runtime";
import { StickerGlyph } from "./post-decor";
import { Dialog } from "./ui";
import { ThemeSample, ThemeStudio } from "./theme-studio";
import { ThemeEditor, ThemeStage, withEdit } from "./theme-editor";
import type { ThemeEdit } from "./theme-editor";

type Item = {
  id: string;
  name: string;
  tier: "market" | "members" | "event";
  accent: string;
  font: ThemeFont;
  event: string | null;
  seasonal: boolean;
  sponsor?: string;
  creator: string;
  emotes: Sticker[];
  pieces: OverlayPiece[];
  edit: ThemeEdit | null;
  unlocked: boolean;
  reason: string | null;
};
type GiftView = {
  id: string;
  decoration: { id: string; name: string; accent: string };
  from: { id: string; name: string; handle: string };
  note: string;
  at: string;
};
type State = {
  current: { id: string | null; source: string };
  season: { id: string; name: string; key: string } | null;
  country: string | null;
  gifts: GiftView[];
  items: Item[];
};
type Earnings = {
  currency: string;
  monthly: number;
  creatorShare: number;
  creatorPot: number;
  decorations: { id: string; name: string; adopters: number; weight: number; estimate: number }[];
  estimate: number;
};
const filters = [
  { tier: "all", title: "All" },
  { tier: "event", title: "Events" },
  { tier: "members", title: "Members" },
  { tier: "market", title: "Market" },
] as const;
type Filter = (typeof filters)[number]["tier"];

/**
 * Themes are picked like wallpapers: browse, see yourself in one, wear it, then make it your own
 * (ADR 0025). Designing a theme from code is a separate page for designers (ADR 0024). Locks come
 * from proof or the calendar, never money. Internally they are still called decorations.
 */
export function DecorationsPanel({
  me,
  users,
  notify,
  onChanged,
}: {
  me: User | undefined;
  /** Everyone a gift can go to. */
  users: User[];
  notify: (s: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<State | null>(null),
    [earnings, setEarnings] = useState<Earnings | null>(null),
    [filter, setFilter] = useState<Filter>("all"),
    [open, setOpen] = useState<string | null>(null),
    [editing, setEditing] = useState(false),
    [designer, setDesigner] = useState(false),
    [giving, setGiving] = useState(false),
    [gift, setGift] = useState({ toId: "", note: "" });
  const load = useCallback(async () => {
    try {
      setState(await api<State>("/decorations"));
      setEarnings(await api<Earnings>("/creator/earnings"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!state) return <div className="empty-state">Loading themes…</div>;
  const after = async (next: Promise<State>, message?: string) => {
    try {
      setState(await next);
      await onChanged();
      if (message) notify(message);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    }
  };
  const choose = (decorationId: string | null, scope: "base" | "season") =>
    after(api<State>("/decorations/choose", { decorationId, scope }));
  const fmt = (n: number) => `${earnings?.currency ?? ""} ${n.toLocaleString("en-US")}`;

  if (designer)
    return (
      <section className="decorations" aria-label="Design a theme">
        <button className="text-button theme-back" onClick={() => setDesigner(false)}>
          <ArrowLeft size={14} /> Back to themes
        </button>
        <header className="identity-head">
          <span className="eyebrow">FOR DESIGNERS</span>
          <h1>Design a theme</h1>
        </header>
        <ThemeStudio notify={notify} />
        {earnings && earnings.decorations.length > 0 && (
          <section className="creator-earnings" aria-label="Creator earnings">
            <span className="eyebrow">YOUR THEMES · SIMULATED</span>
            <h2>{fmt(earnings.estimate)} this month</h2>
            <p className="fineprint">
              {Math.round(earnings.creatorShare * 100)}% of a fixed {fmt(earnings.monthly)} ad pool
              is shared by how many people wear each theme. New wearers count more than people who
              chose it long ago (30-day half-life), and automatic season defaults count half. No
              money moves in this demo.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Theme</th>
                  <th>Wearing it</th>
                  <th>Weight</th>
                  <th>Estimate</th>
                </tr>
              </thead>
              <tbody>
                {earnings.decorations.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.adopters}</td>
                    <td>{d.weight}</td>
                    <td>{fmt(d.estimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>
    );

  const item = state.items.find((d) => d.id === open);
  const wearing = state.items.find((d) => d.id === state.current.id);
  const shown = state.items.filter((d) => filter === "all" || d.tier === filter);
  const close = () => {
    setOpen(null);
    setEditing(false);
    setGiving(false);
  };
  async function give(decorationId: string) {
    const to = users.find((u) => u.id === gift.toId);
    if (!to) return notify("Choose who it is for.");
    try {
      await api("/decorations/gift", { toId: gift.toId, decorationId, note: gift.note });
      notify(`Sent to ${to.name}. They will find it in Themes.`);
      setGiving(false);
      setGift({ toId: "", note: "" });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <section className="decorations" aria-label="Themes">
      <header className="identity-head">
        <span className="eyebrow">YOUR LOOK, EVERYWHERE</span>
        <h1>Themes</h1>
        <p>Pick a look for your profile and every post of yours. Then make it your own.</p>
      </header>
      {state.season && (
        <div className="season-banner">
          It’s <strong>{state.season.name}</strong>. Everyone wears a {state.season.name} theme by
          default.
          <button className="text-button" onClick={() => void choose(null, "season")}>
            Not this season
          </button>
        </div>
      )}
      {wearing && (
        <div className="theme-wearing">
          <span>
            Wearing <strong>{wearing.name}</strong>
            {state.current.source === "season-default" ? " (season default)" : ""}
          </span>
          <button
            className="quiet-button"
            onClick={() => {
              setOpen(wearing.id);
              setEditing(true);
            }}
          >
            <PenLine size={14} /> Edit my theme
          </button>
        </div>
      )}
      {state.gifts.length > 0 && (
        <section className="theme-gifts" aria-label="Gifts for you">
          <h2>
            <Gift size={16} /> Gifts for you
          </h2>
          {state.gifts.map((g) => (
            <article
              key={g.id}
              className="theme-gift"
              style={{ "--gift-accent": g.decoration.accent } as React.CSSProperties}
            >
              <span className="theme-gift-dot" aria-hidden="true" />
              <div>
                <strong>
                  {g.from.name} gave you {g.decoration.name}
                </strong>
                {g.note && <q>{g.note}</q>}
              </div>
              {state.current.id === g.decoration.id ? (
                <span className="decoration-on">Wearing it</span>
              ) : (
                <button
                  className="primary small"
                  onClick={() =>
                    void choose(g.decoration.id, state.season ? "season" : "base").then(
                      (ok) => ok && notify(`You are wearing ${g.decoration.name}.`),
                    )
                  }
                >
                  Wear it
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      <div className="theme-filters" role="group" aria-label="Show themes">
        {filters.map((f) => (
          <button
            key={f.tier}
            className={`chip ${filter === f.tier ? "active" : ""}`}
            aria-pressed={filter === f.tier}
            onClick={() => setFilter(f.tier)}
          >
            {f.title}
          </button>
        ))}
      </div>
      <div className="decoration-grid">
        {shown.map((d) => (
          <article
            key={d.id}
            aria-label={`Theme ${d.name}`}
            className={`decoration-card ${state.current.id === d.id ? "active" : ""}`}
          >
            <button
              className="theme-card-open"
              aria-label={`Preview ${d.name}`}
              onClick={() => setOpen(d.id)}
            >
              <ThemeSample name={d.name} accent={d.accent} font={d.font} pieces={d.pieces} />
            </button>
            <div className="decoration-info">
              <strong>{d.name}</strong>
              <small>
                {d.event ? `${d.event} · ` : d.tier === "members" ? "Members · " : ""}by @
                {d.creator}
              </small>
              {state.current.id === d.id ? (
                <span className="decoration-on">Wearing it</span>
              ) : (
                !d.unlocked && (
                  <span className="decoration-lock">
                    <Lock size={12} /> Locked
                  </span>
                )
              )}
            </div>
          </article>
        ))}
      </div>
      <button className="text-button" onClick={() => void choose(null, "base")}>
        Take off my everyday theme
      </button>
      <p className="theme-designer-link">
        Are you a designer?{" "}
        <button className="text-button" onClick={() => setDesigner(true)}>
          Send your own theme
        </button>
      </p>
      {item && (
        <Dialog title={editing ? `Edit ${item.name}` : item.name} onClose={close} wide={editing}>
          {editing ? (
            <ThemeEditor
              look={item}
              me={me}
              edit={item.edit}
              onSave={async (edit) => {
                if (
                  await after(
                    api<State>("/decorations/edit", { decorationId: item.id, ...edit }),
                    "Saved. Your profile and posts wear your version.",
                  )
                )
                  close();
              }}
              onReset={async () => {
                if (
                  await after(
                    api<State>(`/decorations/edit/${item.id}`, undefined, "DELETE"),
                    "Back to the designer's original.",
                  )
                )
                  close();
              }}
            />
          ) : (
            <div className="theme-preview">
              <ThemeStage look={item} me={me} pieces={withEdit(item.pieces, item.edit)} />
              <div className="theme-preview-info">
                <p className="fineprint">
                  {item.event ? `${item.event} · ` : ""}
                  {item.sponsor ? `with ${item.sponsor} · ` : ""}by @{item.creator}
                </p>
                <span className="decoration-emotes" aria-label="Reactions it brings">
                  {item.emotes.map((e) => (
                    <StickerGlyph key={e.id} sticker={e} />
                  ))}
                </span>
                {state.current.id === item.id ? (
                  <>
                    <span className="decoration-on">You are wearing it</span>
                    <button className="primary" onClick={() => setEditing(true)}>
                      <PenLine size={15} /> Edit
                    </button>
                  </>
                ) : item.unlocked ? (
                  <>
                    <button
                      className="primary"
                      onClick={() =>
                        void choose(
                          item.id,
                          item.seasonal || state.season ? "season" : "base",
                        ).then((ok) => ok && notify(`You are wearing ${item.name}.`))
                      }
                    >
                      Wear{state.season ? " this season" : ""}
                    </button>
                    {!item.seasonal && state.season && (
                      <button className="text-button" onClick={() => void choose(item.id, "base")}>
                        Keep after the season
                      </button>
                    )}
                  </>
                ) : (
                  <span className="decoration-lock">
                    <Lock size={12} /> {item.reason}
                  </span>
                )}
                {item.tier === "market" &&
                  (giving ? (
                    <form
                      className="theme-gift-form"
                      aria-label="Give this theme"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void give(item.id);
                      }}
                    >
                      <label>
                        For
                        <select
                          required
                          value={gift.toId}
                          onChange={(e) => setGift({ ...gift, toId: e.target.value })}
                        >
                          <option value="">Choose someone</option>
                          {users
                            .filter((u) => u.id !== me?.id)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        A note
                        <input
                          maxLength={140}
                          placeholder="Congrats on the sub-5!"
                          value={gift.note}
                          onChange={(e) => setGift({ ...gift, note: e.target.value })}
                        />
                      </label>
                      <div className="theme-gift-form-actions">
                        <button className="primary">Send the gift</button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setGiving(false)}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="fineprint">
                        It appears in their Themes with your note. Nothing is charged in this
                        prototype.
                      </p>
                    </form>
                  ) : (
                    <button
                      className="quiet-button theme-gift-button"
                      onClick={() => setGiving(true)}
                    >
                      <Gift size={14} /> Give as a gift
                    </button>
                  ))}
              </div>
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}
