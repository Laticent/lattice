const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { KEY_INSIGHT_EXCLUDED, OPTIONAL_BLOCKS, supportsBlock, blocksFor } = require('../../../lib/core/authoring-blocks');
const { EXCLUDED: BELOW_NOTE_EXCLUDED, isExcluded: belowNoteExcluded } = require('../../../lib/core/below-note');

// #1651 — the two universal editorial blocks are OPT-OUT, and until now nothing
// machine-readable said which layouts opted out. `authoring-blocks.js` names both
// sets so the manifest, the deck lint, and Compose's gutter read one contract.
//
// The below-note set IS the render kernel's own list (imported, not copied). The
// key-insight set cannot be imported — it lives in a CSS `:not()` chain — so this
// file parses that chain and asserts the two agree. That parse is the whole point:
// it is what stops the declared list from drifting away from what renders.

const MODIFIERS_CSS = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.modifiers.css');

/**
 * EVERY `section:not(…)…blockquote` arm in base.modifiers.css, as a list of the class
 * names each one excludes.
 *
 * The KEY INSIGHT treatment is not one rule — it is a family (the panel background, its
 * `::before` label, and both the direct-child and `.cell-stage` forms), and the arms do
 * NOT all carry the same chain today: the direct `> blockquote::before` arm omits
 * `inventory`. Reading a single arm made this gate blind to an exclusion added anywhere
 * else, which was the whole failure mode it exists to prevent. (Flagged by the Munger
 * inversion pass.)
 */
function keyInsightArmsFromCss() {
  const css = fs.readFileSync(MODIFIERS_CSS, 'utf8');
  const arms = [...css.matchAll(/section((?::not\([^)]*\))+)[^,{;]*?blockquote(?:::before)?\s*[,{]/g)];
  assert.ok(arms.length >= 2, 'could not find the KEY INSIGHT rule family in base.modifiers.css — update this parser, do not delete the gate');
  return arms.map((m) => [...m[1].matchAll(/:not\(\.([a-z0-9-]+)\)/g)].map((x) => x[1]));
}

test('no CSS arm excludes a class the declared key-insight list does not know about', () => {
  const declared = new Set(KEY_INSIGHT_EXCLUDED);
  for (const arm of keyInsightArmsFromCss()) {
    for (const name of arm) {
      assert.ok(
        declared.has(name),
        `base.modifiers.css § KEY INSIGHT excludes \`${name}\`, but KEY_INSIGHT_EXCLUDED does not — authoring.blocks would over-report it as supported`,
      );
    }
  }
});

test('the declared list is exactly the WIDEST arm — no name declared that the CSS never excludes', () => {
  const widest = keyInsightArmsFromCss().reduce((a, b) => (b.length > a.length ? b : a), []);
  assert.deepStrictEqual(
    [...KEY_INSIGHT_EXCLUDED].sort(),
    [...widest].sort(),
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

// The manifest publishes this answer, so a disagreement with the kernel is a lie in a
// machine-readable contract — worse than the silence #1651 set out to close. The kernel
// matches a string class by SUBSTRING, so `compare-code` is excluded for containing
// `code`; a token-exact re-implementation said the opposite. Call the kernel, don't
// mirror it. (Found by the Munger inversion pass before merge.)
test('supportsBlock agrees with the render kernel for EVERY shipped component', () => {
  const manifest = require('../../../dist/docs/components.json');
  const disagreements = manifest.components
    .map((c) => ({ name: c.name, kernel: !belowNoteExcluded(c.name), declared: supportsBlock(c.name, 'below-note') }))
    .filter((r) => r.kernel !== r.declared);
  assert.deepStrictEqual(disagreements, [], 'authoring.blocks must mirror what below-note.js actually does');
});

test('the substring wart is inherited on purpose, not re-litigated here', () => {
  // #1363 tracks whether `compare-code` SHOULD be excluded. Until it is settled, the
  // published contract must say what the engine does, not what it arguably ought to.
  assert.strictEqual(supportsBlock('compare-code', 'below-note'), false);
  assert.strictEqual(belowNoteExcluded('compare-code'), true);
});

test('OPTIONAL_BLOCKS is in document order — key-insight sits above a note', () => {
  assert.deepStrictEqual([...OPTIONAL_BLOCKS], ['key-insight', 'below-note']);
});
