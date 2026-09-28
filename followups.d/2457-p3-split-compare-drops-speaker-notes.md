---
origin: 2457
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# split-compare: the string path drops the slide's speaker notes

Found by the checker on the split-compare stray-block fix. Pre-existing. At the point the split
kernel runs, a speaker note is still a raw `<!-- … -->` inside the section, and
`lib/core/split-panels.js` `applyCompare` rebuilds the section from its slots, so every comment is
discarded. `extractSlideNotes` / `extractSlideCaptions` then return null for split-compare slides:
`examples/studio-present.md` and `examples/stage-console-split.md` each carry a `<!-- note: … -->`
on a split-compare slide that never reaches the export. The same drop disarms the gallery's
`<!-- stress-slide -->` opt-out on split-compare. The fix is one line (keep comments in the
unclaimed blocks), but it writes note annotations into exported PDFs, so it needs the owner's
export sign-off with dark and light renders (CLAUDE.md QUALITY BAR).

```text
  P3 · split-compare speaker notes never reach the export
       why now   — author notes silently lost on a whole layout; the stress-slide opt-out is dead there.
       where     — lib/core/split-panels.js applyCompare (the comment strip on `unclaimed`).
       done when — notes on a split-compare slide export like any other slide's, with a unit arm.
       evidence  — the notes extracted from studio-present.md before and after; the rebuilt PDFs.
       verify    — tier 1 + export sign-off (dark and light).
```
