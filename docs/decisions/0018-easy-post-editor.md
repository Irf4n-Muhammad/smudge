# 0018 — Easy post editor

Status: accepted.

## Context

Profiles got an easy editor (ADR 0016); making a post still meant the studio, which is built
around package source. The owner wants Awwwards-style posts that anyone can make without code.

## Decision

- **Create a post** opens a full-screen post editor (`apps/web/components/post-editor.tsx`). The
  studio stays: **My studio** in the sidebar, **Open the studio** on the first step, and
  **Advanced editor** on the same draft.
- **Pick a style:** Poster, Magazine, Gallery, Scrapbook, Big note, shown as pictures
  (`apps/web/public/post-styles/`). Each has its own colours and font, which can be changed.
  Switching style keeps the words and photos.
- **Tap to edit:** the draft preview runs in edit mode, as profiles do. The headline, label,
  words, quote and each photo are tappable. The bottom bar has Style, Photos, Colors, Font (and
  motion on/off), Button (button and feed caption) and Preview.
- **Settings are source.** The design lives in `smudge/post.js` and the page is regenerated from
  it as ordinary files, so the studio, MCP and "Use format" keep working on the same package.
- **Motion** is one fixed script: words of the headline spell in and parts reveal on scroll. It
  is off for people who ask for reduced motion, and while editing.
- **Fonts** are system font stacks, because posts run with no network access. Handwritten falls
  back to the system's cursive face where Bradley Hand or Segoe Print are missing.

## Consequences

- Hand edits to `index.html` in the studio are replaced the next time the post is changed in the
  easy editor; the settings file is the source of truth for easy posts.
- More styles can be added in `easy-post.ts` without changing the contract.
