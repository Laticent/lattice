studio: +200
playground: +200
home: +200
The HTML reader (`html-ref.generated.js`) and the CSS reader (`css-ref.generated.js`), which load at startup, now remember each `until` search across parses of the same text (`ux_<k>` plus its reset), so an unterminated `<![CDATA[` (or `*/`) in a deck no longer rescans to the end of the text once per section. The quadratic took 9.3 s at 3.4 MB on untrusted deck input; the cache is what makes it linear, so the bytes cannot be given back without the defect returning. CI measured +183 on all three routes (`_astro/remote-ref`) on 2db18d4 against `main` d2c29f5; declared with a little room for gzip variation.
