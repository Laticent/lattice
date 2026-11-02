/**
 * html-ref-grammar — the HTML tokens a web-reference scan needs, as a Segno grammar (Segno R3).
 *
 * The one reader of markup for `scanHtml` (remote-ref.js; the decision note's "R3 landed"). tools/build-segno-grammar.js
 * compiles `htmlSpec` with Segno's code generator into lib/core/html-ref.generated.js, and
 * lib/core/html-ref-reader.js walks that parser's flat tree. Change the grammar here, then run
 * `npm run segno-lib:build`; build:check fails while the generated file is stale.
 *
 * It lives in tools/, not beside the reader in lib/core: only the build reads it (the browser ships the
 * generated parser), and the structure gate keeps a file beside its one user (`npm run structure`).
 *
 * It follows the WHATWG tokenizer (HTML §13.2.5) in the data state, for what decides where a tag,
 * an attribute, a comment or a bogus comment ends. What it keeps (a node per kept piece; text,
 * bogus comments, doctypes and `</>` are read and dropped):
 *   stag, etag  a start or an end tag, from its name to its `>` (the `<` is the character before)
 *   tn          the tag's name
 *   an, av      an attribute's name, and its value with its quotes (`av` may be empty: `a=>`)
 *   sl          a `/` between attributes (a self-closing tag ends `sl` then `gt`)
 *   gt          the `>` that ends a tag. A tag with no `gt` runs to the end of the input, which the
 *               tokenizer drops (eof-in-tag), so the reader stops there.
 * And four STOP kinds, where what follows depends on state the tokenizer does not own (the tree
 * builder switches it, or the reader's foreign-content stack decides). The parse ends at the stop;
 * the reader decides and resumes with `parse(input, rule, from)`:
 *   rtn         the name of a start tag whose content is raw text in HTML content (`style`,
 *               `script`, `textarea`, …, `plaintext`). The reader reads the rest of the tag
 *               (`tagRest`), then, in HTML content, searches for the end tag; in foreign content
 *               it goes on with `top`.
 *   copen       the `--` of `<!--`. The reader reads the comment with `comment`, whose `cend` (the
 *               closing `>`) is a stop too; a comment with no `cend` never ends.
 *   cdo         the `[CDATA[` of `<![CDATA[`: a CDATA section in foreign content (`cdata`), a bogus
 *               comment in HTML content (`bogusRest`).
 *   cend        a comment's closing `>`.
 * The rules a stop hands over to end on a stop of their own, since a parse that does not stop must
 * read to the end of the input: `rgt` (the `>` of a tag `rtn` stopped in), `cdx` (a CDATA section
 * and its `]]>`) and `bog` (a bogus comment and its `>`).
 *
 * Tree construction (foreign content, `<select>`, `<noscript>`, an escaped script) is NOT modeled:
 * the reader reports an `unsure` span there, and the caller asks the platform parser
 * (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §5 and §R3).
 *
 * Pass the Segno API in (`makeHtmlGrammar(S)`): the build bundles Segno's TypeScript source, and
 * tests load whichever copy they measure. Pure data, no fs, no DOM.
 */

