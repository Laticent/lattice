/**
 * #1958 — the CodeQL escaping, sanitization and polynomial-regex findings that sit on deck
 * input. Each arm drives the input that motivated its rewrite, so a revert fails here rather
 * than only in the code-scanning dashboard. The Studio-side YAML quoting arm lives beside its
 * module (docs/src/playground/deck-config.quote.test.ts).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { removeTags, stripTags, plainText } = require('../../../lib/core/plain-text');
const { detailNote } = require('../../../lib/components/chart/_chart-family/mark-detail');
const { stripDebugAttrs } = require('../../../lib/engine/index.js');

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
    'lib/components/chart/_chart-family/svg-legend.js',
    'lib/components/chart/journey/journey.transform.js',
    'lib/components/chart/map/map.transform.js',
    'lib/components/chart/word-cloud/word-cloud.transform.js',
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
  const run = `<p${' '.repeat(200_000)}x>`;
  const t0 = process.hrtime.bigint();
  assert.equal(stripDebugAttrs(run), run);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // The old /\s+data-debug/ took ~1.1 s on 60k spaces and grows with the square; 200k
  // would be ~12 s. Linear is well under a millisecond; 250 ms leaves CI room.
  assert.ok(ms < 250, `${ms.toFixed(1)} ms`);
});

test('stripDebugAttrs still strips every data-debug form with its leading whitespace', () => {
  assert.equal(stripDebugAttrs('<section data-debug="x" class="a">'), '<section class="a">');
  assert.equal(stripDebugAttrs('<section\n\t data-debug class="a">'), '<section class="a">');
  assert.equal(stripDebugAttrs('<a data-debug="" data-debug="y">'), '<a>');
  assert.equal(stripDebugAttrs(' data-debug'), '');
});
