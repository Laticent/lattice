---
origin: 3131
priority: P3
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-11-10-chart-form.md
deferred: large — an image's height comes from its file, which the markup estimate cannot read; the fix measures the real box in the browser, an architecture change to every host that renders a chart
source: https://github.com/Laticent/lattice/pull/3131
---

# A picture on a chart slide makes the phone box estimate run tall

why now   — the trio's red team on #3131 (2026-11-12): `shared/chart-phone.js` `formBoxPx` estimates the chart's box
            from the markup around it. An `<img>` there renders at its file's own height (a 753 x 423 PNG took 423px at
            mobile and at square), which the markup does not carry, so the estimate counts a one-line paragraph and the
            chart prints at 9.5pt (mobile) or 5.6pt (square) while it says `fit`. `main` prints the same slide smaller
            still. No deck in the repo puts a picture on a chart slide.
where     — shared/chart-phone.js `formBoxPx`; or the runtime (lib/runtime/chart-redraw.js), which could measure the
            real `.chart-body` and redraw from it on every host.
done when — a chart slide with a picture above or below the chart prints its chart text at its role size at the four
            phone sizes, and test/integration/components/phone-box-estimate.test.js carries a picture slide.
