/**
 * front-matter-grammar — a deck's front matter as one Segno grammar: the fence that bounds the block, and each line
 * of the YAML body as the readers see it (a key line, a block-scalar header, or neither). This is the REGISTER GRAMMAR
 * engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §5 names, decided by the owner on 2026-11-16 as a
 * grammar plus a small hand-written driver. tools/build-segno-grammar.js compiles `frontMatterSpec` with Segno's code
 * generator into the generated region of lib/core/front-matter-keys.mjs (its driver), and `frontMatterFenceSpec` into
 * the region of lib/core/front-matter-fence.mjs (the fence alone, so a page that needs only where the block ends does
 * not ship the line rule's tables). The parsers live inside their drivers because both must stay ES modules that
 * import nothing (the build script says why). Change the grammar here, then run `npm run segno-lib:build`; build:check fails
 * while the generated file is stale.
 *
 * WHAT IS NOT HERE, AND WHY. Where a block scalar's body ends (`style: |` and the lines under it) is the drivers' one
 * job: a body line is one indented DEEPER than its header, so whether a line is a key depends on a count read from an
 * earlier line. No grammar can carry that count: "a header indented n, then lines each indented more than n" is not
 * context-free (cut it with a regular language to `s^n H s^m L s^k L` with m > n and k > n, and pumping on n breaks
 * one of the two comparisons), so it is not LL(1) either. Segno has no counter and no back-reference by design. The
 * driver compares indent widths the grammar measured, each line once.
 *
 * TWO ENTRY RULES:
 *
 *   fence  on S0 text (no `\r`): `---`, a line end, anything up to and including the first `\n---` after it, then an
 *          optional line end, as the engine's `^---\n[\s\S]*?\n---\n?` reads it. `fence` is a STOP: the parse ends
 *          where the block does and never reads the deck's body.
 *   line   one line of the YAML body, its terminator removed:
 *            indent   `[ \t]*`
 *            name     `[\w$][\w$.-]*`, with each `$` or `.`, or a first character that is not a letter, marked `wide`
 *                     (a block-scalar header's name is `[A-Za-z][\w-]*`)
 *            gap      `[ \t]+` before the colon (a header has none)
 *            colon    `:` (a line with no colon after its name is no key)
 *            lead     `[ \t]+` after the colon
 *            ind      `|` or `>`, then an optional `[1-9][+-]?` or `[+-][1-9]?`
 *            comment  ` #…` after the indicator and at least one blank
 *            junk     anything else after an indicator (`| x`, `|#`, `|2x`), which makes the line a plain value, and a
 *                     comment holding U+2028 or U+2029, which `.` in the header pattern never matched
 *          A line is a block-scalar header when it has a colon, an indicator after a lead, and no wide, gap or junk:
 *          the hand-written `BLOCK_SCALAR_HEAD` and `KEY_HEAD` the island read lines by, character for character, which
 *          test/unit/core/front-matter-grammar.test.js holds to those expressions.
 *
 * Pass the Segno API in (`makeFrontMatterGrammar(S)`), as the other lib grammars do. Pure data, no fs, no DOM.
 */

const BLANK = ' \t';
const LETTER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGIT = '0123456789';
// What `.` in a JavaScript regex does not match, past the line ends the driver already split on.
const LINE_SEP = '\u2028\u2029';
// One word for every expectation: a front-matter line always parses (its last branch takes any text), so no error
// message is ever shown, and one string costs the generated parser less than eleven.
const LABEL = 'front matter';

function makeFrontMatterGrammar(S) {
  const { alt, any, chars, greedy, many, many1, node, noneOf, opt, ref, seq, until } = S;

  const blank = chars(BLANK, LABEL);
  // The rest of a line, read once as a rule of its own: every branch that ends in it calls it, not a copy of the loop.
  const anyRest = ref('rest');
  // A run of blanks, the same way: a rule, so each place a run is read calls it.
  const blanks = ref('blanks');
  const blanks1 = ref('blanks1');

  // The fence: the engine's block, ended where it ends.
  const fence = node('fence', seq('---\n', node('yaml', until('\n---')), opt('\n')));

  // A key's name. `wide` marks what a key may hold and a block-scalar header's name may not.
  const nameStart = alt(chars(LETTER, LABEL), node('wide', chars(`${DIGIT}_$`, LABEL)));
  const nameRest = greedy(many(alt(chars(`${LETTER}${DIGIT}_-`, LABEL), node('wide', chars('$.', LABEL)))));
  const name = node('name', seq(nameStart, nameRest));

  // After an indicator: blanks then an optional comment, or anything else (junk).
  // A comment runs to the line's end; a U+2028 or U+2029 in it is junk beside it (every node here is top-level, so the
  // driver reads one flat list).
  const comment = seq(node('comment', seq('#', many(noneOf(LINE_SEP, LABEL)))), opt(node('junk', seq(chars(LINE_SEP, LABEL), anyRest))));
  const afterBlanks = opt(alt(comment, node('junk', seq(noneOf(`#${BLANK}`, LABEL), anyRest))));
  const tail = opt(alt(seq(blanks1, afterBlanks), node('junk', seq(noneOf(BLANK, LABEL), anyRest))));
  const indicator = node('ind', seq(chars('|>', LABEL), greedy(opt(alt(seq(chars('123456789', LABEL), greedy(opt(chars('+-', LABEL)))), seq(chars('+-', LABEL), greedy(opt(chars('123456789', LABEL)))))))));
  const value = seq(opt(node('lead', blanks1)), opt(alt(seq(indicator, tail), seq(noneOf(`|>${BLANK}`, LABEL), anyRest))));

  const key = seq(name, opt(node('gap', blanks1)), opt(alt(seq(node('colon', ':'), value), seq(noneOf(`:${BLANK}`, LABEL), anyRest))));
  const line = seq(node('indent', blanks), opt(alt(key, seq(noneOf(`${LETTER}${DIGIT}_$${BLANK}`, LABEL), anyRest))));

  // The line rule alone: the fence is its own parser (below), so the key reader does not carry it.
  const frontMatterSpec = {
    start: 'line',
    rules: { line, rest: many(any()), blanks: many(blank), blanks1: many1(blank) },
  };
  // The fence alone, for the pages that ship only the block's end (the docs home page: the splitter, the boundary
  // parser, the deck model). Generated into its own file, so those pages do not carry the line grammar's tables.
  const frontMatterFenceSpec = {
    start: 'fence',
    stops: ['fence'],
    rules: { fence },
  };
  return { frontMatterSpec, frontMatterFenceSpec };
}

module.exports = { makeFrontMatterGrammar, BLANK, LINE_SEP };
