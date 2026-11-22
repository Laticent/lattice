---
origin: 3273
priority: P1
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-compose-empty-deck.md §4
deferred: large — a new architecture for the preview kernel seven Studio surfaces share; the owner chose to ship PR 3273 on its own pool and build this next (2026-11-17)
source: https://github.com/Laticent/lattice/pull/3273
---

# One shared preview pool for every Studio grid, with one global cap

why now   — The owner asked that the empty-deck start grid use "the shared preview pool". None exists: the add-slide picker,
            the layout menu, the slide map, the overview, Reshape, the chat figures and now the start grid each mount their
            own `PreviewPool`, and a pool never releases a frame (the WebKit leak its header measures). The 2026-10-29 audit
            measured the slide map's pool holding 8-9 frames after the map closes and proposed a shared pool with one global
            cap. PR 3273 ships the start grid on its own 4-frame pool, made once per session and reused (0 new frames over
            two type-and-Undo cycles, Chromium and WebKit).
where     — docs/src/components/studio/preview-pool.tsx (the kernel), and its hosts: SlidePicker.tsx, LayoutMenu.tsx,
            StudioMap.tsx, SlideOverview.tsx, ReshapePicker.tsx, ArchitectChat.tsx, EmptyDeckStart.tsx, PrintOptionsPanel.tsx,
            StudioShell.tsx (the Coach list).
done when — every Studio grid draws its tiles from one pool with one global frame cap, a frame is never created twice for
            the same slot across surfaces, and the session's frame count stays at or under that cap however many surfaces
            open; or a design note records why one shared pool is the wrong answer and what bounds the total instead.
evidence  — The hard part is that a frame cannot move between hosts: moving an `<iframe>` element in the page reloads its
            document, which is exactly the churn the pool exists to stop. So a shared pool needs one fixed layer of frames
            placed over tiles in page coordinates, the design the pool's header rejected because a picture lags behind its
            label while a grid scrolls. The design owes an answer to that lag (for example, re-place on scroll inside one
            frame, measured) before any code.
options   — The owner asked (2026-11-17) why it must be an iframe at all. LEAD CANDIDATE: tiles as shadow roots in one
            document, styles via `adoptedStyleSheets`. The pool's header rejected one shared document only because a saved
            component's `extraCss` would restyle every tile; a shadow root scopes it per tile, and `chart-detail-layer.tsx`
            already renders slide content this way. It removes the frame leak and the can't-move-a-frame problem, so every
            grid could share one renderer. What it costs, counted in dist/lattice.css: 164 `:root` rules to rewrite to
            `:host` at build time, 54 `@font-face` rules to hoist to the page, `lib/runtime`'s ~80 direct `document`
            lookups to point at a root (unless static thumbnails need no runtime: unmeasured), four theme files' page-level
            media queries, and the font-swap gate per tile. Start with a SPIKE: the add-slide picker's 80 tiles as shadow
            roots; WebKit memory against frames; `tools/pixel-check.js` against today's iframe tiles; list what breaks
            without the runtime.
verify    — Count every `<iframe>` the page creates (the MutationObserver counter in the PR 3273 note's §4) while opening
            the picker, the layout menu, the map and an empty deck in turn, five times each, on WebKit and Chromium; and the
            preview-pool frame test in LayoutMenu's spec. Adversarial trio (HARD RULE #25): it changes a kernel seven
            surfaces share.
