# 0044 — Right now, read rather than typed

Status: accepted. Reworks part of ADR 0041.

## Context

The first test of the page (ADR 0041) showed two things straight away. The sign-up form was a
bare stack of inputs: no spacing, a developer word ("Handle"), no second password field, no
sense of how strong a password was. And "Right now" asked for too much: four kinds of note to
type, when the point of the page is to show what you are up to with as little effort as
possible. People do not narrate their day; the page should read it.

## Decision

- **Sign up and log in.** One column with room, "Username" with an @ and a hint of where the
  page will live, password with a show/hide toggle and a three-step strength meter (length
  first, variety second), a repeat-password field, and the error under the field it belongs to
  (a taken username, a wrong password) rather than only at the bottom. Nothing changed in the
  rules: ten characters, no common passwords, the same endpoints.
- **Entries are read first.** `NowService` gains `sources`: functions the server installs that
  return what it knows about a person without them typing. Three ship now: the song playing on
  Spotify, the posts they made, and what they did on friends' pages (took a quiz, fed a cat).
  Read entries carry `source` and sit in the archive with the typed ones; they cannot be removed
  by hand, because they are facts, not notes.
- **Spotify once, then by itself.** With `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` set, the
  owner taps "Connect Spotify" once (authorization code flow with PKCE, like Google sign-in);
  only the refresh token is kept, by user, and "off" removes it. The server asks Spotify what is
  playing at most once a minute per person, when their page, the friends' row or the widget is
  read, and the page shows the song with a small Spotify mark. Without the keys the button does
  not exist.
- **One tap for a song without Spotify.** The owner's row shows up to six songs as chips: the
  ones they noted before and the ones people they follow had on. A tap notes it again.
- **Typing is behind a +.** The four manual kinds still exist, but under a small "Note" button;
  the row itself is chips. The setup after sign-up keeps only the optional song; "what are you
  up to" is gone from it.

## Consequences

- A page with no posts, no Spotify and no notes says "Nothing yet" and tells the owner the two
  ways to fill it. The feed row and the widget show read entries like any other.
- The Spotify poll adds one outbound request per person per minute at most, only for people
  who connected; a failure keeps the last answer and tries again later.
- Place and "thinking" remain typed; reading a place from photos is a later step.
