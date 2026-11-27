---
---

The agent pack's entry file, `/agents/start.md`, now fits in 1,500 tokens on Claude's count (1,460; it was about 19,000), and the layout reference it used to carry moved to `/agents/layouts.md`.

`start.md` keeps what a deck cannot be written without: a whole three-slide deck to copy, the short deck canon, the rules for the layouts it lists, the 19 common layouts, one modifier from each of three groups, the notes, and how to check and render. `layouts.md` has every layout, part, deck setting, inline notation and common skeleton, and `start.md` links the full canon. Both name the engine version they describe, as does `/llms.txt`, and every slide in the pack opens with a `<!-- @meta{layout=NAME} -->` record. The kit build fails when `start.md` passes 990 o200k tokens, which is 1,500 on Claude's count at the measured ratio. Decision `engineering/decisions/2026-11-17-agent-pack.md` §4.9.
