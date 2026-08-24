---
status: shipped
summary: PDF was assumed to be the expensive default for testing and sanity checks. Measured, it is the CHEAPEST browser-backed format Lattice ships — PNG/PPTX/ZIP cost 7–9× the same deck, and every image golden costs 3–12× more bytes than the vector PDF, so switching tests or goldens to images would make the repo slower AND larger. The PDF encoder is 2.3% of a small render and 15% of a large one; the cost is the browser round-trip. THE LARGEST SINGLE COST IS mmdc, which boots its own Chrome ONCE PER DIAGRAM — 40.7s of a 44.3s render on the 14-fence diagram gallery. Second is a `networkidle0` wait costing ~1.7s per navigation that pins at ~2.0s regardless of deck size; its cause is UNIDENTIFIED (the first two explanations, font work and the settleFonts cap, were both refuted by experiment), but the render's font correctness rests on an explicit force-load after every navigation, not on the wait — `waitUntil: 'load'` HAS SINCE SHIPPED, worth 0.66-0.80s per navigation (31-59% of a deck's render, -25% across all 277 shipped decks) with zero page-count, clipped-page or auto-split change across the corpus. The real PDF cost is storage, not time: 351 tracked PDFs are 67.5% of the tree and 65.3% of the last 20 commits' new bytes, because one cross-cutting CSS commit re-blesses up to 150 goldens that are not byte-reproducible — which makes MAKING THEM REPRODUCIBLE dominate 'stop committing them'. Also fixed here: `deck.md out.html` wrote PDF bytes into a `.html` file; `.html` is now a first-class output format, a real browser render minus the PDF encode (6.77s vs 8.24s on 58 slides, but ~0 saving on the small fixtures the tests use). Corrected nineteen times (§9) — under re-measurement, adversarial review, and the follow-on work; the measurements held every time, the mechanisms did not. The top lever has since shipped in #1677.
---

# PDF vs HTML vs image — what each format actually costs

**2026-08-16 · measurement record + the defect it turned up (§6), hardened by the adversarial trio (§9)**

**Question asked:** we default to PDF for testing and sanity checks; PDF feels
heavy. What does it buy us, and where can we be leaner?

**Short answer, and it inverts the premise:** PDF is the **cheapest**
browser-backed format Lattice ships — every image format costs 7–9× more for
the same deck, and every image *golden* costs 3–12× more bytes. What is
expensive is **the browser round-trip itself**, which every format except the
in-process engine render pays. The PDF encoder is 2.3% of a small render and
15% of a large one. **Format is not the lever.** The two biggest costs inside a
render are `mmdc` booting its own Chrome **once per diagram** (§2b) and a
`networkidle0` wait that ignores deck size (§2a); the biggest cost *overall* is
not time at all but the 150 MB of committed goldens (§5).

> **This document has been corrected repeatedly — nineteen entries in §9, from
> re-measurement, from adversarial review, and from the work it prompted.** Two
> mechanisms it originally asserted were refuted by experiment, one lever was
> under-sized by 14×, and a third cause of golden churn was missed entirely.
> Every correction is marked in place rather than overwritten. **Treat the
> measurements as solid and any mechanism here as provisional until re-tested** —
> that is the pattern: the numbers held every time, the explanations did not.
>
> **The top lever has since shipped** (#1677: `mmdc` batching + a pinned
> hand-drawn seed, −46% corpus render). §7's table describes the state *before*
> that landed; §9 rows 11–12 record what it changed.

---

## 0. Measurement conditions

Everything below was measured on the cloud sandbox with no other load. Sample
counts are stated per table: the format comparison and the `waitUntil` probe are
medians of 3–4 after a warm-up render; the image-format rows and the phase traces
are single runs, and say so.

**Two figures were corrected after re-measuring with more samples** — the
`.html`-vs-`.pdf` saving (§6) and the mechanism behind the `networkidle0` wait
(§2a). Both corrections are marked in place rather than quietly overwritten,
because the first readings were quoted in a PR before they were re-checked.

| | |
|---|---|
| CPU | Intel Xeon @ 2.80GHz, 4 cores |
| Memory | 15 GB |
| Node | v22.22.2 |
| Chrome | Google Chrome for Testing 131.0.6778.204 |
| poppler | 24.02.0 (`pdftoppm`, `pdfinfo`, `pdftotext`) |
| Decks | `examples/gallery-jargon.md` (58 slides), `lib/components/chart/chart.gallery.md` (15), `examples/kpi-stats-lift.md` (~5), a synthetic 1-slide deck |

Phase timings come from a non-invasive `--require` hook that wraps
`puppeteer.launch`, the `page.*` methods and `child_process.*` — the emulator
itself was not edited.

**Cold-start caveat:** the first CLI invocation in a fresh container measured
27.3s (font cache, module cache, Chrome first launch). Every number below is a
warm-process figure; treat 27s as the one-time cost a CI runner pays once.

---

## 1. Cost per format — the 58-slide deck

| Path | Wall | vs PDF | Output bytes |
|---|---:|---:|---:|
| Engine HTML, **in-process, no browser** | **0.78s** | 0.09× | 142 KB html + 767 KB css |
| CLI → `.html` (§6) | **6.77s** | 0.82× | 2.54 MB |
| CLI → `.pdf` (+ HTML sidecar) | **8.24s** | 1× | 1.66 MB pdf + 2.54 MB html |
| CLI → `.pptx` | 57.7s | 7.0× | 20.9 MB |
| CLI → `.png` (58 files) | 59.0s | 7.2× | 20.6 MB |
| CLI → `.zip` image set | 74.3s | 9.0× | 21.2 MB |
| CLI → `.pdf`, then `pdftoppm -r 150` | 8.2 + 91.2 = 99.4s | 12.1× | + 15.2 MB |
| CLI → `.pdf`, then `pdftoppm -r 30` (review overview) | 8.2 + 7.3 = 15.5s | 1.9× | + 2.5 MB |

The `.html` and `.pdf` rows are **medians of 3 samples after a warm-up render**
(html 6.57 / 6.77 / 6.84; pdf 8.14 / 8.24 / 8.32) — tight enough to compare.
The image rows are single samples, far enough apart that their spread changes no
ordering.

**The `.html`-vs-`.pdf` saving scales with the deck and vanishes on small ones**
— which is why it is not a test-suite lever (§3a, §7 L5). Medians of 3, same
warm-up:

| Deck | `.html` | `.pdf` | Saved |
|---|---:|---:|---:|
| 1 slide, no diagram | 2.18s | 2.20s | **0.9%** — noise |
| 1 slide + one flowchart | 5.24s | 5.25s | **0.2%** — `mmdc` swamps it |
| `test/fixtures/preview-deck.md` | 3.42s | 3.57s | 4.2% |
| chart gallery (15 slides) | 3.56s | 4.45s | 20.0% |
| jargon (58 slides) | 6.77s | 8.24s | 17.8% |

