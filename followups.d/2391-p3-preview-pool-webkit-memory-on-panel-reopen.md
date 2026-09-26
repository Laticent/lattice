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

measured  — 2026-09-26, CONFIRMED on real WebKit (Playwright 26.0 WebKit, 1440x900, a production
            docs build via `astro preview`). Six open/close cycles of the Craft deck panel ("Deck
            scope"), 8 s idle after each close: 5 iframes open, 1 closed every time, and WebKit
            RSS over the Studio baseline climbs +128 / +132 / +161 / +185 / +246 / +276 MB —
            about 30 MB per reopen, never returned. Chromium, same script: flat (−16 to +13 MB).
            Not fixed — see `tried` below.

wider     — not only the deck panel. The Add slide dialog does the same (9 frames per open:
            +169 → +219 → +271 → +371 → +391 → +367 MB over 6 cycles), and Present's overview and
            Reshape share the pattern. The pool fixes churn INSIDE an open grid; a surface that
            closes takes its pool, and WebKit never frees the documents.

tried     — #2398, reverted before merge, owner's call on the measurements:
            · parking frames between opens: needs a state-preserving DOM move. `moveBefore` is
              Chromium-only (measured absent on WebKit 26.0); any other move reloads the frame.
            · keeping a surface mounted but hidden: a force-mounted Radix modal runs `hideOthers`
              on mount (the whole Studio aria-hidden while "closed") and keeps its scroll lock.
            · POSTERS (capture a settled pool frame into an SVG foreignObject → WebP, show <img>
              on reopen): built, fidelity 2–9/255, reopen minted 0 frames. But each capture's
              SVG-image decode is itself a WebKit document (~3.5 MB retained each, synthetic),
              so scrolling the whole Add slide gallery per open grew exactly like main:
              main +391 → +1070 MB, posters +493 → +1097 MB over 5 cycles. Net loss outside the
              4-tile deck panel (which did go flat: +178 → +173 MB).
next      — the one design no measurement has contradicted: ONE Studio-level set of preview
            frames, mounted at the root in a fixed-position layer above dialogs
            (pointer-events: none), that every surface BORROWS and positions over its tiles.
            Frames never move in the DOM, so no reload and no new document on open, close or
            scroll. The cost to design around: re-syncing positions on scroll (the current
            in-content layer exists to avoid exactly that lag) and stacking above dialog content
            but below popovers. Prototype, then measure with the scroll harness below BEFORE
            building it out.
harness   — `.scratch/perf/webkit-scroll-mem.mjs` shape on the branch that took these (not
            committed): WebKit, 1440x900, open Add slide, scroll 14 × 600 px, close, idle 8 s,
            sum RSS of WebKit processes; run main and the branch on the same box, alternating.

