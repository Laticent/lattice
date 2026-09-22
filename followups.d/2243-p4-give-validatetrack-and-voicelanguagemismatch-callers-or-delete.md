---
origin: 2243
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2243#issuecomment-5757375213
backfill: true
---

# Give validateTrack() and voiceLanguageMismatch() callers, or delete them

Backfilled verbatim from the continuation brief on #2243 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

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
