---
origin: 2875
priority: P1
recorded: 2026-10-23
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7b
source: https://github.com/Laticent/lattice/pull/2875
---

# Compose: Shift+Enter writes one new line; one kind of line break inside; the rule in the authoring guide

why now   — the owner settled the model on #2875: one new line in the text is a new line on the slide (no gap), a blank line is a new paragraph (a gap). Compose's Enter already writes a paragraph; no key writes a single new line, so an author cannot add a line without editing the source.
where     — docs/src/lib/compose (the Compose keymap, `hard_break` with `soft`), the authoring guide (design/skill.md or lib/base/base.docs.md).
done when — Shift+Enter in Compose inserts a line break that writes back as one plain new line; Enter still makes a paragraph; the rule is in the authoring guide in plain words.
evidence  — an e2e spec on desktop, gecko and webkit-tablet typing Shift+Enter and reading the saved source.
verify    — tier 1 checker, because it changes the editor keymap every author uses.
