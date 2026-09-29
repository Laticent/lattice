/**
 * The inline notation's grammar, as data. `notation.ts` reads with the parser GENERATED from it
 * (notation.generated.ts, written by tools/build-segno-lib.js and kept fresh by a test); the
 * closure-compiled parser (`compile(notationSpec)`) is the reference the generated one must
 * match exactly. Both start from the same LL(1) proof, so the grammar below is also a proof
 * that every span is read in one left-to-right pass.
 */

import { alt, any, type GrammarSpec, many, node, noneOf, oneOf, opt, ref, seq } from './grammar.js';

const WS = ' \t';
/** Characters that end a bare value. `|` is here so it can be reported as reserved. */
export const STOP = ',={}[]"|';

const ws = many(oneOf(WS, 'a space'));
const bare = node('bare', seq(noneOf(STOP + WS, 'a value'), many(noneOf(STOP, 'a value'))));

// Each shape is its OWN rule, referenced from `value` and `item`, rather than an expression
// both of them embed. Embedded, every shape was generated twice, into two large functions V8
// would not inline; the profile showed the parser running 2.5x slower on pills once it had also
// seen lists. As rules, each shape is one small function. (`quoted` and `bare` cannot recurse,
// so references to them spend none of the nesting cap.)
export const notationSpec: GrammarSpec = {
  start: 'span',
  rules: {
    span: seq(ws, ref('item')),
    record: node('record', seq('{', ref('item'), many(seq(',', ws, ref('item'))), '}')),
    list: node('list', seq('[', ws, opt(ref('item')), many(seq(',', ws, opt(ref('item')))), ']')),
    quoted: node('quoted', seq('"', many(alt(seq('\\', any()), noneOf('"\\', 'text'))), '"')),
    // A value: a record, a list, quoted text, or a bare run. Trailing space after a bare run
    // is part of the run (the reader trims it), which is what keeps the loop LL(1).
    value: alt(seq(ref('record'), ws), seq(ref('list'), ws), seq(ref('quoted'), ws), bare),
    // An item is a value, or a bare NAME followed by `=` and a value.
    item: alt(seq(ref('record'), ws), seq(ref('list'), ws), seq(ref('quoted'), ws), node('word', seq(bare, opt(seq('=', ws, ref('value')))))),
  },
};
