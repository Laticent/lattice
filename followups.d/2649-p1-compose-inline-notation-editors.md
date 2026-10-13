---
origin: 2649
priority: P1
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-07-18-compose-prosemirror.md
source: https://github.com/Laticent/lattice/pull/2649
---

# Compose shows pills, sparks and avatars as raw code; non-technical authors need point-and-click editors for them

```text
  P1 · [no ticket] Inline notation editors for Compose (pill, spark, avatar), then a chart series grid and a diagram outline builder
       why now   — The audit of Compose (#2649) found that `{SHIPPED, c2}`, `~{12 14 17, end}` and `!{Ada Okafor, hair=coily}` render as uppercase monospace text with no preview, and authors are non-technical and do not want to type notation. All three share one grammar (the Segno inline notation, engineering/decisions/2026-09-28-segno-unified-inline-notation.md), so one editor host with a per-kind panel covers them. Chart data (`- EMEA \`4.2\``) and Mermaid diagrams are the same problem in a bigger form.
       where     — docs/src/components/studio/ComposeView.tsx (one shared popover host, the code-fence language chip is the precedent), a view-only chip or node view so each notation has something to click, a notation registry whose parsers come from the engine's own grammar (lib/plugins/grammar.generated.mjs), and the table editing precedent engineering/decisions/2026-07-19-compose-table-editing.md.
       done when — a decision note exists and is agreed (the shared host, the lossless round trip that keeps unknown words verbatim, the "edit as text" escape, mobile as a sheet), then the pill editor ships first, followed by the spark editor sharing the number field with a chart series grid, the avatar designer, and the diagram outline builder; each ships behind a round-trip test over real gallery notation.
       evidence  — per widget, a real Studio run at 1440 / 820 / 390 via tools/screenshot.js with the popover open, plus a round-trip fixture suite built from the shipped galleries.
       verify    — tier 1 checker on the decision note and on the shared round-trip kernel (it rewrites deck source); tier 0 for each widget's panel.
```
