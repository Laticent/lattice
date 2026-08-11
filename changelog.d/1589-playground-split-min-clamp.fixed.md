- **The Playground's pre-paint split seed spent the saved share without the panes' pixel
  minimum, so the divider moved on a narrower window.** A saved layout is a pair of
  PERCENTAGES; each pane also has a minimum in PIXELS, and a share that clears its minimum at
  the window it was saved in can fall below it at a narrower one. The library clamped at
  hydration and the seed did not — measured on the built site by dragging the real divider to
  a 25% preview at 1920 and reloading at 1194: the pane painted **298.3px** and settled at
  **320px**. The instant shell was collateral damage: its cached slide is placed at a rect
  measured in a box that no longer existed, so it declined outright and the visitor got no
  shell at all. The minimum is now declared once (`PG_SPLIT_MIN` in `pg-split.ts`, read by
  both the `<ResizablePanel minSize>` that enforces it and the seed that has to predict it)
  and applied pre-paint as a `min-width`, which for a two-panel flex row *is* the library's
  clamp rather than an approximation of it. One geometry from t=375ms, and the instant shell
  now fires where it used to be missing. Skipped over a collapsed pane, which is heading for
  its 28px rail rather than its minimum. (#1589)
