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
const quoted = node('quoted', seq('"', many(alt(seq('\\', any()), noneOf('"\\', 'text'))), '"'));
const record = node('record', seq('{', ref('item'), many(seq(',', ws, ref('item'))), '}'));
const list = node('list', seq('[', ws, opt(ref('item')), many(seq(',', ws, opt(ref('item')))), ']'));

export const notationSpec: GrammarSpec = {
  start: 'span',
  rules: {
    span: seq(ws, ref('item')),
    // A value: a record, a list, quoted text, or a bare run. Trailing space after a bare run
    // is part of the run (the reader trims it), which is what keeps the loop LL(1).
    value: alt(seq(record, ws), seq(list, ws), seq(quoted, ws), bare),
    // An item is a value, or a bare NAME followed by `=` and a value.
    item: alt(seq(record, ws), seq(list, ws), seq(quoted, ws), node('word', seq(bare, opt(seq('=', ws, ref('value')))))),
  },
};
