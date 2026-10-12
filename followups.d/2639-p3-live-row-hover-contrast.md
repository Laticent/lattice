---
origin: 2639
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md §5
source: docs/e2e/live-panel.spec.ts
---

# Live panel: a hovered person row fails text contrast in the light palette

why now   — the new Live panel axe scan (docs/e2e/live-panel.spec.ts) found it. In the light mode of the `cuoio` palette, a hovered person row (`hover:bg-accent`, `#e1d7c7`) carries its name at 4.46:1 (`#6b5d4f`) and its second line ("Slide 1" etc., 11 px muted) at 3.8:1 (`#766854`), under the 4.5:1 AA floor. The resting state passes, so the scan reads the resting state and says why in a comment.
where     — docs/src/components/studio/live/LivePanel.tsx (`PersonRow`, `hover:bg-accent`) and the muted/accent token pair; check the other palettes' light modes too.
done when — the hovered row passes `color-contrast` in every palette's light mode, and the spec's `page.mouse.move(0, 0)` comment can go because it scans a hovered row as well.
evidence  — the same axe run with the pointer left on a row.
verify    — tier 0 self-review with the gates.
