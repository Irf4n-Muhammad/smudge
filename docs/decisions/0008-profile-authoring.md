# 0008 — Personal authoring without making packages account authorities

Status: accepted.

## Context

A reusable visual profile needs real identity/content editing, composition, preview and publication
in one place. Encoding identity in a mod would confuse display customization with authority and
could leak unfinished changes or let a package choose its actor. Raka's reference artwork also
contains a fixed portrait/wordmark: a personal copy needs the layered composition to substitute
real identity, while the existing Raka example must remain unchanged.

## Decision

- Keep identity outside the package as an optional strict draft/publication snapshot. Session-bound
  core operations enforce ownership and validate avatar assets. Publish/restore commit identity
  and design atomically under the existing expectedVersion check.
- Read a private snapshot only in an owner-authorized draft preview. Public profiles read the
  current account. The avatar endpoint serves only the current public reference, never a draft ID.
- Generate ordinary HTML/CSS/JS source for compatible Raka shells. Switch personal copies to the
  layered artwork, inject a real avatar, and retain editable fragments and their permissions.
  Bounded controls cover composition and section order; source/import/MCP still support original
  behavior and structure. The generator is neither a sandbox nor a universal mod adapter.
- Retain one-step undo for identity/composition/part edits and block publication while visible
  form changes are unapplied. Save the draft ID in the URL so reloading resumes saved work.
- Photo creation uses existing post publication, explicitly separate from profile publication.

## Compatibility and consequences

No package schema version changes. Old drafts/publications without identity stay valid; restoring
one leaves current identity unchanged. New drafts snapshot identity. Restoring a newer publication
also restores its identity, including initials when avatar is null. Null/default restoration only
changes the layout pointer. Existing source outside generated personal files is preserved.

The visual helper applies only to the Raka shell and known compatible fragments. Post appearance
controls apply to Cutouts/Straight, while arbitrary mods own their CSS and behavior. Uploaded
images have the existing 3 MB limit. No production authentication, cloud service or model was added.
