playground: +4
The pie legend and wedge-label sizes in `lib/core/mermaid-theme-map.js` changed from `13px`/`14px` to `20px`/`22px`, which are the same number of characters, so the source grew by 0 bytes. CI read the playground's eager JS 4 B gzipped above main: gzip variation on a one-constant change, not real growth (the same +4 that #2548 saw). No real growth is being declared.
