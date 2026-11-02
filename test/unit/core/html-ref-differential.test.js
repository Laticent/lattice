/**
 * Segno R3 reads markup through a generated Segno parser (lib/core/html-ref-grammar.js) and a reader
 * over its tape (lib/core/html-ref-reader.js), built to replace remote-ref.js's hand-written `scanHtml`.
 * Two promises are held here:
 *   1. R3 equals the LIVE scanner: the same tags, field for field, and an `unsure` span exactly where the
 *      live scanner says `risky`. No exceptions, so a rule added to one and not the other fails here. A tag
 *      R3 drops is a fetch the sanitizer would stop seeing on the switch (HARD RULE #22).
 *   2. The live scanner equals the frozen one (tools/segno-legacy/scan-html.js, e6c3a4a) on tags, and its
 *      `risky` only ever adds to the frozen one's: the rules R3's work added (a CDATA section and the
 *      integration points in foreign content) ask the spec parser more often, never less.
 *
 * Inputs: hand-picked markup for each state the readers depend on, every deck and fixture in the repo,
 * seeded token soups, and seeded foreign-content structures (an `<svg>`/`<math>`, an integration point,
 * raw-text names, CDATA, comments, end tags in the wrong place). The arms that must fail: a parser
 * generated from a grammar whose comment ends at `--!`, and a reader with its foreign-content stack cut out.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeScanHtml, NEEDED } = require('../../../lib/core/html-ref-reader.js');
const real = require('../../../lib/core/html-ref.generated.js');
const scanHtml = makeScanHtml(real);
const live = require('../../../lib/core/remote-ref.js');
const legacy = require('../../../tools/segno-legacy/scan-html.js');

const show = (html) => JSON.stringify(html.length > 200 ? `${html.slice(0, 200)}…` : html);
/** R3 (`scan`) against the live scanner, with nothing left out. */
const differs = (scan, html) => {
  const o = live.scanHtml(html);
  const r = scan(html);
  const want = JSON.stringify([o.tags, o.risky]);
  const got = JSON.stringify([r.tags, r.unsure.length > 0]);
  return want === got ? null : `${show(html)}\n  live ${want.slice(0, 300)}\n  R3   ${got.slice(0, 300)}`;
};
const same = (html) => differs(scanHtml, html);
/**
 * The live scanner against the frozen one: `risky` never dropped, and the same tags, except that where the
 * frozen scanner gave up at an unterminated CDATA section the live one reads on (and is risky): then the
 * frozen tags are where the live ones start.
 */
const regresses = (html) => {
  const o = legacy.scanHtml(html);
  const l = live.scanHtml(html);
  if (o.risky && !l.risky) return `${show(html)}: risky dropped`;
  const a = JSON.stringify(o.tags);
  if (a === JSON.stringify(l.tags)) return null;
  return l.risky && a.slice(0, -1) === JSON.stringify(l.tags.slice(0, o.tags.length)).slice(0, -1) ? null : `${show(html)}: tags differ`;
};

const { rng, gen, genForeign } = require('../../fixtures/html-ref-soups.js');

