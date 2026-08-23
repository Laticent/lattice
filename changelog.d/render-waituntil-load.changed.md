- **Every PDF / PNG / PPTX / HTML export is faster — the render no longer idles after each
  navigation.** The export navigated with `waitUntil: 'networkidle0'`, which waits for the
  network to go quiet *after* everything the page needs has already arrived. Measured through
  the real CLI, that wait cost **0.66–0.80 s per navigation**, and a render performs one
  navigation plus one per auto-split pass plus one for the rails re-render — so the saving
  scales with how much a deck splits: `portrait-roadmap` (1 navigation) **2.14 s → 1.48 s
  (−31%)**, `auto-split` (3) **4.09 s → 1.80 s (−56%)**, `cover-paginate` (4) **5.48 s → 2.27 s
  (−59%)**. The −31% row is the typical one — 265 of the 277 shipped decks drive exactly one
  navigation, 10 drive three and 2 drive four. Sweeping all **277**: **299.4 s → 223.9 s (−25%)**
  wall clock at 4× parallelism (one sweep each way). Per-deck savings are bimodal run to run,
  because the wait this removes was itself bimodal; the corpus figure is the one to quote.
- The change is `waitUntil: 'load'` on the three `page.goto` calls, and it is safe because
  `load` was never the weaker wait for anything this document contains. Serving each resource
  kind from a local server behind a deliberate 1,500 ms delay, `load` **waits** for `<img>`,
  for CSS `background-image: url()`, for `<link rel=stylesheet>` and for the webfont fetch —
  and instrumenting five real sidecars (state-chart, function-plot, images, the 58-slide jargon
  gallery, portrait-roadmap) recorded **zero requests starting after the `load` event**, watched
  a further 2 s past `networkidle0`. Mermaid is pre-rendered in Node and inlined, deck fonts are
  `data:` URIs, and nothing in the page fetches at runtime. Font correctness never rested on the
  navigation wait: it rests on the explicit unbounded force-load that follows each one, which is
  unchanged.
- **Deferred media is now awaited after each navigation.** Chromium holds a below-viewport
  `<img loading="lazy">` past the load event, and a deck can carry raw HTML, so on `load` alone
  such an image never started loading and the export shipped **without it, silently, exit 0**.
  Every image is now decoded, and every `loading="lazy"` frame promoted and awaited, before
  anything is measured or printed — each wait bounded at 10 s, with a warning naming any
  resource that did not settle rather than dropping it in silence.
- **Known behavior change, disclosed rather than fixed: a deck-authored `<script>` that writes
  into the page on a timer may no longer make it into the export.** `networkidle0` incidentally
  granted a few hundred milliseconds of post-load grace, and `load` grants none — measured, a
  400 ms `setTimeout` that landed before now does not. This is not the same case as lazy media:
  a deferred image is markup the browser chose to defer and the export genuinely owes it, whereas
  an author timer is code racing the exporter, where no finite wait is the right answer. The
  engine emits no such scripts and the grace period was never a contract (it varied from ~0.6 s
  to ~1.9 s run to run), but if you relied on it, you will notice.
- **Verified against the whole shipped corpus, not a sample.** 277 decks rendered before and
  after: **identical page counts, identical clipped-page sets, identical auto-split decisions —
  0 differences in all three.** Some decks differ in PDF *bytes*, and that channel is
  pre-existing render nondeterminism rather than anything this change caused: **a same-code
  control run differs on 19 decks, which sits inside the 9–28 range of the cross-code
  comparisons.** The count tracks machine contention, not the diff — the busiest sweep produced
  the most churn. The mechanism is Chrome's tagged-PDF accessibility node IDs (26 bytes across
  `/ID`, `/Headers` and the structure-ID name tree), and every state rasterizes
  pixel-identical.
- New opt-in bench tier, `npm run bench -- --cli`, times a whole `lattice-emulator.js` render —
  node boot, browser launch, navigation and PDF encode. Nothing measured that before: every
  other tier drives the engine in-process or calls `page.setContent` in a browser the bench
  itself launched, so a change to the CLI's navigation strategy moved no number in the file at
  all (HARD RULE #19(c)). Its three decks are chosen for navigation count (1, 3 and 4) and are
  deliberately mermaid-free so `mmdc` cannot swamp the signal. Its `slides` column is the PDF
  page count, so the row doubles as a pagination guard that fails on any machine.
- **Fixed:** three code comments that described the render inaccurately. Two credited
  `waitUntil: networkidle0` with covering the function-plot and state-chart `DOMContentLoaded`
  bootstraps — true, but stronger than the facts, since `DOMContentLoaded` precedes `load`
  anyway. A third said `measureOverflow()` "already force-loads fonts first, via the same
  `lib/core/font-settle.js` helper"; it does not — `measureOverflow` touches `document.fonts`
  nowhere, and the force-load lives in its *callers* as an inline unbounded `page.evaluate` that
  is deliberately not on the shared helper. A new call site added on the strength of that
  comment would have silently measured fallback metrics.
