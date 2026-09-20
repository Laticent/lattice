---
status: shipped
summary: >
  jsdom is slow and we keep it — on the paths we have. TEN parsers were measured on this
  repo's own markup (`npm run dom:bakeoff`), plus the Chromium the repo already launches.
  jsdom 29 and 30 both pass 34/34 correctness probes, happy-dom 32, domino 27, linkedom 26,
  node-html-parser 19 and cheerio 13; parse5 and htmlparser2 score 6/31 and 2/31 against a
  smaller denominator, and basichtml 1/34. happy-dom is disqualified by DOMPurify: hosted on
  it, `<script>` survives, and the repo's own sanitizer tests reproduce it (a full docs run
  under happy-dom was 21% faster and failed 168 tests across 29 files). linkedom and basichtml
  both lowercase all seven camelCase SVG element names — basichtml is deprecated INTO linkedom,
  so they share the defect.
  TWO candidates the first pass missed, and both matter. DOMINO (Mozilla's dom.js, behind
  Angular SSR) is 4.5x faster on a deck, 12x cheaper to load, serializes byte-identically to
  jsdom and keeps SVG casing — but DOMPurify on domino DESTROYS all markup (returns "" for
  `<p>ok</p>`), it returns ZERO for `:scope > section` where every other full DOM returns 2,
  and its NodeList has no `Symbol.iterator` while `lib/` and `tools/` walk query results with
  `for...of` in 130 places. Since `withDom` is fail-closed, that combination
  would make transforms silently no-op. CHROMIUM — already running in the export path, which
  builds three jsdom windows beside an open puppeteer page — is the fastest of all on a deck
  (29.9ms vs jsdom's 287.5ms) and spec-perfect by construction, but CDP is async and `withDom`
  is sync, so it fits only where code already runs inside the page.
  The speed win was never where it looked: the advantage collapses from 4.0x on one slide to
  1.4x on a deck for happy-dom, because jsdom's real cost is FIXED — 569ms of cold `require()`
  per process, and `node --test` forks one process per file. So the shipped fix changes no
  library. 136 docs test files touch no DOM and were paying for a jsdom window they never
  used; pinning them to `environment: 'node'` cuts the docs suite from 233.3s to 212.2s
  (-8.3%) with all 313 files and 4,483 tests still green. Rejected: every parser swap, a
  jsdom 30 upgrade (same correctness, no speed win), and
  `--experimental-test-isolation=none`, which is 11% SLOWER.
---

# The jsdom bake-off: the cost is startup, not parsing

## The answer

**Keep jsdom on the paths we have, and stop paying for it where nothing uses it.**

Ten parsers were measured against this repo's real markup, plus the Chromium the repo
already ships. jsdom is comfortably the slowest and the only one that does every job
we ask of it. Each challenger fails on something that would ship **silently**:

- **linkedom** and **basichtml** lowercase every camelCase SVG element name — 7 of 7
  lost, in both. They share the defect because basichtml is deprecated *into* linkedom.
  That kills every chart gradient, clip path and Mermaid node label, suite green.
- **happy-dom** breaks DOMPurify: `isSupported: true`, then `<script>` passes through.
- **domino** does the opposite — DOMPurify on domino deletes *all* markup — and its
  NodeList is not iterable, which this repo's 130 `for...of` walks depend on.
- The parse-only libraries (**node-html-parser**, **cheerio**, **parse5**,
  **htmlparser2**) have no mutable DOM, so they cannot run the transforms at all.

**Two candidates the first pass missed are genuinely better on speed, and both are
recorded here rather than adopted** — see § "The two that nearly won". The useful
finding is separate from the ranking: **jsdom's cost here is fixed per process, not
proportional to the HTML**, which reframes the fix from "swap the library" to "stop
constructing a DOM nobody asked for". That is what shipped.

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

`npm run dom:bakeoff` runs 34 probes drawn from what the censuses found. Speed is not
consulted until a candidate passes, because this repo has already been here: linkedom
once measured 17x faster on the hot path while silently destroying SVG.

| | jsdom 29 | jsdom 30 | happy-dom | domino | linkedom | nhp | cheerio | parse5 | htmlparser2 | basichtml |
|---|---|---|---|---|---|---|---|---|---|---|
| **Total** | **34/34** | **34/34** | **32/34** | **27/34** | 26/34 | 19/34 | 13/34 | 6/31 | 2/31 | 1/34 |
| SVG camelCase elements | pass | pass | pass | pass | **fail 0/7** | pass | pass | pass | pass | **fail 0/7** |
| Serializes like jsdom | ref | pass | pass | **pass** | fail | fail | pass | pass | fail | fail |
| Selectors (6, count-asserted) | pass | pass | pass | **`:scope` fails** | pass | pass | **`:scope` fails** | none | none | 5 fail |
| Iterable NodeList | pass | pass | pass | **fail** | pass | pass | pass | fail | fail | fail |
| Mutation surface (14) | pass | pass | pass | 1 fail | pass | 6 fail | 14 fail | 14 fail | 14 fail | 14 fail |
| Executes a `<script>` | pass | pass | **fail** | fail | fail | fail | fail | fail | fail | fail |
| `getComputedStyle` / CSSOM | pass | pass | pass | **fail** | fail | fail | fail | fail | fail | fail |
| DOMPurify on it | pass | pass | **leaks** | **deletes all** | leaks | n/a | n/a | n/a | n/a | n/a |

Versions: jsdom 29.1.1 and 30.1.0, happy-dom 20.14.5, domino 2.1.8, linkedom 0.18.13,
node-html-parser 9.0.4, cheerio 1.2.0, parse5 8.0.1, htmlparser2 12.0.0, basichtml 2.4.9,
DOMPurify 3.4.15. parse5 and htmlparser2 have a denominator of 31: three parser-conformance
probes reach the element through `querySelector`, which their adapters do not provide, so
those cells are **not measurable here** rather than library failures — see § "What the
independent check found".

**jsdom 30 is not an upgrade worth taking for speed.** It matches 29 on correctness
(34/34) and is not reliably faster — 129.5ms against 129 on a deck parse-and-serialize,
slower on the mutate op, and its cold `require()` is 577.8ms against 569.0ms. Worth
tracking for its own reasons; it is not a performance lever.

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

## The two that nearly won

The first pass measured six libraries and settled it two ways. That field was too
narrow: it was drawn from the parsers people reach for, and it never asked whether a
DOM had to come from a library at all. Widening it surfaced two real candidates, and a
defect in this harness.

### domino — fast, correct on the things that killed the others, and still not usable

Mozilla's dom.js, the DOM behind Angular's server-side rendering. It is not a browser
emulator, so it carries none of the window plumbing jsdom pays for, and it shows:

| | jsdom 29 | domino | ratio |
|---|---:|---:|---:|
| cold `require()` | 569.0ms | **47.6ms** | 12.0x |
| parse, whole deck | 163.4ms | **31.3ms** | 5.2x |
| parse + serialize, whole deck | 170.7ms | **38.1ms** | 4.5x |
| parse + query + mutate + serialize, whole deck | 287.5ms | **74.9ms** | 3.8x |

It also **serializes byte-identically to jsdom** on all three fixtures and **preserves
SVG casing** — the two things that disqualified linkedom. Unlike happy-dom its lead does
not collapse on a deck.

**Two things stop it, and the second is the dangerous one.**

**DOMPurify on domino deletes everything.** Not a leak — the opposite:

```
in      <h1>Title</h1><p>body <strong>bold</strong></p>
jsdom   <h1>Title</h1><p>body <strong>bold</strong></p>
domino  ""
```

Bare text survives; any element does not. **This harness scored that as a PASS**, because
the DOMPurify probe only asserted that the attack payload did not survive — and a
sanitizer that destroys its input satisfies that perfectly. The probe now asserts both
directions, which is why domino reads 28/34 rather than 29/34. It is worth stating
plainly: the first version of this bake-off had a false-PASS hole in the one probe that
decides the whole question, and only widening the field exposed it.

**domino returns ZERO for `:scope > section`.** Not a throw — a silent empty NodeList,
where every other full DOM returns 2. It parses `:scope` (`:scope section` works) and
mishandles the child combinator. `:scope` appears **208 times** across `lib/`, `tools/`
and `test/`, and the Node census counted it in 37 distinct selector strings. A selector
that matches nothing means the transform finds no sections and does nothing.

**domino's NodeList has no `Symbol.iterator`.** A spec NodeList is iterable; domino's is
array-*like*. `lib/` and `tools/` walk query results with `for (const x of …)` in **130
places**. Each would throw — and `withDom` is **fail-closed**, catching the throw and
returning the input HTML unchanged. So the failure mode is not a red test, it is **every
affected transform silently not applying**, on a deck that still renders. That is the
exact shape this repo's model policy warns about, and it is why a 3.8x win is not taken.

### Chromium — already running, fastest of all, and structurally blocked

`dom-provider.js` gives the browser branch the native `DOMParser` because it is "fast AND
correct", and treats that as a property of the browser environment. But the CLI export
runs a real Chromium too, and **`lattice-emulator.js:5311-5316` builds three jsdom windows
while a puppeteer page is open in the same process.** The fastest correct parser in the
repo may already be running, unused, next to the slowest one.

Measured with the page warm (`npm run dom:bakeoff:chromium`), against jsdom on the same op:

| input | jsdom 29 | Chromium | ratio |
|---|---:|---:|---:|
| median slide (2KB) | 10.5ms | 1.0ms | 10.1x |
| heaviest slide (60KB) | 33.8ms | 4.8ms | 7.0x |
| whole deck (321KB) | 287.5ms | **29.9ms** | **9.6x** |
| *(empty CDP round-trip)* | — | *0.71ms* | *the floor* |

Faster than domino on the two larger inputs, and correct **by construction** — it is the
same engine the PDF renders in, so there is no fidelity question to argue about.

**What blocks it is the contract, not the clock.** `withDom(html, fn)` is synchronous and
hands `fn` a live node; CDP is asynchronous and cannot pass a live node across the process
boundary, so `fn` must run inside the page. That is impossible for the transform kernels
without rewriting their contract — and already true for the emulator, which has 39
`page.evaluate` bodies.

**So this is scoped, real, and deliberately not in this PR.** The emulator's three jsdom
constructions are the candidate, not `withDom`: one of them parses every sanitized section
in a `.map`, paying a fresh jsdom per slide. The 0.71ms CDP floor says how to do it — batch
the sections into one `evaluate` and pay the floor once, rather than per section. That is a
change to the export path, which is HARD RULE #9 / export-sign-off territory and needs its
own before-and-after on real exported bytes. Filed as follow-up, not smuggled in here.

## What the independent check found

The maker-checker pass (HARD RULE #25) did not fault the shipped change — it audited the
**harness**, and found that the false-PASS discovered in the DOMPurify probe was not a
one-off. It was a pattern: **three probe families scored "did not throw" as "correct".**

| Defect | Effect | Status |
|---|---|---|
| Selector probes printed the match count without asserting it | domino, cheerio and basichtml matched **0** elements and scored PASS | fixed — every row now asserts an expected count |
| `speed.mjs` accepted a failed `require()` | a child that throws prints nothing, `Number('')` is 0, `isFinite(0)` is true → the candidate tops the cold-load table at **0.0ms** | fixed — the guard now checks exit status and empty output |
| No "could not measure" state | three parser-conformance probes reach the element via `querySelector`, so parse5's missing selector engine was scored as parse5 failing at parsing | fixed — those cells report `n/a` for a parse-only adapter |

**What the corrections cost, stated because the first table was wrong:** basichtml fell
from 6/34 to **1/34**, domino from 28 to **27**, cheerio from 14 to **13**, and parse5's
denominator dropped to 31. The direction of every verdict held; the numbers did not.

The check also re-derived the load-bearing claims independently and they reproduced
exactly — the happy-dom DOMPurify output byte-for-byte, linkedom's 7-of-7 SVG loss, the
168-failures-across-29-files run, the speed ratio collapse, and — the strongest available
refutation of "a test now passes vacuously" — a **per-test-name** diff across all pinned
files in both environments, which is empty. It also measured the mechanism directly: the
suite's `environment` line halves, 180.57s to 90.22s.

Three write-up errors it caught, corrected here:

- **"the 65 node files that mention jsdom" was wrong.** 65 files *mention* jsdom; **57**
  actually `require` it. The timing stands — that 65-file set is what was measured — but
  the label did not.
- **node-html-parser fails 6 mutation probes, not 7.**
- **"1 was already pinned" was wrong**, and hid a real miss. None of the 147 candidates
  carried a prior pin; the 22 files on `main` with `@vitest-environment jsdom` were
  excluded by the static filter and never were candidates. The true accounting is **147
  candidates, 136 passed, 11 failed** — and one passing file was dropped by a shell loop
  reading a list without a trailing newline. It is pinned now, which is why this note says
  136 where an earlier draft said 135.

## Speed, read with the correctness table beside it

`npm run dom:bakeoff:speed`, real engine output, each cell in its own process (jsdom's
windows do not fully free on `close()`, which fills the heap and killed two earlier
runs of this matrix).

**Cold `require()`, median of 5 fresh processes:**

| jsdom 29 | jsdom 30 | happy-dom | cheerio | linkedom | domino | basichtml | htmlparser2 | parse5 | nhp |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **569.0ms** | 577.8ms | 280.3ms | 180.2ms | 75.8ms | **47.6ms** | 36.5ms | 28.0ms | 21.4ms | 9.7ms |

**parse + serialize, ms per operation (p50), with the speedup against jsdom 29:**

| input | jsdom 29 | happy-dom | linkedom | domino | nhp |
|---|---:|---:|---:|---:|---:|
| median slide (2KB) | 9.14 | 2.29 (4.0x) | 0.36 (25.2x) | 0.33 (27.8x) | 0.16 (56.7x) |
| heaviest slide (60KB) | 20.20 | 9.71 (2.1x) | 4.56 (4.4x) | 3.06 (6.6x) | 1.88 (10.7x) |
| whole deck (321KB) | 170.67 | 126.33 (1.4x) | 46.00 (3.7x) | 38.13 (4.5x) | 25.57 (6.7x) |

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
| …the 65 node files that mention jsdom (57 require it) | 39.8s |
| …65 non-jsdom files, as a control | 28.1s |

So jsdom costs the Node tier about **11.7s of 129.3s (9%)**, and removing it entirely
could not beat that. 65 files × 598ms of cold load is ~39s of CPU, which is most of the
39.8s those files take, divided across four cores. The Node tier is not where the money
is, and no parser swap changes that much.

The docs tier is where the money is, and its problem turned out not to be jsdom's speed
at all.

## What shipped

**136 docs test files now declare `// @vitest-environment node`.** They touch no DOM.
Under the suite default each one built a jsdom window, ran its assertions against plain
objects, and tore the window down.

They were chosen empirically, not by grep. 147 files looked DOM-free statically; all 147
were run under `environment: 'node'`; 11 failed because they import a module that needs a
DOM at load time. The 136 that passed are the ones annotated —
a file that later grows a DOM dependency fails immediately, with its own marker on line 1.

| | before | after |
|---|---:|---:|
| The 136 files alone | 43.0s | **23.6s** (-45%) |
| Full docs suite | 235.6s · 231.1s | **212.3s · 212.1s · 222.4s · 209.3s** |
| Mean | **233.3s** | **214.0s** (-8.3%) |
| Test files / tests passing | 313 / 4,483 | **313 / 4,483** |

**Four post-change runs are reported, not the best pair.** The first two landed at
212.3s and 212.1s; a later pair, after the 136th file was added, spread to 222.4s and
209.3s on the same tree. The spread is the machine, not the change — which is the same
caveat `2026-08-03-performance-guard.md` makes about wall clock on a shared runner, and
the reason the honest headline is a mean of four rather than a tidy pair of two.

**-8.3% off the docs suite, no library change, no behavior change, nothing stubbed.**
Test counts are identical before and after, which is the check that matters: an
environment switch that silently skipped a file would also have looked like a speedup.

## Rejected

- **domino**, despite 3.8-4.5x. DOMPurify deletes all markup on it, and its
  non-iterable NodeList meets `withDom`'s fail-closed catch to make 130 transform
  sites silently no-op. See § "The two that nearly won".
- **Chromium as a general DOM provider.** Fastest measured and correct by
  construction, but CDP is async and `withDom` is sync. Scoped follow-up for the
  export path only, where the code already runs inside the page.
- **Upgrading jsdom 29 to 30.** Same correctness (34/34), no speed win, same cold
  load. There may be other reasons to take it; performance is not one.
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
  files instead. That is 171 markers rather than 136, on the files where being wrong is
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
