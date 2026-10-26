---
status: shipped
summary: >
  #1958, triaged against main at d5394cb by running CodeQL 2.27.3's javascript-code-scanning suite
  locally, because the code-scanning alerts API returns 403 to this repo's integration token. 53
  results today (the issue counted 34 when it was filed). 26 sit in shipped code (lib/, docs/src):
  12 are fixed (3 defects a deck or user can reach, plus 9 one-pass tag strips with no live
  exploit), 5 are hardened at no byte cost, and 9 are false positives with a written reason. The other 27 are in tests, fixtures and dev scripts and are
  listed for dismissal. Answers followup 2307: lib/authoring/lint-core.js has no alert, and
  js/bad-tag-filter has 5 hits tree-wide.
---

# CodeQL triage, 2026-10-26 (#1958)

## 1. How the alerts were read

The alerts API (`GET /repos/Laticent/lattice/code-scanning/alerts`) answers 403 "Resource not
accessible by integration" to this session's token, and so does the Dependabot alerts API. So the
list below is CodeQL itself, not the dashboard: CodeQL CLI 2.27.3 (`codeql-bundle-linux64`, the
release default setup uses), `database create --language=javascript-typescript` over a clean
`git archive` of `main` at `d5394cb` (no `dist/`, no `node_modules`, as CI checks it out), then
`database analyze` with `javascript-code-scanning.qls`, the default setup's suite.

**UNVERIFIED:** that the dashboard shows exactly these 53. GitHub's analysis may run a different
CodeQL version, and its UI hides alerts it classifies as test code by default, which is one
likely reason the issue counted 34. Someone with `security_events` access should compare the
dashboard against §3 and dismiss the false positives there with the reasons given.

## 2. Shipped code: fixed, hardened, or a false positive

"Fixed" means a defect a deck or a user can reach, with a regression test. "Hardened" means the
alert's shape is real but the input cannot reach it today; it is fixed anyway because the fix is
byte-identical for real input. "False positive" means the query matched something that is not a
sanitizer or not fed by untrusted input.

| Alert | Location | Verdict | What changed |
|---|---|---|---|
| js/polynomial-redos | lib/engine/index.js `stripDebugAttrs` | **Fixed** | `\s+data-debug` rescanned each whitespace run from every position: 1,142 ms on 60k spaces, 0 ms after. `(?<!\s)` starts each match at the start of a run. Exported and pinned at 200k spaces. |
| js/double-escaping | lib/components/chart/_chart-family/mark-detail.js:168 | **Fixed** | Decoded `&amp;` before `&lt;`, so an author's literal `&lt;` became `<` in the speaker note. `&amp;` now decodes last. |
| js/incomplete-sanitization | docs/src/playground/deck-config.js:358 | **Fixed** | `quoteIfNeeded` escaped `"` but not `\`, so a value ending in `\` swallowed its closing quote. The engine reads a quoted span raw (`frontMatterScalar`), so escaping would show `\\` on the slide. A value holding `\` or `"` is now single-quoted, which both readers take literally; one that also holds `'` is double-quoted raw, as before. Ordinary values are written as before. A value holding both `'` and `"` has no form both readers take and keeps the old escape. |
| js/incomplete-multi-character-sanitization | svg-legend.js:98, journey.transform.js:147, map.transform.js:81, word-cloud.transform.js:256 and :434, qr-card.js:30, bg-image.js:240, carousel.js:391, markdown-it/plugins.js:1902 | **Fixed (9)** | One-pass `<[^>]+>` label strips. Their input is markdown-it HTML the author already controls, and the boundary is the sanitizer downstream (HARD RULE #22), so none is a live hole; no input was found where one pass leaves a whole tag. All nine now call `removeTags` (lib/core/plain-text.js), the fixed-point strip `plain-text.js` already used, which is byte-identical on well-formed input. |
| js/incomplete-multi-character-sanitization | docs/src/components/studio/present/rehearsal.js:91 | **Hardened** | Comment strip for a rehearsal title, read as text. Now repeats to a fixed point. |
| js/incomplete-sanitization | lib/layout/gate.js:271 and :443, lib/layout/ai.js:785, lib/plugins/mermaid/mermaid.highlight.js:157 | **Hardened (4)** | Regex escapes that escaped only `-`. The names are `NAME_RE`-checked and the mermaid list is a constant, so nothing else could occur; all four now escape every metacharacter. |
| js/incomplete-multi-character-sanitization | lib/engine/directives.js:102 | False positive | `parseCommentDirectives` extracts directives and keeps every other comment by design. It is not a sanitizer and its result is not markup that a leftover `<!--` could open. |
| js/bad-tag-filter | docs/src/playground/editor.js:80, :81 | False positive | Mermaid arrow tokenizers (`-->`, `--x`) in the editor's highlighter. Not an HTML filter. |
| js/bad-tag-filter | docs/src/playground/slide-context.js:354, :367 | False positive | "Is this line a directive comment?" tests for the editor's skeleton insert. Not a filter; a missed comment only means the insert treats the line as content. |
| js/xss-through-dom | docs/src/lib/ensure-hljs-language.ts:134, ensure-katex.ts:45, load-engine.ts:96 | False positive | Script URLs derived from the engine script's own `src` or a build-time option (`engineBase()`, `plainPath`). Deck content renders in the preview frame and cannot reach these nodes. |
| js/xss-through-dom | docs/src/playground/specimen.js:218 | False positive | `data.playgroundUrl` comes from the build-time `#specimen-data` JSON island, not from a deck or the URL. |

