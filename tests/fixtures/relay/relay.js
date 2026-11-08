(() => {
  const canvas = document.getElementById("relay-canvas"),
    ctx = canvas.getContext("2d"),
    button = document.getElementById("relay-submit"),
    tools = document.getElementById("relay-tools"),
    status = document.getElementById("relay-status"),
    contributors = document.getElementById("relay-contributors");
  const starter = document.getElementById("relay-starter-art");
  starter.onload = () => render();
  let entries = [],
    pending = [],
    stroke = null,
    color = "#202020",
    editing = false,
    busy = false,
    submissionId = crypto.randomUUID();
  function line(s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.stroke();
    if (s.points.length === 1) {
      ctx.beginPath();
      ctx.arc(...s.points[0], s.width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function render() {
    ctx.clearRect(0, 0, 1000, 600);

    const illustrated = starter.complete && starter.naturalWidth > 0;
    if (illustrated && !document.querySelector(".world.is-raka")) {
      // Canvas coordinates stay stable for saved strokes; compensate only decorative image aspect.
      const bounds = canvas.getBoundingClientRect();
      const width = bounds.width < 450 ? 760 : 520;
      const h = Math.min(
        600,
        (width * bounds.width * 600 * starter.naturalHeight) /
          (1000 * bounds.height * starter.naturalWidth),
      );
      ctx.drawImage(starter, bounds.width < 450 ? 30 : 125, 600 - h, width, h);
    }
    if (!illustrated && !entries.length && !pending.length) {
      ctx.fillStyle = "#6a6359";
      ctx.font = "italic 30px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("This page is waiting for its first mark.", 500, 270);
      ctx.font = "20px Arial";
      ctx.fillText("Draw with a pointer, or use Add a star.", 500, 310);
    }
    // Only the immutable bundled starter gets an illustrated presentation. User marks stay literal.
    for (const e of entries) {
      if (illustrated && e.id === "20000000-0000-4000-8000-000000000001") continue;
      for (const s of e.strokes) line(s);
    }
    for (const s of pending) line(s);
    if (stroke) line(stroke);
  }
  function state() {
    document.querySelector(".relay").classList.toggle("is-editing", editing);
    tools.hidden = !editing;
    tools.style.display = editing ? "flex" : "none";
    canvas.classList.toggle("drawing", editing && !busy);
    button.textContent = busy ? "Saving…" : editing ? "Save contribution ↗" : "Add your mark →";
    button.disabled = busy || (editing && !pending.length);
    document.getElementById("relay-undo").disabled = busy || !pending.length;
    document.getElementById("relay-cancel").disabled = busy;
    document.getElementById("relay-star").disabled = busy || pending.length >= 32;
    document.getElementById("relay-refresh").disabled = busy || editing;
    contributors.textContent = entries.length + " contributions";
    contributors.title = [...new Set(entries.map((e) => e.name))].join(", ");
    const names = [...new Set(entries.map((e) => e.name))].slice(-3);
    const people = document.getElementById("relay-people");
    people.replaceChildren();
    const avatars = document.createElement("span");
    avatars.className = "relay-avatars";
    avatars.setAttribute("aria-hidden", "true");
    for (const name of names) {
      const avatar = document.createElement("span");
      avatar.textContent = name
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("");
      avatars.append(avatar);
    }
    const label = document.createElement("span");
    label.textContent = names.length
      ? names.map((name) => name.split(" ")[0]).join(", ") + " + you"
      : "Your turn";
    people.title = names.join(", ");
    people.append(avatars, label);
    render();
  }
  async function load() {
    try {
      entries = await forma.relay.read();
      status.textContent = "";
      state();
    } catch (e) {
      status.textContent = "Could not load the canvas: " + e.message;
      button.disabled = true;
    }
  }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1000, ((e.clientX - r.left) * 1000) / r.width)),
      Math.max(0, Math.min(600, ((e.clientY - r.top) * 600) / r.height)),
    ];
  }
  canvas.onpointerdown = (e) => {
    if (!editing || busy || stroke || pending.length >= 32) return;
    canvas.setPointerCapture(e.pointerId);
    stroke = { color, width: 5, points: [point(e)] };
    render();
  };
  canvas.onpointermove = (e) => {
    if (!stroke) return;
    if (stroke.points.length < 128) stroke.points.push(point(e));
    render();
  };
  function finish() {
    if (stroke) {
      pending.push(stroke);
      stroke = null;
      state();
    }
  }
  canvas.onpointerup = finish;
  canvas.onpointercancel = () => {
    stroke = null;
    render();
  };
  tools.querySelectorAll("[data-color]").forEach(
    (b) =>
      (b.onclick = () => {
        color = b.dataset.color;
        tools
          .querySelectorAll("[data-color]")
          .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }),
  );
  document.getElementById("relay-undo").onclick = () => {
    pending.pop();
    state();
  };
  document.getElementById("relay-cancel").onclick = () => {
    editing = false;
    pending = [];
    stroke = null;
    submissionId = crypto.randomUUID();
    status.textContent = "Unsaved marks discarded.";
    state();
  };
  document.getElementById("relay-star").onclick = () => {
    if (busy || pending.length >= 32) return;
    const x = 160 + (pending.length % 5) * 150,
      y = 140 + Math.floor(pending.length / 5) * 55;
    const points = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2,
        r = i % 2 ? 18 : 42;
      points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    pending.push({ color, width: 5, points });
    state();
  };
  document.getElementById("relay-refresh").onclick = () => void load();
  button.onclick = async () => {
    if (!editing) {
      editing = true;
      status.textContent =
        "Draw on the page. Undo removes only your unsaved strokes. Up to 32 strokes per contribution.";
      state();
      return;
    }
    if (!pending.length || busy) return;
    busy = true;
    state();
    try {
      const entry = await forma.relay.add({ submissionId, strokes: pending });
      if (!entries.some((e) => e.id === entry.id)) entries.push(entry);
      pending = [];
      editing = false;
      submissionId = crypto.randomUUID();
      status.textContent = "Your contribution is saved.";
    } catch (e) {
      status.textContent = "Not saved: " + e.message + ". Your marks are kept here; try again.";
    } finally {
      busy = false;
      state();
    }
  };
  state();
  new ResizeObserver(render).observe(canvas);
  button.disabled = true;
  void load();
})();
