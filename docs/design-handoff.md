# Design handoff: who you are, moments, decorations

Everything below works end to end with functional styling only. This file is the brief for a
design pass: what each screen must do, what must not change, and where the code lives.
Restyle freely; keep the behaviours and rules in "Do not change".

## Product in one line

A social feed for everyone where your profile says who you are, proven, and your big moments get
their own cinematic page that only opens with proof. Posts stay a normal shape; themes play
around them.

## Do not change

- Visitors never get free text or drawing on someone else's moment. Reactions are preset stickers,
  one per person, changeable or removable. No like counts on moments for anyone but the owner.
- The post itself keeps a standard shape. Decorations are transparent pieces clinging to the
  edges (top, corners); the bottom can be empty. They never take taps.
- The verified mark is drawn by the app, outside the post frame, never inside post code.
- Mobile first, no hover-only interactions. Check at 390px wide with no horizontal scroll.
- Moments open full screen inside the app; leaving is one tap (Back) and Escape on desktop.
- Locked things say exactly how to unlock them (the rule text comes from the server).

## Screens and components

| Screen / part          | Code                                                    | Notes                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed post decoration   | `components/post-decor.tsx` `DecorFrame`, `DecorCredit` | SVG pieces from `contracts/src/identity.ts` (`decorations`). Each piece: anchor corner + dx/dy + size. Credit line "Theme X · event by @creator". Themed cards also get an accent ring and the theme face on the author name (`app/themes.css`, ADR 0022). |
| Reaction bar           | `post-decor.tsx` `ReactionBar`                          | Emote stickers (SVG) or text stickers. `.reaction.mine` = chosen. Counts hidden on moments.                                                                                                                                                                |
| Moment in feed         | `post-decor.tsx` `MomentCover`, `MomentMark`            | Cover photo, kind, title, Open. Under it: "Graduation · Graduate, Lembayung University · Close circle" with a check when verified, "proof ended" after a breakup/removal.                                                                                  |
| Moment full screen     | `post-decor.tsx` `FullScreenPost`                       | Host bar (Back, owner, mark) + the moment page frame.                                                                                                                                                                                                      |
| Moment page (in frame) | `apps/server/moments.ts` `renderMoment`                 | Counter intro → name decodes → "Open moment" → hero sharpens → chapters reveal on scroll → paper reader → thank you → sticker wall. Optional ambient sound after a tap.                                                                                    |
| Who you are            | `components/identity-hub.tsx`                           | Chapter list (audience toggle, remove), partner requests, tabs: email, invite, partner, trip photo, birthday & country. Local demo inbox. Org admin invite maker.                                                                                          |
| Moment composer        | `components/moment-composer.tsx`                        | Template grid (locked tiles show the rule), then form: proof, title, words, cover, up to 3 chapters, optional paper, thanks, audience.                                                                                                                     |
| Themes                 | `components/decorations-panel.tsx`                      | Season banner, Events / Members / Market groups with live preview, emotes, lock reason, "Wear this season" / "Keep after the season", creator earnings (simulated).                                                                                        |
| Profile chip           | `components/profile-page.tsx` `.chapter-chip`           | Count of visible chapters on any profile, opens the list.                                                                                                                                                                                                  |
| Signup                 | `components/forma-app.tsx` `SignupDialog`               | Name + handle. Open to everyone.                                                                                                                                                                                                                           |
| Mobile create          | `forma-app.tsx` mobile nav, `identity-hub.tsx`          | "Create a post" opens the studio; moments start from "Share a moment" on Who you are.                                                                                                                                                                      |
| Sign-in screen         | `components/auth.tsx` `AuthScreen`, `AuthForms`         | Production only, for signed-out visitors: pitch on the left, Log in / Sign up / Forgot password card. Reset form when opened from an email link.                                                                                                           |
| Account                | `auth.tsx` `AccountPanel`, `VerifyBanner`               | Gear icon in the top bar. Email + confirmed state, change password, log out, log out everywhere. Banner until the email is confirmed.                                                                                                                      |
| Find people            | `community.tsx` `PeoplePanel`, `PersonRow`              | Search by name or @handle, suggestions. Follow, message and block per row. Icon-only follow under 480px.                                                                                                                                                   |
| Notifications          | `community.tsx` `NotificationsPanel`                    | Follows, likes, comments, stickers, partner requests, removed posts. Unread rows tinted; nav badge counts unread.                                                                                                                                          |
| Messages               | `community.tsx` `MessagesPanel`                         | Conversation list + thread. On phones the thread replaces the list (back arrow). Shows why you cannot write yet.                                                                                                                                           |
| Report / block         | `community.tsx` `ReportDialog`, post `⋯` menu           | Report with one of six reasons; Block @handle from the menu or a person row.                                                                                                                                                                               |
| Moderation             | `community.tsx` `ModerationPanel`                       | Moderators only. Grouped reports with reason counts: Remove post, Dismiss, Suspend account.                                                                                                                                                                |
| Account extras         | `community.tsx` `BlockedList`, `DeleteAccount`          | Blocked accounts with Unblock; danger zone that asks for the password (or handle for Google-only).                                                                                                                                                         |
| Google button          | `auth.tsx` `AuthForms`                                  | "Continue with Google" above the email form, only when the server has Google configured.                                                                                                                                                                   |

Styles for all of the above are in `apps/web/app/identity.css`; tokens come from `globals.css`
(`--paper --white --ink --muted --line --accent`). Dark mode uses the existing theme toggle.

## States to design

- Template tile: unlocked, locked (rule text), selected. Seven kinds: Graduation, New job,
  Birthday, Trip, Together, Who you are (club/event titles), Paper or portfolio.
- Chapter: per method (email, invite, partner, photo), audience everyone vs close circle.
- Decoration card: in use (manual or season default), available, locked (members or out of
  season), sponsored.
- Season banner: none, active (Halloween, Hari Kemerdekaan for Indonesia, New Year).
- Moment mark: verified, proof ended, paper (no proof), close circle.
- Empty: no chapters yet; nothing to react with yet.

## Visual references the owner liked

- Moment page: edolus.com (black, loading counter, letters decoding, thin extended uppercase,
  small mono labels, white bracket-corner buttons, "better with headphones").
- Feed decorations: transparent edge pieces like a spider web and a hand at the top, a cat
  peeking over the corner; nothing solid or framed like an old photo frame.
- Profiles: the Lando Norris site energy with tighter spacing ("rapat").

## Try it

`FORMA_TODAY=2026-10-20 npm run dev` shows Halloween. Leo has a public graduation moment. As Alex,
open Who you are, verify `alex@student.lembayung.edu` (the code appears in the local inbox), then
Share a moment → Graduation. Maya admins Teater Senja and Leo admins Lembayung University and the
film festival, so they can issue invite codes.
