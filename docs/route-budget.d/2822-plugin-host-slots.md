studio: +20
playground: +8
home: +8
The Studio hands each plugin's stylesheet to its door (`StudioShell.tsx` passes `css`, `door.ts` adds it to the stamp), which is the +12 in `StudioIsland`. The +8 in `theme-fetch` on all three routes is in code this PR does not touch and does not reproduce in a local build (see `engineering/gotchas/ci.md`, "A PR that changes only markdown fails the route budget by a few bytes"); the cause was not found.
