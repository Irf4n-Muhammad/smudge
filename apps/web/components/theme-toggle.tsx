"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      try {
        if (localStorage.getItem("forma-theme")) return;
      } catch {}
      document.documentElement.dataset.theme = media.matches ? "dark" : "light";
      setDark(media.matches);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(!dark);
    try {
      localStorage.setItem("forma-theme", next);
    } catch {}
  }
  return (
    <button
      className="theme-toggle"
      aria-label={dark ? "Switch to day mode" : "Switch to night mode"}
      aria-pressed={dark}
      onClick={toggle}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
      <span>{dark ? "Daylight" : "After dark"}</span>
    </button>
  );
}
