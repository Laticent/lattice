---
origin: 2385
priority: P3
recorded: 2026-09-26
---

# Point-and-click editing of inline-code spans in Compose

why now   — The owner raised it on #2385. Many Lattice authors are not comfortable
            typing grammar like `:cylinder:c3` or `-label->`, and the owner expects
            older users to prefer Compose. A flowchart's styling lives almost
            entirely in inline-code spans, so without a picker those authors cannot
            style one.
where     — Compose (docs/src/lib/compose/, `code-commands.ts` and the rendered
            inline-code nodes); lib/core/flowchart-grammar.js as the source of the
            choices; the shared shadcn primitives in docs/src/components/ui/ (HARD
            RULE #15: extend them, do not fork a widget).
done when — Clicking an inline-code span in Compose opens a popup of choices for that
            context: on a flowchart shape, an outline (with aliases), a color slot,
            a status; on a connection, line style, heads and color. Picking one
            rewrites the span. The choices come from the grammar's tables. The
            popup is usable by keyboard and at large text sizes, with big targets,
            and works at 1440, 820 and 390 px (screenshot evidence at all three).
            It generalizes to other components' span words later without a redesign.
evidence  — The owner's review of #2385.
verify    — Compose in the built docs site, driven by hand and by e2e, at three widths.
