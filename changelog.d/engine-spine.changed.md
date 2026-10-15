- **Changed: the Studio and the docs site load less JavaScript before they paint.** The Studio's
  startup JavaScript drops from 668KB to 493KB gzipped: the lint core now loads after first paint.
  The engine every app page loads drops from 551KB to 325KB gzipped (1.58MB to 931KB to parse): it
  bundles one copy of markdown-it instead of two, and the docs site now loads it as ES modules
  whose 24 chart kernels arrive only when a deck uses that chart. Output is byte-identical across
  all 276 example and baseline decks. A chart kernel that cannot load (a tab left open across a
  deploy) now says "part of the app didn't load" and offers a reload, instead of failing the render.
- **Changed: the route budget counts the engine and the preview runtime.** A new `engineJsGz`
  metric in `docs/route-budget.json` covers the files under `/playground/v/<hash>/` that
  `eagerJsGz` never saw.
