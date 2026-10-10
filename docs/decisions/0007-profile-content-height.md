# 0007 — Bounded opt-in profile height

Fixed Raka artboard heights clipped its ending when uploaded posts or relay controls grew,
and left dead space when switching parts. Profile v2 may opt into autoHeight; existing height
fields remain fallback values. Legacy packages and independent posts keep fixed dimensions.

The SDK observes document body size and the host validates origin, frame, nonce, strict message
shape and a 600–4000 px bound. Host updates are coalesced independently of creator behavior.
This does not grant host DOM access or unlimited page space. Very long pages still scroll
inside their iframe; arbitrary viewport-dependent packages must opt out to avoid feedback.

Raka uses document flow, a two-column post grid and a real end-of-profile signoff. Existing
publications are immutable; switching the local example is an explicit publication, preserving
posts, uploads, social activity and Drawing Relay contributions.
