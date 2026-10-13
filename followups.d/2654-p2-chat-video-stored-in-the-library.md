---
origin: 2654
priority: P2
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md §3
source: https://github.com/Laticent/lattice/pull/2654
---

# A chat video should be a Library asset once the Library has a video shelf

why now   — #2654 attaches one clip of at most 15 seconds, held in memory for the turn it is sent, so
            it has no `asset:` name, cannot go on a slide, and is lost on reload (Regenerate says so).
where     — docs/src/components/studio/chat-photos.ts (`readChatVideo`, `heldVideos`) and the Library's
            video slice (slice 5 of the library-media-assets note).
done when — a chat clip is saved to the deck's shelf like a photo, shows in Library → Videos, survives a
            reload, and Regenerate re-sends it; `heldVideos` is gone.
evidence  — a Playwright run that attaches a clip, reloads, regenerates, and reads the request body.
verify    — tier 2; blocked on the Library's video slice.
