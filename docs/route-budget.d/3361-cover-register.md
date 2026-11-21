studio: +25
playground: +25
home: +25
The `cover:` register (lib/core/resolve-cover.js) joins the host registers a slide record may set, so `<!-- {cover=light} -->` works on one slide the way front matter does for the deck. tools/build-plugin-registry.js freezes that table into lib/plugins/meta.generated.mjs, which every route loads in the meta-keys chunk: one more entry, 25 gzipped bytes. Nothing to give back without dropping the record form of the register.
