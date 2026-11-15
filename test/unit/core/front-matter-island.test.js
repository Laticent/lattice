
// The front-matter island (lib/core/front-matter-island.mjs): where front matter ends and its key lines, read once,
// and the readers that now pick from that one list (engine `parseFrontMatter`, `frontMatterValue`,
// `topLevelFrontMatterValue`, the splitter's `frontMatterBlockOf`). The differential at the bottom holds each moved
// reader to the regex it replaced, kept here verbatim, over a seeded walk of front-matter shapes (HARD RULE #32: the
// seed is printed and fixed).

const test = require('node:test');
const assert = require('node:assert/strict');

const { frontMatterIsland, frontMatterKeys, FRONT_MATTER_FENCE, topLevelKey, looseKey } = require('../../../lib/core/front-matter-island.mjs');
const { parseFrontMatter } = require('../../../lib/engine/directives.js');
const { frontMatterValue, topLevelFrontMatterValue, frontMatterScalar, isPresetKey } = require('../../../lib/core/front-matter-key.js');
const { FRONT_MATTER } = require('../../../lib/core/boundary-parser.mjs');
const { frontMatterBlockOf, chunkBoundaryLines } = require('../../../lib/core/slide-boundaries.mjs');

const slice = (src, from, to) => src.slice(from, to);

test('the island: block end, YAML span and key spans in source offsets', () => {
  const src = '---\ntheme: cuoio  # brand\n  nested : x\nempty:\n---\n# A\n';
  const fm = frontMatterIsland(src);
  assert.equal(fm.end, src.indexOf('# A'));
  assert.equal(slice(src, fm.yamlFrom, fm.yamlTo), fm.yaml);
  assert.deepEqual(fm.keys.map((k) => [k.name, k.indent, slice(src, k.nameFrom, k.nameTo), slice(src, k.valueFrom, k.valueTo)]), [
    ['theme', '', 'theme', 'cuoio  # brand'],
    ['nested', '  ', 'nested', 'x'],
    ['empty', '', 'empty', ''],
  ]);
  assert.equal(frontMatterScalar(fm.keys[0].raw), 'cuoio');
});

test('the island: CRLF and a lone CR are line ends; a BOM means no front matter', () => {
  const crlf = '---\r\na: 1\r\nb: 2\r\n---\r\nbody';
  assert.deepEqual(frontMatterIsland(crlf).keys.map((k) => [k.name, slice(crlf, k.valueFrom, k.valueTo)]), [['a', '1'], ['b', '2']]);
  assert.equal(crlf.slice(frontMatterIsland(crlf).end), 'body');
  const cr = '---\ra: 1\r---\rbody';
  assert.equal(cr.slice(frontMatterIsland(cr).end), 'body');
  assert.equal(frontMatterIsland('\uFEFF---\na: 1\n---\n'), null);
});

test('the island: the closer need not end its line, as the engine always read it', () => {
  assert.equal('---\na: 1\n---x\nbody'.slice(frontMatterIsland('---\na: 1\n---x\nbody').end), 'x\nbody');
  assert.equal('---\na: 1\n---   \nbody'.slice(frontMatterIsland('---\na: 1\n---   \nbody').end), '   \nbody');
  assert.equal(frontMatterIsland('---\na: 1\n---').end, 12, 'a front-matter-only file with no line end');
});

test('the island: a block scalar body holds no keys, its header does', () => {
  const keys = frontMatterKeys('style: |\n  color: red\n\n  lift: on\nmode: sketch\n  css: >-\n    a: b\nx: 1');
  assert.deepEqual(keys.map((k) => [k.name, k.blockScalar]), [['style', true], ['mode', false], ['css', true], ['x', false]]);
});

test('the island: U+2028 is text, not a line end (YAML 1.2, markdown-it)', () => {
  // The engine's old `(.*)$` dropped such a line and the loose reader's `m` flag split it: both are gone.
  const keys = frontMatterKeys('footer: a\u2028b');
  assert.deepEqual(keys.map((k) => k.name), ['footer']);
  assert.equal(parseFrontMatter('---\nfooter: a\u2028b\n---\n').directives.footer, 'a\u2028b');
});

test('a lone CR: the register readers read lines as the island does', () => {
  assert.equal(frontMatterValue('  a.b: nested\ra.b: top', 'a.b'), 'top');
  assert.equal(topLevelFrontMatterValue('mode: a\rmode: b', 'mode'), 'b');
});

