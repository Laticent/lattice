studio: +31
playground: +14
home: +14
The plugin door's whole-call test (`NAMED_SPAN_RE`, `recordIsWhole`) moved out of code-door-fence.mjs into its own module,
lib/core/named-span.mjs, so Compose and the door share one rule for what a whole `@kind{…}` call is (HARD RULE #1); the
extra module costs 14 gzip bytes in the eager video-overlay chunk on every route that loads it. The Studio adds 17 more
in StudioIsland, where `pluginKindEntries` now keeps an installed kind that declares no slot, so Compose can open a panel
on it. Nothing was given back: the code that grew is the feature, and a shared kernel is the point of the move.
