"use client";
import { useEffect, useState } from "react";

const XHTML = "http://www.w3.org/1999/xhtml";

/**
 * A designer's HTML and CSS become an SVG image (ADR 0024). The browser draws an image in isolation:
 * scripts never run, nothing outside the image loads, and it cannot be clicked or read by the
 * page. That, not the submission rules, is what makes a stranger's code safe to show in the feed.
 * The markup is parsed in an inert document (no scripts, no loading) only to turn it into the
 * well-formed XHTML an SVG image requires.
 */
export function pieceImage(
  html: string,
  css: string,
  width: number,
  height: number,
  texts: Record<string, string> = {},
) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
  // The wearer's words replace a slot's text as plain text, never as markup (ADR 0025).
  for (const el of Array.from(doc.querySelectorAll("[data-text]"))) {
    const name = (el.getAttribute("data-text") ?? "").toLowerCase();
    if (!Object.hasOwn(texts, name)) continue;
    // The piece has a fixed size, so longer words shrink to roughly the space the designer's had.
    const before = Math.max(1, (el.textContent ?? "").trim().length);
    const text = texts[name]!;
    if (text.length <= before) {
      el.textContent = text;
      continue;
    }
    // A span scales relative to the slot's own size, whatever font size the designer gave it.
    const fit = doc.createElement("span");
    fit.setAttribute(
      "style",
      `font-size:${Math.max(0.45, before / text.length).toFixed(2)}em;white-space:nowrap`,
    );
    fit.textContent = text;
    el.replaceChildren(fit);
  }
  const xml = new XMLSerializer();
  const style = doc.createElement("style");
  style.textContent = css;
  const body = [style, ...Array.from(doc.body.childNodes)]
    .map((node) => xml.serializeToString(node))
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="${XHTML}" style="width:${width}px;height:${height}px;overflow:hidden;margin:0">${body}</div>` +
    `</foreignObject></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Draws one community piece. Built after mount, since the parser only exists in the browser. */
export function PieceArt({
  html,
  css,
  width,
  height,
  texts,
}: {
  html: string;
  css: string;
  width: number;
  height: number;
  texts?: Record<string, string> | undefined;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const words = JSON.stringify(texts ?? {});
  useEffect(() => {
    setSrc(pieceImage(html, css, width, height, JSON.parse(words)));
  }, [html, css, width, height, words]);
  return src ? (
    <img
      className="theme-piece-art"
      src={src}
      alt=""
      width={width}
      height={height}
      draggable={false}
    />
  ) : null;
}
