# 0031 — Gift themes

Status: accepted.

## Context

Themes are the look people wear across their posts and page. Buying a look for yourself is a
weak reason to pay; giving one to a friend with a line of your own ("Sub-5, finally!") is a
reason people already have. Before any payment gateway exists, the social act can be built and
tried.

## Decision

- `POST /api/decorations/gift {toId, decorationId, note}` records a gift from the caller to
  another person. Only **market** themes can be given; themes earned by proof or membership
  (`event`, `members`) are refused, so a finisher medal stays a finisher's. The note is at
  most 140 characters. A block between the two refuses the gift, as it refuses a follow.
- The receiver sees the gift at the top of **Themes** ("Gifts for you") with the note and a
  **Wear it** button, and gets a `gift` notification. `GET /api/decorations` gains `gifts`.
- **Nothing is charged.** The prototype records the gift and says so in the form. The record
  shape (who, to whom, which theme, note, when) is what a paid gift would carry; the price and
  the receipt are the payment layer's, later.

## Consequences

- A market theme was already free to wear, so a gift adds the reason and the name, not access.
  When market themes get a price, the gift becomes the purchase and nothing else moves.
- Gifts are not shown on the receiver's profile; whether a worn gift shows "from Maya" is open.
