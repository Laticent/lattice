studio: +2588
playground: +246
home: +246
components: +68
getting-started: +68
Explicit plugin loading (#2509) puts two small things on every route that renders a deck: the engine's admission kernel (`admitPlugins` and the deck's `plugins:` list reader, lib/plugins/host-grammar.mjs and deck-plugins.mjs), about 180 B gzipped, and on the Studio the deck linter's `unknown-plugin` rule, which ships with the Studio's live lint (lint-core itself). Given back first: the Studio's Plugins tab is lazy (React.lazy, so the plugin grammar and the tab's code load when the tab opens — it cost 7.6 KB gz eagerly), and lint-core reads the plugin NAMES from the block installer the bundle already carries instead of importing every plugin's grammar. Measured locally against origin/main with docs/scripts/measure-route-base.sh (studio +2524, playground +182, home +182, components +4, getting-started +4); declared with a 64 B margin per route, because rebuilt chunk names move gzip by a few bytes from build to build.
