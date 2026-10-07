studio: +16
playground: +48
The Playground page's preview now re-renders when the host changes its plugin defaults: one
`lattice:plugin-defaults` listener in `PlaygroundApp.tsx` that routes the event through the page's
frame scheduler, as the palette observer does (#2577, 2509-p5) — measured +32 B gz on the playground
route against main. It names the event as a string rather than importing it from
`@/lib/plugin-admission`, whose static import of the lint bundle made that bundle eager (+110 KB,
past the ceiling, on an earlier push of this PR). The Studio's +8 B is the Guide conductor's rest
rule (`guide-conductor.ts`, `scene.last`): the next sentence of a part a bound slide already played
rests instead of replaying its act. Declared with headroom over the measured 8 / 32 for gzip
variation.