test('the picks: top-level last wins, loose falls back to the first indented line', () => {
  const keys = frontMatterKeys('a:\n  mode: n1\n  mode: n2\nmode: t1\nmode: t2\nb:\n  only: x');
  assert.equal(topLevelKey(keys, 'mode').raw.trim(), 't2');
  assert.equal(looseKey(keys, 'mode').raw.trim(), 't2');
  assert.equal(topLevelKey(keys, 'only'), null);
  assert.equal(looseKey(keys, 'only').raw.trim(), 'x');
});

test('the boundary parser and the deck model share the island fence', () => {
  assert.equal(FRONT_MATTER, FRONT_MATTER_FENCE);
});

test('the splitter ends the block where the engine does, and keeps its line numbers', () => {
  const src = '---\na: 1\n---   \n# One\n\n---\n\n# Two\n';
  assert.equal(frontMatterBlockOf(src), '---\na: 1\n---');
  // The front matter's two fences, then the break on line 5: the same lines a `---` closer gives.
  assert.deepEqual(chunkBoundaryLines(src), chunkBoundaryLines(src.replace('---   \n', '---\n')));
  assert.deepEqual(chunkBoundaryLines(src), [0, 2, 5]);
});

// ── The differential: each moved reader against the regex it replaced ─────────────────────────────────────────────

/** lib/engine/directives.js `parseFrontMatter` before the island, verbatim but for `withoutBlockScalarBodies`. */
function oldWithoutBlockScalarBodies(fm) {
  if (!/:[ \t]+[|>]/.test(fm)) return fm;
  const lines = fm.split('\n');
  const RE = /^([ \t]*)[A-Za-z][\w-]*:[ \t]+[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*|[ \t]*)\r?$/;
  for (let i = 0; i < lines.length; i++) {
    const head = RE.exec(lines[i]);
    if (!head) continue;
    const base = head[1].length;
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].match(/^[ \t]*/)[0].length > base)) lines[++i] = '';
  }
  return lines.join('\n');
}
function oldParseFrontMatter(src) {
  const directives = {};
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { directives, body: src };
  for (const line of oldWithoutBlockScalarBodies(m[1]).split(/\r?\n/)) {
    const kv = /^([A-Za-z_]\w*)[ \t]*:(.*)$/.exec(line.trimEnd());
    if (!kv) continue;
    directives[kv[1]] = frontMatterScalar(kv[2].trimStart());
  }
  return { directives, body: src.slice(m[0].length) };
}
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `frontMatterValue`'s line pick before the island (the preset fallback is unchanged and shared). */
function oldLooseRaw(fm, key) {
  const text = oldWithoutBlockScalarBodies(fm);
  const top = text.split('\n').findLast((l) => new RegExp(`^${esc(key)}[ \\t]*:`).test(l));
  const re = new RegExp(`^[ \\t]*${esc(key)}[ \\t]*:[ \\t]*(.*)$`, 'm');
  const m = top !== undefined ? re.exec(top.replace(/^(\s*[\w-]+)[ \t]+:/, '$1:')) : re.exec(text);
  return m ? frontMatterScalar(m[1]) : null;
}
function oldTopLevel(fm, key) {
  let last = null;
  for (const m of String(fm).matchAll(new RegExp(`^${esc(key)}[ \\t]*:[ \\t]*(.*)$`, 'gm'))) last = m;
  return last ? frontMatterScalar(last[1]) : null;
}
/** lib/core/slide-boundaries.mjs `frontMatterBlockOf` before the island. */
const oldBlockOf = (src) => (/^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?/.exec(src) || [''])[0];

