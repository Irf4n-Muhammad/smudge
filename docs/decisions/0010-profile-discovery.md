# 0010 — Recorded provenance and staged combination reuse

Status: accepted.

## Decision

Keep direct mod origin/version outside executable packages, managed only by the core install path.
Publication snapshots it. Identity edits preserve it; source edits conservatively mark it modified
and part replacement/removal clears attribution. Never infer authorship from matching text or names.
Older/imported designs remain reusable, with unrecorded origin clearly labelled.

Count distinct current public profile pointers using each mod, once per creator across their mods.
Drafts, installs and historical publications cannot inflate that count. These are local demo counts.

Try/Mix creates a separate private candidate with the recipient's identity and published content.
Apply checks both candidate and target revisions before atomically replacing a target draft. Public
reuse copies the actual active composition, not a reconstruction from today's latest mod versions.
Only declared design media is copied. Embedded text/art remains part of that source; dynamic identity,
posts, drawings and votes do not transfer. Cancel keeps the candidate in private draft history.

## Limits

Credits describe direct lineage, not verified original authorship or licensing. Shared dependencies
make exact per-part modification detection unreliable, hence conservative modified labels. Automatic
updates, transitive credits and inference for legacy profiles remain deferred. Existing arbitrary
HTML/CSS/JS authoring and the shared-runtime boundary remain unchanged.
