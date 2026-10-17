---
origin: 2739
priority: P7
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2739
---

# Draw a Mermaid fence inside a blockquote or a deeply indented list item on the CLI, as the browser does

why now   — the #2739 red team found that `> ```mermaid` (a diagram in a quote) and a fence under `10. Tenth step` indented 4 spaces ship as highlighted source from the CLI (PDF and `--player`) while the Studio, the preview and the Webpage export draw them. Every later figure's `data-mmd-idx` and svg id then shift, so the two hosts' files part ways for an ordinary deck shape. In main before #2739 too.
where     — lib/core/mermaid-fences.js opens a fence only at 0–3 spaces of absolute indent with no `>` prefix; the engine (markdown-it) emits `language-mermaid` for these fences, so the runtime draws them. Repro deck shapes: a quoted fence followed by a plain one; a fence under a two-digit ordered item.
done when — the CLI bake finds the same fences markdown-it does (derive them from its tokens, or teach the walker blockquote prefixes and list-content indent), and docs/e2e/player-host-parity.spec.ts gains a deck with a quoted and a list-nested fence that passes byte for byte.
evidence  — the CLI PDF of such a deck shows both diagrams drawn, and the parity spec passes on it.
verify    — tier 1 checker; the CLI PDF of such decks changes, so it stops for the owner's export sign-off.
