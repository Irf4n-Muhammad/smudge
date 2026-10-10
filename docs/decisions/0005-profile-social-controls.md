# 0005 — Optional social controls inside profile v2

Accepted for the local prototype. Exact profile composition needs actual follow/like/save controls
inside creator layout. Host-positioned overlays would couple the platform to one template's pixel
coordinates, so profiles opt into two explicit additive v2 grants instead. v1 remains closed.

Domain validation binds actor to the runtime ticket and targets to the profile owner. Preview
cannot write real state; current publication grants are checked for historical runtime calls.
The host refreshes its feed snapshot after successful actions. Profile read alone still exposes
no saved state. All parts share grants; generated code can invoke them without a provable user
click. Do not present this as a production consent or anti-abuse boundary. Host controls remain
available under Profile options. Tests cover foreign targets, forged identity, preview writes,
viewer isolation, persistence and revoked grants.

The optional v2 headerOverlay flag is a visual layout hint, not host DOM access. Default profiles
keep the toolbar outside their iframe; the Raka shell explicitly reserves 65px behind it.
