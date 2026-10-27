---
origin: 2922
priority: P1
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/gotchas/studio-playground.md
source: https://github.com/Laticent/lattice/pull/2922
---

# Draw preview chips for the Tag color, Tag placement, Stamp shape, Tone shape and Delivery pickers

why now   — #2922 gave every geometry option in Settings a library icon and kept drawn chips
            for Lattice-only looks. These five lists are Lattice-only shapes with no preview at
            all, so they are now the bare rows in an otherwise illustrated panel.
where     — `docs/src/components/studio/option-glyphs.tsx` (add a drawn-chip axis per list,
            beside `imageInk`/`imageShape`); wire it in `StudioShell.tsx` (Card tags, Badges,
            Speech) and `SlideContext.tsx` (the per-slide card-tag picker). Stamp and tone
            values come from `lintVocab` (`stampStyles`, `toneStyles`), so the table must
            cover every word in it.
done when — each value of tag color (color/plain/none), tag placement (corner/foot/notch/
            band/inline), every stamp style, every tone style (rail/edge/glow), and delivery
            shows a 16px chip that mimics how that badge or tag actually renders, and
            `option-glyphs.test.tsx` covers those axes.
evidence  — the #2922 before/after shots: these five dropdowns are text-only.
verify    — open each dropdown in the real Studio at 1440 / 820 / 390 in light and dark, and
            compare each chip against the rendered badge on a slide.
