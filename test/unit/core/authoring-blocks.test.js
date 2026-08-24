const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { OPTIONAL_BLOCKS, supportsBlock, blocksFor, readsInsightLabel } = require('../../../lib/core/authoring-blocks');
const { harvestBody, codaFor, CODA_CLASS } = require('../../../lib/core/coda');
const CATALOG = require('../../../lib/forms/cell/coda/coda-catalog.generated.js');

// #1651 — the two universal editorial blocks are OPT-OUT, and until now nothing
// machine-readable said which layouts opted out. This file used to be the gate on
// that: it PARSED the `:not()` chain out of base.modifiers.css and asserted a
// hand-written list matched it, because the key-insight exclusions lived in CSS and
// could not be imported.
//
// They are DECLARED now (`coda.claims`, baked into coda-catalog.generated.js), and
// one predicate serves both the published contract and the render (lib/core/coda.js
// `rendersBeat`). So the parse is gone, and with it the class of bug it was chasing:
// the contract cannot disagree with the render, because there is only one answer.
//
// What still needs gating is the OTHER direction — that nobody quietly re-introduces
// a per-component exclusion in CSS, and that the declared answer is what a real
// harvest actually produces. Both are asserted below against the live kernel, not
// against a mirror of it.

const MODIFIERS_CSS = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.modifiers.css');

test('the key-insight panel is addressed through the coda cell, not a DOM position', () => {
  const css = fs.readFileSync(MODIFIERS_CSS, 'utf8');
  // The KEY INSIGHT block only — base.modifiers.css also carries a BELOW-NOTE
  // fallback family whose selectors mention `blockquote` as a STRUCTURAL
  // PREDECESSOR (`> :is(ul, ol, blockquote, table) + p`), which is a different
  // rule about a different element.
  const start = css.indexOf('── KEY INSIGHT');
  assert.ok(start > 0, 'could not find the KEY INSIGHT block in base.modifiers.css');
  const block = css.slice(start, css.indexOf('\nsection img', start));
  const arms = [...block.matchAll(/^section[^{,]*blockquote[^{]*\{/gm)].map((m) => m[0]);
  assert.ok(arms.length >= 4, 'could not find the KEY INSIGHT rule family — update this parser, do not delete the gate');
  for (const arm of arms) {
    assert.ok(
      arm.includes(`.${CODA_CLASS}`),
      `KEY INSIGHT arm does not go through .${CODA_CLASS}: ${arm.trim()}\n` +
      'The panel attaches to the coda CELL. A rule keyed on a raw DOM position is the ' +
      'defect this replaced — it silently missed every layout whose transform introduced a wrapper.',
    );
    assert.ok(
      !/:not\(\.[a-z0-9-]+\)/.test(arm),
      `KEY INSIGHT arm carries a per-component :not() exclusion: ${arm.trim()}\n` +
      'Exclusions are DECLARED (`coda.claims` in the component manifest), never written into ' +
      'this selector — a CSS chain is what drifted away from the render for 8 of 61 layouts.',
    );
  }
});

test('what the contract PUBLISHES is what the kernel actually harvests', () => {
  // The real tie, asserted per layout against the live harvest rather than against a
  // second copy of the rules. Body shape: a structural block, then both beats.
  const BODY = '<h2>T</h2>\n<ul>\n<li>a</li>\n</ul>\n<blockquote>\n<p>k</p>\n</blockquote>\n<p>note</p>\n';
  for (const name of Object.keys(CATALOG)) {
    const out = harvestBody(BODY, name);
    const cell = out.includes(`class="${CODA_CLASS}"`);
    const published = blocksFor(name);
    assert.equal(
      cell, published.length > 0,
      `${name}: publishes ${JSON.stringify(published)} but the harvest ${cell ? 'built' : 'did not build'} a coda cell`,
    );
    if (!cell) continue;
    const coda = out.slice(out.indexOf(`class="${CODA_CLASS}"`));
    assert.equal(
      coda.includes('<blockquote>'), published.includes('key-insight'),
      `${name}: key-insight published=${published.includes('key-insight')} but harvested=${coda.includes('<blockquote>')}`,
    );
    assert.equal(
      coda.includes('class="below-note"'), published.includes('below-note'),
      `${name}: below-note published=${published.includes('below-note')} but harvested=${coda.includes('class="below-note"')}`,
    );
  }
});

test('quote renders neither optional block — the case that started #1651', () => {
  assert.deepEqual(blocksFor('quote'), []);
  assert.equal(supportsBlock('quote', 'key-insight'), false);
  assert.equal(supportsBlock('quote', 'below-note'), false);
});

test('an ordinary prose layout renders both', () => {
  assert.deepEqual(blocksFor('list'), ['key-insight', 'below-note']);
});

test('a layout can take one block and not the other', () => {
  // A chart claims its trailing paragraph for the caption (liftChartCaption) and
  // leaves the blockquote alone.
  assert.deepEqual(blocksFor('radar'), ['key-insight']);
  // A legal layout claims the blockquote for its framed source and leaves the note.
  assert.deepEqual(blocksFor('citation-card'), ['below-note']);
});

test('the generated per-layout skeletons are excluded by PATTERN, not by name', () => {
  assert.equal(supportsBlock('layout-anything', 'key-insight'), false);
  assert.deepEqual(codaFor('layout-anything').claims, ['blockquote', 'trailing-paragraph']);
});

test('an unknown component takes both — opt-out means a new layout works untouched', () => {
  assert.deepEqual(blocksFor('some-third-party-layout'), ['key-insight', 'below-note']);
});

test('an unknown block name is never reported as supported', () => {
  assert.equal(supportsBlock('list', 'sidebar'), false);
});

test('the `no-note` opt-out withholds the note and leaves the insight', () => {
  assert.deepEqual(blocksFor('list no-note'), ['key-insight']);
});

test('claims are TOKEN-EXACT — the substring wart is gone', () => {
  // below-note's old matcher tested `cls.includes(x)`, so `compare-code` inherited
  // `code`'s exclusion and `pull-quote` inherited `quote`'s (#1363). Declared claims
  // are per layout, so a name that merely CONTAINS another answers for itself:
  // compare-code claims neither beat and renders both.
  assert.deepEqual(blocksFor('compare-code'), ['key-insight', 'below-note']);
  assert.deepEqual(blocksFor('code'), ['key-insight']);
});

test('a layout that paints the insight label itself is not reported inert', () => {
  // split-compare claims the blockquote (the verdict card is its own anatomy) yet
  // renders `--insight-label` on that card, so `insight-*` is live there.
  assert.equal(supportsBlock('split-compare', 'key-insight'), false);
  assert.equal(readsInsightLabel('split-compare'), true);
  assert.equal(readsInsightLabel('list'), false);
});

test('every catalog row declares a dock the CSS has an arm for', () => {
  const DOCKS = new Set(['column', 'row', 'grid']);
  for (const [name, row] of Object.entries(CATALOG)) {
    assert.ok(DOCKS.has(row.dock), `${name}: unknown coda dock ${JSON.stringify(row.dock)}`);
  }
});

test('OPTIONAL_BLOCKS is in document order — key-insight sits above a note', () => {
  assert.deepEqual(OPTIONAL_BLOCKS, ['key-insight', 'below-note']);
});
