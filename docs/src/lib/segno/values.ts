/**
 * Segno's value readers on their own — `@laticent/segno/values`.
 *
 * `readNumber` reads numbers as people write them (`42`, `-$0.8M`, `12%`, `($1.2M)`, `1,25M`,
 * `1.234.567`) and `readTime` reads time points (`2026-03-15`, `2026 Q1`, `Q3`, `Jan`): the
 * `number()` and `time()` types' readers, and nothing else of the library. A consumer that only
 * reads values (Lattice's chart-values.js and gantt-time.js, which every chart and the narrator
 * share) takes this entry so a bundle that cannot tree-shake a CommonJS `require` does not carry
 * the whole grammar engine. Same code as the main entry's readers — this file only re-exports.
 */
export { type NumberValue, readNumber, readTime, type TimePoint } from './types.js';
