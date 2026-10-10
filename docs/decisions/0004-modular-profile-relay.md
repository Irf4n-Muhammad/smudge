# ADR 0004: Modular profile composition and persistent Drawing Relay

Status: accepted for the local prototype.

Profile v1 remains supported unchanged. Profile v2 introduces four optional fragment slots:
profile, post, story and feature. The package owns its shell and every fragment's HTML/CSS/JS;
these are not React templates or color presets. A selected fragment references a local file and
lists required capabilities. The shell includes matching `<!--forma:slot-->` markers. The renderer
assembles selected fragments before applying the existing isolated runtime policy.

All selected parts share one iframe and the manifest's capabilities. Per-part permissions and DOM
isolation are NOT provided. This explicit limitation avoids implying that a capability label can
sandbox one script from another in the same document. Owners review the combined permissions.

Mixing copies donor files except its shell, preserves unrelated selections, and unions declared
assets. Different contents at the same path are rejected rather than silently replacing source.
The author must rename conflicting paths and update their references. File/size/asset limits apply
after composition. Partial donors are supported; requesting a missing part fails explicitly.
Example fragments depend on the Raka shell's `profileData` promise and shared CSS. Universal
compatibility among arbitrary third-party packages is not claimed.

Drawing Relay is a typed platform storage primitive. Code can replace its presentation and
interactions through the SDK, but cannot run arbitrary server code. Published data is keyed to the
profile owner, not a publication or design. Removing a feature hides it and denies its capabilities
from historical runtimes when the current profile no longer grants them. Data remains recoverable.
Preview writes use draft ID and revision namespaces; publishing never migrates preview marks.

Each contribution has a client submission UUID for retry deduplication, a server-derived author,
timestamp and bounded vector strokes. Up to 32 strokes, 128 points each and 200 contributions per
profile keep demo rendering/storage bounded. This is not a production spam quota, moderation tool,
real-time collaboration service, or production authentication. Refresh retrieves others' changes.
No migration deletes existing posts, profiles, assets or contributions.
