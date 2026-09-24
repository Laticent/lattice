---
origin: 2326
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2326
---

# WebKit sizes the sequence and xychart `<svg>` box differently, so their labels drift low

why now   — The checker behind #2326 found it while re-measuring every mermaid deck
            in both engines. It is a different defect from the baseline one #2326
            fixes. The numbers are identical with and without that rule. In
            WebKit it moves labels up to 32px on a 1280x720 slide.
where     — `examples/universal-tokens-p2-structural.md`: the sequence `<svg>` is
            305 slide-px tall in Chromium and 275 in WebKit (same 1152 width, top
            207.6 vs 206.6), so every label drifts in proportion to its height
            (`messageText` 9.36 → 21.50px). The same pattern shows up in
            `examples/sequence-narration.md` (16 labels, 4.75 → 27.05px) and in
            `examples/xychart-narration.md` (18 labels). The diagram gallery does not
            show it. Start at the svg sizing rules in
            `lib/integrations/mermaid/mermaid.css` (`height:100% !important` inside a
            flex band) and mermaid's `useMaxWidth` inline `max-width`.
done when — `node tools/audit-svg-baselines.mjs --deck examples/sequence-narration.md`
            and the same on the other two decks each report 0 labels over 3px,
            and the Chromium goldens of all three still match.
evidence  — the audit's before/after tables, plus WebKit screenshots of one
            affected slide.
verify    — tier 1: it changes how a third-party SVG is sized in a shared band.
