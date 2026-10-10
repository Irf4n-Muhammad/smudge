# ADR 0003: Public profiles are separate versioned packages

Status: accepted for the local prototype.

The primary customization surface is now the public profile, while the scrolling feed serves
discovery. Profile authors need freedom of structure and behavior without access to visitor
credentials or the host UI. Extending post capabilities would blur whose data a profile can read.

Use a separate kind/profile-v1 schema, owner-bound read/openPost capabilities and separate draft,
publication and active-state records. Reuse the existing source bundler, isolated origin, CSP and
nonce/session ticket bridge. Tickets include kind; both transport layers validate that kind's schema.
Host controls retain navigation, follow, report and accessibility preferences.

Publication stores immutable source and updates a monotonic active pointer in one transaction.
Restore selects a prior owned snapshot or default layout. expectedVersion prevents stale editors
from silently undoing a restoration. History remains stored and is not a revocation mechanism.

Room/comic examples are ordinary authorable packages. MCP and editor call the same profile service.
Visitor preview uses the author's real public data but never exposes editor privileges to the frame.
The bounded height avoids adding a new resizing message surface in this milestone. Longer content
can scroll inside the iframe. JS motion and resource use remain subject to existing prototype limits.
