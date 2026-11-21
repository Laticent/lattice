studio: +1600
home: +120
playground: +80

The Studio draws a listed plugin's block as its afterimage until the plugin's code loads (D1,
`engineering/decisions/2026-11-20-plugin-reload-wait.md`): `code-packages/wait.ts` must run before the
first paint, so it is on the Studio's first load (1,463 bytes measured against `main`). Recording the
drawings (`wait-capture.ts`) loads with the door and costs nothing at startup. The home page and the
Playground carry only the shared hand-off in `entry.ts` and `single-slide-render.ts` (58 to 102 bytes).
Given back first: the arms the owner did not pick, the bench recorder, and a compacted SVG writer.
Measured: studio +1,558, home +102, playground +58; declared with a little room for `main` moving.
