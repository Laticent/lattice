---
status: shipped
summary: PDF was assumed to be the expensive default for testing and sanity checks. Measured, it is the CHEAPEST browser-backed format Lattice ships — PNG/PPTX/ZIP cost 7–9× the same deck, and every image golden costs 3–12× more bytes than the vector PDF. The PDF encoder is 1.6% of a small render and 15% of a large one; the cost is the browser round-trip, and inside it a FLAT ~2.0s `networkidle0` toll per render (56% of a 1-slide render) plus a second Chrome booted by `mmdc` (2.7–3.2s per deck with any diagram). 16 of 18 integration files render a PDF and assert only on the HTML sidecar, but dropping it buys 1.2–1.8% — the real PDF cost is storage, not time: 351 tracked PDFs are 67.5% of the tree and 65.3% of the last 20 commits' new bytes, because one cross-cutting CSS commit re-blesses up to 150 non-byte-reproducible goldens at once. Also found: `deck.md out.html` writes PDF bytes into a `.html` file — there is no HTML-only output mode.
---

# PDF vs HTML vs image — what each format actually costs

**2026-08-16 · measurement record, no behavior change in this commit**

**Question asked:** we default to PDF for testing and sanity checks; PDF feels
heavy. What does it buy us, and where can we be leaner?

**Short answer, and it inverts the premise:** PDF is the **cheapest**
browser-backed format Lattice ships — every image format costs 6–10× more for
the same deck, and every image *golden* costs 3–12× more bytes. What is
expensive is **the browser round-trip itself**, which every format except the
in-process engine render pays. The PDF encoder is 1.6% of a small render and
15% of a large one. Format is not the lever; **the number of browser
round-trips, and the fixed ~2.0s wait inside each one, are.**

---

## 0. Measurement conditions

Everything below was measured on the cloud sandbox, one run per row unless
noted, no other load:

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
| Engine HTML, **in-process, no browser** | **0.78s** | 0.08× | 142 KB html + 767 KB css |
| CLI → `.pdf` (+ HTML sidecar) | **~8.4s** | 1× | 1.66 MB pdf + 2.54 MB html |
| CLI → `.pptx` | 57.7s | 6.9× | 20.9 MB |
| CLI → `.png` (58 files) | 59.0s | 7.0× | 20.6 MB |
| CLI → `.zip` image set | 74.3s | 8.8× | 21.2 MB |
| CLI → `.pdf`, then `pdftoppm -r 150` | 8.4 + 91.2 = 99.6s | 11.8× | + 15.2 MB |
| CLI → `.pdf`, then `pdftoppm -r 30` (review overview) | 8.4 + 7.3 = 15.7s | 1.9× | + 2.5 MB |

The PDF row is the median of three samples spreading 7.8 / 8.4 / 9.6s
(in-process trace total, `time` wall, and the scripted loop, which adds shell
spawn) — read it as "8–10s", not a tight figure. The other rows are single
samples, far enough apart that the spread changes no ordering.

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

**58-slide deck → PDF · total 7,785 ms**

| Phase | ms | % |
|---|---:|---:|
| `mmdc` (mermaid, its **own** Chrome) | 2,659 | 34.2% |
| `page.goto` (load + layout + settle) | 2,003 | 25.7% |
| `page.pdf` (**the actual PDF encode**) | 1,176 | 15.1% |
| `browser.launch` | 277 | 3.6% |
| other `execSync` / `evaluate` | 187 | 2.4% |
| node boot + engine render + file IO (remainder) | ~1,480 | ~19% |

**58-slide deck → PNG · total 56,328 ms** — 50,131 ms (89.0%) is
`element.screenshot` × 58. Everything else is identical to the PDF run.

**1-slide deck, no mermaid → PDF · total 3,591 ms**

| Phase | ms | % |
|---|---:|---:|
| `page.goto` | 2,006 | 55.9% |
| `browser.launch` | 306 | 8.5% |
| `execSync` | 180 | 5.0% |
| `page.pdf` | **65** | **1.8%** |

**1-slide deck, one trivial flowchart → PDF · total 6,965 ms** — `mmdc` alone
is 3,235 ms (46.4%); `page.pdf` is 85 ms (1.2%).

### 2a. The fixed ~2.0s wait

`page.goto` reads 2,003–2,019 ms on **every** deck regardless of size. Probing
the same generated HTML with a warm browser at four `waitUntil` settings:

| `waitUntil` | 1-slide | 58-slide |
|---|---:|---:|
| `domcontentloaded` | 216 ms | 687 ms |
| `load` | 668 ms | 670 ms |
| `networkidle0` (**what we use**) | 1,365 ms | 2,003 ms |
| `networkidle2` | 2,002 ms | 2,020 ms |

So `networkidle0` costs ~1.3s more than `load` on a real deck, and it is a
**flat toll paid per render** — not work proportional to the deck.

This is not free money. The comment at `lattice-emulator.js:2170` documents why
the wait exists: fonts that load lazily leave a slide measured against fallback
metrics and produce a false overflow ring (#894). But `networkidle0` is a
*proxy* for "fonts are settled", and the direct signal — `document.fonts.ready`
plus the existing `lib/core/font-settle.js` helper — is already in the codebase.

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

## 6. A defect found while measuring

`node lattice-emulator.js deck.md out.html` writes **PDF bytes into
`out.html`**, plus a second file `out.html.html` containing the actual HTML.
Verified — `out.html` begins `%PDF-1.7`.

Cause: `lattice-emulator.js:515-518` maps only `.pptx`/`.png`/`.zip` and falls
through to `'pdf'` for everything else, including `.html`. **There is no
HTML-only output mode in the CLI** — the HTML is always a byproduct of a full
browser PDF render. The `--help` text does not list `.html` as an output, so
this is an unhandled extension rather than a broken feature, but it silently
produces a mislabeled file instead of erroring.

---

## 7. Levers, ranked by measured size

| # | Lever | Measured size | Risk |
|---|---|---|---|
| L1 | **Drop the per-render ~2.0s `networkidle0` toll** for an explicit `document.fonts.ready` gate | ~1.3s × 156 renders ≈ **3.4 min** off an 11m39s integration run; 56% of a small render | Real — #894's false-overflow bug is what the wait prevents. Needs the direct font signal, not just a weaker `waitUntil`. |
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
- **Whether L1 is safe.** The ~1.3s is real; that #894 stays fixed under a
  `document.fonts.ready` gate is a hypothesis until it is built and the
  overflow corpus is re-run. Marked **UNVERIFIED**.