// The tokenizer's whitespace. A carriage return is folded into a line feed before tokenizing, so
// it separates as a line feed does.
const WS = ' \t\n\f\r';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
// The elements whose content the tree builder reads as text up to their end tag, in HTML content,
// and `plaintext`, whose content runs to the end. `<noscript>` is raw text because every surface
// that shows a deck runs scripts. The reader holds the same list (RAW_TEXT in html-ref-reader.js).
const RAW_NAMES = ['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'title', 'plaintext'];
// `plaintext`, the longest.
const RAW_NAME_MAX = 9;

function makeHtmlGrammar(S) {
  const { alt, attempt, chars, greedy, many, many1, node, noneOf, opt, ref, seq, until } = S;
  const g = (x) => greedy(x);

  /**
   * One choice that spells every word of `words` in either case of ASCII (the tokenizer lowers
   * ASCII only), factored on the first letter so each decision is made on one character.
   */
  const spell = (words) => {
    const byFirst = new Map();
    for (const w of words) {
      if (!w) continue;
      const c = w[0];
      if (!byFirst.has(c)) byFirst.set(c, []);
      byFirst.get(c).push(w.slice(1));
    }
    const branches = [...byFirst].map(([c, rest]) => {
      const letter = chars(c + c.toUpperCase());
      const tails = rest.filter(Boolean);
      return tails.length ? seq(letter, spell(tails)) : letter;
    });
    return branches.length === 1 ? branches[0] : alt(...branches);
  };

  const space = chars(WS, 'a space');
  const name = seq(chars(LETTERS, 'a letter'), g(many(noneOf(`${WS}/>`, 'a name character'))));
  const gt = g(opt(node('gt', '>')));
  const quoted = (q) => seq(q, until(q, { orEnd: true }));
  // Before an attribute value: a quote opens a quoted value; anything else but a space or `>` starts
  // an unquoted one, which runs to a space or `>` (quotes and `/` included).
  const value = node('av', g(opt(alt(quoted('"'), quoted("'"), seq(noneOf(`${WS}>"'`, 'a value character'), g(many(noneOf(`${WS}>`, 'a value character'))))))));
  // An attribute: its name (the first character may be `=`), the spaces after it, and `=` and a
  // value when one follows. Spaces and `/` between attributes are read by `attrs`.
  const attr = seq(
    node('an', seq(noneOf(`${WS}/>`, 'a name character'), g(many(noneOf(`${WS}/>=`, 'a name character'))))),
    g(many(space)),
    g(opt(seq('=', g(many(space)), value))),
  );
  // A comment, after `<!--` (WHATWG §13.2.5.43-52). It ends at `>` after two or more dashes, or
  // after two or more dashes and `!`; `<!-->` and `<!--->` end at once. `cend` stops the parse.
  const cend = node('cend', '>');
  const tail = g(opt(alt(cend, seq('!', g(opt(cend))))));
  const dashes = seq('-', g(opt(seq('-', g(many('-')), tail))));
  const body = g(many(alt(g(many1(noneOf('-', 'a comment character'))), dashes)));

  const htmlSpec = {
    start: 'top',
    stops: ['rtn', 'copen', 'cdo', 'cend', 'rgt', 'cdx', 'bog'],
    rules: {
      top: g(many(alt(g(many1(noneOf('<', 'a character'))), ref('markup')))),
      markup: seq(
        '<',
        g(
          opt(
            alt(
              node('stag', seq(alt(attempt(node('rtn', spell(RAW_NAMES)), { max: RAW_NAME_MAX, next: `${WS}/>` }), node('tn', name)), ref('tagEnd'))),
              seq('/', g(opt(alt(node('etag', seq(node('tn', name), ref('tagEnd'))), '>', seq(noneOf(`${LETTERS}>`, 'a character'), until('>', { orEnd: true })))))),
              // `<!` and nothing after it is dropped with the rest of the input.
              seq(
                '!',
                g(
                  opt(
                    alt(
                      attempt(node('copen', '--'), { max: 2, next: S.charset.ANY }),
                      attempt(node('cdo', '[CDATA['), { max: 7, next: S.charset.ANY }),
                      '>',
                      seq(noneOf('>', 'a character'), until('>', { orEnd: true })),
                    ),
                  ),
                ),
              ),
              seq('?', until('>', { orEnd: true })),
            ),
          ),
        ),
      ),
      attrs: g(many(alt(space, node('sl', '/'), attr))),
      tagEnd: seq(ref('attrs'), gt),
      // The rest of a tag `rtn` stopped in: its attributes and its `>`, which stops this parse too.
      tagRest: seq(ref('attrs'), g(opt(node('rgt', '>')))),
      comment: alt(
        cend,
        seq('-', alt(cend, seq('-', g(many('-')), tail, body), seq(noneOf('->', 'a comment character'), body), seq())),
        seq(noneOf('->', 'a comment character'), body),
        seq(),
      ),
      cdata: node('cdx', until(']]>', { orEnd: true })),
      bogusRest: node('bog', until('>', { orEnd: true })),
    },
  };
  return { htmlSpec };
}

module.exports = { makeHtmlGrammar, WS, RAW_NAMES, RAW_NAME_MAX };
