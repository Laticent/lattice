studio: +1382
playground: +26
The Studio's Look → Typography control (deck settings) and the set table it reads from lib/core/resolve-typography.js ship in the Studio island: +1,351 bytes gzipped for the control, its Auto head and its preset-aware read and write. `typography:` joins the preset table in lib/core/front-matter-key.js (+26 on both routes) and the rows a view may mark (+5). Given back first: the four set faces are not warmed by the Studio (studio-warm.ts), so the network cost of the feature is zero for a deck that names no set.
