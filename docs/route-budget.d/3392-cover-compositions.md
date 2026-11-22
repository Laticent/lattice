studio: +60
playground: +60
home: +60
The `cover:` register's composition axis (lib/core/resolve-cover.js: `plain`, `masthead`, `ledger`, `column`, `label`, `stage`, `frame`, `poster`) joins the slide-record table, so `<!-- {cover=poster} -->` works on one slide the way front matter does for the deck. tools/build-plugin-registry.js freezes that table into lib/plugins/meta.generated.mjs, which every route loads in the meta-keys chunk: eight more values on the `cover` entry, 60 gzipped bytes. Nothing to give back without dropping the record form of the axis.
