// The docs-site binding of the scene resolver: a bound sentence's unit, found in the slide. It lives
// once in the engine at `lib/core/scene-resolve.mjs` (HARD RULE #1), so the Studio, the exported
// player and the corpus gate resolve a sentence to the same elements. A thin re-export, for the
// reason `resolve-pace.js` gives.
export { anySelector, fillSelector, keyIndex, resolveUnit } from '../../../lib/core/scene-resolve.mjs';
