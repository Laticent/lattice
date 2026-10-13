studio: +1200
playground: +4
The Studio's authoring core (`docs/src/playground/authoring-core.generated.js`) now carries the spark writer `editSpark` and reader `read` (`lib/core/inline-sparks.js`), the pill writer's `icon=` axis (`editIcon`), and `pillIsCrowded` (lint-core, shared with the `pill-shape-crowded` rule), and `ComposeView` carries the Insert-spark door with its icon path. CI measured studio +1105 B gz against main; +1200 leaves room for gzip spread. The spark panel (`SparkPanel.tsx`), the icon row and the object editor host stay in the lazy chunk loaded when an object is first opened.
The playground's eager JS read +2 B in CI: gzip variation on a route this PR changes only through the shared authoring core, as #2361 and #2548 saw. No real growth is being declared there.
Given back first: nothing yet. The writer is pure and shared by the browser bundle and the CLI (HARD RULE #7), so it cannot be split off without a second copy; the panels were already lazy.
