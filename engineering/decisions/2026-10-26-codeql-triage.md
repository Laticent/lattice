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

## 6. Re-check, 2026-11-06

The release audit asked again for the 6 escaping and sanitizing findings #1958 names (the 4
js/incomplete-sanitization regex escapes and the 2 multi-character sanitization ones). All 6 still
stand as §2 left them on `main` at `dd1fb87`:

| Finding | Now |
|---|---|
| lib/layout/gate.js `escapeRe` (×2 uses), lib/layout/ai.js:785, lib/plugins/mermaid/mermaid.highlight.js:157 | Full-metacharacter escape. A new arm in `test/unit/core/codeql-1958-sanitizers.test.js` fails if any of the three loses it. |
| lib/engine/directives.js (comment directive parse) | False positive, §2. |
| lib/integrations/markdown-it/plugins.js `firstChar` | Goes through `removeTags` (fixed point); the existing removeTags arm covers it. |

**UNVERIFIED:** a CodeQL run before and after. The CLI could not be fetched this time (the
session proxy answers 403 for github.com release downloads), and the alerts API still answers 403.
The PR's own CodeQL check reports only new alerts. Dismissing the §2 and §3 false positives on the
dashboard still needs someone with `security_events` access.


## 7. Owner policy, 2026-11-08: fix, do not dismiss

The owner ruled that **a CodeQL alert is not dismissed unless there is an extraordinary reason,
with evidence.** "Used in tests", "dev script" and "false positive" are not enough on their own.
So the §2 false positives and the §3 test, fixture and script alerts are **not** a dismissal
checklist any more: each one is fixed in code, the way §2's real findings were. A test's regex
is rewritten to a linear form or replaced by a parser; a fixture that must stay hostile is the
one shape that can argue for an exception, and then only with the evidence written here.

A re-check on 2026-11-08 (PR #3084, from the `CodeQL` check on every PR merged since
2026-10-25) found no new JavaScript alerts; the remaining count is about 35 (inferred, the alerts
API is still 403 for agents). The work is `followups.d/1958-p2-fix-not-dismiss-codeql.md`.

### 7.1 Done, 2026-11-13 (D2, security pre-GA pass)

Every JavaScript alert in §2, §3 and §5 is now fixed in code except the one fixture exception
below. The alerts API is still 403 for an agent token and the CodeQL CLI could not be fetched
(the release download is blocked), so the before/after is read from each file rather than a dashboard
diff; the PR's own `CodeQL` check confirms the branch adds no new alert. How each class was fixed,
so the fix survives a reviewer who cannot see the dashboard either:

- **notes-core `HTML_BLOCK_ENDS` (§5), js/bad-tag-filter.** The `/<\/(script|pre|style|textarea)>/i`
  end test became `hasRawTextCloser` — an ASCII case fold, then a substring search for each of the
  four closers — keeping byte-for-byte agreement with markdown-it. A differential test parses 11
  openers × 28 probes with markdown-it and holds the mask to its answer, so the rule still cannot
  end a block earlier than markdown-it does (the leak direction). The `<!X` declaration start
  follows markdown-it 14's `[A-Za-z]`.
