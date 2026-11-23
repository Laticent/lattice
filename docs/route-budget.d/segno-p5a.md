studio: +2750
playground: +2750
home: +2700

What grew, measured on a local docs build of this branch against `measure-route-base.sh` on `main` dbc4d73a
(studio +2649, playground +2646, home +2600; each line carries about 100 bytes of margin for CI's variation). Segno P5a
puts one CSS tokenizer on the eager path: lib/core/css-tokens.js, the generated parser that `cssRefSpans` already read
(css-ref.generated.js, deleted) with a second entry for every token (+510 for its rules), the tokenizer's driver (+900)
and the readers the Studio's moved scans share (`cssUrls`, `cssCommaParts`, `rewriteCssUrls`, `cssImports`; +600).
remote-ref.js (the preview sanitizer, on all three routes) requires it for `cssParser`, and a CommonJS require of an ES
module takes the whole file, so the three routes pay for it together; image-painting.js and the slide camera, also on
the eager path, now read through it. The owner chose this cost (one tokenizer everywhere, option A of the P5a route
question) on 2026-11-17, and raised home's ceiling by 2.5 KB and studio's by 1.5 KB for it in their own PR.
