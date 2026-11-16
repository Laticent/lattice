
// The front-matter island (lib/core/front-matter-island.mjs): where front matter ends and its key lines, read once,
// and the readers that now pick from that one list (engine `parseFrontMatter`, `frontMatterValue`,
// `topLevelFrontMatterValue`, the splitter's `frontMatterBlockOf`). The differential at the bottom holds each moved
// reader to the code it replaced on main at 72bd2d9 (copied below: `lastFrontMatterMatch` verbatim, the others with
// only their shared helpers inlined), over a seeded walk of front-matter shapes (HARD RULE #32: the seed is printed
// and fixed).

const test = require('node:test');
const assert = require('node:assert/strict');

const { frontMatterIsland, frontMatterKeys, frontMatterMatch, FRONT_MATTER_FENCE, topLevelKey, looseKey } = require('../../../lib/core/front-matter-island.mjs');
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

test('raw CRLF `---` then `---` is no front matter, as the engine reads it after S0', () => {
  // The boundary parser's old fence split the `\r\n` in two and found an empty block, and the plugin writer then
  // wrote into the middle of a line end (red team, 2026-11-15).
  const src = '---\r\n---\r\n# Agenda\r\n\r\n- one\r\n';
  assert.equal(frontMatterIsland(src), null);
  assert.equal(frontMatterIsland('---\n---\n# Agenda\n'), null);
  assert.equal(frontMatterBlockOf(src), '');
  // The plugin writer adds a block of its own and keeps the author's two lines, as on main.
  const { writeDeckPlugins } = require('../../../lib/core/deck-plugins.mjs');
  assert.equal(writeDeckPlugins(src, ['mermaid']), `---\r\nplugins: [mermaid]\r\n---\r\n\r\n${src}`);
});

test('the plugin admission reads a lone-CR front matter line by line, as the island finds it', () => {
  const { deckPluginList, deckClassTokens, writeDeckPlugins } = require('../../../lib/core/deck-plugins.mjs');
  const src = '---\rtheme: x\rplugins: [mermaid]\rclass: kpi\r---\r# A\r';
  assert.deepEqual(deckPluginList(src), ['mermaid']);
  assert.deepEqual(deckClassTokens(src), ['kpi']);
  assert.equal(writeDeckPlugins(src, ['mermaid', 'math']), src.replace('[mermaid]', '[mermaid, math]'));
});

test('the plugin writer keeps an LF deck LF when its prose holds a stray CR (independent check, 2026-11-16)', () => {
  const { writeDeckPlugins } = require('../../../lib/core/deck-plugins.mjs');
  assert.equal(
    writeDeckPlugins('---\ntheme: indaco\nmode: x\n---\n\n# Slide\n\nText with a stray \r here\n', ['mermaid']),
    '---\ntheme: indaco\nmode: x\nplugins: [mermaid]\n---\n\n# Slide\n\nText with a stray \r here\n',
  );
  assert.equal(writeDeckPlugins('# Slide\n\nText \r here\n', ['mermaid']), '---\nplugins: [mermaid]\n---\n\n# Slide\n\nText \r here\n');
});

test('a key main read by its regex head: `a.b`, `$x` and `1x` now read as the whole key', () => {
  // Main's loose reader picked its column-0 line by the key's head up to the first `.` or `$` (`a`, nothing for
  // `$x`); the island matches the name. No register name holds either character.
  assert.equal(frontMatterValue('  a.b: nested\na.b: top', 'a.b'), 'top');
  assert.equal(frontMatterValue('  $x: nested\n$x: top', '$x'), 'top');
  assert.equal(frontMatterValue('1x: first\n1x: last', '1x'), 'last');
});

test('the island marks a block scalar body; lattice-deck gives its span and each key\'s parent', () => {
  const y = 'foo:\n  footer: x\n  sub:\n    deep: 1\nstyle: |\n  a { b: c }\n\n  d\n\nz: 1\ne: |\nq: 2';
  const keys = frontMatterKeys(y);
  assert.deepEqual(keys.map((k) => [k.name, k.bodyEnd]), [['foo', 0], ['footer', 0], ['sub', 0], ['deep', 0], ['style', 9], ['z', 0], ['e', 11], ['q', 0]]);
  assert.ok(Object.isFrozen(keys) && Object.isFrozen(keys[0]));
  const { latticeDeck } = require('../../../lib/authoring/squadra/lattice-deck.js');
  for (const eol of ['\n', '\r\n']) {
    const src = `---${eol}${y.replace(/\n/g, eol)}${eol}---${eol}# A${eol}`;
    const fm = latticeDeck.parse({ text: src }).tree.kids.find((k) => k.kind === 'front-matter');
    assert.deepEqual(fm.kids.map((k) => [k.attrs.name, k.attrs.parent, k.attrs.parentIndex]), [['foo', '', -1], ['footer', 'foo', 0], ['sub', 'foo', 0], ['deep', 'sub', 2], ['style', '', -1], ['z', '', -1], ['e', '', -1], ['q', '', -1]]);
    const style = fm.kids.find((k) => k.attrs.name === 'style');
    assert.equal(src.slice(style.parts.body.from, style.parts.body.to), `  a { b: c }${eol}${eol}  d`, JSON.stringify(eol));
    const e = fm.kids.find((k) => k.attrs.name === 'e');
    assert.equal(e.parts.body.from, e.parts.body.to, 'an empty body');
    assert.equal(fm.kids.find((k) => k.attrs.name === 'z').parts.body, undefined);
  }
});

