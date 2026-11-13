---
origin: 2988
priority: P3
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §22
deferred: off-path — the squeeze is on 16:9 laptop slides, which #2988's venues do not touch; the fix (a floor on the lede track) changes every deck's masthead and owes its own golden review
source: https://github.com/Laticent/lattice/pull/2988
---

# A long `meta:` squeezes the masthead title on 16:9 slides

why now   — The masthead band is `[masthead-lede] 1fr [masthead-bay] auto`, and nothing stops the `auto` bay
            from taking most of the band. #2988 found it at square phone, where it left the title 0px wide,
            and fixed that surface by stacking the band (§22). The same squeeze happens at 16:9 laptop on
            `main`: `mermaid-engine-fences` gives the title 29% of the band, `mermaid-motion` 38%,
            `mermaid-tilde-fences` 40%, beside their long meta lines.
where     — lib/forms/cell/masthead/masthead.css (`grid-template-columns`), lib/forms/tile/meta/meta.css
fix       — a floor on the lede track, e.g. `[masthead-lede] minmax(50%, 1fr) [masthead-bay] auto`, so the
            meta wraps in its own column; measure the golden diff across every 16:9 gallery first.
done when — no 16:9 example's masthead title gets under half the band (the probe in §22 reports none).
