# 0040 — From the album to your profile and friends' feeds

Status: accepted.

## Context

Smudge has two layers. The moment is closed: its group, chat and album are for the people who
were there (ADR 0037 to 0039). Profiles and the feed are the social layer everyone knows. The
concept (`docs/concept.md`) joins them: photos in a moment go to its album, and the ones a person
picks go to their profile and their friends' feeds. Without that bridge the moment is a private
room with nothing coming out of it.

## Decision

- **Pick, then post as usual.** In the Album tab, **Posting ke profil** lets a member pick up to
  12 photos. They become a draft gallery post of their own, titled with the moment, which opens
  in the normal post editor (`/?postDraft=<id>`). The person writes a caption, changes the style
  or drops photos, and publishes. From there it is an ordinary post: on their profile, in their
  followers' feeds, and under the usual audience, privacy and moderation rules.
- **Only photos that are yours to share.** A member may pick photos they took and photos they
  are tagged in. A photo someone else took carries "Foto: <name>" in its caption. Picking someone
  else's untagged photo is refused (`NOT_YOURS`).
- **Copies, not links.** The picked photos are copied into the person's own images, so the post
  keeps working if the photo later leaves the album, and the album's files stay members-only.
- **The post names its moment.** Post metadata gains `gathering: {id, title}`, shown as "From
  <title>" on the post; it opens the moment, where members see the album and anyone else sees the
  invite or the thank-you. The label is checked when publishing: only a member of that moment may
  carry it, with the moment's own title (`NOT_A_MEMBER`), so nobody borrows a moment they were
  not in.

## Consequences

- The label says the author was in the moment's group, not that they came through the door; the
  memory card (ADR 0039) is what proves attendance.
- Removing a photo from the album does not remove it from posts already made from it; the person
  who posted it removes their post.
- People in a photo who are not tagged have no say beyond the existing report flow.
