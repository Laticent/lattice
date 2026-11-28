---
origin: 3368
priority: P1
recorded: 2026-11-21
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — which gate the first render stalls at is unknown: the three failures carry no evidence of it, and the instrumentation that will name it lands in #3368; the flake desk ruled no first-render timeout without that evidence (2026-11-21)
source: https://github.com/Laticent/lattice/pull/3368
---

# The Studio's first preview render can stall with no frame, no sample and no failure card

why now   — the iPad Studio suite's panes probe waited 150 s for the first render twice (runs 44598041791 and 44850293408,
            about 2 in 10): the preview box was on the page, but it had no iframe and no render sample, its alert was empty,
            and a service worker controlled the page. The iPhone's studio probe stalled once more, earlier still (44880480869,
            see evidence). A person sees the loader spin for good. The Compose probe after the panes probe then inherited
            the wrong deck (fixed in #3368).
where     — the gates between load and the first `iframe.live` (mapped 2026-11-21): the engine's ESM import
            (docs/src/lib/load-engine.ts:79, no timeout), the page-lifetime shared theme fetch (docs/src/lib/theme-fetch.ts:70),
            and the lazy chunks in docs/src/playground/single-slide-render.ts:115-131 and docs/src/lib/render-engine.ts:165-171.
            Every one is a same-origin request through docs/public/sw.js `cacheFirst`, which has no timeout either. An inactive
            host (docs/src/components/DeckPreview.tsx:607) fits the state too, and is less likely at 1032 px.
done when — a failure's message names the gate (panes-probe.js `previewState`, studio-probe.js's first wait: engine loaded, bake, engine.js and
            lattice.css finished, worker state), the stall is fixed at that gate, and the iPad Studio suite runs 10 times
            without it.
evidence  — the two runs above, and a third, earlier stall on the iPhone (dispatch 44880480869, studio-probe.js): 150 s
            without `window.__latticeRenderMetrics`, which its module sets when it loads, so the page's own scripts had not
            got that far. Its timeout now reports the same state (page readyState, preview, engine, finished resources,
            worker). The engine-import rejection that shows no failure card (frame-scheduler.ts:111 swallows it
            before DeckPreview's setFailed) is a separate product defect, fixed on its own branch after #3368.
verify    — the iPad and iPhone ios-safari-studio suites, dispatched ten times; the timeout message on any failure.
update    — 2026-11-28 (🧪 fix session for #3588's reds). The fourth stall, iPad run 46081960658 (claude/library-slice-4),
            stopped AFTER the engine loaded: engine loaded, bake none, engine.js and lattice.css finished, controlled, no
            iframe, no alert, no sample. So the engine's import is not this one's gate. The same job was starved: loopback
            fetches of 12.6–18 s in its engine-retry trace, 1–3 s taps. It passed in 4 iPad runs since, the main control
            46085213157 and dispatch 46099447530 included. No product cause shown; no app change made for it.
            Now covered (PR on claude/panes-probe-post-load-gates): the preview host carries `data-lattice-render-gate`, the
            step the newest render waits on (theme, engine render, split, image chunks, frame load, sheet load, then done,
            stood down or failed; single-slide-render.ts `markGate`), and panes-probe.js `previewState` names it, with the
            post-load chunks' resource timing. Desktop WebKit with a held image-size-memo chunk, and with lattice.css held,
            FAILS naming "image chunks" and "theme". Not covered: the frame scheduler's own state (cut to keep the Studio's
            eager bundle under its ceiling; a gate short of done after the 4 s watchdog says the same), and which await
            inside a merged step stalled.
            Seen in that arm: a render that hangs leaves the frame scheduler's watchdog to clear its guard, nothing renders
            again, and no failure card shows. That sits beside the frame-scheduler.ts:111 swallowed rejection, and both go
            in the product fix on its own branch.
