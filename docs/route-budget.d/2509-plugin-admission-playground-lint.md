studio: +64
playground: +300
home: +32
The Playground page's editor lint now follows the deck's plugin admission (#2509 P3): it points
its lazily loaded lint bundle's boundary parser at the deck's `off` set before each lint, quick fix
and Fix-all, and re-lints when the host changes its defaults (a `StateEffect` plus the linter's
`needsRefresh`) — measured +236 B gz on the playground route against main. The Studio's +33 B is
`deckPluginsOffFor`, now the one helper both callers share (`plugin-admission.ts` calls it from
`editor-diagnostics.js`). Declared with headroom over the measured 33 / 236 for gzip variation; the
authoring-core bundle itself stays lazy on the Playground (its `PLUGIN_NAMES` export is read off the
module after the dynamic import, so no registry is imported eagerly).
The home route's +19 B (and ~7 / ~24 B of the studio and playground measures) is the Mermaid
plugin's own library copy joining `lib/core/remote-ref.js`'s `VENDORED_SCRIPT_PATHS`, so a deck may
load `lib/plugins/mermaid/vendor/mermaid.min.js` as it loads the other vendored builds; that module
sits in a chunk every route loads eagerly. Declared +32 over the measured 19.