Two things fall out immediately:

1. **Rasterizing is the expensive act, not PDF.** PNG/PPTX/ZIP are 7–9× the
   PDF. Screenshotting each slide costs ~860 ms/slide.
2. **The vector PDF is the smallest artifact we can commit** — 3–12× smaller
   than any image golden of the same deck. (It is also smaller than its own HTML
   sidecar here, 1.66 MB vs 2.54 MB, but **that relation is not general**: the
   sidecar is ~2.5 MB for a 1-slide deck too, being dominated by inlined CSS and
   base64 fonts, while the PDF scales with the deck. It inverts on a large
   enough deck. The golden comparison is what the conclusion rests on.)

Image-golden sizes for the same deck, for the record: WebP `--image-size half`
4.7 MB, WebP `1x` 8.3 MB, JPEG `1x` 15.8 MB, PNG `2x` 20.6 MB — against the
PDF's 1.66 MB.

---

## 2. Where the time actually goes

Traced phase breakdown, warm process:

**58-slide deck · `.pdf` (8,200 ms) beside `.html` (6,520 ms)** — the same
render traced twice, so the columns isolate exactly what the PDF costs:

| Phase | `.pdf` ms | `.html` ms |
|---|---:|---:|
| `mmdc` (mermaid, its **own** Chrome) | 2,853 | 2,865 |
| `page.goto` (load + settle — §2a) | 2,004 | 2,003 |
| `page.pdf` (**the PDF encode**) | **1,242** | — |
| `browser.launch` | 323 | 301 |
| other `execSync` / `evaluate` | 219 | 169 |
| node boot + engine render + file IO (remainder) | ~1,559 | ~1,182 |

The 1,680 ms between them is `page.pdf` (1,242 ms) plus the PDF-only
iOS-Quartz SVG rasterization pass. Every other phase matches within noise —
which is the point: **`.html` is the same render minus the encode**, not a
cheaper kind of render.

**58-slide deck → PNG · total 56,328 ms** — 50,131 ms (89.0%) is
`element.screenshot` × 58. Everything else is identical to the PDF run.

**1-slide deck, no mermaid → PDF · total 2,130 ms**

| Phase | ms | % |
|---|---:|---:|
| `page.goto` | 791 | 37.1% |
| `browser.launch` | 270 | 12.7% |
| `execSync` | 139 | 6.5% |
| `page.pdf` | **50** | **2.3%** |

That `page.goto` is the *fast* arm of the bimodal wait in §2a; the slow arm puts
it at 2,003 ms and the total near 3.6s. Both were observed on this identical
command.

**1-slide deck, one trivial flowchart → PDF · total 6,965 ms** — `mmdc` alone
is 3,235 ms (46.4%); `page.pdf` is 85 ms (1.2%).

### 2a. The `networkidle0` wait — and what it actually is

**A first pass at this called it a flat ~2.0s toll. That was the right size and
the wrong mechanism, and the corrected version is a stronger case, not a
weaker one.** Re-measured with more samples:

`page.goto` under `networkidle0` pins at **2,002–2,007 ms on a 1-slide deck and
a 58-slide deck alike** — 4 interleaved rounds each. Deck size does not move it.
Probing the same generated files, interleaved so a warming trend cannot
masquerade as a per-setting difference (medians of 4):

| `waitUntil` | 1-slide | 58-slide |
|---|---:|---:|
| `domcontentloaded` | 169 ms | 610 ms |
| `load` | **238 ms** | **631 ms** |
| `networkidle0` (**what we use**) | **2,003 ms** | **2,003 ms** |

So `networkidle0` costs **~1.77s more than `load` on the small deck and ~1.37s
more on the large one** — larger than the ~1.3s first recorded, and *inversely*
related to deck size, which is the tell.

**A number that ignores deck size is a timeout, not work.** That inference
stands. The *first* answer to "which timeout" was `settleFonts`'s 2,000 ms cap,
and **that answer is refuted — by experiment, not by argument.**

Take a real sidecar and vary only the in-page font handling, interleaved against
real Chrome:

| Variant | `networkidle0` |
|---|---|
| as shipped (`settleFonts(document.fonts, 2000)`) | 807 / 2003 / 1915 ms |
| **`settleFonts` call removed entirely** | 2003 / 2004 / 2002 ms |

Removing the force-load changes nothing. Instrumenting the same navigations, the
**last network event fires at 162–239 ms** — the network is quiet for ~1.8s
before `networkidle0` releases. Two a-priori arguments agree: `Promise.race`
does not cancel, so a cap that loses the race has no channel to the network at
all; and `networkidle0` fires 500 ms after the last request, so a 2,000 ms cap
could only ever produce ~2,500 ms, never a repeatable 2,003 ms.

A related claim went with it. "17 declared faces, of which about 9 are used" is
the `--player` prune's count of the embedded-font block — **not** what
`settleFonts` walks. In a real render `document.fonts.size` is **74**. So
"the render is waiting on fonts the deck never uses" was wrong twice over: it is
not waiting on fonts, and the font set was misidentified.

**What survives, and it is the part that matters:** the penalty is real and
reproducible. On the same file, `load` returns in 238–304 ms where
`networkidle0` takes 2,002 ms — **~1.7s per navigation, and the render performs
one to three of them** (initial, auto-split, rails). Traced in the real CLI the
wait is **bimodal** — 771–802 ms on some runs of an identical command, exactly
2,003 ms on others — so "~2.0s every time" was also wrong; **up to ~1.8s, hit
often but not always** is the honest statement.

**The cause is UNIDENTIFIED.** It is browser-side, unaffected by anything in the
page's script, and reproducible on demand. Naming it is the first task of any
work on this lever — not because the fix depends on it, but because the last two
guesses were both wrong and the third should be measured before it is written
down.

**UPDATE (L2 shipped).** Two things above are now corrected by end-to-end
measurement; see §9 rows 15 and 16.

- **ONE context provokes the slow arm reliably. Everything else about it resisted two
  attempts to pin down, and both attempts are recorded as refutations** (§9 row 16 —
  the second attempt was the *correction* to the first, which is worth noticing: the
  urge to tidy this into a rule survived being caught once). Across four independent
  runs, a **fresh page in an already-warm browser** hits the arm **6/6, 9/10, 10/10,
  10/10**, pinned at exactly 2,002 ms. A **fresh browser's first page** — the context
  the CLI actually uses — has read **0/6, 0/10, 1/10, 7/10 and 10/10** depending on
  document and run. A **reused page** has read **0/6, 0/10 and 1/10**. So the arm is
  real and one context summons it on demand; its incidence anywhere else is not a rule
  and not currently explicable. **The cause remains unidentified.**
