playground: +3000
studio: +500
home: +500
The Playground's on-demand style loader (docs/src/lib/style-loader.ts, the scan kernel lib/core/style-needs-scan.mjs, and the base-registration changes in theme-fetch.ts) ships in the eager JS of every route that uses theme-fetch.ts: playground +2,744 bytes, studio +444, home +447, as CI measured on this PR. The routes were already over their soft targets on main. In exchange the Playground, when the loader is switched on, stops fetching the whole 116 KB gz engine sheet up front: a median deck fetches about 66 KB gz of styles for the first slide. The engine bundle itself is unchanged (an engine hook that would have added 70 bytes was dropped to stay under getting-started's engine ceiling).