test('frontMatterMatch: the block and its YAML, as the converted readers held them', () => {
  assert.deepEqual(frontMatterMatch('---\na: 1\n---\nbody'), ['---\na: 1\n---\n', 'a: 1']);
  assert.deepEqual(frontMatterMatch('---\r\na: 1\r\n---x'), ['---\r\na: 1\r\n---', 'a: 1']);
  assert.equal(frontMatterMatch('# no front matter'), null);
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
/** lib/core/front-matter-key.js `lastFrontMatterMatch` on main, verbatim (comments dropped). */
function oldLastFrontMatterMatch(text, re) {
  const src = String(text ?? '');
  const head = /^\^(?:\\s\*|\[ \\t\]\*)?([A-Za-z_][\w-]*)/.exec(re.source);
  if (head) {
    const keyLine = new RegExp(`^${esc(head[1])}[ \\t]*:`);
    const lines = src.split('\n');
    const top = lines.findLastIndex((l) => keyLine.test(l));
    if (top >= 0) return new RegExp(re.source, re.flags.replace('g', '')).exec(lines[top].replace(/^(\s*[\w-]+)[ \t]+:/, '$1:'));
  }
  return new RegExp(re.source, re.flags.replace('g', '')).exec(src);
}
/** `frontMatterValue`'s line pick on main (the preset fallback after it is unchanged and shared). */
function oldLooseRaw(fm, key) {
  const m = oldLastFrontMatterMatch(oldWithoutBlockScalarBodies(String(fm ?? '')), new RegExp(`^[ \\t]*${esc(key)}[ \\t]*:[ \\t]*(.*)$`, 'm'));
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

const KEYS = ['theme', 'class', 'mode', 'color-mode', 'footer', 'style', 'lift', 'a.b', '$x', 'preset', '1x'];
/**
 * Keys main's loose reader could not pick a line for: it read the key back out of its own regex with
 * `[A-Za-z_][\w-]*`, which stops at a `.` or `$` and fails on a leading digit (then the FIRST match at any indent
 * stood in for the last top-level one). Pinned below, not compared.
 */
const HEAD_CUT = new Set(['a.b', '$x', '1x']);
const VALUES = ['cuoio', ' dark  ', "'q # x' # c", '"a\\"b"', '#fff', '', ' |', ' >-', ' |2+', 'x # note', ': y', 'http://x'];
const INDENTS = ['', '', '', '  ', '    ', '\t'];
function atom(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  switch (Math.floor(r() * 7)) {
    case 0: return '';
    case 1: return `${pick(INDENTS)}# a comment`;
    case 2: return `${pick(INDENTS)}${pick(['- item', `- ${pick(KEYS)}: x`, `"${pick(KEYS)}": q`])}`;
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
    const lines = Array.from({ length: Math.floor(r() * 15) }, () => atom(r));
    const yaml = lines.join(eol);
    const closer = ['---', '---', '---x', '---  '][Math.floor(r() * 4)];
    const tail = r() < 0.2 ? '' : `${eol}# Body${eol}`;
    const src = `---${eol}${yaml}${eol}${closer}${tail}`;
    const why = `seed ${SEED}, case ${n}: ${JSON.stringify(src)}`;
    // A lone `\r` is the one intended difference: the engine's door folds it to `\n` before this runs, so only a
    // raw-bytes caller ever handed one to the old regex, which then missed the block the engine would find.
    if (eol === '\r') assert.notEqual(parseFrontMatter(src).body, src, why);
    else assert.deepEqual(parseFrontMatter(src), oldParseFrontMatter(src), why);
    const island = frontMatterIsland(src);
    if (eol !== '\r') assert.equal(island?.yaml, /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)?.[1], why);
    if (island) {
      assert.ok(island.yamlFrom <= island.yamlTo && island.yamlTo < island.closeEnd && island.closeEnd <= island.end, why);
      assert.equal(src.slice(island.yamlFrom, island.yamlTo), island.yaml, why);
      assert.equal(src.slice(island.closeEnd - 3, island.closeEnd), '---', why);
    }
    for (const key of KEYS) {
      // A preset-family key that is absent or empty falls back to `preset:`, a rule the island did not change.
      // Lone `\r`: the old loose reader found its column-0 line by `split('\n')`, so it saw one line and fell back to
      // the first indented match; the island reads `\r` as the line end it is. Pinned below, not compared.
      if (eol === '\r') continue;
      if (!isPresetKey(key) && !HEAD_CUT.has(key)) assert.equal(frontMatterValue(yaml, key), oldLooseRaw(yaml, key), `${why} key ${key}`);
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

test('the two halves CommonJS requires stay import-free (a required ES module that imports another fails under Playwright)', () => {
  // `front-matter-key.js`, `directives.js`, `lattice-deck.js` and the resolvers `require()` these. When the key reader
  // imported the fence, every Playwright run died loading its config: "request for './front-matter-fence.mjs' is from a
  // module not been linked" (PR #3228, 2026-11-16).
  const fs = require('node:fs');
  const path = require('node:path');
  for (const f of ['front-matter-fence.mjs', 'front-matter-keys.mjs']) {
    const src = fs.readFileSync(path.join(__dirname, '../../../lib/core', f), 'utf8');
    assert.doesNotMatch(src, /^\s*(import\s|export\s.*\sfrom\s)/m, `${f} must import nothing`);
  }
  // And no CommonJS file requires the joined module, which does import both halves.
  const { execFileSync } = require('node:child_process');
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', "require('[./]*core/front-matter-island.mjs')\\|require('./front-matter-island.mjs')", '--', 'lib', 'docs/src', 'tools'], { cwd: path.join(__dirname, '../../..'), encoding: 'utf8' }).trim();
  } catch (e) {
    if (e.status !== 1) throw e; // git grep exits 1 when nothing matches, which is the passing case
  }
  assert.equal(hits, '');
});
