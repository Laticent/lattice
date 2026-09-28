// Segno — the public surface. A grammar engine that only builds grammars it can prove are
// linear, and the one inline notation Lattice reads with it. Framework-free, zero-dependency,
// no DOM. Design: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
//
// (segno, Italian: sign, mark — and the musical *dal segno*, next to cadenza.)

export type { CharSet } from './charset.js';
export * as charset from './charset.js';
export { generate } from './codegen.js';
export type { Inconsistency, Use } from './consistency.js';
export { consistency } from './consistency.js';
export type { FlatTree } from './flat.js';
export { toNodes } from './flat.js';
export type { Expr, Grammar, GrammarSpec, Node, ParseError, ParseResult } from './grammar.js';
export { alt, any, compile, GrammarError, lint, lit, MAX_DEPTH, many, many1, node, noneOf, oneOf as chars, opt, range as charRange, ref, seq, set } from './grammar.js';
export type { Diagnostic, Item, ListValue, Parsed, RecordValue, Scalar, Value } from './notation.js';
export { isDirective, notationGrammar, parse } from './notation.js';
export { notationSpec, STOP } from './notation-grammar.js';
export type { Bound, Positional, RecordOf, RecordSpec, Slot, Spelling } from './schema.js';
export { list, record, SchemaError, schemaProblems, value } from './schema.js';
export type { Cls, EnumOptions, NumberValue, Range, TimePoint, Type } from './types.js';
export { CLASS_ORDER, color, flag, id, named, number, oneOf, range, readNumber, readTime, text, time } from './types.js';
