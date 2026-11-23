---
origin: 3484
priority: P2
recorded: 2026-11-23
area: website
severity: medium
swimlane: docs/src/components/studio/SlidePicker.tsx
deferred: blocked — needs a real iPhone keyboard; Chromium, WebKit and the iOS Simulator under WebDriver raise none
source: https://github.com/Laticent/lattice/pull/3484
---

# Confirm the New-slide gallery's typing layout on a real iPhone keyboard

```text
  P2 · [no ticket] the 153px results area, measured on the device it was reported from
       why now   — #3484 gives the gallery's results room while a phone types (subtitle hidden,
                   pills folded to "All · Family"). The 16px → 153px figure is from a simulated
                   335px keyboard (--kb / --vvh set by hand); no surface here raises a real one.
       done when — on an iPhone at lattice.style: Deck → New slide → After, type "timeline":
                   one full row of results shows above the search field; tapping "Family"
                   opens its menu under the trigger; picking a family keeps the gallery in
                   place. Screenshot attached to this file's closing PR (HARD RULE #23).
```
