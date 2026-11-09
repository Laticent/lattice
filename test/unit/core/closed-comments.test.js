/**
 * Unclosed `<!--` on untrusted input — the comment readers stay linear AND give the
 * answers of the regexes they replaced.
 *
 * `/<!--[\s\S]*?-->/` (alone or as an alternation arm) and markdown-it's `html_inline`
 * comment arm rescan to the end of the text from every opener that never closes. Before
 * lib/core/closed-comments.js and markdown-it 14.3.3, on one machine: one 250 KB line of
 * `<!--` took 148 s to render and 89 s to lint; 280 KB of `a <!--` lines 17 s to render. Each
 * fuzz arm below compares against the regex it replaced, so a faster wrong answer fails here
 * rather than in a deck.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { commentCloser, replaceClosedComments, closedComments } = require(path.join(ROOT, 'lib/core/closed-comments'));
const { scanWork } = require(path.join(ROOT, 'test/helpers/work-count'));
const { assertLinearRegexes } = require(path.join(ROOT, 'test/helpers/regex-trace'));

// A small alphabet dense in the characters that decide a comment, so short strings hit
// the edges: `<!-->`, `<!--->`, `--!>`, overlapping dashes, openers with no closer.
const PIECES = ['<!--', '-->', '--!>', '<', '!', '-', '>', 'a', '\n', ' ', '<!-->', '<!--->', '<b>', '`'];
function* corpus(count, maxLen, seed = 11) {
  let s0 = seed;
  const rnd = (n) => { s0 = (s0 * 1103515245 + 12345) % 2147483648; return s0 % n; };
  for (let k = 0; k < count; k++) {
    let s = '';
    const len = rnd(maxLen);
    for (let i = 0; i < len; i++) s += PIECES[rnd(PIECES.length)];
    yield s;
  }
}

describe('closed-comments — the regex answers, in one pass', () => {
  test('replaceClosedComments is `.replace(/<!--[\\s\\S]*?-->/g, fn)`', () => {
    const fn = (c) => `[${c.length}]`;
    for (const s of corpus(40000, 14)) {
      assert.equal(replaceClosedComments(s, fn), s.replace(/<!--[\s\S]*?-->/g, fn), JSON.stringify(s));
    }
  });

  test('closedComments is `.matchAll(/<!--[\\s\\S]*?-->/g)`', () => {
    for (const s of corpus(40000, 14, 5)) {
      const want = [...s.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m[0], m.index]);
      assert.deepEqual([...closedComments(s)].map((m) => [m[0], m.index]), want, JSON.stringify(s));
    }
  });

  test('commentCloser ends a comment where the regex arm would, and says -1 when it never closes', () => {
    for (const s of corpus(20000, 14, 7)) {
      const endOf = commentCloser(s);
      for (let i = s.indexOf('<!--'); i >= 0; i = s.indexOf('<!--', i + 1)) {
        const re = /<!--[\s\S]*?-->/y;
        re.lastIndex = i;
        const m = re.exec(s);
        assert.equal(endOf(i), m ? i + m[0].length : -1, JSON.stringify(s));
      }
    }
  });
});

// The html_inline guard (lib/core/html-inline-guard.mjs) retired on 2026-11-06: markdown-it 14.3.3
// scans an inline comment with one `indexOf` and stops looking after the first unclosed one
// (GHSA-vfgh-jcmw-g37q), so upstream is linear on the shapes below and the guard, which mimicked
// 14.1's comment regex, had started to disagree with it. The linear-time arms below stay: they are
// what would catch a markdown-it that regressed.

describe('unclosed comments stay linear through the whole render (HARD RULE #22)', () => {
  const latticeEngine = require(path.join(ROOT, 'lib/engine'));
  const engine = latticeEngine.createEngine();

  test('each shape renders in work linear in its length', () => {
    // Before, on one machine: ~17 s, ~148 s, ~8 s and ~17 s. Counted, not timed (HARD RULE #32): each search the
    // render makes covers some characters, and a rescan from every opener to the end of the text makes that total
    // grow with the square. Today each render covers 70 to 116 times its length (the engine reads the source in many
    // linear passes); without the html_inline guard the first and fourth shapes cover over 2,000 times theirs at
    // a tenth of this size, and a closer search that restarts at every opener does the same to the second.
    const inputs = [
      'a <!--\n'.repeat(40000),              // 280 KB of `a <!--` lines — markdown-it html_inline
      `${'<!--'.repeat(62500)}\n`,           // one 250 KB line — scanTags, masthead, panes
      `${'<!-- '.repeat(50000)}\n-->\n`,     // openers, one closer at the end
      `${'a <!--\n'.repeat(40000)}---->`,      // a `-->` the comment arm cannot close on
    ];
    for (const src of inputs) {
      const { scanned } = scanWork(() => engine.render(src));
      assert.ok(scanned <= 200 * src.length, `${JSON.stringify(src.slice(0, 8))}…: ${scanned} chars scanned for ${src.length}`);
    }
  });
});

describe('a layout skeleton full of unclosed comments stays linear (HARD RULE #22)', () => {
  const { findSkeletonHtml } = require(path.join(ROOT, 'lib/layout/gate.js'));

  test('findSkeletonHtml reads a skeleton of unclosed comments, fences and autolinks with linear regexes only', () => {
    // A skeleton is model output. The old `/<!--[\s\S]*?-->/g` tried every opener to the end of the text inside one
    // match (1.7 s at 280 KB), and so did the fence, autolink and tag patterns beside it. No count sees work inside one
    // regex match, so this asks the census instead of a clock (HARD RULE #32): every regex the scan runs must be one
    // recheck calls linear (test/helpers/regex-trace.js).
    const hostile = ['a <!--\n', '```\n', '~~~ x\n', '<a://<b://', '<x@', '<tag'].join('').repeat(200);
    const { result } = assertLinearRegexes(() => findSkeletonHtml(hostile));
    assert.ok(result.length > 0, 'the glued `<tag` lines are still reported');
    assert.deepEqual(assertLinearRegexes(() => findSkeletonHtml('a <!--\n'.repeat(2000))).result, []);
  });
});

describe('the skeleton readers answer as the regexes they replaced (seeded differential fuzz, seed 3045)', () => {
  const { replaceFencedBlocks, replaceAutolinks, skeletonTags } = require(path.join(ROOT, 'lib/layout/gate.js'));
  const { mulberry32 } = require(path.join(ROOT, 'test/helpers/regex-differential'));
  // The old patterns (tests are outside the census, which reads lib/** only).
  const OLD_FENCE = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm;
  const OLD_AUTOLINK = /<[a-z][a-z0-9+.-]*:\/\/[^>\s]*>|<[^\s@<>]+@[^\s@<>]+>/gi;
  const OLD_TAG = /<\/?[a-zA-Z][\w-]*(?=[\s/>]|$)/g;
  const FENCE_PIECES = ['```', '```', '~~~', '````', '`', '~', ' ', '\t', '\n', '\n', '\r', '\u2028', 'a', 'js'];
  const LINK_PIECES = ['<', '<', '>', '>', 'http', 'A', 'z9', '+', '.', '-', '://', ':', '/', '@', ' ', '\n', '\t'];
  const TAG_PIECES = ['<', '</', '<', 'a', 'B', '1', '-', '_', ' ', '/', '>', '\n', '!', '.'];
  const draw = (rand, pieces) => {
    let s = '';
    const len = Math.floor(rand() * 15);
    for (let j = 0; j < len; j++) s += pieces[Math.floor(rand() * pieces.length)];
    return s;
  };
  const tag = (m) => `[${m}]`;

  test('fences, autolinks and tags: 20,000 draws each, no input where old and new disagree', () => {
    const rand = mulberry32(3045);
    for (let i = 0; i < 20000; i++) {
      const f = draw(rand, FENCE_PIECES);
      assert.equal(replaceFencedBlocks(f, tag), f.replace(OLD_FENCE, tag), `fence ${JSON.stringify(f)}`);
      const l = draw(rand, LINK_PIECES);
      assert.equal(replaceAutolinks(l, tag), l.replace(OLD_AUTOLINK, tag), `autolink ${JSON.stringify(l)}`);
      const t = draw(rand, TAG_PIECES);
      assert.deepEqual([...skeletonTags(t)].map((m) => [m.index, m[0]]), [...t.matchAll(OLD_TAG)].map((m) => [m.index, m[0]]), `tag ${JSON.stringify(t)}`);
    }
  });

  test('mutation arm: the guard above fails a scan that still runs any of the old patterns', () => {
    assert.throws(() => assertLinearRegexes(() => 'x'.replace(OLD_FENCE, '')), /polynomial|unknown|does not hold/);
    assert.throws(() => assertLinearRegexes(() => 'x'.replace(OLD_AUTOLINK, '')), /polynomial|unknown|does not hold/);
    assert.throws(() => assertLinearRegexes(() => 'x'.match(OLD_TAG)), /polynomial|unknown|does not hold/);
  });
});

describe('the boundary parser stays linear on unclosed comments (HARD RULE #22)', () => {
  const { splitSourceToSections } = require(path.join(ROOT, 'lib/core/section-source-split.js'));

  test('splitSourceToSections — a full md.parse on the CLI export path — stays linear', () => {
    // This was a full `md.parse`: on markdown-it 14.1.1 with no guard, 273 KB of `a <!--` lines took 32.8 s. It
    // now runs the deck model's own block pass (lib/core/deck-model.mjs), where `a <!--` never opens an HTML block,
    // so no mutant of today's path reaches this input and the test is a sentinel: it reads 10 characters per
    // character at 10,000 and at 40,000 lines. Counted, not timed (HARD RULE #32).
    const src = 'a <!--\n'.repeat(40000);
    const { scanned } = scanWork(() => splitSourceToSections(src));
    assert.ok(scanned <= 30 * src.length, `${scanned} chars scanned for ${src.length}`);
  });
});
