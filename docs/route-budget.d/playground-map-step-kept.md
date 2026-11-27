playground: +325

`PlaygroundApp.tsx` grows by the walk's en-route scroll guard. `walkEnRoute` keeps the guard after a step while the
step's own scroll is still between where it started and where it is going. `scrollWalk` records that destination and
re-arms the guard's timer, and two input stamps let a reader who takes over release it: the native scroll keys inside
the frame (`NATIVE_SCROLL_KEYS` in `onDeckKey`) and a drag in the frame, a scroll under a held press (`onDeckPress`). Together they fix
the `playground-map.spec.ts` "first, last, previous and next" flake, where a step was lost under load. There is nothing
smaller to give back: each piece is one check or one listener.
