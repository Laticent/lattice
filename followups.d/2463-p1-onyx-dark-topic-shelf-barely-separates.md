---
origin: 2463
priority: P1
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2463
---

# onyx-dark: the topic shelf is nearly the band's color, so the lit tab has almost no edge

why now   — the lit tab (#2463) is marked by tone, and on onyx-dark the tab (#000000)
            and the shelf around it (#161616) measure 1.16:1. The white top bar and the
            label carry the mark there, so nothing is unreadable, but tone is the channel
            the tab was designed on. The gap predates #2463: it is the shelf's dark arm.
where     — lib/components/anchor/topic/topic.styles.css, `--_shelf-fill` (the dark arm,
            `color-mix(… var(--surface-inverse) 80%, var(--text-display))`). Onyx-dark's
            `--surface-inverse` is pure black, so an 80/20 mix lands at #161616-ish in the
            painted pixel. The shelf note above it records the band-vs-shelf spread per
            palette; re-measure it rather than trusting it.
done when — the tab-vs-shelf pixel contrast on onyx-dark is at least what indaco-dark
            gets (1.73:1) without dropping any other palette's band-vs-shelf spread.
evidence  — render examples/topic-layout-highlight.md once per theme and sample the tab
            and shelf pixels (the method in #2463's PR body); send the onyx-dark slide
            via SendUserFile.
verify    — tier 0 gates plus the 33-palette pixel sweep; a palette-wide token, so look at
            every dark palette, not only onyx-dark.
