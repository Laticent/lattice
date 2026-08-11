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
  and applied pre-paint as a `min-width` — but only in the viewport band where the library
  actually clamps. **Restoring a saved layout is not a clamp:** a `collapsible` pane restored
  below the midpoint of `collapsedSize` and `minSize` snaps to the 28px rail instead, so a
  seed that models the clamp alone paints 320px where the app is about to show 28. Below that
  midpoint the seed now emits nothing and the raw share paints. One geometry from t=375ms in
  the clamp band, unchanged from `main` in the snap band, and the instant shell fires where it
  used to be missing. (#1589)
