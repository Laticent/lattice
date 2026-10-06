---
origin: 2546
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-segno-unified-inline-notation.md
---

# The Studio's Compose editor still reads leading markers with its own regular expressions

why now   — Segno phase 3 moved every render-path and lint reader of list text onto the
            generated list-text grammar (lib/core/list-text-grammar.js). Decision 20 makes Segno
            Lattice's one parser. Five editor patterns are still built from
            MARKER_CLASS: they rewrite source rather than render it, so they were left out of the
            phase-3 swap and are recorded here instead.
where     — docs/src/lib/compose/table-commands.ts (CELL_MARKER, CELL_MARKER_BARE: `^\[(m)\]\s?`,
            one optional space, not `\s*`), docs/src/lib/compose/deck-markdown.ts
            (ESCAPED_LEADING_MARKER_RE, the `\[x\]` a serializer escapes), docs/src/lib/compose/
            deck-source.ts (a list line that leads with a marker, `[X]` included),
            docs/src/components/studio/ComposeView.tsx (CELL_MARKER_RE), and two tools
            that count inline `[m]` spans (tools/build-component-docs.js DECK_MARKER_SPAN_RE,
            tools/audit-capacity-basis.js STATE_MARKER_RE).
done when — each editor helper calls a rule of the list-text grammar (or a new one beside it), with
            its old outputs frozen first, as freeze-list-text.mjs did; or the note records why an
            editor rewrite is not a reader and stays a pattern.
evidence  — the frozen-oracle test extended to the new rules; the Compose editor's table and
            list commands driven on the real Studio (HARD RULE #23).
verify    — tier 1 maker-checker: editor-only, no render path.
