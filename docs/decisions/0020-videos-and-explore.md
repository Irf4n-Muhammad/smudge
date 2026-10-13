# 0020 — Videos in posts and Explore

Status: accepted.

## Context

The owner worried that friends would find an empty app with little to do. Most of what people
share today is short video, and a new person needs somewhere to find posts before they follow
anyone.

## Decision

- **Videos are assets kept as files.** The record store rewrites its whole file on every change,
  so tens of megabytes inside it would slow every like. Videos keep the asset id and rules photos
  have, with their bytes beside the database.
- **No transcoding.** The app keeps no server-side media tools; the browser checks the file can
  play by grabbing a poster frame before upload. MP4 (H.264) plays everywhere; WebM and MOV play
  where the viewer's browser supports them. The limits are 30 MB and 3 minutes.
- **Streamed by ticket, not inlined.** Photos are inlined as data URLs, which would be far too
  large for video. The runtime origin streams a declared video only to a frame holding a valid
  ticket, so the sandbox, CSP and asset rules stay as they were.
- **Poster frame as the photo.** A video entry's photo is its poster, so covers, profile grids
  and share-link previews keep working with images only.
- **Explore and search.** Explore shows people you don't follow yet, liveliest first with a
  gentle age fade, so a quiet new account still has something to open. Search covers every
  visible post by title, caption and author; `#tags` are plain words in captions. Moments stay
  out: they are for the people who care.

## Consequences

- Hosting will need disk (or object storage) for videos; there is no cleanup of unused videos yet.
- Phones that record HEVC may produce files Chrome can't play; the editor says so and suggests MP4.
- The studio and MCP still upload photos only; videos come from the easy post editor.