- **Playground script-URL loaders (§2), js/xss-through-dom.** The source is the engine `<script>`'s
  own `src` attribute, read by `engineBase()`. In `ensureEngine`, `ensureKatexProvider` and the
  fence-grammar injector the barrier sits **inline at the sink**: an empty URL, or one holding a quote,
  angle bracket, backtick, backslash or whitespace, is refused; the rest is resolved against the page
  and refused unless it shares the page's origin AND scheme (which also turns away `javascript:`,
  `data:` and a same-origin `blob:`); only the resolved href reaches `script.src` or `import()`. The
  origin comparison is what clears the alert: PR #3187's first two pushes put a character check behind
  a helper and then inline, and CodeQL still traced the DOM string to the sink both times. The engine
  and its assets are same-origin on every real page, so nothing legitimate is refused. A separate
  `scriptSrc` helper ran first until the home route crossed its hard byte ceiling; its scheme check
  duplicated the origin-and-scheme comparison, so it went and its character check moved inline.
  Because the injected `src` is now the resolved href, the dedup lookups compare resolved URLs
  (`scriptTagFor`) in the two loaders and in `injectPrefetch`; comparing the caller's raw string missed
  a tag injected from a relative URL and added a second `<script>` on retry. `specimen.js` builds its
  Playground route from the site base instead of reading `data.playgroundUrl` off the
  `#specimen-data` island. Arms: `docs/src/lib/script-src.test.ts`,
  `test/unit/playground/specimen-navigation.test.js`.

  **Known limit for the desktop app.** The check compares serialized origins, and a `file:` page or a
  custom-scheme page (`tauri://localhost`) has an opaque origin that serializes as the string `"null"`
  on both sides (checked with Node's `URL`: `file:///app/index.html` and a relative asset under it both
  read `"null"`). So on such a page relative assets load, but the origin half of the barrier
  degrades: any URL of the same scheme passes, `file:///anything.js` included. Before the desktop app
  loads the engine, compare against its real asset base (or `http://tauri.localhost` on Windows, a real
  origin) instead of relying on `location.origin`.
- **Playground directive scanners (§2), js/bad-tag-filter.** The editor's four Mermaid arrow families
  (each held both `<` and `>`) moved to `docs/src/playground/mermaid-arrows.js`, split so no single
  pattern holds both brackets; `slide-context.js`'s `/^\s*<!--.*-->\s*$/` line test became
  `isCommentLine`. Both are pinned to the old regexes' answers over millions of generated strings:
  `test/unit/playground/mermaid-arrows.test.js`, `test/unit/playground/slide-context.test.js`.
- **The 19 chart-test polynomial scrapers (§3), js/polynomial-redos.** `heatmap`, `map`, `quadrant`
  and `word-cloud` tests scraped rendered SVG with `[^>]*` / `[\s\S]*` runs. They now read the markup
  through `test/helpers/svg-tags.js` (one linear pass, the helper written for exactly this) or
  string ops, so no polynomial regex is left. (`quadrant.test.js`'s earlier "linear" rewrite still
  had two unbounded runs; it is the file that proves a comment claiming linearity is not a gate.)
- **The remaining §3 single alerts.** `pptx-export` strips with `removeTags` (fixed point) not a
  one-pass `<[^>]+>`; `shadcn-bridge` scans for `token:` by string instead of a RegExp built with a
  `-`-only escape; `chart-narration` asserts the link target absent by substring not `/https?:/`;
  `interpret` drops a no-op `.replace('split-panel','split-panel')` (js/identity-replacement);
  `slide-directives.test.ts` counts `-->` with `split` not a regex; `check-overflow.mjs` and
  `check-preview-render.mjs` confine the served path to `dist/` through the new
  `docs/scripts/lib/confined-path.mjs` (tested, with a traversal failing arm), closing
  js/path-injection.

**The one exception — `test/fixtures/npm-plugin-canary.js:173, js/bad-code-sanitization.** This fixture's
job is to GENERATE hostile plugin source and feed it to the npm-plugin canary to prove the sandbox
blocks it. Line 173 concatenates each attempt's `body` — the exploit vectors under test — straight
into the generated `render()` source. That concatenation IS the test: `attempts` /`markupVectors`
are the payloads the canary must neutralize, and any sanitization of them would make the fixture
assert nothing. The generated code never runs outside the canary's sandboxed harness and no
production path imports it. There is no rewrite that keeps the fixture hostile and clears the query
(moving the bodies to data the generated code `eval`s or `new Function`s is the same flag). This
is the §7 "fixture that must stay hostile" case: **dismiss on the dashboard with this reason**
(requires `security_events` access; an agent token is 403). It is the only JS alert left open.
