studio: +1250
home: +320
playground: +30
Hide a slide (#3053). The Studio's eager JS carries the slide menu's Hide Slide / Show Slide, the preview bar's Hidden chip and the strip and map's eye-off mark (StudioIsland +441 B, strip-actions +121 B), the block-level hide deck op (deck-ops +261 B), and the one `hide` reader the slice path needs so the shown slide's page number skips hidden slides (fidelity-findings +277 B on studio and home: lib/core/hide-directive.mjs and slideSourceHidden in lib/diagnostics/slice-equivalence-core.mjs). CI measured studio +1141, home +278, playground +12 on cb357098; the declared figures leave room for gzip spread across later heads.
Given back first: the reader reuses the boundary parser and comment grammar already in that chunk rather than adding its own, and only a slide whose text contains "hide" is parsed.
