- **Fixed: the Playground e2e specs no longer click a control before the island that
  wires it has hydrated.** `playground-paint`'s first case clicked the Galleries
  trigger on presence alone; the trigger is server-rendered, so Playwright's
  auto-wait was satisfied 300–480ms before React committed, and a click in that
  window is dropped rather than replayed — an intermittent nightly red on the
  `mobile` project under worker contention. Both it and `playground-state` now gate
  on hydration through `controlReady`.
- **Fixed: `controlReady` no longer reports a React control ready ~100ms too early.**
  It waited for the `<astro-island>` to drop its `ssr` attribute, but
  `@astrojs/react` hydrates inside a `startTransition`, so the island drops that
  attribute before React has committed. It now also waits for React's own per-node
  commit marker, measured to land in the same frame as the first click that works.
