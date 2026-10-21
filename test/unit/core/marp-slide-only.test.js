/**
 * Unit: the export-to-Marp boundary for the slide-only directives (lib/core/marp-slide-only.js).
 *
 * Lattice scopes a plain `<!-- header: H -->` to its own slide (audit §11r); Marp carries it onto every later slide.
 * The bundle therefore writes it as `_header:`, which both read the same way.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withSlideOnlySpotted } = require('../../../lib/core/marp-slide-only');
const fs = require('node:fs');
const path = require('node:path');
const { withRuntimeScripts } = require('../../../lib/core/marp-bundle');

test('a plain header and footer comment become their underscore spelling; a paginate comment is not this step\'s', () => {
  // Page numbers are not a slide directive (audit §11s): lib/core/marp-bundle-scope.js drops the comment in the bundle.
  const deck = '# One\n\n---\n\n<!-- header: Q3 -->\n<!-- footer: "Board" -->\n<!--paginate: true-->\n\n# Two\n';
  assert.equal(withSlideOnlySpotted(deck), '# One\n\n---\n\n<!-- _header: Q3 -->\n<!-- _footer: "Board" -->\n<!--paginate: true-->\n\n# Two\n');
});

test('an underscore comment, another directive, and prose are left alone', () => {
  const deck = '<!-- _header: L -->\n<!-- class: dense -->\n<!-- a note about the header: it reads well -->\n# x\n';
  assert.equal(withSlideOnlySpotted(deck), deck);
});

test('fenced code and inline code are quoted, not read', () => {
  const deck = '```md\n<!-- header: in a fence -->\n```\n\nWrite `<!-- header: H -->` to set one.\n\n~~~\n<!-- footer: F -->\n~~~\n';
  assert.equal(withSlideOnlySpotted(deck), deck);
});

test('a comment spanning lines is rewritten', () => {
  assert.equal(withSlideOnlySpotted('<!--\nheader: Q3\n-->\n# x\n'), '<!--\n_header: Q3\n-->\n# x\n');
});

// The shapes a checker found the first, line-pattern draft got wrong: it rewrote quoted code and skipped a value with
// a backtick, which Marp then carried onto every later slide.
test('a directive whose value holds a backtick is rewritten', () => {
  assert.equal(withSlideOnlySpotted('# a\n\n---\n\n<!-- footer: `v2` -->\n\n# b\n'), '# a\n\n---\n\n<!-- _footer: `v2` -->\n\n# b\n');
});

test('code in a nested list, in a blockquote, and an indented code block are left alone', () => {
  const deck = [
    '- a',
    '  - b',
    '',
    '    ```md',
    '    <!-- footer: q -->',
    '    ```',
    '',
    '> ```',
    '> <!-- header: q -->',
    '> ```',
    '',
    'Para.',
    '',
    '    <!-- header: indented code -->',
    '',
    'Use `<!--` to open one.',
    '',
    '~~~',
    '<!-- header: quoted -->',
    '~~~',
    '',
  ].join('\n');
  assert.equal(withSlideOnlySpotted(deck), deck);
});

test('every slide-only key of a comment holding several is rewritten', () => {
  assert.equal(withSlideOnlySpotted('<!--\nheader: H\nfooter: F\n-->\n# x\n'), '<!--\n_header: H\n_footer: F\n-->\n# x\n');
});

test('front matter is never touched, even a YAML comment that looks like a directive', () => {
  const deck = '---\ntheme: indaco\n# <!-- footer: F -->\n---\n\n# x\n';
  assert.equal(withSlideOnlySpotted(deck), deck);
});

test('a re-export is idempotent', () => {
  const once = withSlideOnlySpotted('# a\n\n---\n\n<!-- header: H -->\n\n# b\n');
  assert.equal(withSlideOnlySpotted(once), once);
});

test('a deck with nothing to rewrite comes back byte-identical', () => {
  const deck = '---\nheader: Deck\n---\n\n# One\n\n---\n\n# Two\n';
  assert.equal(withSlideOnlySpotted(deck), deck);
});

// The rewrite is NOT in `withRuntimeScriptsReport`: marp-bundle.js ships in the browser engine every route loads, and it
// put a route over its engine ceiling there. So every producer of a Marp bundle calls it on the deck it hands the
// bundle step. This census finds every caller of `withRuntimeScriptsReport` and requires the rewrite beside it.
test('every producer of a Marp bundle rewrites the slide-only directives before the bundle step', () => {
  const root = path.join(__dirname, '../../..');
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return ['node_modules', 'dist', '.git', 'public'].includes(e.name) ? [] : files(p);
    return /\.(js|mjs|ts|tsx)$/.test(e.name) && !/\.test\.|\.generated\./.test(e.name) ? [p] : [];
  });
  const callers = ['lib', 'tools', 'docs/src'].flatMap((d) => files(path.join(root, d)))
    .filter((f) => /withRuntimeScriptsReport\(/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith(path.join('lib', 'core', 'marp-bundle.js')))
    .map((f) => path.relative(root, f).replaceAll('\\', '/')).sort();
  assert.deepEqual(callers, ['docs/src/components/studio/export/deck-export.js', 'tools/export-marp.js'], 'a new producer of a Marp bundle: call withSlideOnlySpotted on its deck, then add it here');
  for (const f of callers) assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /withRuntimeScriptsReport\(\s*(?:\/\/[^\n]*\n\s*)*withSlideOnlySpotted\(/, `${f} must hand withRuntimeScriptsReport a deck withSlideOnlySpotted has rewritten`);
});

test('the bundle step itself leaves the comment alone, so the rewrite is the producers\' job', () => {
  const out = withRuntimeScripts('---\ntheme: indaco\nheader: Deck\n---\n\n# One\n\n---\n\n<!-- header: Q3 -->\n\n# Two\n');
  assert.match(out, /<!-- header: Q3 -->/);
  assert.match(withSlideOnlySpotted(out), /<!-- _header: Q3 -->/);
});
