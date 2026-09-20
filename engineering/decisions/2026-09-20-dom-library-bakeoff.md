---
status: shipped
summary: >
  jsdom is slow and we keep it. Six parsers were measured on this repo's own markup
  (`npm run dom:bakeoff`): jsdom passes 33/33 correctness probes, happy-dom 31/33,
  linkedom 25/33, and the three parse-only libraries 18/13/6. happy-dom's two misses
  are the two that decide it — DOMPurify hosted on happy-dom leaves `<script>` in its
  output, which is HARD RULE #22's whole foundation, and the repo's own sanitizer tests
  reproduce it (`sanitizeSlideHtml('<script>steal()</script><p>ok</p>')` returns
  `'steal()<p>ok</p>'`); a full docs run under happy-dom was 21% faster and failed 168
  tests across 29 files. linkedom still lowercases all seven camelCase SVG element
  names, confirming the disqualification already recorded in `lib/core/dom-provider.js`.
  The speed win was never where it looked: the advantage collapses from 3.2x on one
  slide to 1.3x on a whole deck, because jsdom's real cost is FIXED — 598ms of cold
  `require()` per process, and `node --test` forks one process per file. So the
  shipped fix changes no library at all. 135 docs test files touch no DOM and were
  paying for a jsdom window they never used; pinning them to `environment: 'node'`
  cuts the docs suite from 233.3s to 212.2s (-9.0%) with all 313 files and 4,483 tests
  still green. Rejected: swapping the parser anywhere (correctness), and
  `--experimental-test-isolation=none`, which is 11% SLOWER because it trades
  per-file parallelism for a shared process.
---

# The jsdom bake-off: the cost is startup, not parsing

## The answer

**Keep jsdom everywhere it is used today, and stop paying for it where nothing uses it.**

Six candidates were measured against this repo's real markup. jsdom is comfortably the
slowest and it is the only one that does every job we ask of it. The two credible
challengers each fail on something that would ship silently:

- **linkedom** lowercases every camelCase SVG element name — 7 of 7 lost. That kills
  every chart gradient, every clip path and every Mermaid node label, with the suite
  green. This re-confirms the disqualification already written into
  `lib/core/dom-provider.js`.
- **happy-dom** breaks DOMPurify. Hosted on a happy-dom window, DOMPurify reports
  `isSupported: true` and then passes `<script>`, `onclick=` and a whole
  `<foreignObject>` payload straight through.

The useful finding is separate from the ranking: **we were measuring the wrong thing.**
jsdom's cost here is overwhelmingly fixed per process, not proportional to the HTML.
That reframes the fix from "swap the library" to "stop constructing a DOM nobody asked
for", which is what shipped.

## What jsdom is actually doing in this repo

Two censuses, both mechanical.

**Node side** — 75 files, 185 `new JSDOM(...)` calls:

| Fact | Count |
|---|---|
| Construction sites passing **zero options** (a bare parse) | **165 of 185 (89%)** |
| Sites setting `runScripts: 'dangerously'` + `pretendToBeVisual` | 17, across 8 files |
| Uses of `:has()`, `:is()`, `:where()` in a selector string | **0** |
| Production callers of `withDom` (the `dom-provider` seam) | **0** |

The 17 scripting sites boot the real `dist/lattice-runtime.js` inside the parsed
document. That is the hardest capability to replace and only jsdom has it. Layout
metrics (`getBoundingClientRect`, `offsetHeight`, `scrollHeight`) are supplied by the
tests via prototype patches rather than computed by jsdom, and `getComputedStyle` is
stubbed at nearly every site — so the *layout* engine we are paying for is mostly not
being used.

**Docs side** — 313 vitest files, all on the jsdom environment, none opting out:

| Fact | Count |
|---|---|
| Test files importing jsdom directly | **0** — all rely on the environment |
| Files using React Testing Library | 65 of 307 |
| Files touching **no DOM at all** | **168 of 307 (54.7%)** |
| Global stubs the setup adds for jsdom gaps | 8, plus 1 module alias |

That last row is the whole shipped change.

## Correctness first, and why the order is not negotiable

`npm run dom:bakeoff` runs 33 probes drawn from what the censuses found. Speed is not
consulted until a candidate passes, because this repo has already been here: linkedom
once measured 17x faster on the hot path while silently destroying SVG.

