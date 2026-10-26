# 0043 — Programs between people: the quiz and the cat

Status: accepted.

## Context

Stage 3 of the work order ("Program antar orang") is where the page stops being only yours.
The concept's one line for the product is "pages that run programs, and programs that connect
people". The Wall (notes from friends) and the relay drawing already exist as page capabilities
and are the guestbook and the trace wall the stage asks for. Two more were named as the first
programs between people: a quiz, "how well do you know me?", and a cat that friends keep fed.
The stage also asks for one sandbox per program with CPU and memory budgets and coarse, visible
permissions; this ADR covers the programs and the permissions, and says what is left.

## Decision

- **State belongs to the owner, not to the page.** `ProgramService`
  (`packages/core/src/programs.ts`) keeps the quiz (questions with answers) and the cat's feeds
  by owner id. A new design keeps both; deleting the account erases both, and a person's own
  answers and feeds on other pages with it.
- **The quiz.** The owner writes 1 to 10 questions with 2 to 4 options each in the easy editor
  (`PUT /api/me/quiz`); the answers never leave the server in a read. Friends answer through the
  page (`quiz.read`, `quiz.answer`): a score, which options were right, and a board of the best
  ten. The owner cannot score on their own quiz, a retake replaces the earlier result, and
  saving new questions starts the board over.
- **The cat.** It lives on the page with a name from the settings; its mood is the attention it
  got in the last day: hungry (nobody), fine (one or two), purring (three or more). Anyone who
  may see the owner's posts may feed it once a day (`cat.read`, `cat.feed`); the page says who
  fed it today. Nothing is bought, nothing dies.
- **Coarse, visible permissions.** A section grants exactly its own capabilities and only while
  it is on the page: `wall` → `profile.wall.*`, `quiz` → `quiz.*`, `cat` → `cat.*`. Taking the
  section off takes the grant away, so the manifest's capability list is a human-readable
  account of what the page can do. The profile manifest now allows up to 12 grants (was 9), so
  all three can be on at once.
- **Reads for guests, writes for people.** A share link shows the quiz's board and the cat's
  mood; answering and feeding need an account, and go through the same block and privacy rules
  as the Wall.

## Not in this stage

- **One sandbox per program with budgets.** All sections of a page still run in the page's
  single iframe (ADR 0002); a runaway quiz could stall the cat. Per-program iframes with
  `allow-scripts` only, a size cap and a request budget per program are the next step on the
  runtime, after the second program written by someone outside the team exists.
- **Shared pages** (a couple, a trip, a class) are not here; sides (ADR 0027) remain the basis.

## Consequences

- The Paint wall template is at `smudge:v5`; older copies refresh their shared files on the
  next easy-editor save and gain the two sections in the section sheet.
- The in-page SDK gains `forma.quiz` and `forma.cat`, so other templates and mods can draw the
  same programs their own way; the server is the only place the rules live.
