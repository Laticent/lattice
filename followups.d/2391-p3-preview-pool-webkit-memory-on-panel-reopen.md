---
origin: 2391
priority: P3
recorded: 2026-09-26
---

# Measure WebKit memory when the deck panel closes and reopens

why now   — the deck panel's `PreviewPool` (StudioShell `inspectorBody`) now holds the four preset
            tiles' frames. Hoisting it to panel level (#2391) keeps them alive across Basic ↔
            Advanced, tab and search switches (measured: the same 5 iframes throughout). But
            closing the desktop inspector, switching to the Slide scope, or closing the phone
            settings sheet still unmounts the pool. By the repo's own figure (~11MB per WebKit
            preview document, never reclaimed) each reopen could retain ~44MB on Safari/iPad.
            Not measured on WebKit; the Reshape popover makes the same trade.
where     — docs/src/components/studio/StudioShell.tsx (`inspectorBody`, the inspector/Sheet
            mounts), docs/src/components/studio/preview-pool.tsx.
done when — retained memory across N panel open/close cycles is measured on WebKit, and either
            it is flat, or the pool is hoisted above the open/close boundary (or the tiles fall
            back to posters) so it is.
evidence  — a WebKit memory reading across ≥5 open/close cycles, before and after.
verify    — tier 2: Playwright WebKit (see docs/playwright.config.ts note on installing it) with
            a memory sample per cycle, as in engineering/decisions/2026-09-13-gallery-preview-memory.md.
