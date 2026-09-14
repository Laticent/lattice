- **Fixed: the export bake's diagram-wait arguments are now pinned by unit cells.**
  `bakeDeckSections` opts its capture frame out of releasing (`releaseDiagrams: false`) and
  owns the give-up itself at 12000, for a 16000 total; the same parameter's DEFAULT
  (`= true`) is what makes the six rasterizing lanes release at their only wait. All three
  were free parameters that no gate held: `waitForDiagrams` was pinned cell by cell, the
  call sites supplying its arguments were not — and the last regression in exactly that
  spot was invisible to four green end-to-end arms. Three cells now drive the real
  `bakeDeckSections` and `rasterizeDeckImages` through a stubbed capture frame. Flipping
  the explicit `releaseDiagrams` to `true` fails two of them; moving the bake's budget to
  either 8000 or 16000 fails the budget cell; flipping the DEFAULT to `false` fails the third —
  and that one is not hypothetical: driven on the real Studio, an `Images (.zip)` export
  with the render stalled comes back with a BLANK slide where the shipping default paints
  the author's source, while the diagram-free slide stays byte-identical as a control. Each cell costs
  tens of milliseconds, because the budget is walked with fake timers rather than waited
  out.
