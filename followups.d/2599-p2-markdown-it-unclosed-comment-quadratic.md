---
origin: 2599
priority: P2
recorded: 2026-10-08
area: engine
severity: low
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
source: https://github.com/Laticent/lattice/pull/2599
---

# markdown-it parses a repeated unclosed `<!--` in quadratic time

why now   — a hostile deck stalls every path that parses author source with markdown-it: `'a <!--'`
            repeated to 120 KB takes about 2.9 s in `md.parse`, measured by #2599's third checker. The
            Export-to-Marp strip and refusal (`withRuntimeScripts`, `refusedHtml`) pay it, and so does
            any other markdown-it pass over author source. The time is markdown-it's inline comment
            scan, not Lattice code, and it predates #2599.
where     — markdown-it's `html_inline` rule over unclosed comments; Lattice callers that parse author
            source: lib/core/marp-bundle.js, lib/core/marp-bundle-html.js, lib/core/live-author-html.js,
            the engine.
done when — a 1 MB deck of repeated unclosed `<!--` parses in under a second on every path that takes
            author source, or a size guard refuses it first with a stated reason.
evidence  — a timing arm like live-author-html.test.js's, at 128 KB and 1 MB, before and after.
verify    — tier 0 gates; tier 1 if the fix patches or wraps markdown-it.
