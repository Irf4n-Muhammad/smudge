# Product concept log

The `smudge-concept` panel (`.claude/agents/smudge-concept.md`) reads this file at the start of
every session and proposes lines for it at the end. Muhammad decides what goes in.

There are two separate products. Keep their ideas apart.

1. **Smudge**: Instagram, but every profile and post is HTML, so a profile can be a real website.
2. **Bubble**: a nested Reddit where members are verified by achievement.

## 1. Smudge

### What it is

- Like Instagram, but each post, profile and page is its own HTML/CSS/JS program that opens fully
  inside the app. Profile shape is free through themes.
- Pitch: "your social profile is your portfolio". A programmer shows a live GitHub card and
  projects grouped by topic; Instagram only has a grid and one bio link.
- Businesses (restaurants, gyms, shops) make their official website here: menu, hours, prices,
  owner photos, plus reviews from people you follow who actually went.
- Demand: whoever wants to be shown needs a page as complete as a website, but websites are formal,
  hard to make and nobody visits them. Whoever is searching wants everything in one trusted place
  instead of jumping between Google reviews, photos and a website. Smudge: a page as complete as a
  website, found as easily as social media. A social media engine for websites, not a search engine.

### Themes

- Making a profile is as easy as Canva. Themes are made in bulk (AI templates from us, plus anyone
  in an open market) and curated. Modding is open for those who want it.
- A theme shows in the feed, not only on the profile.
- Some themes unlock only through verification (e.g. a UofT theme for UofT people, a Paris theme
  from photo GPS in Paris). These cannot be bought elsewhere, which is what keeps ordinary users who
  only picked a theme from leaving.

### Growth and money

- Early on, sell the place to put your website, not the network: people come for the tool and stay
  for the network. Links go in Instagram bios, LinkedIn and WA groups and open without an account,
  so every site advertises Smudge.
- In that phase we compete directly with Carrd, Linktree and Framer, so it must be clearly easier or
  better.
- Money: themes as skins and season passes, transaction cuts, intent-based ads (places, search,
  sponsored moments) as a complement. Creators are paid from sales and transactions. Never paid
  verification.

### Why Instagram won't copy

- Its feed and ads live on a uniform format, and running other people's HTML is a security risk for
  it. Free design alone is not unique (Carrd, Wix exist); the unique part is websites living inside
  a feed and found through your people.

### Open

- The network effect is empty on day one; the tool has to carry the first weeks.
- Is the friends feed strong enough for daily return?
- ADR 0011 excludes lunar-calendar seasons (Ramadan, Eid); revisit if seasonal themes matter.

## 2. Bubble

### What it is

- A nested Reddit: small bubbles inside big ones (soulslike inside games), an official page on top,
  open to anyone.
- The argument is verified by achievement. Proof comes from data (Steam or PSN hours, Strava,
  bosses beaten, FPL rank) or from places and people (GPS at a gym or stadium, a coach vouching).
- Proof gives weight, not entry. Answers from proven members rank higher.
- Talk is born from a thing (a boss, a route, a match), so it stays findable: one Malenia, not 40
  Malenia threads.

### Moat and limits

- Post format is a feature, not a moat. The moat is the proven name that builds up and cannot be
  taken to Discord (closed islands) or Reddit (anonymous, unproven).
- Credentials must be recognised by people, not only handed out by the system (Foursquare badges
  died because they were about the app). A credential is worth what it unlocks. If it can be faked,
  it is worth nothing. Credentials belong to the person and are opt-in.
- Communities with almost no proof (book clubs, film fans) are weaker bubbles.

## Shared rules

- Method: human desire, then context and goal (fixed), then the way (radical), then whether the
  difference matters or is sugarcoating. Think top down from maximum potential.
- A feature Instagram can paste on without breaking its machine is not a weapon.
- The toy has to be about the person, not about the toy.

## Rejected

- Starting from a niche (run clubs) as the goal. A niche may only come back as an entry tactic
  under agenda item 7.
- "Don't compete with Discord" as a reason to close off an idea.
- Deep research reports for these questions: no meaningful information.
- Mixing Smudge and Bubble into one product.

## Agenda

| #   | Question                                                | Status |
| --- | ------------------------------------------------------- | ------ |
| 1   | What is social media? The core point, from human desire | open   |
| 2   | Its general form (feed, timeline, profile, DM) and why  | open   |
| 3   | Smudge's core and where it differs                      | open   |
| 4   | Does the difference matter: stay, or only viral?        | open   |
| 5   | How to make people stay, judged against item 1          | open   |
| 6   | Truly new or different? Switch, or one more app?        | open   |
| 7   | Reaching people: niche, open for all, or both           | open   |
| 8   | Features: which, why they matter, which are radical     | open   |
| 9   | At maximum potential, do people still use other apps?   | open   |
