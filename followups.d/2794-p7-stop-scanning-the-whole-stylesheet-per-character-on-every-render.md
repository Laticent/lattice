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

re-measured 2026-10-26 (session F, round two) — the scanner half is mostly gone and this item no longer meets its own bar.
            #2871 replaced the regex-per-character reader with today's `cssRefSpans` tokenizer, and #2858 remembers the last
            answer so a keystroke skips it. What the FIRST render still pays, on the 987 KB `dist/lattice-min.css`:
            Node, one cold call in a fresh process, 27-35 ms (seven runs); real Chromium, a cold page, 4x CPU, 60-93 ms
            (median 77, seven runs); the Playground's first load, CPU profile, every `remote-ref` function together
            33-45 ms at 1x and 120-153 ms at 4x. Three behavior-identical rewrites were built and measured, each against
            the unchanged tokenizer and each producing the same spans on the whole sheet:
              1. the name loop inlined into the main loop: cold 40 ms vs 29 ms in Node (slower: the bigger function optimizes later);
              2. sticky-regex skips over plain names and inert runs: 2.7x faster before V8's optimizing tier (40 vs 105 ms with
                 `--max-opt=2`) but 33-45 ms vs 27-35 ms once it runs, and 75 vs 77 ms in Chromium at 4x;
              3. an allocation-free `nameEnd` closure that slices a name only when `(` follows: 1.75x faster before optimization
                 (59 vs 100 ms), even after it, and 66 vs 77 ms median in Chromium at 4x, inside the 46-93 ms spread.
            None comes near the 100 ms done-when, and none is worth a change to a scanner that feeds the frame's
            content-security policy (HARD RULE #22) plus the trio it would owe. NOT shipped; the code is unchanged.
            What is left, in order of size:
              (a) the engine's first `cssFor` composition, about 26 ms at 1x and 104 ms at 4x (lib/engine/themes.js says so; it
                  is already memoized for every later call). A build-time pre-composed default sheet would remove it from the
                  first render, but it changes what the engine ships, so it needs its own design note.
              (b) the scan itself, only by not running it: a build-time answer for our own sheet, verified by string
                  equality against the composed sheet before it is trusted. A weaker key (a hash) is a CSP bypass if it
                  collides, so it must be equality.
              (c) hoisting `cssRefSpans`' inner closures (`readName`, `open`, `push`) to module scope, so V8 keeps optimized
                  code between calls (today a second call on the same sheet costs as much as the first: 28 ms and 28 ms).
                  Needs the differential fuzz test and the trio.
            Measurement scripts: browser-cold (Playwright, the module loaded into a blank page, `webRefsInCss` timed once per
            fresh page) and a CDP profile of /playground/ aggregated by function and file. Re-create them from this paragraph.

re-measured again 2026-10-26 (PR #2913, note §10) — `composeCss` is 86-89 ms at 1x in Node and costs the same on a second call; `packTheme` is
            about 70 ms of it. In the Playground's biggest boot task `cssFor` is 100-320 ms at 4x. Memoizing the base pack helps palette
            changes, not the first render; only a packed base that REPLACES the raw one for the Playground, trusted by byte equality, removes the
            first cost. That changes the engine's input contract, so it waits for the owner (decision card on the PR). Not built.

decided 2026-10-26 (owner, on PR #2913, D1 A) — do not ship a pre-built base sheet; accept the 100-320 ms first-render composition. Nothing to build
            here. Reopen only if the owner asks.