| | jsdom | happy-dom | linkedom | node-html-parser | cheerio | parse5 |
|---|---|---|---|---|---|---|
| **Total** | **33/33** | **31/33** | **25/33** | 18/33 | 13/33 | 6/33 |
| SVG camelCase elements | pass | pass | **fail (0/7)** | pass | pass | pass |
| Serializes like jsdom | ref | pass | fail | fail | pass | pass |
| Selectors we actually write | pass | pass | pass | pass | pass | fail |
| Mutation surface (14 probes) | pass | pass | pass | 7 fail | 14 fail | 14 fail |
| Executes a `<script>` | pass | **fail** | fail | fail | fail | fail |
| `getComputedStyle` / `styleSheets` | pass | pass | fail | fail | fail | fail |
| DOMPurify sanitizes on it | pass | **fail** | fail | fail | fail | fail |

Versions: jsdom 29.1.1, happy-dom 20.14.5, linkedom 0.18.13, node-html-parser 9.0.4,
cheerio 1.2.0, parse5 8.0.1, DOMPurify 3.4.15.

### The disqualifier: DOMPurify does not sanitize on happy-dom

This is the finding that ends the migration, so it is stated with the payload:

```
input      <img src=x onerror=alert(1)><script>steal()</script>
           <svg><foreignObject><p onclick=evil()>x</p></foreignObject></svg><p>ok</p>

jsdom      <img src="x"><svg></svg><p>ok</p>
happy-dom  <script>steal()</script><svg><foreignObject><p onclick="evil()">x</p>
           </foreignObject></svg><p>ok</p>
```

`DOMPurify.isSupported` is `true` in both cases. There is no warning. The behavior is
the same whether the window is fresh, written to, or populated by `innerHTML`, and
whether DOMPurify is constructed before or after.

**This is not a microbenchmark artifact — the repo's own tests reproduce it.** A full
docs run under `environment: 'happy-dom'` failed 168 tests across 29 files, among them:

```
FAIL src/lib/sanitize-slide-html.test.ts > drops <script> and <style> from content
  expected 'steal()<p>ok</p>' to be '<p>ok</p>'

FAIL src/playground/snapshot-cache.test.ts > re-sanitizes html at the storage boundary
                                             (defense in depth, #22)
  expected '<script>evil()</script>' not to contain '<script'
```

HARD RULE #22 is built on `sanitizeSlideHtml` doing its job. A parser swap that makes
the sanitizer a no-op, while every gate stays green except the two tests that happen to
check, is precisely the failure mode this repo's model policy describes: well-formed,
confident, wrong, and past the machine gates.

**Caveat, stated rather than buried:** the 168 failures were not each root-caused. Many
are plainly stubs (`pdf-text-extract` wants real `getComputedStyle`; several RTL files
want layout). The sanitizer failures are the ones that decide the question, and those
were reproduced independently outside vitest.

### The other miss: script execution

happy-dom ran no script in five configurations — a bare `new Window()`, one with `url`
set, one with `settings.disableJavaScriptEvaluation: false`, the `Browser`/`newPage`
API with `waitUntilComplete()`, and appending a `<script>` element with `textContent`
(the idiom all 17 Node sites use). Reported as measured: it may be a configuration this
investigation did not find, not proof the library cannot do it. Either way the 17 sites
that boot the real runtime have no candidate but jsdom today.

## Speed, read with the correctness table beside it

`npm run dom:bakeoff:speed`, real engine output, each cell in its own process (jsdom's
windows do not fully free on `close()`, which fills the heap and killed two earlier
runs of this matrix).

**Cold `require()`, median of 5 fresh processes:**

| jsdom | happy-dom | linkedom | node-html-parser | cheerio | parse5 |
|---:|---:|---:|---:|---:|---:|
| **598.1ms** | 281.4ms | 75.3ms | 9.7ms | 182.0ms | 23.2ms |

**parse + serialize, ms per operation (p50), with the speedup against jsdom:**

| input | jsdom | happy-dom | linkedom | node-html-parser |
|---|---:|---:|---:|---:|
| median slide (2KB) | 6.87 | 2.29 (3.0x) | 0.36 (18.9x) | 0.16 (43.3x) |
| heaviest slide (60KB) | 22.08 | 10.13 (2.2x) | 5.06 (4.4x) | 1.61 (13.8x) |
| whole deck (321KB) | 186.76 | 141.96 (1.3x) | 47.47 (3.9x) | 21.15 (8.8x) |

**Read the columns downward.** happy-dom goes 3.0x → 2.2x → 1.3x as the input grows;
linkedom 18.9x → 4.4x → 3.9x. The advantage is mostly a *fixed* per-parse cost, and it
shrinks to nearly nothing on the unit the CLI export actually works in. A bake-off run
at a single input size would have reported a number three to sixteen times off.