- **So "~1.7s per navigation" was too high for the shipped path — but do not take
  the new number from the context argument either.** Take it from the end-to-end
  measurement, which needs no mechanism to be valid: through the real CLI
  (`npm run bench -- --cli`, 3 iterations), the saving is **0.66-0.80 s per
  navigation**, consistent across decks driving 1, 3 and 4 navigations. Because the
  CLI's first navigation sometimes pays the 2,002 ms arm and sometimes does not, the
  per-render saving is itself bimodal — an independent re-measurement of the 1-navigation
  deck read 2.07 s, 2.11 s and 3.61 s before the change, so that deck's saving spans
  roughly −29% to −59% run to run. The corpus figure (−25% over 277 decks) averages that
  out and is the number to quote.

### 2a-bis. Why the fix is nonetheless cheap — the wait is not what protects #894

The first pass asserted that dropping `networkidle0` would reintroduce #894's
false overflow ring, and scoped the lever as multi-day work. **That was a
misattribution.** `lattice-emulator.js:2421`, immediately after every
navigation, already does this:

```js
await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
await document.fonts.ready;
```

An explicit, **unbounded** force-load-then-await, on the Node side, repeated
after the auto-split and rails navigations. The render's font correctness rests
on *that*, not on `waitUntil`. #894 was a bug in the **exported HTML's embedded
watcher** — the script a human runs when they open the static file later — and
`2026-07-10-overflow-cause-highlighting.md` §14 says so directly: "`measureOverflow()`
was never affected — it already force-loads fonts first." The comment beside the
code says the same ("not touched by the bug this file's OTHER two copies had").

So the cheap experiment is: set `waitUntil: 'load'` on the three `page.goto`
calls, keep the existing explicit force-load, and run the overflow corpus and
the split suites. That is an afternoon with a real test, not a project — and it
is the opening move, with the settle-promise plumbing as the fallback if it
fails.

### 2a-ter. What the export waits for, and what it declines — the author-timer decision

