---
origin: 2794
priority: P7
recorded: 2026-10-20
area: website
severity: low
swimlane: lib/core/remote-ref.js
source: https://github.com/Laticent/lattice/pull/2794
---

# Cache or fast-path the web-reference scan of the stylesheet (and the sheet composition) that every first render pays

`remoteCssRefs` (lib/core/remote-ref.js) walks the composed stylesheet one character at a time, testing a regex per character,
to find web `url()` references (HARD RULE #22 territory: it feeds the frame's content-security policy). On the whole 931 KB
sheet it costs about 127 ms of self time in the first `renderDeck`, and the engine's stylesheet composition costs another
112 ms in the first `engine.render`; both scale with the sheet. The base sheet is ours and identical on every render, so a
result keyed by the sheet text, or an `indexOf`-driven scan that skips to `url(` and `"`/`'`, returns the same answer in
a few milliseconds.

why now   — about 240 ms of a 1.4 s first slide on the default (whole-sheet) path, independent of the style loader.
where     — lib/core/remote-ref.js (`remoteCssRefs`, `webRefsInCss`), its callers in docs/src/playground/deck-render.js and deck-preview.js; lib/themes (`cssFor` composition).
done when — `renderDeck` for `examples/focus.md` on the whole sheet drops by at least 100 ms in the same-machine measurement used in the decision note §11, and a test pins that the fast path returns exactly the references the tokenizer does on the sheet and on adversarial inputs (escaped `u\72l(`, a comment inside a string, a `)` inside a string).
evidence  — before and after timings; the equivalence test.
verify    — tier 2 (a security-adjacent scanner: the adversarial trio, HARD RULE #25).

status    — scan fast path built (122 to 10 ms cold, 73 to 2-8 ms warm); equivalence + linear-time test test/unit/core/remote-css-refs-equivalence.test.js; the adversarial trio found a quadratic digit-run cliff, fixed. Sheet composition (112 ms) not touched.
