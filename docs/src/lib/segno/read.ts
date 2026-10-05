/**
 * Segno's reader on its own — `@laticent/segno/read`.
 *
 * Everything a consumer needs to READ notation and BIND it to a slot: `parse` (the generated
 * notation parser), the schema builders (`record`, `list`, `value`) and the value types. Not the
 * grammar compiler, the code generator or the consistency checker, which only build parsers.
 * Lattice's lib/ takes this entry because its bundles reach the Studio's startup path through
 * the live lint, and a CommonJS `require` of the main entry carries the whole engine: measured
 * 2026-10-05, 10.1KB gzipped (read.cjs, minified) against 23.3KB for `index.cjs`. Same source
 * as the main entry — this file only re-exports — but each built entry bundles its own copy, so
 * never compare a value from this entry to one from another by identity (`instanceof`, `===`).
 */
export type { Diagnostic, Item, ListValue, Parsed, RecordValue, Scalar, Value } from './notation.js';
export { isDirective, parse } from './notation.js';
export type { Bound, Positional, RecordOf, RecordSpec, Slot, Spelling } from './schema.js';
export { list, record, SchemaError, schemaProblems, value } from './schema.js';
export type { Cls, EnumOptions, NumberValue, Range, TimePoint, Type } from './types.js';
export { CLASS_ORDER, flag, id, indexed, named, number, oneOf, range, readNumber, readTime, text, time } from './types.js';
