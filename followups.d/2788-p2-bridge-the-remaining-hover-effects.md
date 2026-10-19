---
origin: 2788
priority: P2
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-19-studio-main-thread-jank.md
---

# Bridge the other hover effects the Studio's live preview cannot receive

why now   — The preview box takes no pointer events, so `:hover` never fires inside it. #2788 bridges
            collage tiles (`hoverCollageAt`) and code copy buttons already had one. Chart hover cards
            (tower, risk matrix) and the `.anima-live:hover .scene-control` controls still work only in
            the Playground and Present.
where     — docs/src/components/studio/StudioShell.tsx `previewHolderRef` (`onHover`); the chart-interact
            host in docs/src/playground/chart-interact.js; lib/components/imagery/scene/scene.styles.css.
done when — each effect reacts to a real mouse over the Studio preview, driven at screen coordinates in
            Chromium and Firefox like the collage case in docs/e2e/collage-lightbox.spec.ts.
evidence  — gotcha "`:hover` never fires on anything inside the Studio's live preview" in
            engineering/gotchas/studio-playground.md.
verify    — a Playwright case per effect.
