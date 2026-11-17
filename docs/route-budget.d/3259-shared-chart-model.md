studio: +200
playground: +200
home: +200
The chart detail rules the Studio's chart reveal ran inline (selectors, mark lookup, the card's title and value, the near-miss hit test, the hold zone, the emphasis) moved into lib/runtime/chart-reveal/model.mjs so the exported HTML player runs the same rules (HARD RULE #1). Each rule now takes the chart and section as parameters instead of closing over them, which costs about 150 bytes gzipped (esbuild, measured against main's chart-interact.js; 200 declared to cover Vite's own count). Given back first: the player-only card renderer moved to its own module, and a namespace import that kept every model export became named imports, which took the growth from 568 bytes to 149.
