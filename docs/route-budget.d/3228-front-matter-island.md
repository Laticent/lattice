studio: +960
playground: +1060
home: +1040
The front-matter island (lib/core/front-matter-island.mjs), the one reader every register resolver, the engine and the splitter now share for where front matter ends and which lines are keys: 1,035 bytes gzipped, shipped wherever a page reads a register. Measured locally against main at 72bd2d9: studio +913, playground +1007, home +985; each line carries about 50 bytes of margin for the CI-only variation in docs/route-budget.d/README.md's precedent. Given back first: the key-nesting and block-scalar body spans moved out of the shared module into `lattice-deck`, which only the lint core loads (127 bytes), and that took home back under its ceiling.
