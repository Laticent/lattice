studio: +2495
playground: +2495
home: +2495
The web-reference scanner reads markup through a generated Segno parser (lib/core/html-ref.generated.js, about 3.2 KB gzip) in place of a hand-written scanner (Segno R3), so _astro/remote-ref.js grows by 2,495 gzip bytes on every route that imports it, as measured locally against main. No ceiling moves: the Studio stays under the 567,832 ceiling #3001 set.
