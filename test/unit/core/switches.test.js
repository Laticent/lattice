/**
 * Unit: the switch spine (lib/core/switches.mjs) — one spelling and one precedence for every
 * on/off a deck or a slide can set (engineering/decisions/2026-11-04-switch-vocabulary.md).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SWITCHES, SWITCH_TOKENS, REGISTER_SWITCHES, switchOn, settleSwitches, registerToken, registerValue,
} = require('../../../lib/core/switches');
const { RETIRED_SWITCHES, retiredSwitch } = require('../../../lib/authoring/switches-retired.mjs');

test('every switch is spelled no-X / with-X, and no two switches share a token', () => {
  for (const s of SWITCHES) {
    assert.equal(s.no, `no-${s.name}`);
    assert.equal(s.with, `with-${s.name}`);
  }
  assert.equal(new Set(SWITCH_TOKENS).size, SWITCH_TOKENS.length);
  for (const t of SWITCH_TOKENS) assert.doesNotMatch(t, /-(on|off|none)$/, `${t} uses a retired spelling`);
});

test('the precedence: with-X > no-X > silent (for the bands it covers) > the caller\'s fallback', () => {
  assert.equal(switchOn('progress', ['no-progress', 'with-progress']), true, 'with- wins a slide carrying both');
  assert.equal(switchOn('progress', ['no-progress']), false);
  assert.equal(switchOn('progress', ['silent']), false, 'silent covers the rail');
  assert.equal(switchOn('progress', ['silent', 'with-progress']), true, 'with- beats silent');
  assert.equal(switchOn('logo', ['silent']), true, 'silent does not cover the logo');
  assert.equal(switchOn('note', ['silent']), true, 'nor the below-note');
  assert.equal(switchOn('pagination', [], false), false, 'no token: the fallback');
  assert.equal(switchOn('row-label', [], null), null, 'a null fallback means "measure it"');
  assert.equal(switchOn('header', { contains: (t) => t === 'with-header' }), true, 'a classList reads the same');
  assert.throws(() => switchOn('nope', []), /unknown switch/);
});

test('settleSwitches leaves at most one token per switch, expands silent, and is idempotent', () => {
  const cur = ['content', 'no-progress', 'with-progress', 'silent', 'with-pagination'];
  const once = settleSwitches(cur);
  assert.deepEqual(once, ['content', 'with-progress', 'silent', 'with-pagination', 'no-header', 'no-footer']);
  assert.equal(settleSwitches(once), once, 'a settled list comes back as the same array');
  const plain = ['content'];
  assert.equal(settleSwitches(plain), plain, 'nothing to settle: same array, no copy');
});

test('retired spellings map to their replacement, and the map has no entry that is still current', () => {
  // The full table, pinned pair by pair (the module builds it from patterns to save lint-core bytes).
  assert.deepEqual(RETIRED_SWITCHES, {
    'callout-off': 'no-callout', 'callout-on': 'with-callout', 'motion-off': 'no-motion', 'motion-on': 'with-motion',
    'spectrum-off': 'no-spectrum', 'spectrum-on': 'with-spectrum', 'spectrum-edge-off': 'no-spectrum-edge',
    'spectrum-card-off': 'no-spectrum-card', 'spectrum-card': 'with-spectrum-card', 'spectrum-trim-off': 'no-spectrum-trim',
    'spectrum-trim': 'with-spectrum-trim', 'row-label': 'with-row-label', 'no-rule': 'no-spine', 'rule-none': 'no-heading-rule',
    'treatment-none': 'no-treatment', 'finish-none': 'no-finish', 'backdrop-none': 'no-backdrop', 'tag-none': 'tag-bare',
  });
  assert.equal(retiredSwitch('callout-off'), 'no-callout');
  assert.equal(retiredSwitch('no-rule'), 'no-spine');
  assert.equal(retiredSwitch('rule-none'), 'no-heading-rule');
  assert.equal(retiredSwitch('no-progress'), null);
  for (const [from, to] of Object.entries(RETIRED_SWITCHES)) {
    assert.ok(!SWITCH_TOKENS.includes(from), `${from} is retired but is also a current switch token`);
    assert.notEqual(from, to);
  }
});

test('a setting\'s off / on word stamps the switch class; every other word keeps <key>-<word>', () => {
  assert.equal(registerToken('spectrum', 'off'), 'no-spectrum');
  assert.equal(registerToken('spectrum', 'on'), 'with-spectrum');
  assert.equal(registerToken('spectrum', 'mono'), 'spectrum-mono');
  assert.equal(registerToken('rule', 'none'), 'no-heading-rule');
  assert.equal(registerToken('rule', 'full'), 'rule-full');
  assert.equal(registerToken('spectrum-card', 'auto'), 'with-spectrum-card');
  assert.equal(registerToken('headline', 'left', 'head-'), 'head-left', 'a setting with no switch keeps its prefix');
  assert.equal(registerValue('spectrum', 'no-spectrum', ['on', 'solid', 'off']), 'off');
  assert.equal(registerValue('spectrum', 'spectrum-solid', ['on', 'solid', 'off']), 'solid');
  assert.equal(registerValue('spectrum', 'spectrum-off', ['on', 'solid', 'off']), null, 'the retired class is not a value');
  for (const [key, sw] of Object.entries(REGISTER_SWITCHES)) {
    assert.ok(SWITCHES.some((s) => s.name === sw.name), `${key} names a switch the table does not have`);
  }
});

test('the reference page lists every switch and every retired spelling', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'src', 'content', 'docs', 'reference', 'switches.md'), 'utf8');
  for (const s of SWITCHES) {
    assert.ok(page.includes(`\`${s.no}\``) && page.includes(`\`${s.with}\``), `docs/src/content/docs/reference/switches.md has no row for ${s.name}`);
  }
  for (const from of Object.keys(RETIRED_SWITCHES)) assert.ok(page.includes(`\`${from}\``), `the reference page does not list the retired ${from}`);
});
