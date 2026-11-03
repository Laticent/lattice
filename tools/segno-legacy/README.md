# `tools/segno-legacy/` — the inline-code kernels as they were before Segno phase 2

Frozen, verbatim copies (taken from `main` at the commit before Segno phase 2 started; only
`require` paths adjusted) of the three hand-written inline-code kernels the parser bake-off
measured (`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

One tool reads them, and nothing in `lib/` may: **`tools/parser-bakeoff/`**. The bake-off
measured six parser libraries against these kernels (`2026-09-28-parser-library-bakeoff.md`);
pointing it here keeps its published numbers reproducible.

`flowchart-row.js` joined them at Segno phase 3b: `readArrow` and `splitRow` as they were at
a4fb527, before the generated row parser replaced them. The bake-off's flow arm times it as the
incumbent, and `tools/parser-bakeoff/freeze-flow-rows.mjs` reads it to (re)write the oracle in
`test/unit/tools/fixtures/flow-rows.frozen.json`. The unit test reads that fixture, not this file.

Do not fix bugs here: a fix would change what the bake-off measured. Each file is deleted when
nothing reads it.

`css-ref-spans.js` joined at Segno R2: `cssRefSpans` and its helpers as they were at 242de4a, before the
generated CSS parser replaced the tokenizer. `test/unit/core/css-ref-spans-differential.test.js` and
`tools/check-css-ref-spans.mjs` read it as the oracle; nothing in `lib/` may.

`scan-html.js` joined at Segno R3: `scanHtml` and its helpers as they were at e6c3a4a, before R3's work fixed
the hand-written scanner and replaced it with the generated HTML reader. `test/unit/core/html-ref-differential.test.js`
and `tools/check-html-ref-spans.mjs` read it to show the live fixes only add `risky`; nothing in `lib/` may.

`scan-html-fixed.js` joined when R3 was switched on: the hand-written `scanHtml` at 065bbfe, with the six fixes R3's
work found. It is the oracle R3 is held to, read by the same test and tool.

`gallery-elements.js` joined at Segno R4 (the gallery gate): the CLI gate's parse5 reader as it was at 96f3c3a, before
both gates moved onto `remote-ref.js` `remoteRefsInHtml`. `test/unit/core/gallery-html-differential.test.js` reads it as the
oracle; nothing in `lib/` may.

`inline-url-media.mjs` joined at Segno R4 (the export): `lib/export/inline-url-media.mjs` as it was at 3555b79 (with
`lib/core/data-uri.js`'s two functions inlined, so it adds no consumer to `lib/core`), before
its regex walker was replaced by `remote-ref.js` `scanHtml` and `cssRefSpans`. `test/unit/export/inline-url-media-differential.test.js`
reads it as the oracle and as a failing arm; nothing in `lib/` may.

`poster-in-style.js` joined at Segno R4 (the narrator): the regex `lib/transformers/prose-projection.mjs` read a video
embed's poster with, at c0cbc52, before `posterInStyle` read the style with `cssRefSpans`.
`test/unit/transformers/prose-projection-poster.test.js` reads it as the oracle and as a failing arm; nothing in `lib/` may.
