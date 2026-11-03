---
origin: 3024
priority: P3
recorded: 2026-11-03
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: large — a change to css-ref-grammar.js's `urlBody` and the reader, which every cssRefSpans consumer reads, so it owes its own differential against the frozen tokenizer
source: https://github.com/Laticent/lattice/pull/3024
---

# Three url() spellings Chromium fetches that cssRefSpans reports as a plain string

what      — The red team of #3024 found three, in Chromium 153, from a `style` attribute and a `<style>` body:
            1. a quoted `url("a.png" foo)` with a modifier (`crossorigin(…)`, `referrerpolicy(…)`) or a comment before `)`;
            2. a quoted `url("a.png` that the end of the text closes;
            3. a string that reaches `image-set()` through a custom property (`--a:"a.png"` then `image-set(var(--a))`).
            `cssRefSpans` reports each as a string span, not a url, so the embedders (the CLI export, the Studio's
            Webpage export) leave the picture out and, for a local file, ship its path. The refusal side treats every
            string as an address, so nothing is fetched that a refusal should stop.
done when — 1 and 2 are url spans (or carry a fact the embedders read); 3 is decided as a policy (embed every closed
            string that names a local picture, or document the gap).
evidence  — the css-ref-spans differential with the change explained, and the inliner's Chromium oracle with the three
            shapes in its soups.
verify    — tier 2: the reader decides what the exports read off disk.
