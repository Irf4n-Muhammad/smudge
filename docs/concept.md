# Product concept log

The `smudge-concept` panel (`.claude/agents/smudge-concept.md`) reads this file at the start of
every session and proposes lines for it at the end. Muhammad decides what goes in.

There are two separate products. Keep their ideas apart.

1. **Smudge**: where the moments of your life live; every profile, post and page is HTML.
2. **Bubble**: a nested Reddit with a world map of interest bubbles you can step into.

## 1. Smudge

### What it is

- Center: "Smudge is where the moments of your life live, from the plan to the memory, and only the
  people who were there are in it."
- Like Instagram, but each post, profile and page is its own HTML/CSS/JS program. Three parts form
  one loop:
  1. **Moments** (the activity): weddings, reunions, birthdays, trips, dinners.
  2. **Profile** (where the results pile up): a timeline of where you were present and with whom,
     and at the same time your website or portfolio, as easy as picking a theme.
  3. **Businesses** (where the activity happens): venues, restaurants, gyms, cafes and wedding
     vendors get an official page, stamps and reviews from people proven to have come.
- One QR scan at the venue ties them: it opens the moment's album, proves presence and gives a stamp.
- Loop: planning a moment picks a place from business pages (ranked by friends' proven reviews) →
  everyone scans at the place → the moment becomes a memory on every attendee's profile → friends
  see it and plan their own moment there.
- Closest competitor: Partiful. Pitch: "Partiful, but moments pile up into your life timeline and
  connect to the place they happened."

### Moments

- Shaped like a Telegram group: the invite page pinned on top; a chat tab (announcement mode for
  big events, free chat for small ones); an album tab; small groups inside the moment.
- Small groups inherit date, place and dress code, are hidden from the parent, and close with it.
- Unlike Telegram, a moment closes itself after the event and becomes one memory card on each
  attendee's profile. A group that keeps meeting is offered to become a permanent circle.
- Norm: only people who were there. Intimacy comes from shared presence, not small size. No public
  like counts; outsiders see nothing unless the host opens it.
- Wedding flow: host picks a template, vendors attach → link goes to WA, opens without an account →
  RSVP with a phone number gives the host a guest count → updates reach RSVP'd guests → at the door
  a QR replaces the guestbook and opens the album (digital gift envelope here too) → afterwards the
  same link becomes album plus thank-you. Viewing needs no account; uploading photos does.
- Album: chapters from the invite's rundown, photos sorted in by time; official photographer (credited)
  and most-responded photos on top; a "your photos" tab from tags and small groups (no face
  recognition yet); guest wishes inside; live on the day, locked a few days later after the hosts
  rearrange.
- Before-event chat must be at least as comfortable as a WA group (fast, notifications, photos,
  voice notes), or people make a WA group and the "after" never happens.
- Big moments (weddings, reunions) pull new people; small ones (birthdays, trips, dinners) keep them.

### Where HTML matters

- Invites, albums and memory cards are programs shaped by the moment's theme. The theme market
  becomes a market for moment templates: digital-invite sellers now selling over WA sell here, and
  we take a cut.
- Profiles stay free websites: "your social profile is your portfolio". A "use this theme" button on
  every profile makes profiles spread; the theme maker gets credit and a share.
- Some themes unlock only through proof (UofT, Paris), which nothing else can sell.

### Growth and money

- Entry door: weddings in Indonesia (an existing paid market with no platform; one couple pulls
  hundreds). Product supports all moment types from day one.
- Links are the watermark: every moment link opened in WA shows "made with Smudge".
- Money: businesses and vendors pay for pages and tools (customer reach, AI receptionist, proven
  visit reports), people buy themes and templates, intent-based ads appear where people search for
  places. Feed stays intimate with few or no ads. Never paid verification; never sell or license
  people's data.
- Start as a complement to Instagram, not a rival; attention ads and an explore of strangers'
  programs come only once big.
- Rough best case (estimate, unchecked): about $10B a year, more if intent ads grow.

### Why others won't copy

- Instagram: uniform feed and ads; running other people's HTML is a security risk; a moment owned by
  hundreds is not its shape.
- WhatsApp can copy planning (it has group Events) but not the after: no profiles or timeline, and
  end-to-end encryption stops it arranging 300 guests' photos server-side. No places either. So the
  moat is after the event and the place; before the event must simply be good.
- Moments never ask anyone to leave WhatsApp: each is a new small group, so the move-together
  problem that stopped Telegram does not apply.

### Not doing

- Food delivery, being a bank or Stripe, store backend, pay-per-visit as the main billing.
- Replacing WhatsApp. Maximum potential is "where your friend circles live": groups from WhatsApp,
  memories from Instagram.

### Open

- Test one real wedding end to end: do guests sign up, upload photos, and create their own small
  moment within a month?
- Weddings are rare per person; small gatherings must count as moments for weekly return.
- HTML safety (hangs, login-look phishing, code moderation) and location data (no background
  tracking, store results only, per-action permission).
- ADR 0011 excludes lunar-calendar seasons (Ramadan, Eid); revisit if seasonal themes matter.

## 2. Bubble

### What it is

- Premise: everyone lives inside interest bubbles, and today those bubbles are invisible. You
  cannot see how big a bubble is, whether it is growing, where it is busy, or its mood, nor which
  bubbles you are in.
- Form: a nested feed like Reddit (bubbles inside bubbles), posting free like Reddit. The feed is
  what people open daily.
- The one thing that differs: a world map of bubbles. Size from people, color from mood, glow when
  growing; zoom follows the nesting (Games → Soulslike → Elden Ring). A private personal map shows
  which bubbles you are in, shareable like Wrapped.
- The map is a door, not a picture: tap a country to enter that country's feed of the bubble,
  auto-translated ("what Koreans think of this patch"), or jump to another bubble's view of the same
  thing (runners and sneakerheads on one shoe). Communities are split by language and app today
  (Reddit, X, 5ch, Bilibili, DC Inside); nowhere shows how the rest of the world talks about the
  same thing.
- One line: "See the world as bubbles, and find yours."

### Features on the map

- Trending counts real people, not posts, per bubble and per country, and measures change (growth,
  mood shift) rather than volume. Unlike Twitter, bots and news do not dominate.
- Country page: top songs, most played games, games made there, and its people's feed. Every chart
  is a door into the conversation.
- Live reaction: during a World Cup final, a big release or a patch, the map moves and you can enter
  any country's feed. This is the main puller.
- Bridges: bilingual people who explain context between two bubbles get known for it.
- Replay: a time slider showing how a bubble grew or how its mood changed.
- Context card: for a person or topic you keep hearing about but do not know, show which bubble it
  comes from, why it is known (explained from inside), a sourced timeline, and the bubble's mood.
  "TikTok gives the fragment, Bubble gives the whole picture."

### Prestige, gurus and booking

- A stamp matters only if it is hard, recognised by people (not just the system), and sits on a
  visible ladder. Model: the World Marathon Majors Six Star medal; Sydney's push to join shows
  issuers want into a good bracket because it sends people to them, which solves the issuer
  chicken-and-egg. We curate brackets; issuers pay to join.
- Few brackets: prestige only needs to be read inside its own bubble, so one Slam per bubble, only
  bubbles big and old enough earn one, and if more than about 1% finish, next year gets harder.
- Slam: a permanent name with contents renewed each year (like the Ballon d'Or), because games keep
  changing. Example: "Soulslike Slam 2026", the 4 hardest soulslikes of that year. Old Slams become
  veteran marks. Calendar: picks announced at the start of the year, chase during it, finishers at
  the end. Studios cannot pay to get in; picks by community or a fixed rule (lowest completion rate).
- What the holder gets: identity that travels (Bubble name, Smudge theme unlock, CV), a closed
  circle of holders, and the next rung. Holders are the "one person who pulls 1000".
- Radical layer, prestige as power rather than decoration:
  - Academy: holders pick next year's Slam and vote the bubble's awards ("Soulslike of the Year"
    by proven players, not journalists); winners put the laurel on their cover.
  - Belts that can be taken: each bubble has a belt holder per country, challengers can take it,
    and the map shows who holds what. Gives daily return.
  - Lineage: a title is granted by someone who holds it, their name stays on yours, and they share
    blame for cheating (as in jiu-jitsu).
  - Country against country: everyone's titles add to a national score; only matters with a real
    consequence (the top country hosts next year's Slam Invitational, like Eurovision). Otherwise a
    marketing moment, not the core.
  - Group titles: clubs and guilds chase a Slam together, a reason to invite friends.
- Guru: prestige for making others succeed. Bubble links advice to proven outcomes ("your tips
  helped 2,300 people beat Malenia"); others can only count likes.
- Booking: pay someone for a real-time consult or lesson, priced by legitimacy (proven results)
  more than fame. Unlike ADPList or Topmate, mentors are chosen by outcome, not self-filled
  profiles, and not only for careers. Likely Bubble's main money: a marketplace cut. The guru's
  outcome count only grows on sessions booked through Bubble, which keeps them from leaving to WA.
- Pay if it works: money held until the result is proven (sub-4 marathon on Strava), or a bounty
  board where gurus apply and are paid on success. Only possible where results are provable.
- AI from proven paths: an assistant trained on thousands of real journeys to success, answering
  from people in the same position who made it. Data grows with every success. Subscription; the AI
  covers the common path and can recommend a guru for the personal one.
- Money from Slams: a small season entry fee (tracking, race number, physical medal; finishing
  never bought, a free route stays) and a yearly Slam Invitational for finishers (broadcast,
  sponsors, tickets), like Boston qualifying.

### Moat and money

- The map can be copied; it is the marketing. The moat is people from many countries already in one
  place, which no regional platform gets by adding a feature.
- Money: official bubbles free; studios and brands pay for crowd and mood insight; countries
  (cultural agencies, tourism boards) and local game makers pay for an official country page, marked
  official and kept apart from people's posts.
- Verified by achievement started as a Smudge idea (theme unlocks). Bubble may use it to keep
  crowds real and weigh answers, but it is not the core.

### Open

- Prestige: lineage and belts need a form of challenge in bubbles without head-to-head (film,
  books); academy needs term limits and secret votes against cliques and bribes; booking cut-off
  for credit split between several gurus; pay-if-it-works needs clear targets and a guard against
  account boosting in games; AI data needs consent and aggregates only.
- Other ideas from the same talk, not yet placed: a proof wallet as its own product used by both
  Smudge and Bubble; reviews only from people who scanned in (overlaps Smudge businesses); a
  standalone context card as the cheapest test of Bubble's premise.
- Translation of community slang; cold start per country (start with 2 or 3 countries big in one
  bubble); outsiders flooding another country's feed (maybe read-only first).
- Context cards about real people: defamation risk, gossip drift, accuracy while a story is hot.
- Privacy: aggregates only, no slice under about 100 people, rough country only, personal map
  private by default.
- Chart data from Spotify or Steam may not be licensed; move to Bubble's own activity over time.
- Paid campaigns and state pages must be marked and kept out of trending.

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
