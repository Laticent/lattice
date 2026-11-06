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

  test('findSkeletonHtml reads 4.2 MB of `a <!--` lines without hanging', () => {
    // A skeleton is model output. The old `/<!--[\s\S]*?-->/g` tried every opener to the end of the text inside one
    // match, so its cost grows with the square: 1.7 s at 280 KB. No count sees work inside one regex match, so this is a
    // hang guard (F4 in engineering/decisions/2026-11-06-flaky-tests.md), sized so the old regex overruns it 14 times.
    const t = performance.now();
    assert.deepEqual(findSkeletonHtml('a <!--\n'.repeat(600000)), []);
    const ms = performance.now() - t;
    assert.ok(ms < 40000, `${ms.toFixed(0)} ms`); // flaky-ok: hang guard — linear 37 ms, the old shape ~580 s at this size
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