Put next to the 598ms `require()`, the shape of the problem is clear: on the Node tier
we are not paying jsdom to parse, we are paying it to load.

## Where the time actually goes

Measured on this sandbox (4 cores, Node 22.22.2), steady-state runs:

| Tier | Wall clock |
|---|---:|
| `docs` vitest — 313 files, 4,483 tests | **233.3s** |
| `npm test` — 421 files, 9,796 tests | **129.3s** |
| …the 65 node files that require jsdom | 39.8s |
| …65 non-jsdom files, as a control | 28.1s |

So jsdom costs the Node tier about **11.7s of 129.3s (9%)**, and removing it entirely
could not beat that. 65 files × 598ms of cold load is ~39s of CPU, which is most of the
39.8s those files take, divided across four cores. The Node tier is not where the money
is, and no parser swap changes that much.

The docs tier is where the money is, and its problem turned out not to be jsdom's speed
at all.

## What shipped

**135 docs test files now declare `// @vitest-environment node`.** They touch no DOM.
Under the suite default each one built a jsdom window, ran its assertions against plain
objects, and tore the window down.

They were chosen empirically, not by grep. 147 files looked DOM-free statically; all 147
were run under `environment: 'node'`; 11 failed because they import a module that needs a
DOM at load time, and 1 was already pinned. The 135 that passed are the ones annotated —
a file that later grows a DOM dependency fails immediately, with its own marker on line 1.

| | before | after |
|---|---:|---:|
| The 135 files alone | 43.0s | **23.6s** (-45%) |
| Full docs suite, run 1 | 235.6s | **212.3s** |
| Full docs suite, run 2 | 231.1s | **212.1s** |
| Test files / tests passing | 313 / 4,483 | **313 / 4,483** |

**-9.0% off the docs suite, no library change, no behavior change, nothing stubbed.**
Test counts are identical before and after, which is the check that matters: an
environment switch that silently skipped a file would also have looked like a speedup.

## Rejected

- **Swapping the parser anywhere.** Correctness, as above. jsdom stays in
  `lib/core/dom-provider.js`, `lib/core/transform-dsl/apply-to-html.js`,
  `lib/export/html-player.js`, `lattice-emulator.js` and all 67 test files.
- **`node --test --experimental-test-isolation=none`**, to pay the 598ms load once
  instead of 65 times. Measured on the 65 jsdom files: **44.3s against 39.8s isolated —
  11% slower.** It trades per-file parallelism across four cores for a single shared
  process, and the parallelism is worth more than the load.
- **happy-dom for the docs files that do need a DOM.** It is genuinely faster: a full
  run was 168.4s against 212.2s. It is not being proposed because it would leave the
  suite's sanitizer coverage inert, and a per-file environment matrix makes that a
  standing trap — a test that later starts exercising `sanitizeSlideHtml` from a
  happy-dom file would pass while proving nothing. That is a decision worth revisiting
  only if DOMPurify gains real happy-dom support.
- **`environment: 'node'` as the suite default**, flipping the annotation to the DOM
  files instead. That is 171 markers rather than 135, on the files where being wrong is
  expensive.

## What this does NOT claim

**It does not claim the docs suite is fast.** 212s is still slow, and the remaining cost
is real React work in ~65 RTL files, not parser overhead. The three heaviest files
(`studio.controls`, `StudioShell`, `studio.theme-depth`) carry 388 RTL calls between
them; `2026-08-23-jsdom-suite-timeout-budget.md` already measured a single `StudioShell`
mount at 90-205ms and found no waste to remove.

**It does not claim these timings reproduce elsewhere.** They are one sandbox, 4 cores,
two runs per arm. The ratios are the durable part; the absolute numbers are not, and
`2026-08-03-performance-guard.md` already settled that wall clock on a shared runner
cannot gate a merge. Nothing here is wired into `bench:check` for that reason —
`npm run bench` measures the engine, and this is test-harness cost, which it has never
covered.

**It does not claim happy-dom is a bad library.** It passed 31 of 33 probes, including
every selector, the whole mutation surface, CSSOM and all four parser corners, and it
serialized every fixture byte-identically to jsdom. Two misses disqualify it *here*
because of what this repo asks a DOM to do.

**It does not re-verify the browser path.** `dom-provider`'s browser branch uses the
native `DOMParser` and was not re-measured; its numbers stand as recorded there.
