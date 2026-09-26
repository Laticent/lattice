/**
 * Unclosed `<!--` on untrusted input — the comment readers stay linear AND give the
 * answers of the regexes they replaced.
 *
 * `/<!--[\s\S]*?-->/` (alone or as an alternation arm) and markdown-it's `html_inline`
 * comment arm rescan to the end of the text from every opener that never closes. Before
 * lib/core/closed-comments.js and lib/core/html-inline-guard.mjs, on one machine: one
 * 250 KB line of `<!--` took 148 s to render and 89 s to lint; 280 KB of `a <!--` lines
 * 17 s to render. Each fuzz arm below compares against the regex or the unguarded parser,
 * so a faster wrong answer fails here rather than in a deck.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const { commentCloser, replaceClosedComments, closedComments } = require(path.join(ROOT, 'lib/core/closed-comments'));
const { guardHtmlInline } = require(path.join(ROOT, 'lib/core/html-inline-guard.mjs'));

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

describe('html-inline-guard — markdown-it gives the same tokens, without the rescan', () => {
  const plain = new MarkdownIt('commonmark', { html: true, breaks: true });
  const guarded = new MarkdownIt('commonmark', { html: true, breaks: true });
  guardHtmlInline(guarded);

  test('rendered HTML is identical to the unguarded parser across a fuzz corpus', () => {
    for (const s of corpus(20000, 16, 13)) {
      assert.equal(guarded.render(s), plain.render(s), JSON.stringify(s));
    }
  });

  test('a link label (the rule\'s silent mode) is unaffected', () => {
    const src = '[a <!-- b](x) and [c <!-- d -->](y) <!-- tail';
    assert.equal(guarded.render(src), plain.render(src));
  });
});

describe('unclosed comments stay linear through the whole render (HARD RULE #22)', () => {
  const latticeEngine = require(path.join(ROOT, 'lib/engine'));
  const engine = latticeEngine.createEngine();

  test('each shape renders well under the quadratic cost', () => {
    // Before, on one machine: ~17 s, ~148 s and ~8 s. After: ~0.3 s together. The bound
    // sits between the two with room either side for a slow runner.
    const inputs = [
      'a <!--\n'.repeat(40000),              // 280 KB of `a <!--` lines — markdown-it html_inline
      `${'<!--'.repeat(62500)}\n`,           // one 250 KB line — scanTags, masthead, panes
      `${'<!-- '.repeat(50000)}\n-->\n`,     // openers, one closer at the end
    ];
    const t = Date.now();
    for (const src of inputs) engine.render(src);
    assert.ok(Date.now() - t < 4000, `took ${Date.now() - t}ms`);
  });
});
