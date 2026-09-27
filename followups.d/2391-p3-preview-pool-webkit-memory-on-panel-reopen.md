---
origin: 2391
priority: P3
recorded: 2026-09-26
---

# Keep the deck panel's and Present overview's previews alive across a reopen on WebKit

Narrowed 2026-09-27 by #2398: Add slide is done (it stays mounted between opens,
`docs/src/components/ui/persistent-surface.tsx`). What is left is the deck panel and the overview.

why now   — Measured by #2398 on Playwright WebKit 26: the deck panel's preset tiles strand about
            30 MB per open/close (+128 → +276 MB over 6 cycles), because closing the phone settings
            sheet or the desktop inspector unmounts their `PreviewPool`. Present's overview (`g`)
            rebuilds its frames the same way. Chromium reclaims and stays flat.
where     — docs/src/components/studio/StudioShell.tsx (`inspectorBody`; the inspector PanelSheet),
            docs/src/components/studio/SlideOverview.tsx (returns null when closed),
            docs/src/components/ui/panel.tsx (`PanelSheet` already takes `persistent`).
            Record: engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md §5.
done when — WebKit RSS across 6 open/close cycles of each surface stays flat, with 0 iframes
            created and 0 `srcdoc` writes per reopen. Any state the kept-mounted surface used to
            reset by remounting (scroll, open sections, Basic/Advanced) resets on open, as Add
            slide's does. Do NOT move previews out of their scroller to get there: the frame dock
            did, and on a real iPad the previews trailed their tiles on every fast scroll.
evidence  — RSS per cycle and the document count, main vs branch, same box
            (`.scratch/perf/webkit-panel-mem.mjs` and `doc-count.mjs` shapes; rebuild if gone),
            plus a real-iPad check that scrolling the panel is unchanged.
verify    — tier 1 checker, because the inspector sheet carries much more state than Add slide
            and a hidden, mounted copy of it keeps running its effects.
