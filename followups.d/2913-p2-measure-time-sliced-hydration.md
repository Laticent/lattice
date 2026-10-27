---
origin: 2913
priority: P2
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md
source: https://github.com/Laticent/lattice/pull/2913
---

# Measure hydrating the Playground and Studio shells in slices

why now   — React commits are 440-470 ms single tasks at 4x CPU (note §9); TBT counts every task over 50 ms, so slicing lowers it without
            removing work. Unmeasured.
where     — docs/src/components/playground/PlaygroundApp.tsx, docs/src/components/studio/StudioShell.tsx: `React.lazy` + `Suspense`
            around the toolbar sheets, the map and the editor host.
done when — a prototype with a measured long-task list before and after, and a go or no-go. Not shipped from the spike.
evidence  — long-task counts and TBT from 5 Lighthouse runs on a CDN preview.
verify    — the trio if it ships: it touches every load of both apps.
