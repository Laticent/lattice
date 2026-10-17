studio: +32
playground: +96
home: +96
The pill kernel moved into the embedded pills plugin and the plugin registry gained one row (the pill's), so the engine bundle every route carries read +4 B gz against main on the playground and home routes in CI (the studio route read -12 B). The site navigation also gains a Pills row under Plugins (`docs/src/lib/nav.mjs`), which ships in each route's eager chrome, as the Sparks row did (+12 to +17 B per route). The figures leave room for gzip spread while later commits on this PR move the pill styles and the remaining kernel importers; each will be re-measured. Nothing lazy became eager.
