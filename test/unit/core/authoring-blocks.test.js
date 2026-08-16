const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { KEY_INSIGHT_EXCLUDED, OPTIONAL_BLOCKS, supportsBlock, blocksFor } = require('../../../lib/core/authoring-blocks');
const { EXCLUDED: BELOW_NOTE_EXCLUDED } = require('../../../lib/core/below-note');

// #1651 — the two universal editorial blocks are OPT-OUT, and until now nothing
// machine-readable said which layouts opted out. `authoring-blocks.js` names both
// sets so the manifest, the deck lint, and Compose's gutter read one contract.
//
// The below-note set IS the render kernel's own list (imported, not copied). The
// key-insight set cannot be imported — it lives in a CSS `:not()` chain — so this
// file parses that chain and asserts the two agree. That parse is the whole point:
// it is what stops the declared list from drifting away from what renders.

const MODIFIERS_CSS = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.modifiers.css');

/** The `:not(.x)` names guarding the KEY INSIGHT panel rule in base.modifiers.css. */
function keyInsightExclusionsFromCss() {
  const css = fs.readFileSync(MODIFIERS_CSS, 'utf8');
  // The panel rule: `section:not(.a):not(.b)… > .cell-stage > blockquote {`
  const rule = css.match(/section((?::not\([^)]*\))+)\s*>\s*\.cell-stage\s*>\s*blockquote\s*\{/);
  assert.ok(rule, 'could not find the KEY INSIGHT panel rule in base.modifiers.css — update this parser, do not delete the gate');
  return [...rule[1].matchAll(/:not\(\.([a-z0-9-]+)\)/g)].map((m) => m[1]);
}

test('the declared key-insight exclusions match the CSS that actually renders', () => {
  const fromCss = keyInsightExclusionsFromCss();
  assert.deepStrictEqual(
    [...KEY_INSIGHT_EXCLUDED].sort(),
    [...fromCss].sort(),
    'KEY_INSIGHT_EXCLUDED has drifted from the `:not()` chain in base.modifiers.css § KEY INSIGHT',
  );
});

test('quote renders neither optional block — the case that started #1651', () => {
  assert.strictEqual(supportsBlock('quote', 'key-insight'), false, 'a quote claims its blockquote as the quotation');
  assert.strictEqual(supportsBlock('quote', 'below-note'), false, 'a quote claims its trailing paragraph as the attribution');
  assert.deepStrictEqual(blocksFor('quote'), []);
});

test('an ordinary prose layout renders both', () => {
  assert.deepStrictEqual(blocksFor('content'), ['key-insight', 'below-note']);
  assert.deepStrictEqual(blocksFor('cards-grid'), ['key-insight', 'below-note']);
});

test('a layout can take one block and not the other', () => {
  // `inventory` is off the key-insight chain but not on the below-note kernel list.
  assert.strictEqual(supportsBlock('inventory', 'key-insight'), false);
  assert.strictEqual(supportsBlock('inventory', 'below-note'), true);
  assert.deepStrictEqual(blocksFor('inventory'), ['below-note']);
  // `timeline-list` is the mirror case.
  assert.strictEqual(supportsBlock('timeline-list', 'key-insight'), true);
  assert.strictEqual(supportsBlock('timeline-list', 'below-note'), false);
});

test('the generated per-layout skeletons are excluded by PATTERN, not by name', () => {
  assert.strictEqual(supportsBlock('layout-3-up', 'key-insight'), false);
  assert.strictEqual(supportsBlock('layout-anything', 'key-insight'), false);
});

test('an unknown component takes both — opt-out means a new layout works untouched', () => {
  assert.deepStrictEqual(blocksFor('some-third-party-layout'), ['key-insight', 'below-note']);
});

test('an unknown block name is never reported as supported', () => {
  assert.strictEqual(supportsBlock('content', 'sidebar'), false);
  assert.strictEqual(supportsBlock('content', ''), false);
});

test('below-note exclusions are the kernel list itself, not a copy', () => {
  for (const name of BELOW_NOTE_EXCLUDED) {
    assert.strictEqual(supportsBlock(name, 'below-note'), false, `${name} is on the render kernel's EXCLUDED list`);
  }
});

test('OPTIONAL_BLOCKS is in document order — key-insight sits above a note', () => {
  assert.deepStrictEqual([...OPTIONAL_BLOCKS], ['key-insight', 'below-note']);
});
