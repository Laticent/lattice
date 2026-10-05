studio: +350
playground: +40
The `pill-literal` warning is new lint-core code, and the Studio's live lint is lint-core itself
(HARD RULE #7), so it ships there: `pillWouldRenderQuoted` and `findLiteralPills`, which tell an
author that a pill label holding `|` `=` `[` `]` `{` or `"` renders as plain code and give the
quoted spelling. The Playground's bytes are the same bundle's shared chunk. CI measured +281 and
+3 against main at 4e8b8f8; the rest is headroom for gzip noise in shared chunks as main moves
(#2513 saw 49 bytes of it).
