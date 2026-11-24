/**
 * `cssRefSpans` reads CSS through a generated Segno parser (lib/core/css-ref-grammar.js). The
 * hand-written tokenizer it replaced is frozen in tools/segno-legacy/css-ref-spans.js, and the two
 * must return the same spans, field for field, on every input: a span the new reader drops is a
 * fetch the sanitizer no longer sees (HARD RULE #22).
 *
 * Three inputs: the hand-picked spellings the old tokenizer's comments name, every CSS file and
 * `<style>` body in the repo's decks and themes, and a seeded fuzz built from the token pieces CSS
 * is made of, mutated at random. The fuzz is the arm that can fail: `MUTANT` below feeds the
 * comparison a reader that ignores `url(` spelled with an escape, and the test proves it is caught.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCssRefSpans } = require('../../../lib/core/css-ref-reader.js');
const helpers = require('../../../lib/core/remote-ref.js');
const cssRefSpans = makeCssRefSpans(require('../../../lib/core/css-ref.generated.js'), helpers);
const legacy = require('../../../tools/segno-legacy/css-ref-spans.js');

const same = (css) => {
  const want = JSON.stringify(legacy.cssRefSpans(css));
  const got = JSON.stringify(cssRefSpans(css));
  return want === got ? null : `${JSON.stringify(css.length > 200 ? `${css.slice(0, 200)}…` : css)}\n  old ${want.slice(0, 300)}\n  new ${got.slice(0, 300)}`;
};

describe('the grammar-driven reader returns the old tokenizer\'s spans', () => {
  const PICKED = [
    'a{background:url(https://x.test/a.png)}',
    'a{background:URL( "https://x.test/a.png" )}',
    "a{background:url('https://x.test/a.png'",
    'a{background:u\\72l(https://x.test/a.png)}',
    'a{background:\\55 RL(https://x.test/a.png)}',
    'a{background:\\000075rl(https://x.test/a.png)}',
    'a{background:\\u\\r\\l(https://x.test/a.png)}',
    'a{background:\\75 \\72 \\6c (https://x.test/a.png)}',
    'a{background:\\00075 rl(https://x.test/a.png)}',
    'a{background:\\0075a rl(https://x.test/a.png)}',
    'a{background:\\000075a(https://x.test/a.png)}',
    'a{background:ur\\6c  (https://x.test/a.png)}',
    'a{background:url(a"b)c"d{}e;url(https://x.test/z)}',
    'a{background:url(a/*b)c*/;url(https://x.test/z)}',
    'a{background:url(\\)https://x.test/z)}',
    'a{background:xurl(https://x.test/a.png)}',
    'a{background:1url(https://x.test/a.png)}',
    'a{background:-url(https://x.test/a.png)}',
    'a{background:url()}',
    'a{background:url(',
    'a{background:url(   ',
    'a{background:url("x"',
    'a{background:url("x"   y)}',
    'a{background:url("x"\n)}',
    '@font-face{src:url(https://x.test/f.woff)}',
    '@font-face{src:url("https://x.test/f.woff")}p{background:url(https://x.test/p.png)}',
    ':is(@font-face,p){background:url(https://x.test/a.png)}',
    '@font-face p{src:url(https://x.test/f.woff)}',
    '@/**/font-face{src:url(https://x.test/f.woff)}',
    '@font-face/**/{src:url(https://x.test/f.woff)}',
    '@\\66ont-face{src:url(https://x.test/f.woff)}',
    'a[href="https://x.test/sel"]{background:url(https://x.test/a.png)}',
    'a[b="x"]{} @font-face{src:url(https://x.test/f.woff)}',
    '"https://x.test/s" \'https://x.test/t\'',
    '"unterminated\nurl(https://x.test/a.png)',
    '"x\fy"url(https://x.test/a.png)',
    '"a\\\nb"url(https://x.test/a.png)',
    '"a\\22 b"url(https://x.test/a.png)',
    '/* url(https://x.test/c.png) */ a{}',
    '/* unterminated url(https://x.test/c.png)',
    '/*/ url(https://x.test/c.png) */',
    'a{b:c(d{e:url(https://x.test/a.png)}f)}',
    'a{b:c)}url(https://x.test/a.png)',
    'a{b:\\',
    '\\',
    '@',
    '@@font-face{}',
    'é url(https://x.test/a.png) éurl(https://x.test/a.png)',
    'a{background:url(https://x.test/a.png);;url(https://x.test/b.png)}',
    '',
  ];
  test('the picked spellings', () => {
    const bad = PICKED.map(same).filter(Boolean);
    assert.deepEqual(bad.slice(0, 3), []);
  });

  test('every CSS body in the repo\'s themes and decks', () => {
    const root = path.resolve(__dirname, '../../..');
    const files = [];
    const walk = (dir, depth) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth < 6) walk(p, depth + 1);
        } else if (/\.(css|md)$/.test(e.name) && fs.statSync(p).size < 2_000_000) files.push(p);
      }
    };
    for (const d of ['lib', 'themes', 'examples', 'test/integration/baseline-decks']) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d), 0);
    assert.ok(files.length > 100, `found ${files.length} files`);
    const bad = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      const bodies = f.endsWith('.css') ? [text] : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).concat([text]);
      for (const css of bodies) {
        const d = same(css);
        if (d) bad.push(`${path.relative(root, f)}: ${d}`);
      }
    }
    assert.deepEqual(bad.slice(0, 3), []);
  });

  // Seeded, so a failure reproduces.
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const PIECES = ['url(', 'URL(', 'u\\72l(', '\\55 RL(', '\\000075rl(', '\\u\\r\\l(', '\\75 \\72 \\6c (', 'ur\\6c  (', 'xurl(', '-url(', '1url(', 'url (', 'rl(', '"', "'", ')', '(', '[', ']', '{', '}', ';', ':', ',', '/*', '*/', '/', '*', '@font-face', '@font-face ', '@FONT-FACE', '@media', '@', '\\', '\\ ', '\\\n', '\r\n', '\r', '\f', '\n', ' ', '\t', 'https://x.test/a.png', '//x.test/b', 'a', 'p', 'a-b', '0', '75', '72', '6c', 'é', '\u{1F600}', '\\22 ', '\\27', '\\29 ', '\\0', 'src:', 'background:', 'a[href=', 'is(', '!important'];
  const gen = (r) => {
    let out = '';
    const n = 1 + Math.floor(r() * 24);
    for (let k = 0; k < n; k++) out += PIECES[Math.floor(r() * PIECES.length)];
    return out;
  };
  test('a seeded fuzz of 60,000 token soups', () => {
    const r = rng(2026);
    const bad = [];
    for (let k = 0; k < 60_000 && bad.length < 3; k++) {
      const d = same(gen(r));
      if (d) bad.push(d);
    }
    assert.deepEqual(bad, []);
  });

  test('the fuzz can fail: a parser whose url( window is too short is caught', () => {
    // The real generated parser with the attempt window cut from 32 characters to 5, so the long
    // escaped spellings of `url` stop being recognized. The same reader, the same comparison.
    const source = fs.readFileSync(path.resolve(__dirname, '../../../lib/core/css-ref.generated.js'), 'utf8');
    assert.ok(source.includes('i0 + 32'), 'the attempt window moved; update this mutant');
    const mod = { exports: {} };
    new Function('module', 'exports', source.replace('i0 + 32', 'i0 + 5'))(mod, mod.exports);
    const broken = makeCssRefSpans(mod.exports, helpers);
    const r = rng(2026);
    let caught = 0;
    for (let k = 0; k < 20_000; k++) {
      const css = gen(r);
      if (JSON.stringify(broken(css)) !== JSON.stringify(legacy.cssRefSpans(css))) caught++;
    }
    assert.ok(caught > 0, 'the broken parser agreed with the oracle on every soup');
  });

  test('a parser that lacks a kind the reader needs is refused at once', () => {
    const { NEEDED } = require('../../../lib/core/css-ref-reader.js');
    const real = require('../../../lib/core/css-ref.generated.js');
    for (const k of NEEDED) {
      const renamed = { parse: (...a) => { const r = real.parse(...a); return r.ok ? { ...r, tree: { ...r.tree, kinds: r.tree.kinds.map((x) => (x === k ? `${k}2` : x)) } } : r; } };
      assert.throws(() => makeCssRefSpans(renamed, helpers), new RegExp(`"${k}"`));
    }
  });
});
