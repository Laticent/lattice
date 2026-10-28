studio: +30
home: +30
The Playground preview frame's stylesheet gains one rule, `html{-webkit-text-size-adjust:100%;text-size-adjust:100%}`, so iOS Safari does not enlarge a slide's long text blocks (single-slide-render.ts, which the Studio and the home preview share). CI measured +27 bytes gzipped on each route; the declared figure leaves room for gzip spread.
Given back first: nothing to give. The rule is the whole change, and it is two properties on one selector.
