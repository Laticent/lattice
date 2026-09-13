- **Fixed: the export bake's two diagram-wait arguments are now pinned by a unit cell.**
  `bakeDeckSections` opts its capture frame out of releasing (`releaseDiagrams: false`)
  and owns the give-up itself at 12000, for a 16000 total. Both were free parameters that
  no gate held: `waitForDiagrams` was pinned cell by cell, the call site supplying its
  arguments was not — and the last regression in exactly that spot was invisible to four
  green end-to-end arms. Two cells now drive the real `bakeDeckSections` through a stubbed
  capture frame. Flipping `releaseDiagrams` to `true` fails both; moving the budget to
  either 8000 or 16000 fails the second. They cost 53ms and 34ms.