/** mulberry32: a seeded generator, so a failure replays (HARD RULE #32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = ['theme', 'class', 'mode', 'color-mode', 'footer', 'style', 'lift', 'a.b', '$x', 'preset'];
const VALUES = ['cuoio', ' dark  ', "'q # x' # c", '"a\\"b"', '#fff', '', ' |', ' >-', ' |2+', 'x # note', ': y', 'http://x'];
const INDENTS = ['', '', '', '  ', '    ', '\t'];
function atom(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  switch (Math.floor(r() * 7)) {
    case 0: return '';
    case 1: return `${pick(INDENTS)}# a comment`;
    case 2: return `${pick(INDENTS)}- item`;
    case 3: return `${pick(INDENTS)}${pick(KEYS)} :${pick(VALUES)}`;
    default: return `${pick(INDENTS)}${pick(KEYS)}:${pick(VALUES)}`;
  }
}

test('differential: the island readers equal the regexes they replaced on 4,000 seeded front matters', () => {
  const SEED = 0x3242;
  const r = rng(SEED);
  let compared = 0;
  for (let n = 0; n < 4000; n++) {
    const eol = ['\n', '\n', '\n', '\r\n', '\r'][Math.floor(r() * 5)];
    const lines = Array.from({ length: 1 + Math.floor(r() * 8) }, () => atom(r));
    const yaml = lines.join(eol);
    const closer = ['---', '---', '---x', '---  '][Math.floor(r() * 4)];
    const tail = r() < 0.2 ? '' : `${eol}# Body${eol}`;
    const src = `---${eol}${yaml}${eol}${closer}${tail}`;
    const why = `seed ${SEED}, case ${n}: ${JSON.stringify(src)}`;
    // A lone `\r` is the one intended difference: the engine's door folds it to `\n` before this runs, so only a
    // raw-bytes caller ever handed one to the old regex, which then missed the block the engine would find.
    if (eol === '\r') assert.notEqual(parseFrontMatter(src).body, src, why);
    else assert.deepEqual(parseFrontMatter(src), oldParseFrontMatter(src), why);
    assert.equal(frontMatterIsland(src)?.yaml, /^---(?:\r\n|\r|\n)([\s\S]*?)(?:\r\n|\r|\n)---(?:\r\n|\r|\n)?/.exec(src)?.[1], why);
    for (const key of KEYS) {
      // A preset-family key that is absent or empty falls back to `preset:`, a rule the island did not change.
      // Lone `\r`: the old loose reader found its column-0 line by `split('\n')`, so it saw one line and fell back to
      // the first indented match; the island reads `\r` as the line end it is. Pinned below, not compared.
      if (eol === '\r') continue;
      if (!isPresetKey(key)) assert.equal(frontMatterValue(yaml, key), oldLooseRaw(yaml, key), `${why} key ${key}`);
      assert.equal(topLevelFrontMatterValue(yaml, key), oldTopLevel(yaml, key), `${why} key ${key}`);
    }
    // The splitter: identical unless the closer carries trailing blanks, where the island ends at `---` (the engine's).
    if (closer !== '---  ') assert.equal(frontMatterBlockOf(src), oldBlockOf(src), why);
    compared++;
  }
  assert.equal(compared, 4000);
});

test('lattice-deck: an fm-key per key line, with name and value parts in source offsets, and deck.settings', () => {
  const { latticeDeck } = require('../../../lib/authoring/squadra/lattice-deck.js');
  // A BOM and CRLF: S0 strips and folds them, and every span still indexes the author's text.
  const src = '﻿---\r\ntheme: cuoio  # brand\r\nstyle: |\r\n  color: red\r\nfoo:\r\n  footer: nested\r\nclass: kpi\r\nclass: dark\r\n---\r\n\r\n# A\r\n';
  const { tree } = latticeDeck.parse({ text: src });
  const fm = tree.kids.find((k) => k.kind === 'front-matter');
  assert.deepEqual(
    fm.kids.map((k) => [k.kind, k.attrs.name, src.slice(k.parts.name.from, k.parts.name.to), src.slice(k.parts.value.from, k.parts.value.to), k.attrs.value, k.attrs.top]),
    [
      ['fm-key', 'theme', 'theme', 'cuoio  # brand', 'cuoio', true],
      ['fm-key', 'style', 'style', '|', '|', true],
      ['fm-key', 'foo', 'foo', '', '', true],
      ['fm-key', 'footer', 'footer', 'nested', 'nested', false],
      ['fm-key', 'class', 'class', 'kpi', 'kpi', true],
      ['fm-key', 'class', 'class', 'dark', 'dark', true],
    ],
  );
  const settings = latticeDeck.facts['deck.settings'](tree);
  assert.deepEqual([...settings.keys()], ['theme', 'style', 'foo', 'class']);
  assert.equal(settings.get('class').attrs.value, 'dark', 'a repeated key: the last line wins (#3050, D1)');
  assert.equal(latticeDeck.facts['deck.settings'](latticeDeck.parse({ text: '# No front matter\n' }).tree).size, 0);
  assert.ok(latticeDeck.kinds.includes('fm-key'));
});
