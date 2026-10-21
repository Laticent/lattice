---
origin: 2789
priority: P3
recorded: 2026-10-20
area: website
severity: low
swimlane: docs/src/components/studio/preview-rect.ts
source: the preview-bar rework on #2826, 2026-10-20
---

# The Studio's pre-paint shell does not model the slide map

why now   — the slide map is remembered (`lattice-studio-map`), but the pre-paint shell (studio.astro seed, `PREVIEW_CHROME`) never reads it, so a returning user with the map on sees the shell's slide strip and full-width slide, then the map column (or row) arrives and the slide resizes. Since #2826 the map also REPLACES the slide strip outside Read, so the footer band changes height too. Pre-existing for the column; the strip half is new.
where     — docs/src/pages/studio.astro (the seed that publishes `--sh-ftr` / `--sh-pane-w`), docs/src/components/studio/preview-rect.ts, StudioChromeSkeleton.tsx.
done when — with `lattice-studio-map=1` stored, studio-instant-shell's slide-box comparison holds at 1440, 820 and 390.
evidence  — the spec run with the map stored on, before and after.
verify    — tier 1 checker; studio-shell-parity and studio-instant-shell green.
