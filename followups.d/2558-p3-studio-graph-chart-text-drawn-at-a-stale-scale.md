---
origin: 2558
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# Studio preview: a graph chart's names can paint at a stale scale

why now   — found while verifying #2558 on the real Studio (the docs preview). After typing a
            flowchart into the Deck source, the preview sometimes paints every shape name at about
            0.8x its position and size, measured from the SVG origin, while the shapes and lines
            sit right. It happened in 4 of 10 runs of a flowchart with NO icons, and 2 of 10 with
            icons, so it predates #2558. The SVG's attributes are correct in those same frames
            (each `<tspan x>` is its tile's center), so the DOM is right and the paint is not: the
            text keeps the scale it was laid out at when the preview's fit scale changes after the
            paint (a Chrome SVG text trait). A screenshot 8s after the edit still showed it.
where     — docs/src/lib/trama/pipeline.ts (the SVG write and the fit transform on `.flowchart-scale` /
            `.state-chart-scale`); the Studio preview's own scale. A likely fix forces SVG text
            re-layout after the fit settles (rewrite the SVG once more, or toggle a property that
            invalidates text layout), but the cause has to be shown first.
done when — 20 runs of the Studio probe below show no frame with names off their tiles, for a
            flowchart and a state chart, at 1440px.
evidence  — the probe: open the docs preview's /studio/, replace the Deck source with a flowchart,
            screenshot the preview at 8s and compare with a known-good capture (ImageMagick
            `compare -metric AE -fuzz 5%`); a bad run differs by about 1,300–1,600 pixels.
verify    — tier 1 checker.

not reproduced — 2026-10-07, while trying to fix it (the cause has to be shown first, so nothing changed):
            97 valid runs, each a fresh browser profile at 1440x900, a screenshot of the preview 8s
            after the edit, compared with a known-good capture (`compare -metric AE -fuzz 5%`):
              · `npm run dev`, deck inserted as one input: flowchart 19, state chart 14
              · the static build (`npm run build:e2e` + `preview:e2e`): flowchart 16, state chart 18
              · the static build, window narrowed to 1180 then back after the paint: flowchart 10
              · the static build, typed key by key: flowchart 10, state chart 10
            Every one is identical to the good capture (0 px, or under 900 px of anti-aliasing).
            Seven more were the preview's loading skeleton at 8s, not stale text. Headless Chromium
            131, no GPU. The 4-in-10 runs in #2558 were the same Chromium, so what differs is the
            probe itself; the next attempt should start from #2558's probe script rather than a
            rewrite. The probe this pass used: deck typed into `.cm-content`, `iframe` screenshotted.

