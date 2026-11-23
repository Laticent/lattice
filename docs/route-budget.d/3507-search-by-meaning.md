studio: +437
playground: +501

The gallery search now tries meaning before spelling (#3507): `component-search.ts` gains `slips()`, a spelling-distance check that counts a swapped pair as one slip, the `intentHits` step, and the rule that keeps a tag or look's single owner first, measured at +423 gzip bytes on both routes; the Studio's other +14 is `StudioIsland` passing `searchTerms` through. The playground also carries `catalog-wire.ts`, which unpacks the catalog's word lists on arrival. Packing them gave back 7.7KB of the page's HTML (CI: 517.4KB with arrays, 509.7KB packed, ceiling 510.4KB). The playground's +78 is that unpacking in `PlaygroundIsland`.
