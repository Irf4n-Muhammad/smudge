# 0042 — The first screen: friends right now, and the widget

Status: accepted.

## Context

Stage 2 of the work order ("Temen dan widget") has two halves. The first screen should open on
what the people you follow are up to, with the feed and scrolling as usual below. And a
home-screen widget should show one friend's page live, so the page is in front of you before
you even open the app. ADR 0041 gave every person the one-tap "now" archive; this stage is
about seeing each other's.

## Decision

- **A row above the feed.** `GET /api/me/friends-now` returns, for each person you follow,
  their latest entry as you may see it (the same filter as their posts), newest first, at most 30. `FriendsNow` shows it as a horizontal row of tiles above the composer on "For you"
  (outside a side): face, first name, the entry and how long ago. A tap opens their page. The
  row refreshes every minute and shows nothing at all until a friend has noted something.
- **The widget's content is a web page.** `/w/<handle>` renders one friend's page the size of
  a widget: who, what now, what is playing, polled every minute from
  `GET /api/public/users/:handle/widget` with the guest rules and limit. A tap opens
  `/u/<handle>`. It needs no account and is not indexed.
- **The native shell is separate work.** A real home-screen widget needs an iOS and Android
  app. The plan is a thin wrapper around the existing web (a web view for the app, and widget
  extensions that read the same widget endpoint and draw it natively or show `/w/<handle>`).
  That is a project of its own, with store accounts, signing and review, and is not started
  here. Until then `/w/<handle>` is a bookmark, a pinned tab, or an "add to home screen" page.

## Consequences

- The row only shows people you already follow; discovery still happens in Explore and
  People. Someone with no friends who note things sees the feed exactly as before.
- Entries are read as often as the feed is opened plus once a minute while it stays open;
  the public widget endpoint shares the guest rate limit with the other share links.
- Blocking or a private account hides both the tile and the widget, through the existing
  `viewFilter`; a hidden page answers the widget with "This page is not here."
