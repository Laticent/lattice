---
status: shipped
summary: PDF was assumed to be the expensive default for testing and sanity checks. Measured, it is the CHEAPEST browser-backed format Lattice ships — PNG/PPTX/ZIP cost 7–9× the same deck, and every image golden costs 3–12× more bytes than the vector PDF. The PDF encoder is 2.3% of a small render and 15% of a large one; the cost is the browser round-trip, and inside it a `networkidle0` wait that pins at ~2.0s on a 1-slide and a 58-slide deck ALIKE — the signature of a timeout, and it is the `settleFonts` 2000ms cap leaking through the network heuristic while the page force-loads 17 declared faces to use about 9 — plus a second Chrome booted by `mmdc` (2.9–3.2s per deck with any diagram). 16 of 18 integration files render a PDF and assert only on the HTML sidecar, but dropping it buys 1.2–1.8% — the real PDF cost is storage, not time: 351 tracked PDFs are 67.5% of the tree and 65.3% of the last 20 commits' new bytes, because one cross-cutting CSS commit re-blesses up to 150 non-byte-reproducible goldens at once. Also fixed here: `deck.md out.html` wrote PDF bytes into a `.html` file (plus an `out.html.html`) — `.html` is now a first-class output format, a real browser render minus the PDF encode, measured 6.77s vs 8.24s on a 58-slide deck (medians of 3) — a saving that scales with the deck and is ~0 on the small fixtures the tests use.
---

# PDF vs HTML vs image — what each format actually costs

**2026-08-16 · measurement record, plus the one defect it turned up (§6)**

**Question asked:** we default to PDF for testing and sanity checks; PDF feels
heavy. What does it buy us, and where can we be leaner?

**Short answer, and it inverts the premise:** PDF is the **cheapest**
browser-backed format Lattice ships — every image format costs 6–10× more for
the same deck, and every image *golden* costs 3–12× more bytes. What is
expensive is **the browser round-trip itself**, which every format except the
in-process engine render pays. The PDF encoder is 2.3% of a small render and
15% of a large one. Format is not the lever; **the number of browser
round-trips, and a font wait inside each one that is pinned to a 2,000 ms
timeout rather than to the deck, are.**

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
2. **The vector PDF is the smallest artifact we can commit** — smaller than its
   own HTML sidecar (1.66 MB vs 2.54 MB), and 3–12× smaller than any image
   golden of the same deck.

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

**A number that ignores deck size is a timeout, not work**, and this one is the
`settleFonts` bound. The exported HTML's own script calls
`settleFonts(document.fonts, 2000)` on `DOMContentLoaded`
(`lattice-emulator.js`, `lib/core/font-settle.js`), which calls `.load()` on
**every declared `@font-face`** — 17 faces, of which a given deck uses about 9
(the `--player` prune reports `9/17 faces kept`). Those loads are network
requests, so they hold `networkidle0` open, and the 2,000 ms cap in
`settleFonts`'s `Promise.race` is what the navigation ends up pinned to. The
render is waiting on **fonts the deck never uses**, through a heuristic that
cannot tell the difference.

Traced inside the real CLI the same wait is **bimodal** — 771 / 794 / 801 / 802
ms on some runs of an identical command, then exactly 2,003 ms on others. The
fast runs are the fonts genuinely resolving; the slow ones are the cap. Both
readings are real, which is why "~2.0s every time" was wrong: the honest
statement is **up to ~1.8s per render, hit often but not always**.