The regression arms are `test/unit/core/codeql-1958-sanitizers.test.js` and
`docs/src/playground/deck-config.quote.test.ts`. The decode-order, linear-time and quoting arms
fail against `main`.

## 3. Tests, fixtures and dev scripts: dismiss as "used in tests"

None of these runs on deck input in a shipped surface.

- js/polynomial-redos (19): test/unit/components/heatmap.test.js (3), map.test.js (2),
  quadrant.test.js (13), word-cloud.test.js (1). Each runs a fixed regex over a fixture the test
  renders itself.
- js/incomplete-multi-character-sanitization: test/unit/export/pptx-export.test.js:121.
- js/incomplete-sanitization: test/unit/tokens/shadcn-bridge.test.js:155.
- js/incomplete-url-substring-sanitization: test/unit/core/chart-narration.test.js:135.
- js/identity-replacement: test/unit/transform-dsl/interpret.test.js:71.
- js/bad-tag-filter: docs/src/components/studio/slide-directives.test.ts:95.
- js/bad-code-sanitization: test/fixtures/npm-plugin-canary.js:173. A deliberately hostile
  fixture for the npm-plugin canary.
- js/path-injection: docs/scripts/check-overflow.mjs:108, docs/scripts/check-preview-render.mjs:52.
  Developer scripts whose "user input" is their own command line.

## 4. Followup 2307: the lint-core alert

#2307's changelog said it removed "the spanning tag regex CodeQL's bad-tag-filter query flags" in
`lib/authoring/lint-core.js`. On `main` at `d5394cb` CodeQL reports **no** alert of any kind on
that file. `js/bad-tag-filter` has **5** hits tree-wide: `docs/src/playground/editor.js:80` and
`:81`, `docs/src/playground/slide-context.js:354` and `:367` (false positives, §2), and
`docs/src/components/studio/slide-directives.test.ts:95` (test, §3). The claim holds for this
CodeQL run; whether the dashboard shows the alert as closed is the same UNVERIFIED as §1.

## 5. After this branch

The same suite over this branch's tree reports **37** (from 53). All 17 alerts §2 marks fixed or
hardened are gone, and nothing else moved, except one new alert:

- **js/bad-tag-filter at lib/authoring/notes-core.js (`HTML_BLOCK_ENDS`)**, from #2012's rewrite of
  the code mask. False positive: these are markdown-it's own HTML-block end conditions copied
  verbatim (`/<\/(?:script|pre|style|textarea)>/i` and its neighbors), and the mask must agree
  with markdown-it, not with a browser. Widening one to match more (a `</script >` with a space)
  would end the block earlier than markdown-it does, open a fence markdown-it reads as raw HTML,
  and hide a real note from `--strip-notes`, which is the leak direction. Dismiss with that reason.

The remaining 36 are the 9 false positives in §2 and the 27 test, fixture and script alerts in §3.

GitHub's own CodeQL run on the PR flagged one more, which the local run above predates: the
last branch of `quoteIfNeeded` (a value holding `'` together with `"` or a trailing `\`)
escaped `"` but not `\`, so `it's C:\` still swallowed its closing quote. It now escapes
both; a regression arm in `deck-config.quote.test.ts` fails without it.
