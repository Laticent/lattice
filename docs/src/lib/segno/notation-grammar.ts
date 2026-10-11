/**
 * The inline notation's grammar, as data. `notation.ts` reads with the parser GENERATED from it
 * (notation.generated.ts, written by tools/build-segno-lib.js and kept fresh by a test); the
 * closure-compiled parser (`compile(notationSpec)`) is the reference the generated one must
 * match exactly. Both start from the same LL(1) proof, so the grammar below is also a proof
 * that every span is read in one left-to-right pass.
 */

import { alt, any, type GrammarSpec, many, node, noneOf, oneOf, opt, ref, seq } from './grammar.js';

/** Space, tab and no-break space (U+00A0, which text pasted from documents and chat carries). */
export const WS = ' \t\u00a0';
/** Characters that end a bare value. `|` is here so it can be reported as reserved. */
export const STOP = ',={}[]"|';
/**
 * TAGS: a character directly before a span's opening `{` names what kind of record it is —
 * `~{12 14 17}`, `^{database}`, `!{Ada Okafor}`. Only at the very START of a span: there, a tag character
 * always opens a tagged record, so the choice is made on one character and the grammar stays
 * LL(1). The price is that a span's top-level bare value cannot start with a tag character —
 * `~/path` simply fails to parse, which for inline code means it stays code. Inside a record or
 * a list a tag character is ordinary text (`{~5 min}`). What each tag MEANS is the slot's
 * business (`record({ tag: '~' })`), not the grammar's.
 */
export const TAGS = '~^!';

const ws = many(oneOf(WS, 'a space'));
const bare = node('bare', seq(noneOf(STOP + WS, 'a value'), many(noneOf(STOP, 'a value'))));
// The same run at the START of a span, where a tag character opens a tagged record instead.
const topBare = node('bare', seq(noneOf(STOP + WS + TAGS, 'a value'), many(noneOf(STOP, 'a value'))));

// Each shape is its OWN rule, referenced from `value` and `item`, rather than an expression
// both of them embed. Embedded, every shape was generated twice, into two large functions V8
// would not inline; the profile showed the parser running 2.5x slower on pills once it had also
// seen lists. As rules, each shape is one small function. (`quoted` and `bare` cannot recurse,
// so references to them spend none of the nesting cap.)
export const notationSpec: GrammarSpec = {
  start: 'span',
  rules: {
    span: seq(ws, alt(node('tagged', seq(oneOf(TAGS, 'a tag'), ref('record'), ws)), ref('top'))),
    // `item`, less the bare runs that start with a tag character (see TAGS).
    top: alt(seq(ref('record'), ws), seq(ref('list'), ws), seq(ref('quoted'), ws), node('word', seq(topBare, opt(seq('=', ws, ref('value')))))),
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
