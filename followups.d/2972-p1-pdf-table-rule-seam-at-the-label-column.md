---
origin: 2972
priority: P1
recorded: 2026-10-29
area: engine
severity: low
swimlane: engineering/pipeline.md
deferred: off-path — the CLI PDF export pipeline, which this PR does not touch; the seam is on main's committed PDFs
---

# A table's row rule prints soft under the label column and crisp under the tinted cells

why now   — Found while reviewing `examples/checks.md` slide 4 (obligation-matrix `pills`) for PR #2972. At a
            normal zoom the rule above a zebra-tinted row reads as a step where the label column ends.
where     — The CLI's PDF output (`node dist/lattice.js deck.md out.pdf`). At 300 dpi the rule under an untinted
            cell is a 5-pixel anti-aliased band (225/189/152/165/202), and under a tinted cell a crisp 3-pixel
            line (141). obligation-matrix's zebra (`tbody tr:nth-child(odd) td:not(:first-child)`) tints every cell
            but the first, so one rule mixes the two.
evidence  — main's committed `lib/components/legal/legal.gallery.light.pdf` slide 18 shows the same step under its
            HIPAA row, so it predates #2972. The screen render is continuous (Chromium, 3× DPR). Chromium's own
            `page.pdf()` of the same exported HTML prints every segment as the same crisp 141 line, with or
            without `background-clip: padding-box` on the tint. So the CLI pipeline is the variable, not the CSS.
            A plain `table` slide with no zebra prints soft and EVEN, so no seam shows there.
done when — The CLI's PDF prints a table rule with one weight across all of its cells, on obligation-matrix and
            on any table with a partial row tint.
verify    — Render `examples/checks.md` with the CLI, `pdftoppm -r 300 -f 4 -l 4`, and read one rule's pixel
            column at x = 12% and x = 60% of the page width: the two profiles match.
