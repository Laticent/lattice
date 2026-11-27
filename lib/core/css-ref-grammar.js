/**
 * css-ref-grammar — CSS as one Segno grammar with two entries: the tokens a web-reference scan needs (`top`), and every
 * token of a sheet or an island (`sheet`, Segno P5).
 *
 * tools/build-segno-grammar.js compiles `cssSpec` with Segno's code generator into the generated region of
 * lib/core/css-tokens.js, which exports the parser as `cssParser`. `cssRefSpans` (remote-ref.js, through
 * css-ref-reader.js) walks the flat tree `top` writes; the tokenizer in the same file walks the tree `sheet` writes. ONE
 * parser serves both, so the two share every rule they can and a page that loads both pays for one. Change the grammar
 * here, then run `npm run segno-lib:build`; build:check fails while the generated region is stale.
 *
 * What it keeps (a node per kept token; everything else is read and dropped):
 *   str     a string token, quotes included
 *   at      `@` and the name after it (`@font-face`)
 *   open    one of `(` `[` `{`, including the `(` of a function other than `url`
 *   close   one of `)` `]` `}`
 *   url     a function named `url`, from the first character of the name to the `(`. A STOP kind:
 *           the parse ends there, because what follows is a token the grammar cannot tell from
 *           ordinary CSS without knowing the name was `url` (the next rule, `urlBody`, reads it).
 * Comments are read and dropped.
 *
 * WHY `url(` IS A STOP. After a name that decodes to `url` and a `(`, CSS reads everything up to
 * `)` as one token: quotes, `/*` and `{` lose their meaning. The name can be spelled with escapes
 * (`u\72l(`, `\55 RL(`, `\000075rl(`, `\u\r\l(`), so a grammar can only take that branch by
 * factoring every spelling of `u`, `r` and `l`, character by character, including the whitespace a
 * hex escape eats. `urlName` does that inside one bounded attempt (the longest spelling is 28
 * characters), and the node it keeps stops the parse. The caller reads the body with `urlBody`,
 * parsed from the end of the stop, and resumes `top` after it. Number of parses: two per `url(`
 * plus one, each reading only its own stretch of the input.
 *
 * The block stack (`@font-face` only where a rule can start, `[…]` never fetching, a closer that
 * does not match the innermost block being an ordinary token) is state, not syntax, and lives in
 * the reader. engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §R2.
 *
 * Pass the Segno API in (`makeCssGrammar(S)`): the build bundles Segno's TypeScript source, and
 * tests load whichever copy they measure. Pure data, no fs, no DOM.
 */

// CSS Syntax 3 §3.3: a carriage return, a form feed and CRLF are newlines, and the first two are
// whitespace with a space and a tab.
const NL = '\n\r\f';
const WS = ` \t${NL}`;
const HEX = '0123456789abcdefABCDEF';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
// What a name is read from: ASCII letters, digits, `_`, `-`, and an escape. A non-ASCII character
// ends a name here (it continues one in CSS): the scanner then sees a `url(` the browser does not,
// which is the safe side.
const NAME_START = `${LETTERS}_-`;
const NAME_CHAR = `${NAME_START}0123456789`;
// The longest spelling of `url(`: three letters of at most nine characters (`\` + six digits + CRLF)
// and the `(`.
const URL_NAME_MAX = 32;

