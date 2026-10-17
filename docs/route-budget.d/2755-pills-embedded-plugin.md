playground: +64
home: +64
The pill kernel moved into the embedded pills plugin and the plugin registry gained one row (the pill's), so the engine bundle every route carries reads +4 B gz against main on the playground and home routes in CI (the studio route reads -12 B). That is the plugin manifest's extra generated entry and the `embedded` flag read in `admitPlugins`, not new behavior; the figures leave room for gzip spread while later commits on this PR move the pill styles and the remaining kernel importers, and each will be re-measured. Nothing lazy became eager.
