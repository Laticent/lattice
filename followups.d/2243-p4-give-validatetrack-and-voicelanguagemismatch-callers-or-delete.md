---
origin: 2243
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2243#issuecomment-5757375213
---

# Give validateTrack() and voiceLanguageMismatch() callers, or delete them

Backfilled verbatim from the continuation brief on #2243 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open. Half done: `voiceLanguageMismatch` has its caller now (`NarrationExportOptions.tsx:118`). `validateTrack` still has none outside tests. Also carried from #2243's brief (its P5 file is deleted as done): NOT A CODE ITEM — someone needs to listen to one narrated deck end to end on the real Studio. No sandbox can do this, so a session with no human present must not claim it.

```text
  P4 · [no ticket] Give validateTrack() and voiceLanguageMismatch() callers, or delete them
       why now   — shipped code with no callers rots; voiceLanguageMismatch tree-shakes out
                   of the route today, so it costs nothing and does nothing.
       where     — docs/src/lib/cadenza/track.ts, docs/src/components/studio/tts-voice-catalog.ts.
                   The obvious homes are the caption export path (validate before writing a
                   .vtt) and the Studio voice picker (warn when the voice's language does not
                   match the deck's).
       done when — each is either wired to a real surface with a test that exercises it
                   there, or removed.
       evidence  — the warning rendered in the real Studio via tools/screenshot.js, or the
                   validation firing on a deliberately malformed track in a real export.
       verify    — tier 0 gates.
```
