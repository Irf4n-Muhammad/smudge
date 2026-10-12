# 0016 — Easy profile editor and The Wall

Status: accepted.

## Context

Stage three of the Smudge redesign. The owner wanted a profile editor people with no design or
code background can use, following the approved designs (`design/smudge/editor-1-setup`,
`editor-2-edit`, `editor-3-add-section`): pick a vibe, tap the profile to change it, add sections.
The existing editor stays for people who want HTML, CSS and MCP.

## Decision

- **Entry.** Your own profile shows **Edit profile** in its header. It opens a full-screen editor
  (`apps/web/components/easy-editor.tsx`). The old editor stays as **Customize profile** and is
  linked from the easy one as **Advanced editor**, on the same draft.
- **Pick your vibe.** Starting points are shown as pictures of real profiles made with them
  (`apps/web/public/vibes/`). If your live profile is a Paint wall, the editor skips this step and
  opens a private copy of it.
- **Tap to edit.** The preview runs in edit mode (contracts.md): outlined parts report which field
  was tapped, and taps don't use the page. The host only listens to its own draft preview.
- **Settings are source.** Choices are written to `smudge/settings.js` by
  `applySmudgeSettings` in `packages/core`, as the Ink & Paper composition controls already do. The
  advanced editor, MCP and mods keep working on the same files. An older Paint wall copy is brought
  up to date the first time it is edited; files already rewritten at this version are kept.
- **What can be changed:** big name (first, full or nickname), the italic line (`*stars*` make
  italic), the top corner, the ribbon, name, bio and photo, five colour sets (Halloween still takes
  over in October), and sections in any order: Now doing, Gallery, The Wall, Big quote, On repeat,
  Countdown, Latest and All posts.
- **Saving.** Edits save to the draft after a short pause, one after another, and the preview
  reloads. Nothing is public until **Publish**.
- **The Wall** is a server-backed guestbook with three new profile methods (contracts.md). Names
  come from the session, notes are short, there are per-person and per-wall limits, blocks apply,
  owners can take any note down, and account deletion removes a person's notes.

## Follow-up (polish)

- **No flicker.** Each save still makes a new draft revision, but the editor loads it in a hidden
  frame behind the visible one and swaps when the new frame has drawn and measured itself (or
  after six seconds). Sending live settings into the open frame was rejected: every vibe would
  need its own re-render code, and community mods would not get it.
- **Tap-to-edit everywhere.** The click-to-edit capture moved from the Paint wall's script into
  the SDK, keyed on `data-edit`, so any page (including mods) gets it by tagging elements. Ink &
  Paper/Essentials reuse the existing profile design controls; Room and Comic get a small look
  block (colour and one line). An untouched Ink & Paper original keeps its hand-drawn header until
  a layout control is used.
- **Reporting wall notes** rides on the `profile.wall.read` grant rather than a fourth wall
  capability, so walls already published can be reported and the 9-capability budget is unchanged.
  Paint wall files moved to marker `smudge:v3` so older copies pick up the Report button when next
  edited.

## Limitations

- The preview still reloads behind the scenes; state inside the frame (a half-typed wall note,
  scroll inside a carousel) resets after each save.
- Room and Comic have no sections to reorder. Parts unique to Ink & Paper (the drawing wall's own
  rules) still live in the advanced editor.
- A published Paint wall that predates `smudge:v3` shows no Report button until its owner edits it
  again; the server accepts reports either way.
- Countdown dates use the visitor's local midnight.
