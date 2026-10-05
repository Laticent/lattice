studio: +700
playground: +150
home: +150

The plugin grammar every route's startup JavaScript carries grows by the chart family: one more
plugin entry, and the 24 chart classes that now require it (`COMPONENT_PLUGINS`, filling the
`kernel` slot is requiring the plugin) — the playground's and home's +94 B gz as CI measures it.
The Studio also carries `docs/src/lib/plugin-admission.ts` and the plugin name list, which point
its rail and lint parsers at a deck's plugin admission (+593 B gz in all). Given back first: the
lint bundle's parser switch is imported from the authoring-core chunk the Studio already loads
eagerly, not a second copy. Declared with headroom, because the measure moves a few bytes run to run.
