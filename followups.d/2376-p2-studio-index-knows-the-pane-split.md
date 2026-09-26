---
origin: 2376
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2376
---

# the Studio's slide index does not know a panes slide splits

why now   — the engine renders a split panes slide (every panes slide on a square, portrait,
            story or mobile deck; a 16:9 one whose components fit neither way) as two slides,
            and the Studio counts it as one source chunk. After it, the caret and the rail
            are a slide apart, lint's `slide:` numbers stop matching the rendered ones, and the
            preview takes its alignment fallback (the shown slide alone). It fails closed.
where     — docs/src/components/studio/lint.ts (`slideRanges`, `slideIndexAt`), and the
            index mapping in StudioShell.tsx; lib/core/section-source-split.js.
done when — the Studio maps a rendered slide to its source chunk (and back) through a split
            panes slide, WITHOUT cutting `splitSlides`' chunks: they feed write-back
            (deck-ops.ts, motion-sheet.ts, compose deck-source.ts), which would write the cut
            into the author's source. `lintCore.paneSplitLine` is the split rule to use.
evidence  — decision note §6.8; the seventh checker's finding 4 on PR #2376.
verify    — a portrait deck with a panes slide mid-deck in the real Studio: caret on the
            slide after it selects the right rail slide, and narration still projects.
