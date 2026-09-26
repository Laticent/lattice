---
origin: 2390
priority: P3
recorded: 2026-09-26
---

# Drive the one-size Studio spec on WebKit, and tidy the hidden measuring renderer

why now   — #2390 carries the one-size rule into the Studio's one-slide preview and Present with a
            hidden whole-deck measuring frame (docs/src/lib/scale-cap.ts). It was verified on
            Chromium only; the sandbox had no WebKit, and WebKit is the engine that keeps
            torn-down preview documents (docs/src/components/studio/preview-pool.tsx). The second
            checker also logged two low items left as known.
where     — docs/e2e/scale-one-size.spec.ts (add the webkit-tablet project, or tag it `@webkit`);
            docs/src/lib/single-slide-render.ts `measureDeckScaleCap` (the measurer is never
            disposed; its whole-deck renders feed `recordRenderSample`, so they show in the perf
            overlay as if they were preview renders).
done when — scale-one-size.spec.ts passes in the webkit-tablet project; the measurer's renders are
            excluded from the perf overlay; the measurer is disposed when the last deck-context
            renderer is, or the decision to keep it for the page's life is written into its header.
evidence  — the Playwright run on webkit-tablet with 0 failed; a perf-overlay screenshot of a
            scaled deck showing only preview renders.
verify    — tier 1 checker if the measurer's lifecycle changes, because every Studio one-slide
            render passes through that module.
