// Segno — the public surface. A general-purpose grammar engine that only builds grammars it can
// prove are linear, and a small inline notation (values, [lists], {records}) with schema-bound
// types built on it. Lattice is its first user. Framework-free, zero-dependency,
// no DOM. Design: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
//
// (segno, Italian: sign, mark — and the musical *dal segno*, next to cadenza.)

export type { CharSet } from './charset.js';
export * as charset from './charset.js';
export { generate, kindsOf } from './codegen.js';
export type { Inconsistency, Use } from './consistency.js';
export { consistency } from './consistency.js';
export type { Anomalies, Anomaly, AnomalyKind, Coverage, Facts, Limit } from './facts.js';
export { anomalies, coverage, facts, limitOf, MAX_FACT_SPANS } from './facts.js';
export type { FlatTree } from './flat.js';
export { toNodes } from './flat.js';
export type { Expr, Grammar, GrammarSpec, Node, ParseError, ParseResult } from './grammar.js';
export { alt, any, attempt, compile, GrammarError, greedy, lint, lit, MAX_ATTEMPT, MAX_DEPTH, MAX_DEPTH_LIMIT, MAX_NODES_LIMIT, MAX_UNTIL, many, many1, NODES_EXHAUSTED, node, noneOf, oneOf as chars, opt, range as charRange, ref, restrict, rolesOf, STACK_EXHAUSTED, seq, set, until } from './grammar.js';
export type { DescValue, Diagnostic, Item, ListValue, Parsed, RecordValue, Scalar, Value } from './notation.js';
export { isDirective, notationGrammar, parse } from './notation.js';
export { notationSpec, plainRecordSpec, STOP, TAGS, WS } from './notation-grammar.js';
export type { Bound, Positional, RecordOf, RecordSpec, Slot, Spelling } from './schema.js';
export { list, record, SchemaError, schemaProblems, value } from './schema.js';
export type { Cls, EnumOptions, NumberValue, Range, TimePoint, Type } from './types.js';
export { CLASS_ORDER, flag, id, indexed, isCurrency, malformedNumber, named, number, oneOf, range, readNumber, readTime, text, time } from './types.js';
