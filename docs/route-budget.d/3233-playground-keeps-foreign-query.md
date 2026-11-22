playground: +79
home: +64

The Playground's address-bar write now rewrites only the four keys it owns (`c`, `view`, `s`, `v`)
and keeps every other one, so a `?tier=unsupported` pin survives a walk to a component and the
decline screen keeps the tier it was pinned to (`withPlaygroundQuery` in `playground-controller.ts`,
called from `PlaygroundApp.tsx`). The helper is the whole cost: 64 bytes in the shared
`playground-controller` chunk, which home also loads, and 15 bytes at the call site in
`PlaygroundIsland`. Nothing to give back that is smaller than the fix itself.
