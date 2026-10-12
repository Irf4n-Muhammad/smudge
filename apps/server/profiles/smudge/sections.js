// smudge:v3
// Paint wall page sections. Reads the easy-editor settings (smudge/settings.js), applies colours and
// section order, draws the sections the owner added, and turns taps into edits while editing.
(() => {
  const defaults = {
    palette: "paint",
    sections: ["latest", "selected", "posts"],
    quote: { text: "" },
    now: { text: "", place: "", progress: 40 },
    repeat: { song: "", artist: "" },
    countdown: { label: "", date: "" },
    wall: { title: "The Wall" },
  };
  const s = Object.assign({}, defaults, window.smudgeSettings || {});
  const palettes = {
    paint: ["#ff4f9a", "#d8ff3d", "#2b3cff", "#19c37d"],
    electric: ["#2b3cff", "#d8ff3d", "#ff4f9a", "#00c2ff"],
    sunset: ["#ff6a3d", "#ffc93d", "#ff3d8b", "#8a5cff"],
    ocean: ["#00a6c7", "#b8f3ff", "#1f4bff", "#19c37d"],
    mono: ["#101010", "#bdbdbd", "#5b5b5b", "#e8e8e8"],
  };
  const order = Array.isArray(s.sections) ? s.sections : defaults.sections;
  const paints = palettes[s.palette] || palettes.paint;
  let css = order.map((k, i) => `[data-sm-section="${k}"]{order:${i + 1}}`).join("");
  for (const k of ["latest", "selected", "posts"])
    if (!order.includes(k)) css += `[data-sm-section="${k}"]{display:none!important}`;
  // Halloween keeps its own paints; the owner's palette is for the rest of the year.
  if (s.palette !== "paint")
    css += `html:not([data-season="halloween"]) .sm{${paints
      .map((c, i) => `--p${i + 1}:${c}`)
      .join(";")}}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  // Taps while editing are turned into edits by the Smudge SDK itself (see [data-edit]).

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const section = (kind, label) => {
    const node = el("section", "sx sx-" + kind);
    node.dataset.smSection = kind === "count" ? "countdown" : kind;
    node.dataset.edit = node.dataset.smSection;
    const head = el("div", "label");
    head.append(el("span", "", "— " + label));
    node.append(head);
    return node;
  };
  // *Stars* mark italic words, like the tagline.
  const marked = (text) => {
    const frag = document.createDocumentFragment();
    text.split("*").forEach((piece, i) => {
      if (!piece) return;
      frag.append(i % 2 ? el("em", "", piece) : document.createTextNode(piece));
    });
    return frag;
  };
  const builders = {
    quote() {
      if (!s.quote.text) return null;
      const node = section("quote", "IN ONE LINE");
      const q = el("blockquote");
      q.append(marked("“" + s.quote.text + "”"));
      node.append(q);
      return node;
    },
    now() {
      if (!s.now.text) return null;
      const node = section("now", "NOW DOING");
      const card = el("div", "sx-card");
      if (s.now.place) card.append(el("span", "sx-pill", s.now.place));
      card.append(el("strong", "", s.now.text));
      const bar = el("div", "sx-bar");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", s.now.progress + "% done");
      const fill = el("i");
      fill.style.width = Math.max(0, Math.min(100, s.now.progress)) + "%";
      bar.append(fill);
      card.append(bar);
      node.append(card);
      return node;
    },
    repeat() {
      if (!s.repeat.song) return null;
      const node = section("repeat", "ON REPEAT");
      const card = el("div", "sx-card");
      const disc = el("span", "sx-disc");
      disc.setAttribute("aria-hidden", "true");
      const text = el("div");
      text.append(el("strong", "", s.repeat.song), el("small", "", s.repeat.artist || ""));
      card.append(disc, text);
      node.append(card);
      return node;
    },
    countdown() {
      if (!s.countdown.date) return null;
      const node = section("count", "COUNTDOWN");
      const card = el("div", "sx-card");
      const clock = el("div", "sx-clock");
      card.append(el("strong", "", s.countdown.label || "Something's coming"), clock);
      node.append(card);
      const end = new Date(s.countdown.date + "T00:00:00").getTime();
      const pad = (n) => String(n).padStart(2, "0");
      const tick = () => {
        const left = Math.max(0, end - Date.now());
        if (!left) {
          clock.textContent = "It's today";
          return;
        }
        const d = Math.floor(left / 864e5),
          h = Math.floor(left / 36e5) % 24,
          m = Math.floor(left / 6e4) % 60;
        clock.textContent = `${pad(d)} : ${pad(h)} : ${pad(m)}`;
        clock.setAttribute("aria-label", `${d} days, ${h} hours and ${m} minutes to go`);
      };
      tick();
      setInterval(tick, 30000);
      return node;
    },
    wall() {
      const node = section("wall", "GUESTBOOK");
      const title = el("h2");
      const words = (s.wall.title || "The Wall").split(" ");
      title.append(document.createTextNode(words.slice(0, -1).join(" ") + " "));
      title.append(el("em", "", words[words.length - 1]));
      node.append(title, el("p", "", "Leave a note. Be nice, it's someone's wall."));
      const list = el("ul", "sx-notes");
      list.setAttribute("aria-label", "Notes on the wall");
      const form = el("form", "sx-form");
      const box = el("textarea");
      box.maxLength = 140;
      box.placeholder = "Write something nice…";
      box.setAttribute("aria-label", "Your note");
      const row = el("div", "sx-form-row");
      let tone = 0;
      const tones = [0, 1, 2, 3].map((t) => {
        const b = el("button", "sx-tone tone-" + t);
        b.type = "button";
        b.setAttribute("aria-label", "Note colour " + (t + 1));
        b.setAttribute("aria-pressed", String(t === tone));
        b.onclick = () => {
          tone = t;
          tones.forEach((o, i) => o.setAttribute("aria-pressed", String(i === t)));
        };
        return b;
      });
      const stick = el("button", "sx-stick", "Stick it");
      stick.type = "submit";
      row.append(...tones, stick);
      const status = el("p", "sx-status");
      status.setAttribute("role", "status");
      form.append(box, row, status);
      node.append(list, form);
      const render = (data) => {
        list.textContent = "";
        if (!data.notes.length) {
          const empty = el("li", "sx-note tone-1");
          empty.append(el("p", "", "No notes yet. Be the first."));
          list.append(empty);
        }
        data.notes.forEach((n, i) => {
          const item = el("li", "sx-note tone-" + n.tone);
          item.style.setProperty("--tilt", (i % 2 ? 1.6 : -1.4) + "deg");
          item.append(el("p", "", n.text), el("small", "", "— " + n.name));
          if (n.removable) {
            const x = el("button", "", "×");
            x.setAttribute("aria-label", "Remove note from " + n.name);
            x.onclick = () =>
              forma.profile.wall
                .remove(n.id)
                .then(render)
                .catch(() => (status.textContent = "Could not remove it. Try again."));
            item.append(x);
          }
          if (n.reportable && forma.profile.wall.report) {
            const flag = el("button", "sx-flag", "Report");
            flag.setAttribute("aria-label", "Report note from " + n.name);
            flag.setAttribute("aria-expanded", "false");
            flag.onclick = () => {
              const open = !item.querySelector(".sx-why");
              flag.setAttribute("aria-expanded", String(open));
              if (!open) return item.querySelector(".sx-why").remove();
              const why = el("div", "sx-why");
              why.setAttribute("role", "group");
              why.setAttribute("aria-label", "What's wrong with it?");
              for (const [reason, label] of [
                ["spam", "Spam"],
                ["harassment", "Mean or hurtful"],
                ["other", "Something else"],
              ]) {
                const b = el("button", "", label);
                b.onclick = () =>
                  forma.profile.wall
                    .report(n.id, reason)
                    .then((data) => {
                      render(data);
                      status.textContent =
                        "Thanks. That note is hidden for you and we'll take a look.";
                    })
                    .catch(() => (status.textContent = "Could not report it. Try again."));
                why.append(b);
              }
              item.append(why);
              why.querySelector("button").focus();
            };
            item.append(flag);
          }
          list.append(item);
        });
      };
      const errors = {
        WALL_NOTE_LIMIT: "You've left 5 notes here already.",
        WALL_FULL: "This wall is full.",
        CAPABILITY_DENIED: "The Wall is closed right now.",
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const text = box.value.trim();
        if (!text) return;
        stick.disabled = true;
        try {
          render(await forma.profile.wall.add({ submissionId: crypto.randomUUID(), text, tone }));
          box.value = "";
          status.textContent = "Stuck it on the wall.";
        } catch (err) {
          status.textContent = errors[err.message] || "Could not stick it. Try again.";
        } finally {
          stick.disabled = false;
        }
      };
      forma.profile.wall
        .read()
        .then(render)
        .catch(() => (status.textContent = "The notes could not load. Try refreshing."));
      return node;
    },
  };
  window.addEventListener("DOMContentLoaded", () => {
    const host = document.getElementById("sm-sections");
    if (!host) return;
    for (const kind of order) {
      const node = builders[kind] && builders[kind]();
      if (node) host.append(node);
    }
  });
})();
