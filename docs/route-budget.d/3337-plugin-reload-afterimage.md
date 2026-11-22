studio: +1900
home: +140
playground: +130

The Studio draws a listed plugin's block as its afterimage until the plugin's code loads (D1,
`engineering/decisions/2026-11-20-plugin-reload-wait.md`): `code-packages/wait.ts` must run before the
first paint, so it is on the Studio's first load (1,737 bytes measured against `main`). Recording the
drawings (`wait-capture.ts`) loads with the door and costs nothing at startup. The home page and the
Playground carry only the shared hand-off in `entry.ts` (about 120 bytes): the waits are gated to previews, and an
empty or unreadable Library clears the stale fence registry.
Given back first: the arms the owner did not pick, the bench recorder, and a compacted SVG writer. Not taken:
`deckPluginList` and `scanFences`, the shared readers, which ship in lazy chunks and would add about 2.2 KB here; a
small copy of each rule is held to them by `wait.test.ts`.
Measured: studio +1,854, home +124, playground +116; declared with a little room for `main` moving.
