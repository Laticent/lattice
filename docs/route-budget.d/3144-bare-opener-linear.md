studio: +13
`readIsland`'s `bareOpener` in lib/core/directive-island.mjs (eager in the Studio through class-directive-scan) is two linear regex tests now instead of one quadratic one, which took about 19 s on a comment of 200,000 blank lines. Given back first: the one-pass `slice`/`includes` read became a shorter anchored `/^\s*\n/` test.
