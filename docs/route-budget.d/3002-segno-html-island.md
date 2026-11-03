studio: +2701
playground: +2701
home: +2701
The web-reference scanner reads markup through a generated Segno parser (lib/core/html-ref.generated.js, about 3.2 KB gzip) in place of a hand-written scanner (Segno R3), so _astro/remote-ref.js grows by 2,701 gzip bytes, as CI measures it, on every route that imports it. No ceiling moves: the Studio measures 551.6 KB under the 554.5 KB (567,832-byte) ceiling #3001 set.
