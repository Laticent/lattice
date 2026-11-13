/**
 * #1958 — the CodeQL escaping, sanitization and polynomial-regex findings that sit on deck
 * input. Each arm drives the input that motivated its rewrite, so a revert fails here rather
 * than only in the code-scanning dashboard. The Studio-side YAML quoting arm lives beside its
 * module (docs/src/playground/deck-config.quote.test.ts).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { removeTags, stripTags, plainText } = require('@laticent/markup');
const { detailNote } = require('../../../lib/plugins/chart-family/shared/mark-detail');
const { stripDebugAttrs } = require('../../../lib/engine/index.js');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

test('removeTags strips to a fixed point, so a stripped tag cannot splice a new one together', () => {
  // What must hold is that no complete tag survives. For this `+` form no input was found
  // where ONE pass leaves a whole tag behind (each match starts at the leftmost `<`), so the
  // fixed point is what lets CodeQL, and a reader, see that without the argument.
  for (const hostile of ['<scr<script>ipt>alert(1)</scr</script>ipt>', '<<b>script<i>>x', 'a<<b>i>c', '<<<b>>>']) {
    assert.doesNotMatch(removeTags(hostile), /<[^>]+>/, hostile);
  }
  // Well-formed markdown-it output reaches the fixed point in one pass: byte-identical.
  assert.equal(removeTags('<strong>Ops</strong> &amp; <em>IT</em>'), 'Ops &amp; IT');
  assert.equal(stripTags(' <b>x</b>&nbsp;y '), 'x y');
  assert.equal(plainText('<b>Ops</b> &amp;lt; IT'), 'Ops &lt; IT');
});

test('the chart kernels\' local strippers all go through removeTags', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '../../..');
  for (const f of [
    'lib/plugins/chart-family/shared/svg-legend.js',
    'lib/plugins/chart-family/kinds/journey/journey.transform.js',
    'lib/plugins/chart-family/kinds/map/map.transform.js',
    'lib/plugins/chart-family/kinds/word-cloud/word-cloud.transform.js',
    'lib/components/connect/_qr-card/qr-card.js',
    'lib/core/bg-image.js',
    'lib/core/carousel.js',
  ]) {
    // Code only: a comment may quote the old one-pass form to explain the change.
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(?:\/\/|\*)/.test(l)).join('\n');
    assert.doesNotMatch(src, /\.replace\(\/<\[\^>\][*+]>\/g, ''\)/, `${f} still strips tags in one pass`);
  }
});

test('a speaker-note detail decodes each entity once: an author\'s literal &lt; stays &lt;', () => {
  // markdown-it writes an author's literal `&lt;` as `&amp;lt;`. Decoding `&amp;` first turned
  // it into `&lt;` and then into `<` (CodeQL js/double-escaping).
  const note = detailNote([{ label: 'Margin', detail: 'kept &amp;lt; 5% &amp; rising' }]);
  assert.equal(note, '<!-- Margin: kept &lt; 5% & rising -->');
});

test('stripDebugAttrs is linear on a long whitespace run (it was quadratic)', () => {
  // Nothing counts backtracking inside one regex (the old /\s+data-debug/ took 1.3 s on 40k spaces, growing with the
  // square), so every regex the call runs must be one recheck calls linear (test/helpers/regex-trace.js over
  // tools/regex-census.json), which needs no clock (HARD RULE #32).
  const run = `<p${' '.repeat(2_000)}x>`;
  // recheck cannot model the look-behind that made it linear, so its proof is written here and on its line in
  // lib/engine/index.js (`// regex-ok`).
  const allow = { '/(?<!\\s)\\s+data-debug(?:="[^"]*")?/g': "(?<!\\s) starts a match only at a run's first blank, so each run is tried once" };
  assertLinearRegexes(() => assert.equal(stripDebugAttrs(run), run), { allow });
});

test('stripDebugAttrs still strips every data-debug form with its leading whitespace', () => {
  assert.equal(stripDebugAttrs('<section data-debug="x" class="a">'), '<section class="a">');
  assert.equal(stripDebugAttrs('<section\n\t data-debug class="a">'), '<section class="a">');
  assert.equal(stripDebugAttrs('<a data-debug="" data-debug="y">'), '<a>');
  assert.equal(stripDebugAttrs(' data-debug'), '');
});

// The four js/incomplete-sanitization findings (#1958), in three files (gate.js's two go through
// its one `escapeRe`): regex escapes that escaped only `-`. A source check, so an equivalent
// rewrite of an escape has to update this arm.
// #2910 widened each to every metacharacter. The names they escape are NAME_RE-checked or a
// constant list, so no input reaches the gap today; this arm keeps a revert from landing
// silently, since a later caller may not check its names (re-verified 2026-11-06).
test('the layout gate, the AI layout scope check and the Mermaid highlighter escape every regex metacharacter', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '../../..');
  const FULL = '.replace(/[.*+?^${}()|[\\]\\\\-]/g, \'\\\\$&\')';
  for (const [f, n] of [['lib/layout/gate.js', 1], ['lib/layout/ai.js', 1], ['lib/plugins/mermaid/mermaid.highlight.js', 1]]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(src.split(FULL).length - 1 >= n, `${f} lost its full-metacharacter escape`);
    assert.doesNotMatch(src, /\.replace\(\/-\/g, '\\\\-'\)/, `${f} escapes only "-" again`);
  }
  // And the full escape does what it says: a name made of metacharacters matches only itself.
  const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const hostile = 'a.b*c+(d)|[e]\\f-g^$';
  assert.ok(new RegExp(`^${escapeRe(hostile)}$`).test(hostile));
  assert.ok(!new RegExp(`^${escapeRe('a.b')}$`).test('axb'));
});