**Settled 2026-08-24 (#1792). The export captures at the `load` event plus an
explicit media settle, and it DOES NOT WAIT ON AUTHOR TIMERS. It now says so
when a deck's script loses that race.**

This is the imperative half of the hole row 19 opened. The declarative half —
`<img loading="lazy">`, which Chromium defers past `load` — shipped with L2 as
`settleDeferredMedia`. The two look alike and are not:

| | deferred media | an author timer |
|---|---|---|
| who deferred it | the BROWSER, from markup the document declared | the DECK's own code, racing the exporter |
| does the export owe it | yes — the document asked for it | no finite wait is correct |
| what shipped | promote to eager, await decode, bound each wait at 10 s | **decline the wait, report the loss** |

**Why decline.** There is no number that is right. A bounded settle that admits
a 400 ms timer excludes a 500 ms one, and the deck that needs 500 ms is written
the day after the budget is published; the budget would also be spent on every
navigation of every deck, against a class **no shipped deck uses** — all 277
were scanned, 3 carry a raw `<script>`, and all 3 are parser-blocking
`<script src>` scaffolding for the live preview with no deferral of their own.
Picking a number is a product promise, not a measurement, and this is the
promise: **what the page has painted by `load` is what the export captures.**

**Why the grace period was never a contract.** Under `networkidle0` a deck could
appear to work — its idle floor granted a few hundred ms incidentally. Bisected
on a 2-slide deck: 40 ms and 80 ms landed, 120 ms, 200 ms and 400 ms did not. The
floor itself is bimodal and machine-dependent (§2a, §9 rows 2 and 16), so a deck
relying on a 400 ms timer was relying on the fast arm not being hit.

**Why it still needed a change.** Declining is fine; declining SILENTLY is the
defect, and it is the same failure shape as the lazy-image class: a page missing
content, exit 0, no diagnostic. Two nets now say it out loud:

- **At capture** — `lib/core/author-deferral-probe.js`, installed through
  `page.evaluateOnNewDocument` before the document's first script and read at the
  last moment the page is still the page. It patches `setTimeout`, `setInterval`,
  `requestAnimationFrame`, `requestIdleCallback`, `fetch` and `XMLHttpRequest`,
  attributes each schedule to the `<script>` element that made it via
  `document.currentScript`, and reports what has NOT run. **It never waits.**
  Every `<script>` the export emits carries `data-lattice-script` so the probe can
  tell our timers from the deck's — the overflow watcher arms a 2,000 ms
  `settleFonts` race on every deck in the repo, and counting it would have made
  the warning fire everywhere and mean nothing.
- **At authoring** — `lint:deck` rule `author-script-defers`, which is also the
  answer to the probe's structural blind spot: `document.currentScript` is null
  inside a `<script type="module">` and inside any promise continuation, so those
  are invisible at capture. Unknown provenance is deliberately NOT reported —
  defaulting it to "the deck" would blame the deck for the engine's own
  `settleFonts(...).then(check)` work, on every render.

**Scope of the warning.** Every captured format (PDF/PPTX/PNG/image set) and
`--player`, which strips every inline script from the file it ships. A plain
`.html` export does not warn: its sidecar carries the deck's `<script>` intact,
so the recipient's browser runs the timer and nothing is lost.

**What it costs.** Nothing measurable. One `evaluateOnNewDocument` per page and
one `page.evaluate` per render, no waiting anywhere. Through
`npm run bench -- --cli --check` against the baseline blessed before the change,
on the same machine: **−4.5% / +1.5% / +0.2%** on the decks that drive 1, 3 and 4
navigations — inside those datasets' own 3–8% RME. L2's saving is intact; the
baseline was not re-blessed, because there is nothing to ratchet.

**And it changes nothing about what ships.** Patching `setTimeout` in the page
is the part of this with real blast radius, so it was checked at the artifact
rather than argued: the same deck rendered on the commit before and the commit
after is **byte-identical**, on `test/fixtures/preview-deck.md` (143,917 B) and
on `examples/state-chart-stress.md` (1,279,338 B) — the second chosen because
its geometry is MEASURED in the page after `fonts.ready`, so a wrapper that
perturbed timing would move those bytes. Neither moved, and neither moved the
AX-node channel of §9 row 17 either.

**Verified on the real surface** (HARD RULE #23): a rendered PDF carries the
synchronous script's text and not the 400 ms one, and the warning names the
second and not the first — `test/integration/export/author-script-deferral.test.js`.
A `lint:deck --all` sweep over the 274 shipped decks reports the new rule zero
times.

### 2b. mmdc launches a second browser **per diagram** — the largest cost here

**Corrected.** The first pass wrote: "`mmdc` costs 2,659 ms on a 58-slide deck
with many diagrams and 3,235 ms on a 1-slide deck with one trivial flowchart.
The cost is a fixed second Chrome boot, not per-diagram work."

`examples/gallery-jargon.md` contains **exactly one** mermaid fence. That was one
diagram against one diagram — a comparison that could not establish scaling, and
"many diagrams" was simply false.

The code says per-fence: `renderMermaidOne` (`lattice-emulator.js:1097`)
`execSync`s the `mmdc` binary and is invoked once per fence from the `renderOne`
callback (`:1367`), with no memoization of rendered SVGs in
`lib/core/render-diagrams.js`. Traced against `lib/components/diagram/diagram.gallery.md`
(**14 fences**):

```
total 44,303 ms
mmdc (mermaid)   40,754 ms   x14   92.0%
page.goto         2,003 ms    x1    4.5%
browser.launch      283 ms    x1    0.6%
```

Fourteen invocations, **~2.9s each, 92% of the render**. Every diagram boots its
own Chrome.

**This reranks the whole document.** `mmdc` is not "2.7–3.2s per deck" — it is
**~2.9s × diagram count**, which on the diagram and component galleries dominates
every other cost measured here, `page.goto` included. It also shrinks the fix:
the first pass proposed re-rendering mermaid inside the browser we already
launched, which touches the theming contract (`engineering/mermaid.md`). Batching
all fences into one `mmdc` invocation, reusing one process, or memoizing
identical definitions gets most of it and touches no contract at all.

---

## 3. What this costs the test suite

Measured on this machine, cold render cache:

| Tier | Tests | Wall | Per test |
|---|---:|---:|---:|
| `npm test` (unit) | 6,103 | 80.2s | 13 ms |
| **`npm run test:integration:pr`** — what every PR runs, `CI=true` so the render cache is off | **469** | **439.3s (7m20s)** | **937 ms** |
| `npm run test:integration` (full) | 714 | 698.5s (11m39s) | 978 ms |

**11.7% of the tests take 8.7× the wall clock, at 75× the per-test cost.** The
per-PR slice alone is 7m20s — 5.5× the entire 6,103-test unit suite.

Slowest suites, full run:

| Suite | Wall |
|---|---:|
| `export/export-formats` | 281.4s |
| `components/component-galleries` | 279.5s |
| `exemplars/exemplar-render` | 218.0s |
| `invariants/axe-a11y` | 77.2s |
| `export/html-player` (9 cases) | ~263s combined |

Slowest in the per-PR slice: `export-formats` 274.2s, `component semantic
invariants` 261.3s, `content-clipped pill` 104.1s, `axe-a11y` 68.3s,
`html-player` cases ~226s combined.

One full integration run performs **156 emulator renders**, leaving 424 MB in
`.scratch/test-cache` (156 PDFs = 50.6 MB, plus sidecars).

### 3a. How much of that is *actually* PDF

**Corrected — the first pass undercounted the universe.** It said "18 integration
files spawn the CLI", which is exactly what a literal `grep lattice-emulator`
returns; it misses the files that reach the CLI through `runEmulator` in
`test/helpers/render.js`. Recounted (`grep -rl "lattice-emulator\|runEmulator"`):
**25 files**, 12 of them via the helper. Classified by what they read back:

| | Files | What they need |
|---|---:|---|
| Read real PDF bytes | `export-formats`, `present-mode`, `speaker-notes`, `marp-kit-render` (+ the `pageCount` users below) | pdf-lib / pdfinfo / pdftotext |
| Render a `.pdf` and assert **only on the `.html` sidecar** | the large majority | nothing PDF-specific |

`test/integration/mermaid/mermaid-smoke.test.js` is the archetype: it renders
`deck.pdf`, then `return fs.readFileSync(html, 'utf8')`. The PDF is never
opened.

**And removing it would buy almost nothing.** `page.pdf` on those small
fixtures is 61–85 ms out of a 3.6–7.0s render: **1.2–1.8%**. The waste is real
but it is not where the time is.

### 3b. The page-count oracle is replaceable

`component-galleries`, `bucket-galleries` and `exemplar-render` use
`pageCount(pdf)` via poppler as the oracle for "did a transform drop a slide" —
which also catches auto-split pagination. Measured across five decks, the HTML
sidecar carries the same post-split structure and yields the identical count:

| Deck | PDF pages | Sidecar slide markers |
|---|---:|---:|
| `auto-split` | 9 | 9 (+1 template) |
| `gallery-jargon` | 58 | 58 (+1) |
| `split-envelope-css` | 6 | 6 (+1) |
| 1-slide synthetic | 1 | 1 (+1) |

The offset is a constant 1 (the runtime's own template string), and a naive
`</section>` regex is *not* safe — decks that embed markup examples in their
prose add phantom matches (auto-split showed 3). A DOM query against the slide
container is exact. **So the PDF is not load-bearing for these assertions —
but replacing it saves render time only if the render also stops producing the
PDF, which is the 1.2–1.8% above.**

---

## 4. What PDF uniquely buys

Genuinely PDF-only, provable nowhere else:

| Capability | Probe | Where |
|---|---|---|
| Viewer semantics — `/PageMode FullScreen`, `/PageLayout`, `/Trans`, `/ViewerPreferences`, `/NonFullScreenPageMode`, `/FitWindow`, `/Dur` | pdf-lib | `present-mode` — 3 cases |
| Speaker notes as PDF `/Annots` (`/Contents`, hidden `/F 2`) | pdf-lib | `speaker-notes` — 3 of 5 cases |
| Selectable text + font embedding round-trip, raster/vector image behavior, paper geometry | `pdftotext`, `pdfinfo` | `export-formats` — 5 of 29 cases |
| One PDF page per slide, last page is a real slide | `pdfinfo`, `pdftotext` | `marp-kit-render` — 1 of 7 cases |
| Page count after auto-split | `pdfinfo` | `component-galleries`, `bucket-galleries`, `exemplar-render` — **replaceable, see §3b** |

**Thirteen test cases** in those four files read PDF bytes directly — corrected
from twelve: the first pass missed `export-formats`'s "the exported PDF carries
an accessible /Lang + title (WCAG 2.4.2 / 3.1.1)", which reads the raw bytes for
`/Lang`. This PR's own new `pdfinfo` case makes it fourteen in the shipped tree.

Two honesty notes on that figure. It counts only cases that parse PDF bytes
*inline*; the `pageCount()` helper also shells out to `pdfinfo`, and
`component-galleries` / `bucket-galleries` / `exemplar-render` call it across
every enriched component and bucket — dozens of cases, listed one row above but
not in the total. And the count is of *direct byte readers*, not of "tests that
need a PDF". The load-bearing conclusion is unchanged and narrower than the
number suggests: **a small, nameable set of capabilities genuinely requires PDF
bytes; everything else currently rendered to PDF is provable from the HTML
sidecar.**

Beyond the test suite, PDF earns its keep in two places numbers support:

- **As the review artifact.** Render + `pdftoppm -r 30` for a whole-deck
  overview is 15.7s against 59.0s to render PNGs directly — the PDF route is
  3.8× cheaper *and* produces sharper small images (vector rasterized down, not
  pixels scaled down).
- **As the golden.** 1.66 MB against 4.7–20.6 MB for any image equivalent.
  Swapping goldens to images would make the repository 3–12× heavier, not
  lighter.

---

## 5. What PDF costs the repository — the largest number here

| | |
|---|---:|
| Tracked PDFs | **351 files, 150.8 MB** |
| Share of the entire tracked tree (223.2 MB) | **67.5%** |
| `.git` in a **shallow** clone | 169 MB |
| New blob bytes in the last 20 commits — PDF | **216.0 MB** |
| New blob bytes in the last 20 commits — everything else | 114.6 MB |
| **PDF share of recent history growth** | **65.3%** |

By group: `examples/` 150 files / 57.3 MB · `lib/components/**/*.gallery.pdf`
150 files / 58.3 MiB · `exemplars/` 45 files / 13.9 MiB.

**Units:** the group figures above and the commit table below are **MiB**; the
headline 150.8 MB / 223.2 MB are decimal MB. The same 61,180,658 bytes therefore
appears as "58.3" in the group line and "61.2" in the commit table — one number,
two bases, not two measurements. The 67.5% and 65.3% ratios are unaffected.

The mechanism is re-blessing. A single cross-cutting CSS commit rewrites every
golden it touches:

| Commit | PDFs rewritten | Bytes added |
|---|---:|---:|
| `b842891f` theme(chrome): running header on split-panel | 150 | 61.2 MB |
| `48b378da` theme(on-dark): bind dark-panel ink | 123 | 51.5 MB |
| `c4db939b` forms(inset): stage outer inset | 96 | 48.4 MB |
| `bdadeb7b` chart(inset): charts at the frame inset | 72 | 39.6 MB |
| `e4ccb158` chart(body): block padding off the chart body | 28 | 12.0 MB |

And per `tools/golden-diff.mjs`, **committed gallery PDFs are not
byte-reproducible** — font-subset ordering and timestamps churn on every
rebuild — so a re-render with zero visual change still writes a full new blob
for every file. That is why `golden-diff.mjs` has to rasterize and pixel-diff
before it can tell a reviewer whether anything actually moved.

> **Corrected, and FIXED — see §9 rows 13–14.** "Font-subset ordering" was never
> measured; it does not churn. Two renders of `examples/sketch.md` on one machine
> produce 1,502,729 bytes of which **exactly four differ**, all digits inside
> `/CreationDate` and `/ModDate`. Pinning those two fields is the whole of L0, and
> it has shipped. What remains — and is NOT fixed — is that Skia rasterizes
> differently on different hosts, so a golden blessed elsewhere still differs.

**This is the real "PDF is heavy" cost, and it is a storage/history cost, not a
render cost.**

---

## 6. A defect found while measuring — **fixed in this change**

`node lattice-emulator.js deck.md out.html` wrote **PDF bytes into `out.html`**
(verified — the file began `%PDF-1.7`), plus a second `out.html.html` holding
the actual HTML. Cause: the format switch mapped only `.pptx`/`.png`/`.zip` and
fell through to `'pdf'` for everything else, and the sidecar name is derived by
stripping the output extension and appending `.html` — so an `.html` output
resolved to `out.html.html`.

`.html` is now a first-class output format rather than a rejected extension:

- The rendered HTML is the deliverable; no PDF is written, and the sidecar and
  the output are the same file.
- **Still a real browser render.** Auto-split and the overflow/legibility passes
  measure laid-out DOM, and the written file is their post-split result — an
  `.html` render pages identically to the same deck's `.pdf` (asserted in
  `test/integration/export/export-formats.test.js`). What it skips is `page.pdf`
  and the PDF-only iOS-Quartz SVG rasterization pass.
- Measured on the 58-slide deck: **6.77s vs 8.24s** to `.pdf` (medians of 3
  after a warm-up) — **17.8%**, which is `page.pdf` (1,242 ms in §2) plus the
  skipped SVG pass. An earlier 2-sample read of 6.4 vs 8.5 put this at ~25%;
  the 3-sample medians are the figure to quote. **It scales with the deck** —
  0.2–0.9% on a 1-slide fixture, 20% on the chart gallery (§1).
- `--player` / `--fluid` build the viewer at that path; `--notes` writes
  `deck.notes.txt`; `--raster`, `--paper`/`--orientation` and `--present` are
  PDF-only and now warn instead of going silent.

**What this does not do:** it is not the 0.78s browser-free number from §1, and
should not be sold as one. That figure is `lib/engine` with no layout at all —
a different coverage tier (§7, non-levers).

---

## 7. Levers, ranked by measured size

**Read the sizes as per-render or per-artifact, not as wall clock.** The first
pass multiplied a per-render saving by 156 renders and subtracted it from an
11m39s wall clock. That is wrong: `node --test` runs files **concurrently**
(`availableParallelism` = 4 here), and this document's own §3 proves it — the
five slowest suites it lists sum to ~1,119s against a 698.5s wall. A saving of
*N* serial seconds removes roughly *N* ÷ parallelism of wall clock, and less
when the box is CPU-saturated, because idle wait frees a core that other work
immediately refills. The serial×count arithmetic has been removed rather than
divided by a factor that was never measured.

| # | Lever | Measured size | Risk |
|---|---|---|---|
| ~~L0~~ | ~~**Make the exported PDF byte-reproducible**~~ — **DONE.** Pinning `/CreationDate` + `/ModDate` was the entire job; font-subset ordering never churned (§9 row 13) | A no-op re-bless of an unchanged deck now adds **zero** bytes to git, where it used to add the full file. Same-machine only: `golden-diff.mjs` still rasterizes, because a golden blessed on another host still differs (§9 row 13) | Landed. Smaller than written up here: one pure kernel + two write sites, no goldens touched |
| ~~L1~~ | ~~**Batch or memoize `mmdc`**~~ — **DONE, #1677.** One invocation per deck | Was ~2.9s × diagram count (40.7s of a 44.3s render). Now `1.86s + 1.09s × N`; corpus 454.5s → 245.5s, **−46%** | Landed. Memoization was measured and *dropped*: 118 fences, 111 distinct — 7 redundant renders, not worth a cache |
| ~~L2~~ | ~~**Try `waitUntil: 'load'`** on the three `page.goto` calls, keeping the existing explicit force-load~~ — **DONE.** | **0.66-0.80 s per navigation** measured end to end (not the ~1.7s written here first — §9 row 15). Per deck: 1 nav 2.14→1.48 s (−31%), 3 nav 4.09→1.80 s (−56%), 4 nav 5.48→2.27 s (−59%). **The −31% row is the typical one**: 265 of 277 shipped decks drive exactly one navigation, 10 drive **three** and 2 drive **four** — so the 56-59% figures describe ~4% of the corpus. (A first draft said "two" and "three": it derived the count as `1 + splits.length` and dropped the rails re-render, which the bench tier's own dataset names — "3 nav", "4 nav" — had right all along.) Whole corpus: 299.4→223.9 s (**−25%**, one sweep each way) | Landed. Safety was the whole job and it came out clean: **0 page-count, 0 clipped-page and 0 auto-split differences across all 277 decks**. `load` was never the weaker wait — it waits for `<img>`, CSS `background-image`, `<link>` stylesheets and webfonts (measured against delayed responses), and no request starts after `load` on any real sidecar |
| **L3** | **Audit integration assertions for layout-dependence.** Several render a whole browser to assert a string fact — `deck-class-fm`, `deck-mode-fm`, `deck-logo` say so in their own headers | 100% of those renders, not 1.8%. The root is that the emulator's front-matter post-process is a second implementation of the shared kernel — converge it (HARD RULE #1) and the assertions become unit tests | Per-assertion work; **only a minority qualify** (see the non-lever below) |
| **L4** | **Stop committing 351 golden PDFs** | ~150 MB tracked, 65% of history growth | **Only if L0 is impossible.** As written it trades the visual-review gate for disk: `golden-diff.mjs` needs the before-PDFs in the tree, and HARD RULE #9 requires a committed `.pdf` per feature deck |
| L5 | **Amortize per-spawn boot** — batch/daemon render instead of cold `spawnSync` per test | ~0.3–0.9s per spawn | Low, but new machinery. Deduplicating redundant re-renders is likely the bigger and safer win — one fixture is rendered 6× in a single file (`test/helpers/render.js` header) |
| L6 | Skip the PDF write in the tests that never read it | **0.2–0.9%** of those renders (§1) | Not worth doing on its own |

### Measured non-levers — do not do these

- **Switching tests or review to images.** 7–9× slower to produce, 3–12× more
  bytes.
- **Switching goldens to images.** Same, worse.
- **Switching tests to `.html` for speed.** 0.2–0.9% on the small fixtures the
  suite actually renders (§1).
- **Rasterizing PDFs at high DPI for review.** `pdftoppm -r 150` on the
  58-page deck is 91.2s — 11× the render that produced it. `-r 30` (what
  `rasterize-for-review.sh --overview` does) is 7.3s and is the right default.
- **WHOLESALE replacement of the browser render with the engine's in-process
  HTML.** It is ~10× faster (0.78s vs 8.24s) but lays nothing out: no fonts, no
  measurement, no overflow, no auto-split. Most of the per-PR slice genuinely
  needs that — `split-trigger`, `split-veto`, `split-envelope-css`,
  `content-clipped-pill`, `footer-band`, `legibility-watcher`, `axe-a11y` are
  all layout claims. **But this is a limit on wholesale replacement, not a
  reason to skip the per-assertion audit in L3.** The first pass cited HARD
  RULE #23 here; that rule says a verification claim must name its surface and
  carry an artifact from it — it does not say every assertion must be made
  against the shipped artifact, and it should not be stretched into "the
  browser is always required."

---

## 8. What is not measured here

- **CI wall-clock.** Every number above is this sandbox. GitHub runners are a
  different machine; the *ratios* should hold, the absolutes will not. Real CI
  job durations are free from the Actions API and were not collected — they are
  the only wall clock anyone actually waits on.
- **The parallelism factor.** `node --test` runs files concurrently and this
  document never measured by how much. One run with `--test-concurrency=1`
  beside a normal run would give it directly, and every per-render lever should
  be divided by it.
- **The hit rate of the slow arm** — attempted when L2 shipped, and it is STILL NOT a
  settled number. One leg reproduces everywhere: a **fresh page in an already-warm
  browser** hits the 2,002 ms arm on 6/6, 9/10, 10/10 and 10/10 across four independent
  runs. Nothing else does. A **fresh browser's first page** — the context the CLI
  actually uses — has been measured at 0/6, 0/10, 1/10, 7/10 and 10/10 depending on
  document and run, and a **reused page** at 0/6, 0/10 and 1/10. Two successive attempts
  to state this as a clean rule were both refuted by re-measurement (§9 row 16). The
  honest position is that the arm is real, one context provokes it reliably, and its
  incidence elsewhere is document- and run-dependent for reasons nobody has found.
  **L2's size does not depend on any of this** — it was measured end to end.
- **What actually causes the 2,003 ms pin** (§2a). Two candidate mechanisms were
  refuted by experiment, and two attempts to characterize it by *context* rather than
  by cause were refuted by re-measurement. Nothing has been found.
- **How many of the renders are distinct inputs** versus redundant re-renders of
  the same deck. `test/helpers/render.js`'s own header notes one fixture is
  rendered 6× in a single file, so deduplication may be a larger and safer win
  than L5's daemon — and it is invisible while the render count is treated as a
  constant.
- **The nightly tiers** (`test:integration:nightly`, `perf-nightly`,
  `studio-e2e-nightly`) were not timed as tiers.
- ~~**Whether L2 is safe.**~~ — **VERIFIED, and against the whole corpus rather
  than the overflow gate alone.** All 277 shipped decks rendered before and
  after: **0 page-count differences, 0 clipped-page differences, 0 auto-split
  differences.** Eleven decks differ in PDF bytes and a same-code control
  reproduces exactly the same eleven, so that channel is pre-existing
  nondeterminism, not this change (§9 row 17).
- ~~**What makes 11 of 277 decks render to different BYTES run to run.**~~ —
  **IDENTIFIED, and it is TWO things** (§9 rows 17 and 20). The second — an unseeded
  rough.js in Mermaid's `classBox`, which churns a classic diagram deck's content
  stream — is FIXED. The first, and the remainder of this bullet, is Chrome's
  tagged-PDF accessibility node IDs. The
  remaining open part is smaller and specific — *why the counter starts from a
  different value*, and whether pinning it is reachable from our side at all.
  The output is pixel-identical either way, so this is a repo-hygiene question
  (it erodes L0's byte-reproducibility and is a flake risk for anything that
  diffs rendered PDFs), not a correctness one.
- **A latent font-ordering hazard, deliberately not guarded.** The state-chart's
  in-page `document.fonts.ready.then(drawAll)` feeds measured geometry, and
  `f.load()` on a face that is still `unloaded` REPLACES `document.fonts.ready` —
  measured — which would orphan that redraw. It holds today only because deck
  fonts are `data:` URIs and every face is already `loaded` when the navigation
  returns (measured across five sidecars: `unloaded=0`, ready not replaced). A
  theme or `--css` override adding one genuinely remote `@font-face` breaks the
  invariant. Nobody has built that deck; the invariant is now written beside the
  force-load rather than left implied.
- **37 of 74 declared `@font-face` are in `error` state** on a real sidecar, under
  both waits, swallowed by the force-load's `.catch(() => {})`. Pre-existing and
  off the path of L2 — logged here rather than chased.

---

## 9. Correction log

This document asserted things that were wrong. They are listed rather than
quietly fixed, because it was quoted in a PR while wrong, and because the
pattern in them is instructive: **every error was a mechanism inferred from a
timing signature, and the measurements themselves all held.**

| # | Originally said | Actually | Found by |
|---|---|---|---|
| 1 | `.html` saves ~25% (6.4 vs 8.5s, 2 samples) | 17.8% (6.77 vs 8.24, medians of 3), and **~0 on small decks** | Re-measuring with more samples |
| 2 | The ~2.0s wait is a flat toll | Bimodal: 771–802 ms or exactly 2,003 ms on identical commands | Re-measuring |
| 3 | The 2,003 ms is the `settleFonts` 2,000 ms cap leaking through `networkidle0` | **Refuted by experiment** — removing the force-load entirely still yields 2,003 ms, and the last network event fires at 162 ms. Cause unidentified | Independent checker |
| 4 | "17 declared faces, ~9 used" is what `settleFonts` walks | That is the `--player` prune's count of a different set; `document.fonts.size` is 74 in a real render | Independent checker |
| 5 | Dropping `networkidle0` reintroduces #894 | #894 was the **exported watcher**; the render has its own explicit unbounded force-load at `:2421`. The cheap fix was ruled out on a false premise | Munger inversion |
| 6 | `mmdc` is a fixed per-deck cost (2.7–3.2s) | **Per diagram** — ~2.9s × N; 40.7s of a 44.3s render on a 14-fence deck. The comparison used two 1-fence decks, one of them labeled "many diagrams" | Munger inversion |
| 7 | Levers sized as per-render × 156 renders ≈ minutes of wall clock | `node --test` runs files concurrently; the doc's own suite sums exceed its own wall clock | Munger inversion |
| 8 | "18 integration files spawn the CLI"; "12 cases read PDF bytes" | 25 files (a literal grep missed the `runEmulator` indirection); 13 direct byte-readers, 14 in this tree | Independent checker |
| 9 | HARD RULE #23 forecloses the engine-HTML tier | #23 governs how a verification claim is *evidenced*, not which tier an assertion may use. Over-cited to close a door that should stay open (L3) | Munger inversion |
| 10 | `.html`'s justification is the 17.8% | Its real customer is `--player`/`--fluid`, which previously forced an unwanted PDF encode. Size-independent, and the honest headline | Munger inversion |
| 11 | The goldens are un-reproducible because of font-subset ordering and timestamps (§5) | **A third cause, and the largest: the diagrams themselves were random.** `look: handDrawn` paints through rough.js, seeded from `handDrawnSeed`, which Mermaid defaults to `0` — read as "use `Math.random()`". 32 of 161 SVG lines differed between back-to-back renders of `examples/sketch.md`. Fixed in #1677 by pinning the seed | Building the diagram oracle for #1677 |
| 12 | `mmdc` costs "2.9–3.2s per deck with a diagram" (§2b, already corrected once to per-diagram) | Confirmed per-diagram and now **fixed**: #1677 batches a deck's fences into one invocation. Corpus render 454.5s → 245.5s (−46%). The lever table below describes the state *before* that landed | #1677 |
| 13 | Goldens churn from "font-subset ordering **and** timestamps" (§5, and four comments in `golden-diff.mjs` / `regression-gate.mjs` that had repeated it for months) | **Only the timestamps.** Two renders of `examples/sketch.md` on one machine: 1,502,729 bytes each, **exactly 4 differ**, every one a digit inside `/CreationDate` or `/ModDate`. Font subsets, object order and xref offsets are already stable. Nobody had ever byte-compared two renders; the font-subset half was inherited, not measured. Fixed by pinning two fields — L0 turned out to be a pure kernel and two call sites, not the multi-part job it was scoped as | Building L0 |
| 14 | Pinning the dates in the written bytes covers every path | **Half the paths.** It covers the Skia-only render, whose dates are in the clear. The four pdf-lib post-passes (`--notes` / `--present` / `--embed-source` / `--raster`) re-save through `PDFDocument.save()`, which defaults to `useObjectStreams: true` and packs the Info dictionary into a **Flate-compressed** object stream — the timestamp is still there, invisible to a byte scan, and because deflate output length tracks its input the FILE LENGTH moved too (`--embed-source`: 2,903 bytes differing, 28,194 vs 28,195). Caught by testing each post-pass instead of assuming the vector result generalized; fixed by pinning at the document level before `save()` as well | Measuring the fix |
| 15 | L2 is worth **~1.7s per navigation** (§2a, §7) | **0.66-0.80 s per navigation.** The 1.7s came from a probe that opened a FRESH PAGE per sample against a warm browser — the one context that pins `networkidle0` at 2,002 ms. The CLI launches its own browser and re-navigates one page, so it never enters that context. Measured end to end through the real CLI, the three decks that drive 1, 3 and 4 navigations saved 0.66 / 0.76 / 0.80 s each. The lever is still large — 31-59% of a deck's render — just not for the stated reason | Building the CLI bench tier that #19(c) required |
| 16 | The 2,003 ms arm is a clean three-way **condition**: fresh page in a warm browser 6/6, reused page 0/6, **fresh browser's first page 0/6** | **Refuted twice, in the same change.** This is the SIXTH inferred mechanism in this log, written by the person who had just finished reading the other five — and then the *correction* to it was itself too confident and had to be corrected again. Round one (n=10, two documents): fresh browser's first page **7/10 and 1/10**, not 0/6. Round two, an independent re-run: **0/10 and 10/10**, and the *reused-page* leg came in at **1/10** rather than 0. So across four runs only ONE leg survives — a fresh page in a warm browser, 6/6 / 9/10 / 10/10 / 10/10. The other two span nearly their whole range and are document- and run-dependent. **There is no clean condition, and the cause remains unidentified.** Row 15's number is unaffected: it was measured end to end and never rested on this | The adversarial trio (HARD RULE #25), then a second independent review of the correction |
| 17 | Renders are byte-reproducible (rows 13-14; and `2026-08-18-golden-corpus-purpose-and-medium.md`: "4 decks of 30 are byte-irreproducible, driven by `classDiagram`, not by mermaid") | **True of the decks that were sampled, not of the corpus — and the mechanism is now MEASURED rather than guessed.** Two same-code runs over all 277 shipped decks differ on **at least 11**, and the count is a function of MACHINE CONTENTION rather than of any code: across seven sweeps the pairwise counts run 9–28, and **same-code controls (11 and 19) land inside the range of cross-code comparisons (9–28)**, the busiest sweep producing the most churn. The set is not fixed either — `cover-paginate.md`, outside the original 11, reproduces it in 39 bytes. Only 5 of the 11 contain `classDiagram` and four contain no mermaid at all, so `classDiagram` is not the driver. **What it is:** Chrome's tagged-PDF accessibility node IDs. Four states of `muted-tier-and-syntax.md` are all exactly 304,496 B / 8 pages and differ in **26 bytes**: 20 inside `/ID (node0000046N)` and the `/Headers [(node0000046N)]` that references it, and **6 more in the `/Limits` and `/Names` of the structure-ID name tree** — definitions, references and the index shifting together. All states rasterize **pixel-identical**. Page counts, clipped-page sets and split decisions never varied | The corpus sweep for L2, then the adversarial trio isolating the bytes |
| 18 | L2 (`waitUntil: 'load'`) changes nothing about what is exported — "0 page-count, 0 clipped-page, 0 auto-split differences across 277 decks" | **The corpus was right and the generalization was wrong, twice.** (a) `load` does not wait for `<img loading="lazy">` or `<iframe loading="lazy">`, which Chromium defers past the load event; a deck can carry raw HTML (`html: true`), and a lazy remote image rendered under `load` was **absent from the PDF entirely** — `pdfimages -list` showing the object under `networkidle0` and no image objects at all under `load`, exit 0, no warning. The corpus could not see it: it contains **zero** raw `<img>`, remote assets, `<iframe>`, `<video>` or `url()`. Fixed in the same change by promoting deferred media to eager and awaiting decode after each navigation. (b) One reviewer measured the change **widening** row 17's AX-node churn — `muted-tier-and-syntax.md` at 2 distinct byte states before and 4 after, under 24-way contention. **Treat that as unconfirmed**: a second reviewer got 3 states in 12 renders and could not settle it, and the corpus-wide count is now known to track machine contention rather than code (row 17), with same-code controls landing inside the cross-code range. Either way the HTML sidecar and the raster are identical, so nothing user-visible turns on it | The adversarial trio, attacking a class the corpus does not contain |
| 19 | Deferred media is "the one class `load` does not wait for", and `settleDeferredMedia` handles it | **Both halves wrong, and the fix was worse than the bug it fixed.** (a) It is not the only class: `networkidle0` also granted a few hundred ms of incidental post-load grace, and a deck-authored `<script>` writing on a 400 ms timer landed before and does not now — disclosed in the changelog rather than fixed, because no finite wait is correct for author code racing the exporter — the choice between a bounded settle and an explicit decline was tracked as **#1792** and is now **settled — declined on the record, with the loss reported rather than silent (§2a-ter)**. (b) The first `settleDeferredMedia` **wedged the render on any `<iframe>`**: `contentDocument` is `null` (not a throw) for an opaque-origin frame, so a frame whose load had already fired was awaited forever — ~190 s, then a FAILED export, where the old code rendered in 1.9 s. The same line skipped a same-origin lazy frame, whose initial `about:blank` reads `complete`, so it was promoted and never awaited. Rewritten: every wait bounded at 10 s with a warning, frames awaited only if promoted, images left alone because `decode()` alone settles them — which also stopped `loading="eager"` leaking into the `--player` bake | An independent checker + fact-checker on the post-trio delta — i.e. on the fix for the previous row |
| 20 | Row 17: "`classDiagram` is not the driver" of byte-irreproducibility, the mechanism being Chrome's tagged-PDF accessibility node IDs | **Right about the AX nodes, over-general about `classDiagram` — there are TWO mechanisms and the second is now fixed.** Row 17's actual evidence was a population argument (only 5 of 11 churning decks contain `classDiagram`, four contain no mermaid), which refutes "`classDiagram` is the ONLY driver" and does not touch "`classDiagram` churns." It does: a classic `classDiagram` fence rendered twice differs by **1,207 bytes inside a Flate-compressed CONTENT stream**, a different place and two orders of magnitude off row 17's 26 bytes in `/ID` + `/Headers`. Decompressed they are bezier control points. Mermaid's `classBox` draws through rough.js on EVERY render and merely flattens the wobble after (`if (node.look !== 'handDrawn') { options.roughness = 0 }`); `roughness` multiplies the draws AFTER they are taken, and rough.js `_line` spends one on `divergePoint = 0.2 + random(o) * 0.2`, which it never scales. Lattice emitted `handDrawnSeed` only under `look: handDrawn`, so a classic deck got Mermaid's default `0` and rough.js read that as `Math.random()`. Both control points land ON the segment between the endpoints, so the cubic IS that segment: pixel-identical output, different `<path d>` text — which is precisely why every pixel oracle in the repo was blind to it, and why the AX-node hunt found the other mechanism instead. Fixed by stating the seed on both looks. Measured across all 31 committed mermaid decks: **7 changed bytes, 0 changed pixels** — the two decks that showed 1 px and 7 px were already flickering 2-3 px and 5-7 px between consecutive PRE-fix renders, and now render byte-identically. Two of the 7 contain no `classDiagram`, so the rough.js path reaches past that one diagram type. **Row 17 is otherwise unamended**: the AX-node churn is a genuinely separate mechanism, still unpinned, and still the one that explains the churning decks with no mermaid in them | Reproducing row 17's own repro and decompressing the stream instead of diffing the PDF |

The red team's findings were defects in the shipping code rather than in this
document — the `--strip-notes` sidecar leak, the `.HTML` case mismatch, the
orphaned pre-split file on a failed render, an inflatable page count, and a
regression test that could not fail. All are fixed in this PR; see its
description.
