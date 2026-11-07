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

  test('each shape renders well under the quadratic cost', () => {
    // Before, on one machine: ~17 s, ~148 s, ~8 s and ~17 s. After: ~0.4 s together. The bound
    // sits between the two with room either side for a slow runner.
    const inputs = [
      'a <!--\n'.repeat(40000),              // 280 KB of `a <!--` lines — markdown-it html_inline
      `${'<!--'.repeat(62500)}\n`,           // one 250 KB line — scanTags, masthead, panes
      `${'<!-- '.repeat(50000)}\n-->\n`,     // openers, one closer at the end
      `${'a <!--\n'.repeat(40000)}---->`,      // a `-->` the comment arm cannot close on
    ];
    const t = Date.now();
    for (const src of inputs) engine.render(src);
    assert.ok(Date.now() - t < 4000, `took ${Date.now() - t}ms`);
  });
});

describe('a layout skeleton full of unclosed comments stays linear (HARD RULE #22)', () => {
  const { findSkeletonHtml } = require(path.join(ROOT, 'lib/layout/gate.js'));

  test('findSkeletonHtml reads 280 KB of `a <!--` lines fast', () => {
    // A skeleton is model output. Before, on one machine: 1.7 s; after: ~2 ms.
    const t = Date.now();
    findSkeletonHtml('a <!--\n'.repeat(40000));
    assert.ok(Date.now() - t < 500, `took ${Date.now() - t}ms`);
  });
});

describe('the boundary parser stays linear on unclosed comments (HARD RULE #22)', () => {
  const { splitSourceToSections } = require(path.join(ROOT, 'lib/core/section-source-split.js'));

  test('splitSourceToSections — a full md.parse on the CLI export path — stays linear', () => {
    // Three boundaryParser callers run the full `md.parse`. On markdown-it 14.1.1 with no guard,
    // 273 KB of `a <!--` lines took 32.8 s here; with the guard, or on 14.3.3, well under a second.
    const t = Date.now();
    splitSourceToSections('a <!--\n'.repeat(40000));
    assert.ok(Date.now() - t < 5000, `took ${Date.now() - t}ms`);
  });
});