describe('the R3 reader returns the live scanner\'s tags, and the live scanner keeps the frozen one\'s', () => {
  const PICKED = [
    '', '<', '<<', '</', '</>', '<!', '<?', '<a', '<a ', '<a b', '<a b=', '<a b="', "<a b='x", '<a b=c', '<a b=c>', '<a/', '<a/>',
    '<p a=1><svg><style>x</style></svg>', '<img src="x" alt=\'y\' / >', '<a b c=d e = "f"/>', '<a b / = c>', '<a ==x>', '<a "b"=c \'d\'>', '<a b="x"c=d>', '<a b=x/>', '<svg a=/>', '<svg / >',
    '<!-- x --><img src=a>', '<!--><img>', '<!---><img>', '<!----><img>', '<!-- -- --><img>', '<!-- --!--><img>', '<!-- --!-><img>', '<!-- ---!><img>', '<!--<!--><img>', '<!--<!---><img>',
    '<!-- unterminated <img src=b>', '<!--', '<!---', '<!-- --', '<!-- --!',
    '<style>a</style ><img>', '<style>a</styles><img></style><b>', '<style>a</STYLE/x><i>', '<style>a', '<style>a</style', '<STYLE>x</STYLE><b>', '<style', '<style ', '<style/>x</style><b>', '<stylé>', '<styles><img>',
    '<script><!-- x</script><img>', '<script>x</script><img>', '<textarea x="</textarea>">a</textarea><i>', '<title><img></title><b>', '<xmp><img></xmp>', '<iframe><img></iframe>', '<noembed><img></noembed>', '<noframes><img></noframes>',
    '<noscript><img src=n></noscript>', '<select><img></select>', '<plaintext><img>', '<PLAINTEXT><img>', '<plaintextx><img>',
    '<svg><![CDATA[<img src=z>]]><image href=q /></svg>', '<svg><![CDATA[<img', '<![CDATA[x>]]><img>', '<![CDATA[', '<svg><![cdata[x>]]><img>',
    '</ x><img>', '</><img>', '</1><img>', '</ ', '<!doctype html><img src=k>', '<!DOCTYPE html PUBLIC "a>b"><img>', '<?x><img>', '<?', '<!x', '<!>', '<!->',
    '<math><svg>', '<math><mi><img></mi></math>', '<svg/><img>', '<svg><svg></svg><img></svg><b>', '<svg><p></p></svg>', '<svg></p><img>', '<svg></br>', '<svg><foreignObject><img></foreignObject></svg>', '<svg><template><img></template></svg>', '<math><annotation-xml><img>',
    '<svg><style><!--</style><img src=s>', '<svg><style>a</style><img>', '<svg><script>x</script></svg><img>', '<svg><title>x</title></svg>',
    '<svg><desc><x></svg></x></desc><style><img src=https://evil.example/x.png></style>', '<math><mi><x></math></x></mi><style><img src=m></style>', '<svg><desc></svg><style><img src=d></style>',
    '<svg><desc><title><!--</title><img src=a>--></desc></svg>', '<math><mtext><title><![CDATA[</title><img src=t>]]></mtext></math>', '<svg><foreignObject><p></foreignObject></svg><img>',
    '<div><math><mi><![CDATA[><img src="y.png"></mi></math></div>', '<svg><desc><![CDATA[><img src=z>', '<math><mi><![CDATA[<picture><source srcset=x>]]></mi></math>',
    '<svg><title><![CDATA[x]]></title><image href="i.png"/></svg>', '<svg><style><![CDATA[x]]></style><image href=s /></svg>', '<svg><xmp><![CDATA[x]]></xmp><image href=x /></svg>', '<svg><textarea><!-- x --></textarea><image href=c /></svg>',
    '<svg><title>Chart</title><desc>A chart</desc><path d=M0/></svg><img src=ok>', '<svg><title/><desc/><img></svg>', '<svg><desc></desc><g><img></g></svg>',
    '<a\tb\nc\rd\fe>', '<a b\r=\rc>', '<img src=a\u0000b>', '<Kmp><img>', '<aK=1>',
  ];
  test('the picked markup', () => {
    assert.deepEqual(PICKED.map(same).filter(Boolean).slice(0, 3), []);
    assert.deepEqual(PICKED.map(regresses).filter(Boolean).slice(0, 3), []);
  });

  test('every deck, gallery and fixture in the repo', () => {
    const root = path.resolve(__dirname, '../../..');
    const files = [];
    const walk = (dir, depth) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth < 6) walk(p, depth + 1);
        } else if (/\.(md|html|svg)$/.test(e.name) && fs.statSync(p).size < 2_000_000) files.push(p);
      }
    };
    for (const d of ['lib', 'themes', 'examples', 'test/integration/baseline-decks', 'test/fixtures']) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d), 0);
    assert.ok(files.length > 300, `found ${files.length} files`);
    const bad = [];
    for (const f of files) {
      const html = fs.readFileSync(f, 'utf8');
      const d = same(html) || regresses(html);
      if (d) bad.push(`${path.relative(root, f)}: ${d}`);
    }
    assert.deepEqual(bad.slice(0, 3), []);
  });

  test('a seeded fuzz of 60,000 token soups and 30,000 foreign-content structures', () => {
    const r = rng(2027);
    const bad = [];
    for (let k = 0; k < 90_000 && bad.length < 3; k++) {
      const html = k < 60_000 ? gen(r) : genForeign(r);
      const d = same(html) || regresses(html);
      if (d) bad.push(d);
    }
    assert.deepEqual(bad, []);
  });

  test('the fuzz can fail: a parser whose comment ends at `--!` is caught', () => {
    const grammar = require('../../../lib/core/html-ref-grammar.js');
    // Generated from a mutated grammar, not patched into the committed code, so the mutant cannot go stale.
    const S = loadSegno();
    const reader = makeScanHtml(generatedFrom(S, mutatedSpec(S, grammar)));
    const r = rng(2027);
    let caught = 0;
    for (let k = 0; k < 20_000; k++) if (differs(reader, gen(r))) caught++;
    assert.ok(caught > 100, `the broken parser was caught on only ${caught} of 20,000 soups`);
  });

  test('the fuzz can fail: a reader with its foreign-content stack cut out is caught', () => {
    // The reader's own source with every push onto the foreign stack removed, so it never enters foreign content.
    const file = path.resolve(__dirname, '../../../lib/core/html-ref-reader.js');
    const source = fs.readFileSync(file, 'utf8');
    const cut = source.replace(/foreign\.push\(\{ name: t\.name, points: \[\] \}\)/g, 'undefined');
    assert.equal((source.match(/foreign\.push\(/g) || []).length, 2, 'the reader pushes onto its foreign stack in a new place; update this mutant');
    assert.notEqual(cut, source);
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', cut)(mod, mod.exports, require);
    const reader = mod.exports.makeScanHtml(real);
    const r = rng(2027);
    let caught = 0;
    for (let k = 0; k < 2_000; k++) if (differs(reader, genForeign(r))) caught++;
    assert.ok(caught > 500, `the stackless reader was caught on only ${caught} of 2,000 structures`);
  });

  test('a parser that lacks a kind the reader needs is refused at once', () => {
    for (const k of NEEDED) {
      const renamed = { parse: (...a) => { const r = real.parse(...a); return r.ok ? { ...r, tree: { ...r.tree, kinds: r.tree.kinds.map((x) => (x === k ? `${k}2` : x)) } } : r; } };
      assert.throws(() => makeScanHtml(renamed), new RegExp(`"${k}"`));
    }
  });

  test('unsure spans name their reason and cover the markup that raised them', () => {
    const cases = [
      ['<!-- x <img src=a>', 'comment-unterminated', 0],
      ['<svg><foreignObject>', 'foreign-content', 5],
      ['<svg></p>', 'foreign-breakout', 5],
      ['<select>', 'select', 0],
      ['<noscript>', 'noscript', 0],
      ['<script><!-- x</script>', 'escaped-script', 8],
      ['<math><mi><![CDATA[<picture><source srcset=x>]]></mi></math>', 'foreign-cdata', 10],
      ['<svg><desc><![CDATA[>', 'foreign-cdata', 11],
      ['<svg><desc></svg>', 'integration-point', 11],
    ];
    for (const [html, why, from] of cases) {
      const { unsure } = scanHtml(html);
      assert.equal(unsure.length, 1, `${html} ${JSON.stringify(unsure)}`);
      assert.equal(unsure[0].why, why, html);
      assert.equal(unsure[0].from, from, html);
      assert.ok(unsure[0].to > unsure[0].from, html);
    }
    assert.deepEqual(scanHtml('<p><img src=a><svg><path d=M0/></svg>').unsure, []);
    // Lattice's own chart SVG: a title and a description beside the drawing, nothing inside them.
    assert.deepEqual(scanHtml('<svg role=img><title id=t>Chart</title><desc id=d>Sales</desc><g><path d=M0/></g></svg><img src=a>').unsure, []);
    // A CDATA section whose only `>` is its own `]]>` reads the same either way.
    assert.deepEqual(scanHtml('<svg><![CDATA[a < b]]></svg>').unsure, []);
  });

  test('integration points reach the spec parser (the live scanner, fixed with R3)', () => {
    const { JSDOM } = require('jsdom');
    const { DOMParser } = new JSDOM('').window;
    // Each fetched in Chromium 131 as written; the frozen scanner was sure of every one.
    const cases = [
      ['<math><mi><![CDATA[<picture><source srcset=https://evil.test/x>]]></mi></math>', 'https://evil.test/x'],
      ['<div><math><mi><![CDATA[><img src="https://evil.test/y.png"></mi></math></div>', 'https://evil.test/y.png'],
      ['<svg><desc><x></svg></x></desc><style><img src=https://evil.test/z.png></style>', 'https://evil.test/z.png'],
      ['<svg><desc><title><!--</title><img src=https://evil.test/a>--></desc></svg>', 'https://evil.test/a'],
    ];
    for (const [html, url] of cases) {
      assert.equal(legacy.scanHtml(html).risky, false, `the frozen scanner was sure of ${html}`);
      assert.deepEqual(live.blockWebImages(html, [], { fonts: true, DOMParser }).blocked.map((b) => b.url), [url], html);
    }
  });

  test('a stray <body> tag\'s attributes do not slip past the spec parser\'s check (found by the browser fuzz)', () => {
    const { JSDOM } = require('jsdom');
    const { DOMParser } = new JSDOM('').window;
    // `<select>` makes the scan risky, so the spec parser checks the result; the `<BODY>` gives its
    // `background` to the page's body, which that check never visited (fb-43615, seed 11, fetched in all three engines).
    const html = '<select></select><table><tr><td><table><BODY width="a b" background="https://evil.test/b.png"></table></td></tr></table>';
    const r = live.blockWebImages(html, [], { DOMParser });
    assert.deepEqual(r.blocked.map((b) => b.url), ['https://evil.test/b.png']);
    assert.doesNotMatch(r.html, /evil\.test/);
  });

  test('linear on hostile input, both readers', () => {
    const hostile = ['<a '.repeat(100_000), '<!--'.repeat(50_000), '<!-- -'.repeat(50_000), '<!-- x -->'.repeat(40_000), '<!-- --!>'.repeat(40_000), '<style>'.repeat(30_000), '<svg><![CDATA['.repeat(30_000), '<svg><desc><![CDATA[>'.repeat(20_000), `<a b="${'x'.repeat(500_000)}`, '</'.repeat(100_000)];
    for (const [name, scan] of [['R3', scanHtml], ['live', (h) => live.blockWebImages(h, [], { DOMParser: null })]]) {
      for (const html of hostile) {
        const t = process.hrtime.bigint();
        scan(html);
        const ms = Number(process.hrtime.bigint() - t) / 1e6;
        // The frozen scanner took 29 s on the 400 KB comment flood.
        assert.ok(ms < 2000, `${name}: ${JSON.stringify(html.slice(0, 20))}… took ${ms.toFixed(0)} ms`);
      }
    }
  });
});

