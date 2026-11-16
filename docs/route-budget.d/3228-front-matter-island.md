studio: +1060
playground: +1060
home: +1040
The front-matter island (lib/core/front-matter-island.mjs), the one reader every register resolver, the engine and the splitter now share for where front matter ends and which lines are keys: 1,035 bytes gzipped, shipped wherever a page reads a register. Measured by CI against main: studio +1013, playground +1007, home +985 (a local build read studio +913: a -100 in preview-pool that CI's base does not show); each line carries about 50 bytes of margin. Given back first: the key-nesting and block-scalar body spans moved out of the shared module into `lattice-deck`, which only the lint core loads (127 bytes), and that took home back under its ceiling.
