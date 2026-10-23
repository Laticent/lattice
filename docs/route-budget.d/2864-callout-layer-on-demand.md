studio: +115
playground: +115
home: +115
`render-engine.ts` (the one chokepoint every render passes through) gains `ensureCalloutLayer`, the engine's `calloutsNeeded` call and a one-retry wrapper that loads the callout layer when a render met a callout the host's scan could not see (115 B gz, all in `_astro/theme-fetch.js`, measured by CI against main 0f84491). It buys the lazy load: the callout layer's lane and markers (7.5 KB gz) leave the largest chart kernel, 85.7 to 80.3 KB, and a deck with no callout never fetches them. The three routes are over soft already, so the 115 B is declared here instead of given back; the retry path is what keeps a markup-hidden callout from failing for good, and cutting it would reopen that.