/** Segno's API and code generator, bundled from source (as tools/build-segno-grammar.js does). */
function loadSegno() {
  const esbuild = require('esbuild');
  const dir = path.resolve(__dirname, '../../../docs/src/lib/segno');
  const r = esbuild.buildSync({
    stdin: { contents: "export { generate } from './codegen.ts'; export * from './index.ts';", resolveDir: dir, loader: 'ts' },
    bundle: true, write: false, format: 'cjs', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', r.outputFiles[0].text)(mod, mod.exports);
  return mod.exports;
}

/** The parser `spec` generates, loaded as the committed one is. */
function generatedFrom(S, spec) {
  const js = require('esbuild').transformSync(S.generate(spec), { loader: 'ts', target: 'es2022', tsconfigRaw: '{}' }).code;
  const mod = { exports: {} };
  new Function('module', 'exports', `${js.replace(/^export function parse\(/m, 'function parse(')}\nmodule.exports = { parse };`)(mod, mod.exports);
  return mod.exports;
}

/** The grammar with `--!` ending a comment by itself: the comment tail's `!` becomes a `cend`. */
function mutatedSpec(S, grammar) {
  const seq = (...xs) => (xs.length === 2 && xs[0] === '!' && xs[1]?.t === 'opt' && xs[1].x.kind === 'cend' ? S.node('cend', '!') : S.seq(...xs));
  return grammar.makeHtmlGrammar({ ...S, seq }).htmlSpec;
}
