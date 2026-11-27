---
---

The agent pack's entry file, `/agents/start.md`, is now about 1,300 tokens instead of 12,300, and the layout reference it used to carry moved to `/agents/layouts.md`.

`start.md` keeps what a deck cannot be written without: a whole three-slide deck to copy, the short deck canon, the rules, the 19 common layouts, three modifier groups, the notes, and how to check and render. `layouts.md` has every layout, part, deck setting, inline notation and common skeleton, and `start.md` links the full canon. Both name the engine version they describe, as does `/llms.txt`, and every slide in the pack opens with a `<!-- @meta{layout=NAME} -->` record. The kit build fails when `start.md` passes 1,300 o200k tokens (the owner's 1,500, less a margin for other tokenizers). Decision `engineering/decisions/2026-11-17-agent-pack.md` §4.9.
