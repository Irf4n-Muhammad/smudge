# 0006 — Explicit post covers and lazy profile media

Status: accepted for the local prototype.

Uploaded media was available inside experiences but profile mods substituted illustration crops.
Use an optional coverAssetId in post metadata rather than guessing which declared asset is content.
Validate declaration and ownership at all writes and publication. Reuse remaps copied cover IDs.

Expose the cover through an optional profile v2 capability, bound to a published post of the profile
owner. Return one data URL per request, not all images inside profile.read, to avoid unbounded bulk
media transfers. The stack fetches current/next covers; grids use viewport observation. Existing v1
packages remain accepted. Current grants revoke access from historical runtimes too.

This is local image delivery, not thumbnail processing or a CDN. The 3 MB upload limit remains;
production image resizing, quotas and media moderation still need separate work. Existing immutable
profile publications need an explicit new revision to opt in; startup does not rewrite user designs.
