---
origin: 2739
priority: P8
recorded: 2026-10-17
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2739
---

# Re-suffix the ids of a diagram the Read·Article projection copies out of a blockquote

why now   — the #2739 red team found a Studio Webpage export of a deck with a Mermaid diagram inside a blockquote carrying `id="lattice-mmd-1"` and every inner id (markers, drop shadow, gradient) twice: the article copy of a NESTED figure is not re-suffixed, while a top-level one gets `-a` correctly. The copies are identical, so nothing visible breaks yet, but the document is invalid HTML and a reference can resolve against the wrong copy.
where     — the prose projection's figure re-hosting in lib/export/player-core.mjs (the `-a` suffixing of a copied figure's ids) and lib/transformers/prose-projection.
done when — no id appears twice in the exported player for a deck with a blockquoted diagram, asserted by a unit test on the projection.
evidence  — a duplicate-id scan of the exported file, before and after.
verify    — tier 1 checker.
