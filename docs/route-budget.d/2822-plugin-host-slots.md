studio: +254
playground: +225
home: +225
The Studio hands each plugin's stylesheet to its door (`StudioShell.tsx` passes `css`, `door.ts` adds it to the stamp), which is the +29 in `StudioIsland`. The rest is in `theme-fetch`, which the startup bundle shares with the preview draw host's stub (`preview-draw-host.ts`: one property definition on `window` plus the warm-up call that `render-engine.ts` makes for a deck holding a plot); that is +225 on all three routes. The host itself (`preview-draw-host-impl.ts`, the frame code and the library pins) loads on first use and is not in any route's startup bundle. A first cut that kept the loading logic in the stub cost +393 on three routes, which is why it is split.