function makeCssGrammar(S) {
  const { alt, attempt, charset, chars, greedy, many, many1, node, noneOf, opt, ref, seq, set, until } = S;
  const g = (x) => greedy(x);

  // Shared pieces are RULES, not values: Segno's generator inlines a value everywhere it is used, and
  // inlining the escape and the two strings into six places tripled the parser's size.
  const wsUnit = ref('wsUnit');
  const hex = chars(HEX, 'a hex digit');
  /** One to six hex digits, then the one whitespace that belongs to the escape. */
  const hexTail = (k) => (k === 1 ? g(opt(hex)) : g(opt(seq(hex, hexTail(k - 1)))));
  const esc = ref('escape');
  const name = g(many(alt(esc, chars(NAME_CHAR, 'a name character'))));
  const string = (q) => ref(q === '"' ? 'stringDq' : 'stringSq');
  /** A string token for quote `q`: an escape, a line continuation, or a character that is neither the
   *  quote nor a newline. A newline ends a BAD string and is read again. */
  const stringRule = (q) => {
    const continuation = alt(seq('\r', g(opt('\n'))), chars('\n\f', 'a newline'));
    const escaped = seq('\\', g(opt(alt(continuation, ref('hexEscape'), noneOf(HEX + NL, 'an escaped character')))));
    return node('str', seq(q, g(many(alt(escaped, noneOf(`${q}\\${NL}`, 'a string character')))), g(opt(q))));
  };

  /** One spelling of a letter of `url`: itself, `\` + itself, or `\` + zero-padded hex + the
   *  whitespace the escape eats. `pair` is the hex digits of the two cases, as two sets. */
  const zeros = (k) => (k === 0 ? seq() : g(opt(seq('0', zeros(k - 1)))));
  const urlLetter = (letters, first, second) =>
    alt(chars(letters), seq('\\', alt(chars(letters), seq(zeros(4), chars(first), chars(second), g(opt(wsUnit))))));
  // u = 75, U = 55; r = 72, R = 52; l = 6c, L = 4c.
  const urlName = seq(urlLetter('uU', '75', '5'), urlLetter('rR', '75', '2'), urlLetter('lL', '64', 'cC'), '(');

  const specials = `/"'@(){}[]\\${NAME_START}`;
  const cssSpec = {
    start: 'top',
    stops: ['url', 'body'],
    rules: {
      wsUnit: alt(seq('\r', g(opt('\n'))), chars(' \t\n\f', 'a space')),
      hexEscape: seq(hex, hexTail(5), g(opt(wsUnit))),
      // A backslash and what it escapes. At the end of the input the backslash stands alone.
      escape: seq('\\', g(opt(alt(ref('hexEscape'), noneOf(HEX, 'an escaped character'))))),
      stringDq: stringRule('"'),
      stringSq: stringRule("'"),
      top: g(many(ref('token'))),
      token: alt(
        attempt(node('url', urlName), { max: URL_NAME_MAX, next: S.charset.ANY }),
        seq('/', g(opt(seq('*', until('*/', { orEnd: true }))))),
        string('"'),
        string("'"),
        node('at', seq('@', name)),
        seq(alt(esc, chars(NAME_START, 'a name start')), name, g(opt(node('open', '(')))),
        node('open', chars('[{(', 'an opener')),
        node('close', chars(')]}', 'a closer')),
        g(many1(noneOf(specials, 'a character'))),
      ),
      // The token after `url(`: a string and what closes it, or an unquoted token to the `)`.
      urlBody: node(
        'body',
        seq(
          g(many(chars(WS, 'a space'))),
          alt(
            seq(alt(string('"'), string("'")), g(many(chars(WS, 'a space'))), g(opt(node('rparen', ')')))),
            node(
              'unq',
              alt(
                seq(alt(esc, noneOf(`)\\"'`, 'a character')), g(many(alt(esc, noneOf(')\\', 'a character')))), g(opt(node('rparen', ')')))),
                node('rparen', ')'),
              ),
            ),
            seq(),
          ),
        ),
      ),
    },
  };

  // ── THE SHEET TOKENIZER (Segno P5) ──────────────────────────────────────────────────────────────────────────────
  // The `sheet` entry reads the same text as `top`, with the same escape, string and `url(` rules, but KEEPS every token,
  // so a reader can walk a whole stylesheet or one value (an island) as spans: lib/core/css-tokens.js is its driver and
  // says what each kind means. It differs from `top` in three places, each toward CSS Syntax 3 §4.3:
  //   - a name may hold a non-ASCII character (`top` ends one there, the safe side for a fetch scan only);
  //   - `@` and `#` take a name only when one starts after them (`@1x` is `@` and then text);
  //   - whitespace, `;`, `:` and `,` are tokens, not part of the run of other characters.
  // Numbers are not tokens: a digit run is text, so `1url(x)` reads as a `url(`, where a browser reads a dimension and a
  // `(`. That is the side `top` errs on, and no reader of this tokenizer reads a number.
  // A rule may start only one way on each character but the `url(` attempt's, so it stays LL(1) but for that one bounded
  // attempt, which `top` already has.
  const nameCharWide = set(charset.union(charset.ofChars(NAME_CHAR), [0x80, 0xffff]), 'a name character');
  const nameStartWide = set(charset.union(charset.ofChars(NAME_START), [0x80, 0xffff]), 'a name start');
  const wideName = ref('wideName');
  const identStart = alt(esc, nameStartWide);
  const sheetSpecials = `/"'@#(){}[];:,\\${NAME_START}${WS}`;
  // The `sheet` rules are added after `top`'s own, so `top` generates the same code it did when it was a parser of its own
  // (lib/core/css-ref.generated.js, deleted with P5a).
  Object.assign(cssSpec.rules, {
    wideName: g(many(alt(esc, nameCharWide))),
    sheet: g(many(ref('sheetToken'))),
    sheetToken: alt(
      attempt(node('url', urlName), { max: URL_NAME_MAX, next: S.charset.ANY }),
      node('cmt', seq('/', g(opt(seq('*', until('*/', { orEnd: true })))))),
      string('"'),
      string("'"),
      node('ws', g(many1(chars(WS, 'a space')))),
      node('at', seq('@', g(opt(seq(identStart, wideName))))),
      node('hash', seq('#', wideName)),
      seq(node('ident', seq(identStart, wideName)), g(opt(node('open', '(')))),
      node('open', chars('[{(', 'an opener')),
      node('close', chars(')]}', 'a closer')),
      node('semi', ';'),
      node('colon', ':'),
      node('comma', ','),
      g(many1(noneOf(sheetSpecials, 'a character', [0x80, 0xffff]))),
    ),
  });
  return { cssSpec };
}

module.exports = { makeCssGrammar, NL, WS, URL_NAME_MAX };
