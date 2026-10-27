# 0038 — The day: a door QR and the live album

Status: accepted.

## Context

The work plan's third stage is the day itself. Two things tie the day to Smudge: knowing who
actually came (the earlier "I was there" of ADR 0029 was self-declared), and one album that every
guest fills, so the photos do not scatter across a hundred phones and WhatsApp groups. The owner
left open where photos are stored and how many a wedding of 300 to 1,000 guests produces.

## Decision

- **A QR at the door that changes every 30 seconds.** The host opens `/m/<id>/door` on a phone or
  tablet at the entrance. The code is an HMAC of the moment and the 30-second step under a secret
  kept in its own record (never in the invite); the current code and the two before it are
  accepted, so a scan takes up to 90 seconds. A photo of the QR sent to someone at home stops
  working within that time.
- **A scan becomes a pass, and signing in records arrival.** Scanning opens `/m/<id>?pintu=<code>`.
  The page trades the code for a pass at once (good for 12 hours) and keeps it in the tab, so a
  guest can sign in or make an account there without losing it. With an account, the pass records
  the arrival and makes them a member; they land on the album with a welcome. Arrivals show on the
  door screen, in the host's guest list, and as "Sudah datang" in the member list. They are what
  the memory card of the next stage will be built from.
- **Photos need an account and membership.** Any member adds photos from the Album tab. The server
  decodes each one, turns it upright, resizes it to at most 2048 pixels with a 480-pixel copy for
  the grid, and re-encodes it as JPEG. Re-encoding drops the file's metadata, so a guest's GPS
  position never reaches other guests; only the camera's time is read first. Files live beside
  the database, like videos (`moments/` in the data directory), and only members can open them.
- **Chapters come from the rundown.** A photo's time is the camera's (EXIF, local time at the
  venue), else the phone's time for the file, else the upload time in Jakarta time. On the day it
  goes under the last rundown item that started before it; before the day and after it get their
  own chapters.
- **Order within a chapter.** Photos by members the host names as photographers come first and are
  credited, then the most liked, then in time order. As decided in `docs/concept.md`, only the
  person who posted a photo sees how many liked it.
- **"Foto kamu"** holds the photos you posted, the ones you are tagged in, and the ones posted by
  people in your small groups. Whoever posts a photo tags anyone in the moment; anyone tags or
  untags themselves.
- **Wishes.** Each member leaves one wish (writing again replaces it), shown under the album.
- **Removal.** The poster or the host takes a photo down. Deleting an account removes its photos,
  likes, tags, wishes and arrivals; deleting a moment removes all of them and the door secret.
- **Limits.** 20 MB per upload, 300 photos per member and 5,000 per moment. Door scans and uploads
  allow 600 per 10 minutes per address, since a whole wedding can share the venue's Wi-Fi.

## Consequences

- Storage stays on the server's disk. At about 400 KB per photo plus its small copy, 5,000 photos
  are about 2 GB per wedding. Moving files to object storage is still the owner's decision; the
  service only needs a different place to write.
- The album is polled every ten seconds, like the chat; locking it after the day, rearranging and
  the thank-you page are the next stage.
- A guest can forward a scanned link within 90 seconds, or share a pass from the same tab. That is
  enough for a test wedding; a host who needs more can check people at the door.
- HEIC files that a browser does not convert are refused; phone browsers usually send JPEG.
- Photos do not go to profiles or friends' feeds yet; picking them comes with the memory card.
