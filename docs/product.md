# Product intent

## Agreed direction

The broad vision is freedom to shape software through existing AI tools. Customization includes
features, interaction rules, structure, and appearance. Colors and themes alone do not satisfy it.

The first application is Instagram-like social sharing: post moments, follow people, browse a feed,
and interact. Public profiles are now the primary creative surface: their owner designs a world
that every visitor can experience. The scrolling feed remains the discovery surface, with custom
post behavior and visual language. Private customization of the whole app is a later layer.

One account holds several sides of a person (ADR 0027): each side is its own world with its own
feed and composer, and a post lives in one of them. This is the base for collections, organiser
stamps and friends made through shared moments, not a second account in disguise.

AI is external: compatible clients can use an MCP server to author and revise experiences.
We are not training a model or assuming an embedded prompt box. A published experience should
work for viewers without their own AI connection or inference call.

Account style can be reused across different post formats. Simple posts remain possible.
Deeper interactions are optional; viewers must be able to leave a post without completing it.

Start locally, with no paid infrastructure required. Advertising is a possible later business
model; ad delivery, revenue sharing, design marketplaces, games, and community/chat expansion
are not requirements of the current foundation.

## Hypotheses, not established facts

- Expressive formats may make sharing and viewing more valuable.
- Reusing styles and experiences may keep everyday posting easy.
- Mixing formats might also create fatigue or navigation problems.
- External AI can potentially create useful formats beyond a prebuilt template catalog.
- None of this proves adoption, a moat, or the displacement of an incumbent.

## First meaningful product demonstration

An external AI creates a novel interactive post through MCP, iterates in a preview, and publishes
it. Another user can use it inside a feed alongside simpler and differently formatted posts.
This path is implemented and covered by a real MCP/browser test. See roadmap.md for limits.

The feed now presents personal worlds across the available width: rearrange a photo collage,
explore memories through stars, or open a letter. These are ordinary programmable packages,
not special host components. Thin navigation and floating social controls leave room for each
creator's composition. Day/night appearance coordinates the host and willing experiences;
the product's freedom still comes from custom structure and interaction, not the theme toggle.

The next visual experiment goes beyond post interiors: an optional space cockpit arranges
existing posts around a draggable orbit, with overlapping rings, planetary geometry and a
side transmission panel. This demonstrates an alternate shape and navigation for the app itself.
It is currently host-authored. Making whole-app compositions safely authorable through AI is a
separate architecture step; the existing MCP contract still authors isolated post experiences.

The clarified direction preserves vertical scrolling. Visible post frames are deliberately smaller
than their actual drawing envelopes, allowing art to overlap neighboring posts within controlled
limits. The breakout demo tests this with comic, space and landscape compositions, including a
boundary inspection toggle. The cockpit remains an optional earlier experiment, not the target
navigation model. Creator-authored cross-post extensions still need a versioned composition contract.

## Public profile milestone

Profiles accept versioned HTML/CSS/JS packages authored through the editor or external MCP.
The room and comic examples run as ordinary packages and read the owner's actual public identity
and publications. They are starting points, not an exhaustive template catalog. Host controls
retain back, follow, reporting, appearance and reduced motion. Draft preview, immutable publication
history and restoration allow changing a live profile without losing prior designs.

## Raka modular example

The local Raka profile demonstrates comic breakouts, independently selected profile/post/story
fragments and a working shared Drawing Relay. English UI supports pointer drawing, keyboard-accessible
star stamps, color, undo before submit, persistence and attribution. The editor composes Raka and
Essentials parts, shows combined permissions and previews before publication. External AI uses the
same drafts and composition API through MCP. This is a bounded local prototype, not a mod marketplace.

## Sharing and remixing

The local mod library lets a creator share all or selected profile surfaces, another account try
and remix an immutable version, and a third visit the published result. Identity and content stay
with the installer. After Hours demonstrates independently packaged vinyl, poster, ticket and
setlist-voting fragments. The feed remains the discovery surface; these parts style profile
content, not the host feed or an expiring-story player. Distribution is local demo sharing;
commercial licensing, payments, remote accounts, moderation and automatic updates are not included.

## Discover and reuse

Public profiles now lead to their recorded mod sources and creators. Visitors can preview the
actual combination using their own content, then adopt it in a private draft. Creator collections
show usage from current public profiles, not downloads or simulated popularity. Version updates,
automatic matching of older source, commercial licensing and ranking remain outside this milestone.
