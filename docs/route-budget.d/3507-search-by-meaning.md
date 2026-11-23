studio: +400
playground: +700

The gallery search now tries meaning before spelling (#3507): `component-search.ts` gains `slips()`, a spelling-distance check that counts a swapped pair as one slip, and the `intentHits` step, measured at +369 gzip bytes on both routes; the Studio's other +14 is `StudioIsland` passing `searchTerms` through. The playground also carries `catalog-wire.ts`, which unpacks the catalog's word lists on arrival. Packing them is what gave back the page's HTML bytes: about 12KB, enough to bring `htmlRaw` back under its ceiling.
