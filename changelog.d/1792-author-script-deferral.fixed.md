- **Fixed: an export that loses a deck-authored `<script>`'s output no longer loses it
  silently.** Since the render started navigating with `waitUntil: 'load'`, a slide that
  paints itself from a `setTimeout` ships without that content, exit 0, with nothing said —
  the same failure shape as the lazy-image class, and the half of it that was disclosed
  rather than fixed (#1792). The render now names what had not run at the instant it
  captured:

  ```
    ⚠ 1 deck-authored script task had not run when the export captured:
        slide 3 · inline <script> · setTimeout(400ms)
      The export captures at the load event plus an explicit media settle; it does not wait on author timers,
      so anything those tasks would have written is NOT in this file.
  ```

- **The wait itself is declined, on the record.** The export captures at the `load` event
  plus an explicit deferred-media settle, and does **not** wait on author timers — because
  no finite wait is correct for code racing the exporter: whatever budget we published, the
  next deck could ask for one millisecond more, and the budget would be spent on every
  navigation of every deck for a class essentially no shipped deck uses. Measured on this
  tree, raw `<script>` appears in 4 tracked decks and every one is parser-blocking
  `<script src>` scaffolding for the live preview, with no deferral of its own. The grace
  period that existed before was never a contract either — it came from `networkidle0`'s
  idle floor, which is bimodal and machine-dependent; bisected on a 2-slide deck, 40 ms and
  80 ms landed and 120 ms did not. Written up in
  `engineering/decisions/2026-08-16-render-format-cost-assessment.md` § 2a-ter, and stated
  for deck authors in `design/skill.md` § Raw HTML in a deck and `AGENTS.md`.

- **New `lint:deck` rule `author-script-defers`** flags a deferring inline `<script>` while
  the deck is still being written. It is the wider of the two nets and the only one under
  everything the render cannot attribute: a `<script type="module">` (where
  `document.currentScript` is `null`), plus `fetch`, `requestIdleCallback`, `Worker`,
  `MutationObserver`, `IntersectionObserver`, `WebSocket`, `EventSource`, `queueMicrotask`,
  `element.animate` and dynamic `import()`. Across the 274 decks `lint:deck --all`
  discovers, the new rule reports zero findings.

- **The probe observes; it never changes what deck code sees.** That is the governing rule,
  and it cost two capabilities to honor. `requestAnimationFrame` and `requestIdleCallback`
  are not tracked — a rAF scheduled at parse time runs at the next paint, long before the
  capture, so its output *is* in the PDF and reporting it was a false alarm on decks that
  rendered perfectly. `fetch` is not tracked either: settling the record means attaching to
  the deck's promise, and attaching is what marks a promise handled — one strategy stopped
  a deck's `unhandledrejection` fallback from painting, the other fired it spuriously on a
  deck whose own `.catch` had already handled the error, and there is no third option. Both
  are documented false negatives, and `lint:deck` names them statically instead.

- **What the warning claims, precisely.** It never fires for work that ran, for work
  canceled with `clearTimeout`, for an interval that has already ticked, or for the
  engine's own scripts — every `<script>` the export emits now carries
  `data-lattice-script`, censused twice, so a bootstrap of ours can never be counted as the
  deck's (the overflow watcher arms a 2,000 ms race on every deck in the repo). It does
  fire for deck-authored work still outstanding at capture. A plain `.html` export does not
  warn at all: its sidecar keeps the deck's script live, so nothing is lost. Every captured
  format and `--player` do.

- No measurable cost: one `evaluateOnNewDocument` per page and one `page.evaluate` per
  render, with no waiting anywhere. Through `npm run bench -- --cli --check` against the
  baseline blessed before the change, on the same machine, the decks driving 1, 3 and 4
  navigations read **−4.5% / +1.5% / +0.2%** — inside their own 3–8% RME. The saving from
  `waitUntil: 'load'` is intact, and the baseline is not re-blessed because there is
  nothing to ratchet.
