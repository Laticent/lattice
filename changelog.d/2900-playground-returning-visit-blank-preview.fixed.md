- **Fixed: a returning visit to the Playground no longer opens on a blank preview.** On the
  published site, reloading the Playground in the desktop split view left the preview pane
  empty: the cached-slide placeholder stayed in the layout at full window height and pushed
  the live slide below the window. The placeholder now stays out of the layout once the live
  slide takes over.
- **Fixed: the Playground's instant preview of your last slide now shows on the published
  site.** The same rule clipped the placeholder to zero height while it was meant to show, so
  a returning visit waited for the full app to load before any slide appeared. The last slide
  you worked on now paints straight away.
