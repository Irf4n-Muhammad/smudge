// smudge:v5
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
    quiz: { title: "" },
    cat: { name: "" },
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
  // "Now doing" and "On repeat" cards, from the settings or from the owner's live entries.
  const nowCard = (text, place, progress, when) => {
    const node = section("now", "NOW DOING");
    const card = el("div", "sx-card");
    if (place) card.append(el("span", "sx-pill", place));
    card.append(el("strong", "", text));
    if (when) card.append(el("small", "sx-when", when));
    if (typeof progress === "number") {
      const bar = el("div", "sx-bar");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", progress + "% done");
      const fill = el("i");
      fill.style.width = Math.max(0, Math.min(100, progress)) + "%";
      bar.append(fill);
      card.append(bar);
    }
    node.append(card);
    return node;
  };
  const repeatCard = (song, artist) => {
    const node = section("repeat", "ON REPEAT");
    const card = el("div", "sx-card");
    const disc = el("span", "sx-disc");
    disc.setAttribute("aria-hidden", "true");
    const text = el("div");
    text.append(el("strong", "", song), el("small", "", artist || ""));
    card.append(disc, text);
    node.append(card);
    return node;
  };
  const ago = (iso) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return mins <= 1 ? "just now" : mins + " min ago";
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + " h ago";
    const days = Math.round(hours / 24);
    return days === 1 ? "yesterday" : days + " days ago";
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
      return nowCard(s.now.text, s.now.place, s.now.progress, "");
    },
    repeat() {
      if (!s.repeat.song) return null;
      return repeatCard(s.repeat.song, s.repeat.artist);
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
    // "How well do you know me?" (ADR 0043): the owner's questions, a friend's answers, a board.
    quiz() {
      const node = section("quiz", "QUIZ");
      const title = el("h2");
      const words = (s.quiz.title || "How well do you *know* me?").split(" ");
      title.append(marked(words.join(" ")));
      node.append(title);
      const box = el("div", "sx-card sx-quiz-box");
      box.setAttribute("aria-live", "polite");
      node.append(box);
      const status = el("p", "sx-status");
      status.setAttribute("role", "status");
      node.append(status);
      const errors = {
        SIGN_IN_REQUIRED: "Sign in to take the quiz.",
        OWN_QUIZ: "It's your quiz. Send it to a friend.",
        CAPABILITY_DENIED: "The quiz is closed right now.",
      };
      const board = (data) => {
        const list = el("ol", "sx-board");
        list.setAttribute("aria-label", "Best scores");
        data.board.forEach((b, i) => {
          const li = el("li");
          li.append(
            el("b", "", String(i + 1)),
            el("span", "", b.name),
            el("strong", "", b.score + "/" + b.total),
          );
          list.append(li);
        });
        return list;
      };
      const result = (data) => {
        box.textContent = "";
        const m = data.mine;
        const head = el("div", "sx-score");
        head.append(el("strong", "", m.score + "/" + m.total));
        head.append(
          el(
            "span",
            "",
            m.score === m.total
              ? "Perfect. You really know them."
              : m.score >= m.total / 2
                ? "Not bad. Close friends."
                : "Hmm. Time to hang out more.",
          ),
        );
        box.append(head);
        const review = el("ol", "sx-review");
        data.questions.forEach((q, i) => {
          const li = el("li", m.picked[i] === m.correct[i] ? "right" : "wrong");
          li.append(el("p", "", q.text), el("small", "", "Answer: " + q.options[m.correct[i]]));
          review.append(li);
        });
        box.append(review);
        const again = el("button", "sx-stick", "Try again");
        again.type = "button";
        again.onclick = () => play(data);
        box.append(again);
        if (data.board.length) box.append(el("p", "sx-label", "Best scores"), board(data));
      };
      const play = (data) => {
        box.textContent = "";
        const picks = [];
        let i = 0;
        const ask = () => {
          box.textContent = "";
          const q = data.questions[i];
          box.append(el("small", "sx-step", i + 1 + " of " + data.questions.length));
          box.append(el("p", "sx-question", q.text));
          const group = el("div", "sx-options");
          group.setAttribute("role", "group");
          group.setAttribute("aria-label", q.text);
          q.options.forEach((o, k) => {
            const b = el("button", "sx-option", o);
            b.type = "button";
            b.onclick = async () => {
              picks.push(k);
              i += 1;
              if (i < data.questions.length) return ask();
              box.textContent = "Checking…";
              try {
                status.textContent = "";
                result(await forma.quiz.answer(picks));
              } catch (err) {
                status.textContent =
                  errors[err.message] || "Could not send your answers. Try again.";
                render(data);
              }
            };
            group.append(b);
          });
          box.append(group);
        };
        ask();
      };
      const render = (data) => {
        box.textContent = "";
        if (!data.questions.length) {
          box.append(
            el("p", "", data.own ? "Write your questions in the editor." : "No questions yet."),
          );
          return;
        }
        if (data.mine) return result(data);
        const intro = el("p", "sx-question", data.questions.length + " questions. No peeking.");
        const start = el("button", "sx-stick", data.own ? "Preview the quiz" : "Start");
        start.type = "button";
        start.onclick = () => play(data);
        box.append(intro, start);
        if (data.takers) {
          box.append(
            el(
              "p",
              "sx-label",
              data.takers + (data.takers === 1 ? " friend has" : " friends have") + " tried",
            ),
          );
          box.append(board(data));
        }
      };
      forma.quiz
        .read()
        .then(render)
        .catch(() => (status.textContent = "The quiz could not load. Try refreshing."));
      return node;
    },
    // The cat (ADR 0043): it lives on the page; friends keep it fed, once a day each.
    cat() {
      const name = s.cat.name || "the cat";
      const node = section("cat", "THE CAT");
      const card = el("div", "sx-card sx-cat-card");
      const pic = el("div", "sx-cat");
      pic.setAttribute("role", "img");
      pic.innerHTML =
        '<svg viewBox="0 0 120 100" aria-hidden="true"><path class="ear" d="M22 44 L14 12 L44 30Z"/><path class="ear" d="M98 44 L106 12 L76 30Z"/><ellipse class="body" cx="60" cy="68" rx="46" ry="30"/><circle class="head" cx="60" cy="48" r="32"/><g class="eyes"><ellipse cx="46" cy="46" rx="5" ry="7"/><ellipse cx="74" cy="46" rx="5" ry="7"/></g><g class="sleepy"><path d="M39 47 q7 5 14 0"/><path d="M67 47 q7 5 14 0"/></g><path class="nose" d="M57 56 L63 56 L60 60Z"/><path class="mouth" d="M52 61 q8 7 16 0"/><g class="whisk"><path d="M20 56 L44 58"/><path d="M20 64 L44 60"/><path d="M100 56 L76 58"/><path d="M100 64 L76 60"/></g><path class="tail" d="M104 80 q18 -4 10 -24"/></svg>';
      const text = el("div", "sx-cat-text");
      const line = el("strong");
      const who = el("small");
      const feed = el("button", "sx-stick", "Feed " + name);
      feed.type = "button";
      const status = el("p", "sx-status");
      status.setAttribute("role", "status");
      text.append(line, who, feed, status);
      card.append(pic, text);
      node.append(card);
      const errors = {
        SIGN_IN_REQUIRED: "Sign in to feed " + name + ".",
        CAT_FED: "You already fed " + name + " today.",
        CAPABILITY_DENIED: name + " is asleep right now.",
      };
      const render = (data) => {
        pic.dataset.mood = data.mood;
        pic.setAttribute("aria-label", name + " is " + data.mood);
        line.textContent =
          data.mood === "happy"
            ? name + " is purring."
            : data.mood === "fine"
              ? name + " is fine. Could eat."
              : name + " is hungry.";
        who.textContent = data.today.length
          ? "Fed today by " + data.today.map((f) => f.name).join(", ") + "."
          : "Nobody has fed " + name + " today.";
        feed.textContent = data.fedByMe ? "Fed ✓ come back tomorrow" : "Feed " + name;
        feed.disabled = data.fedByMe;
      };
      feed.onclick = async () => {
        feed.disabled = true;
        try {
          status.textContent = "";
          render(await forma.cat.feed());
          status.textContent = "Nom. " + name + " says thanks.";
        } catch (err) {
          status.textContent = errors[err.message] || "Could not feed " + name + ". Try again.";
          feed.disabled = false;
        }
      };
      forma.cat
        .read()
        .then(render)
        .catch(() => (status.textContent = name + " could not be found. Try refreshing."));
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
    // The owner's one-tap entries (ADR 0041) take over the cards they added, when there are any.
    if (!window.forma || !forma.profile || !forma.profile.read) return;
    forma.profile
      .read()
      .then((d) => {
        const live = d && d.now;
        if (!live) return;
        const swap = (kind, node) => {
          if (!order.includes(kind)) return;
          const old = host.querySelector('[data-sm-section="' + kind + '"]');
          if (old) old.replaceWith(node);
          else host.append(node);
        };
        if (live.current) swap("now", nowCard(live.current.text, "", null, ago(live.current.at)));
        if (live.listening) swap("repeat", repeatCard(live.listening.text, live.listening.by));
      })
      .catch(() => {});
  });
})();
