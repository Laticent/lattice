/**
 * Segno's number reader on its own — `@laticent/segno/number`.
 *
 * `readNumber` reads numbers as people write them (`42`, `-$0.8M`, `12%`, `($1.2M)`, `1,25M`,
 * `1.234.567`): the `number()` type's reader, and nothing else of the library. A consumer that
 * only reads numbers (Lattice's chart-values.js, which every chart and the narrator share) takes
 * this entry so a bundle that cannot tree-shake a CommonJS `require` does not carry the whole
 * grammar engine. Same code as the main entry's `readNumber` — this file only re-exports it.
 */
export { type NumberValue, readNumber } from './types.js';
