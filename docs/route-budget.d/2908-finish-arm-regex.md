playground: +40
The playground's snapshot cache reads a finish rule's head to decide whether the page holds a mark it reaches; the shared finish rules now lead with `section:is(.marks-pigment, .marks-etch, .marks-tone)` instead of one finish, so the regex in docs/src/playground/snapshot-cache.js accepts both heads (+23 B gz measured by CI against main; the declared figure leaves room for gzip spread).
Nothing was given back: the change is one regex alternative, and it removes about 115 KB of generated finish CSS from every deck's stylesheet, which this metric does not count.