This is still not free money, and the fix is not swapping the `waitUntil`. The
comment at `lattice-emulator.js:2170` records why the wait exists: fonts that
load lazily leave a slide measured against fallback metrics and produce a false
overflow ring (#894). Dropping to `load` would reintroduce exactly that. The
shape of a real fix is to **await the page's own settle promise** — the
`settleFonts` result is already computed in-page — instead of inferring it from
network idle, and to force-load only the faces the deck actually uses. Then a
render waits as long as its fonts take (~0.3s on the fast runs above) rather
than paying a 2,000 ms cap that has nothing to do with the deck.

### 2b. mmdc launches a second browser

`mmdc` costs 2,659 ms on a 58-slide deck with many diagrams and 3,235 ms on a
1-slide deck with one trivial flowchart. **The cost is a fixed second Chrome
boot, not per-diagram work.** Any deck touching mermaid pays it on top of the
emulator's own `browser.launch`.

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

18 integration files spawn the CLI. Classified by what they read back:

| | Files | What they need |
|---|---:|---|
| Read real PDF bytes | **2** (`export-formats`, `present-mode`) + `speaker-notes`, `marp-kit-render` | pdf-lib / pdfinfo / pdftotext |
| Render a `.pdf` and assert **only on the `.html` sidecar** | **16** | nothing PDF-specific |

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

**Twelve test cases** — out of 44 in those four files, and out of 714
integration tests total — genuinely read PDF bytes. Everything else currently
rendered to PDF is provable from the HTML sidecar.

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
150 files / 58.3 MB · `exemplars/` 45 files / 13.9 MB.

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

| # | Lever | Measured size | Risk |
|---|---|---|---|
| L1 | **Await the page's own `settleFonts` promise instead of `networkidle0`**, and force-load only the faces the deck uses | `networkidle0` costs **1.37s (58-slide) to 1.77s (1-slide)** over `load`, hit on most but not all renders (§2a). Bounded by ~1.8s × 156 renders ≈ **4.6 min** off an 11m39s run | Real — #894's false-overflow bug is what the wait prevents, so a weaker `waitUntil` is NOT the fix. The in-page settle result already exists; the work is plumbing it out and re-running the overflow corpus. |
| L2 | **Stop shelling out to `mmdc`**; render mermaid in the browser we already launched | **2.7–3.2s per deck** with any diagram — a whole second Chrome boot | Moderate — mermaid theming contract must be preserved (`engineering/mermaid.md`) |
| L3 | **Amortize per-spawn boot** — batch/daemon render for the test suite instead of 156 cold `spawnSync` calls | ~0.3–0.9s × 156 ≈ **1–2 min**, plus node startup | Low, but it is new machinery |
| L4 | **Stop committing 351 golden PDFs**; keep the `.md`, render goldens on demand, commit only what a human is meant to open | **~150 MB tracked, 65% of history growth** | Design decision, not a tweak — touches HARD RULE #9 and the golden/regression gate |
| L5 | Skip the PDF write in the 16 tests that never read it | **1.2–1.8%** of those renders | Low — and not worth doing on its own |

### Measured non-levers — do not do these

- **Switching tests or review to images.** 7–9× slower to produce, 3–12× more
  bytes.
- **Switching goldens to images.** Same, worse.
- **Rasterizing PDFs at high DPI for review.** `pdftoppm -r 150` on the
  58-page deck is 91.2s — 11× the render that produced it. `-r 30` (what
  `rasterize-for-review.sh --overview` does) is 7.3s and is the right default.
- **Replacing the browser render with the engine's in-process HTML.** It is
  12× faster (0.78s vs 8.4s) but it does not lay anything out: no fonts, no
  measurement, no overflow, no auto-split. It is a different coverage tier, not
  a cheaper version of the same one. Per HARD RULE #23, a claim verified there
  is not a claim about the rendered deck.

---

## 8. What is not measured here

- **CI wall-clock.** Every number above is this sandbox. GitHub runners are a
  different machine; the *ratios* should hold, the absolutes will not.
- **The nightly tiers** (`test:integration:nightly`, `perf-nightly`,
  `studio-e2e-nightly`) were not timed as tiers — only the full local
  integration run, the per-PR slice, and their per-suite breakdowns.
- **Whether L1 is safe.** The 1.37–1.77s is real; that #894 stays fixed under a
  `document.fonts.ready` gate is a hypothesis until it is built and the
  overflow corpus is re-run. Marked **UNVERIFIED**.
