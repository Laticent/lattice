- **Fixed: an export that loses a deck-authored `<script>`'s output no longer loses it
  silently.** Since the render started navigating with `waitUntil: 'load'`, a slide that
  paints itself from a `setTimeout` ships without that content, exit 0, with nothing said —
  the same failure shape as the lazy-image class, and the half of it that was disclosed
  rather than fixed (#1792). The render now names what had not run at the instant it
  captured:

  ```
    ⚠ 1 deck-authored script task had not run when the export captured — whatever it writes is NOT in this file.
        slide 3 · inline <script> · setTimeout(400ms)
      The export captures at the load event plus an explicit media settle; it does not wait on author timers.
  ```

- **The wait itself is declined, on the record.** The export captures at the `load` event
  plus an explicit deferred-media settle, and does **not** wait on author timers — because
  no finite wait is correct for code racing the exporter: whatever budget we published, the
  next deck could ask for one millisecond more, and the budget would be spent on every
  navigation of every deck for a class no shipped deck uses (all 277 scanned; 3 carry a raw
  `<script>`, all 3 parser-blocking `<script src>` scaffolding with no deferral of their
  own). The grace period that existed before was never a contract either — it came from
  `networkidle0`'s idle floor, which is bimodal and machine-dependent; bisected on a
  2-slide deck, 40 ms and 80 ms landed and 120 ms did not. Written up in
  `engineering/decisions/2026-08-16-render-format-cost-assessment.md` § 2a-ter, and stated
  for deck authors in `design/skill.md` § Raw HTML in a deck and `AGENTS.md`.

- **New `lint:deck` rule `author-script-defers`** flags a deferring inline `<script>` while
  the deck is still being written, which is also the answer to the render probe's one
  structural blind spot: `document.currentScript` is `null` inside a
  `<script type="module">`, so the probe has nobody to attribute the timer to and stays
  quiet. Across the 274 shipped decks the new rule reports zero findings.

- **The warning fires exactly when content was lost, which is the property that matters.** A
  false alarm on a deck that rendered correctly would teach authors to ignore the channel, so
  work that already ran, work that was canceled with `clearTimeout`, and an interval that has
  already ticked are all silent — and every `<script>` the export emits now carries
  `data-lattice-script`, so the engine's own bootstraps are never counted as the deck's (the
  overflow watcher arms a 2,000 ms race on every deck in the repo). A plain `.html` export
  does not warn at all: its sidecar keeps the deck's script live, so nothing is lost. Every
  captured format and `--player` do.

- No measurable cost: one `evaluateOnNewDocument` per page and one `page.evaluate` per
  render, with no waiting anywhere. Through `npm run bench -- --cli --check` against the
  baseline blessed before the change, on the same machine, the decks driving 1, 3 and 4
  navigations read **−4.5% / +1.5% / +0.2%** — inside their own 3–8% RME. The saving from
  `waitUntil: 'load'` is intact.

- Nothing about the exported artifact changes. Patching `setTimeout` in the page is the
  part of this with real blast radius, so it was checked at the artifact rather than
  argued: the same deck rendered before and after is **byte-identical**, on
  `test/fixtures/preview-deck.md` (143,917 B) and on `examples/state-chart-stress.md`
  (1,279,338 B) — the second because its geometry is measured in the page after
  `fonts.ready`, so a wrapper that perturbed timing would have moved those bytes.
