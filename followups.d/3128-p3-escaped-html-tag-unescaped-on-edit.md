---
origin: 3128
priority: P3
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-10-compose-first.md §6
deferred: off-path — the canonical serializer never escaped `<`, on main as well; #3128 only made Compose keep an untouched `\<` line as written
source: https://github.com/Laticent/lattice/pull/3128
---

# An escaped HTML tag becomes live HTML when its line is edited in Compose

why now   — Compose parses with `html: false`, so `A \<b>x\</b>` (literal text in the engine, which renders HTML) and
            `A <b>x</b>` (live bold) read the same to it. The serializer never escapes `<`, so editing a line written
            `\<tag>` writes `<tag>`, and the export renders it as HTML. Found by the checker on #3128's faithful
            write-back, which keeps such a line as written while it is untouched but cannot keep its escape once
            the line itself is edited.
where     — docs/src/lib/compose/deck-markdown.ts (the text serializer's escaping) and deck-source.ts
            `LOSSY_CONSTRUCTS` (where `\$` already locks a slide for the same reason).
done when — a `\<` the author wrote survives an edit of its line (escape `<` that opens a tag, or lock the slide as
            `\$` does), and a deck-fidelity case pins it.
evidence  — a unit case: edit a word on `A \<b>x\</b> here.`; the deck still holds `\<b>`.
verify    — deck-fidelity.test.ts and the engine render of the edited deck (no `<b>` element).
