---
origin: 2673
priority: P1
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md
source: https://github.com/Laticent/lattice/pull/2673
---

# The spark editor and the pinned slide bar were not driven at 820px or in desktop Safari

```text
  P1 · [no ticket] Drive the spark editor and the pinned slide bar at 820px and in desktop Safari
       why now   — #2673 shipped the spark editor and a phone-only `position: sticky` slide bar. The owner drove both on a real iPhone, and Chromium e2e covers 1440 and 390 (touch emulation). Nothing drove the 820px tablet width or Safari on a Mac. The sheet-versus-popover switch and the bar's two-row wrap both change near those widths, and the pin applies at 640px viewport width and below, so a pane that is narrow inside a wide window gets the unpinned bar.
       where     — docs/src/components/studio/InlineObjectEditor.tsx (popover on desktop and tablet, sheet on a phone), docs/src/components/studio/ComposeView.tsx (the `@media (max-width:640px)` block that pins `.cs-slide-active > .cs-slide-bar`), docs/e2e/compose-spark-editor.spec.ts, docs/e2e/compose-spark-phone.spec.ts.
       done when — a run at 820px (touch and pointer) and in Safari shows the editor opens anchored and closes, a pick writes one word, and the bar is fully on screen on a long slide; any gap found is fixed with a test, or the doc says plainly which widths are not covered.
       evidence  — screenshots at 820px, light and dark, with the editor open; a driven run in Safari (the `webkit-tablet` project exists in docs/playwright.config.ts but needs a WebKit install this sandbox lacks).
       verify    — tier 0 gates; tools/screenshot.js at the three widths (CLAUDE.md, website changes).
```
