---
origin: 2599
priority: P2
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
source: https://github.com/Laticent/lattice/pull/2599
---

# Export-to-Marp still loses the runtime when a deck ends in an open code fence or deep foreign content

```text
  P2 · [no ticket] close an open fence, and deeper SVG/MathML nesting, over the bundle trailer
       why now   — the 2026-10-27 hostile-tail red team (after the sweep in decision note 2026-08-17 §13)
                   found three availability gaps left. None runs script or loads an unlisted resource.
                     - A code fence left open on the last slide (``` / ~~~html / four backticks, no
                       closer): data-lattice-runtime stays null and the last slide SHOWS the guard,
                       the markdownlint comment, the three <script src> lines and the JSON blocks as
                       code text. Already broken before the sweep. The guard closes HTML blocks only.
                     - Three or more nested <svg> (or four <math>) in a block that opens with a
                       <div>: each trailer line is its own html_block and gets one closer, so
                       Mermaid, then dagre, then the runtime come out as SVG <script> elements.
                       Seven nested <svg> lines: runtime null. (Inside a paragraph the </p> breaks
                       out, which hides this from a paragraph-shaped sweep.)
                     - An <iframe> left open MID-deck swallows every later slide as raw text; a
                       <title> gets an export warning (unclosedTitle), an <iframe> gets none.
       where     — lib/core/marp-bundle-html.js (latticeBundle: the closer; refusedHtml/unclosedTitle
                   for the warning), lib/core/marp-bundle.js (RUNTIME_SCRIPTS; the producer could
                   append a fence closer sized to the open fence it finds with markdown-it).
       done when — each shape has an arm in test/integration/export/marp-bundle-author-script.test.js
                   that fails before the fix; the harness counts mermaid/dagre scripts, not only
                   data-lattice-runtime.
       evidence  — the failing-then-passing arms.
       verify    — tier 1 checker.
```
