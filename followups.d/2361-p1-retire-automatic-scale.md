---
origin: 2361
priority: P1
recorded: 2026-09-27
---

# Retire automatic scale-fit: `venue:` renders at exactly the size the author chose

why now   — the owner's ruling on PR #2399 (2026-09-27): a venue is an intentional setting, like
            desktop zoom, so the deck must never shrink itself to fit. The automatic step-down
            (#2390: STEP / LEVEL in lib/core/scale-fit.js, and the Studio's hidden whole-deck
            measuring frame in docs/src/lib/scale-cap.ts) costs too much and is not
            deterministic: one added line can move the whole deck to another size. Measured on
            the real Studio (81-slide talk, `venue: hall`, desktop Chromium): each measure is
            ~1.3 s of main-thread long tasks and ~11 MB of heap; and two live bugs sit in that
            code on `main` until it is deleted — typing queues one whole-deck measure PER KEY
            (48 keys → 30–48 measures, 32–52 s blocked, keys lagging 13.6 s vs 2.8 s), and every
            slide change in the preview paints the requested size for 30–150 ms before dropping
            (18 of 18 changes). Both were fixed and then stripped from #2399 on the owner's call,
            because this retirement deletes the code they lived in (the fixes are commits `0d04238`
            and `1a8de05`, still reachable from PR #2399's force-push history, for reference).
where     — lib/core/scale-fit.js (STEP, LEVEL, SCALE_LEVEL_SRC), its three callers (the
            emulator's page.evaluate pass, the watcher embedded in exported .html, the live
            runtime in lib/runtime/index.js), the export's `↓ SCALE` report, docs/src/lib/scale-cap.ts
            and its hook in docs/src/lib/single-slide-render.ts (measureDeckScaleCap),
            docs/e2e/scale-one-size.spec.ts, `fit: report` (lib/base/base.registers.docs.md), and
            engineering/decisions/2026-09-25-font-scale-fit.md (amend: rules 1–7 retired).
            The owner's decisions for the same PR:
            • When a slide does not fit at the chosen venue: WARN, PLUS A ONE-CLICK FIX. Lint
              (the per-venue budgets from #2399) warns while writing; the Studio's overflow ring
              marks the slide on screen; the export's OVERFLOW report names every clipped slide.
              The Studio offers a button: split the slide, or drop the deck to a smaller venue.
            • A VENUE MENU in the Studio's deck settings (Laptop / Huddle / Conference / Hall /
              Default), next to the slide-size control in StudioShell.tsx, writing `venue:`.
            • A VENUE SWITCH on the Present stage, to change the room size live without editing
              the deck.
            Not display detection: a browser sees screen size, not room size.
done when — at `venue: hall` every slide renders at 1.5x in the export, the exported .html, the
            Studio preview and Present, whatever its content; nothing measures the whole deck;
            a slide that does not fit clips and is named by lint, the Studio ring and the export,
            with the one-click fix offered in the Studio; the deck-settings menu and the Present
            switch exist and work at 1440 / 820 / 390 px.
evidence  — the talk exported at each venue (every page at the venue size, the OVERFLOW list per
            venue); the Studio typing probe re-run (0 whole-deck measures, typing time equal to
            no venue); tools/screenshot.js at 1440/820/390 for the menu and the switch; a demo
            deck (HARD RULE #9) showing a slide that clips at hall and its fix.
verify    — tier 2 adversarial trio: it deletes an engine kernel with three injected callers and
            changes the export's report and every venue deck's rendered size.
