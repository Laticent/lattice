playground: +177

`PlaygroundApp.tsx` grows by two pieces of the walk's scroll guard. `walkEnRoute` keeps the guard after a step while the
step's own scroll is still between where it started and where it is going, and `scrollWalk` records that destination
and re-arms the guard's timer. `gotoIndex` aims the preview at a slide the walk already names, and no longer returns
without scrolling. Together they fix the `playground-map.spec.ts` "first, last, previous and next" flake, where a step
was lost under load. There is nothing smaller to give back: each is one check and one call.
