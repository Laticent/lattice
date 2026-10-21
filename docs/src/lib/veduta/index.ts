// Veduta — a windowed preview, headless. Which units of a list a view should mount, at what
// fidelity, in what order, and how to move through them. See README.md.
//
// The core imports nothing outside this folder. A host supplies a FOCUS (any hub, such as Fuoco's)
// and CONNECTORS that do the mounting; Lattice's connectors live with the Studio and the Playground.

export type { Asked, Band, Budget, Caps, Intent, Policy, Previous, RankEntry, Satisfied, StageKind, Tier, Unsafe, Viewport, WindowArgs, WindowName } from './core.js';
export { createVeduta, settle, windowFor } from './core.js';
