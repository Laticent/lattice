/**
 * flowchart-row-grammar — the flowchart row (`Storefront -SEV1-> Payments`) as a Segno grammar.
 *
 * This is the ONE reader of a row's text. tools/build-segno-grammar.js compiles `rowSpec` with
 * Segno's code generator into lib/core/flowchart-row.generated.js, and `splitRow`
 * (flowchart-grammar.js) walks that parser's flat tree. Change the grammar here, then run
 * `npm run segno-lib:build`; build:check fails while the generated file is stale.
 *
 * Why a grammar needs `attempt()` here: `-x` in `A -x B` is a word and `-x->` in `A -x-> B` is
 * an arrow, and the two only part at the closing shaft and the character after it, up to 64
 * characters past the `-`. So at a word start the grammar TRIES an arrow on a bounded window and
 * keeps it only if a space or the end follows; otherwise the character passes to the word.
 * engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Flowchart rows need a
 * bounded attempt has the measurements and the review.
 *
 * Two entry rules:
 *   row   text that starts at a word start (the start of a row, or text after a code span)
 *   rest  text that continues a word (text right after an escaped `\{literal}` span): its first
 *         word cannot be an arrow, because an arrow only opens at a word start
 *
 * Pass the Segno API in (`makeRowGrammar(S)`): the build bundles Segno's TypeScript source, and
 * the bake-off and the unit test load whichever copy they measure. Pure data, no fs, no DOM.
 */

// The row's character classes. A SPACE may sit inside a label; a newline may not. Any of the four
// ends an arrow, and any of them starts a word.
const SPACE = ' \t\r';
const BOUNDARY = ' \t\r\n'; // what must follow an arrow (or the end)
// The longest label an arrow takes, in characters: a label that runs past it is text.
const LABEL_MAX = 61;
// CommonMark's escapable set: a backslash before any of these is an escape (`\->`, `\&`).
const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

function makeRowGrammar(S) {
  const { alt, any, attempt, chars, greedy, many, many1, node, noneOf, opt, ref, seq } = S;

  /** A label character that keeps the arrow open after a non-space. */
  const labelChar = (c) => noneOf(`${SPACE}\n<>${c}`, 'a label character');
  /** The label's running text: a space run must be followed by a label character or a shaft (a
   *  shaft after a space never closes). */
  const running = (c) => many(alt(labelChar(c), seq(many1(chars(SPACE, 'a space')), alt(labelChar(c), c))));

  /** Every arrow whose shaft is `c`, after an optional `<`. `left` decides whether a bare shaft is
   *  an arrow (`<-` is; `-` is not). The label is not a node: it is the text between the first
   *  shaft and the closing run, so the reader takes it off the arrow's own offsets. */
  function shaft(c, left) {
    const N = labelChar(c);
    const U = running(c);
    const head = node('head', '>');
    const closing = seq(many1(c), many(seq(N, U, many1(c))), opt(head));
    const labeled = seq(alt(N, '<'), U, closing);
    const doubled = seq(c, opt(alt(head, seq(node('third', c), opt(head)))));
    const branches = [node('doubled', doubled), head, node('labeled', labeled)];
    return left ? seq(c, opt(alt(...branches))) : seq(c, alt(...branches));
  }

  /** A labeled arrow that MUST end in `>`. The label cap counts from the label, so a headed and an
   *  unheaded arrow at the cap differ in length by one, and each is its own attempt. */
  function headedLabel(c) {
    const N = labelChar(c);
    const U = running(c);
    return seq(c, node('labeled', seq(alt(N, '<'), U, many1(c), many(seq(N, U, many1(c))), node('head', '>'))));
  }

  const both = (make) => alt(node('dash', make('-')), node('eq', make('=')));
  const wchar = alt(
    seq('\\', greedy(opt(node('esc', chars(PUNCT, 'punctuation'))))),
    noneOf(`${BOUNDARY}\\`, 'a word character'),
  );
  const arrowAt = (x, max) => attempt(node('arrow', x), { max, next: BOUNDARY });

  // At a word start, try an arrow; a failed attempt hands the character on to the word. Headed
  // first, because the unheaded window is one shorter and would read a headed arrow at the cap as
  // an unheaded one followed by `>` (which its `next` check then refuses).
  const rowSpec = {
    start: 'row',
    rules: {
      row: many(alt(chars(BOUNDARY, 'a space'), ref('word'))),
      rest: seq(greedy(many(wchar)), ref('row')),
      word: alt(
        arrowAt(both(headedLabel), 1 + LABEL_MAX + 2),
        arrowAt(both((c) => shaft(c, false)), 1 + LABEL_MAX + 1),
        arrowAt(seq('<', both(headedLabel)), 2 + LABEL_MAX + 2),
        arrowAt(seq('<', both((c) => shaft(c, true))), 2 + LABEL_MAX + 1),
        seq(wchar, greedy(many(wchar))),
      ),
    },
  };

  // The #2462 spike's finding, kept as a check: the arrow ALONE is a strict LL(1) grammar. Only
  // the choice at a word start needs attempt().
  const arrowSpec = {
    start: 'window',
    rules: {
      window: seq(ref('arrow'), opt(seq(chars(BOUNDARY, 'a space'), many(any())))),
      arrow: alt(
        node('dash', shaft('-', false)),
        node('eq', shaft('=', false)),
        seq('<', alt(node('dash', shaft('-', true)), node('eq', shaft('=', true)))),
      ),
    },
  };

  return { rowSpec, arrowSpec };
}

module.exports = { makeRowGrammar, SPACE, BOUNDARY, LABEL_MAX, PUNCT };
