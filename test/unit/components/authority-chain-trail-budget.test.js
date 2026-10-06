/**
 * Unit: `trail-budget` — a word in an `authority-chain trail` column fits the column.
 *
 * The table is a measurement (lib/authoring/lint-core.js TRAIL_WORD_CHARS, 2026-10-05, wide
 * 16:9, every theme alike); these tests pin how the rule READS a deck against it: the venue
 * rung, the tier count, the hand face, and where Chromium breaks a citation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));
const { trailWordBudget } = require(path.join(ROOT, 'lib/authoring/lint-core.js'));

const deck = ({ fm = [], cls = 'authority-chain trail', tiers }) => ['---', 'theme: indaco', ...fm, '---', '',
  `<!-- _class: ${cls} -->`, '', '## Trail.', '',
  ...tiers.flatMap(([label, cite], i) => [`${i + 1}. ${label}`, `   - \`${cite}\``, '   - Gloss.']), ''].join('\n');
const found = (opts) => lintText(deck(opts)).filter((f) => f.rule === 'trail-budget');
const four = (cite, label = 'Case') => [['Statute', 'A'], ['Regulation', 'B'], ['Guidance', 'C'], [label, cite]];

test('trail-budget: the budget follows the tier count, the venue and the hand face', () => {
  assert.deepEqual([0, 1, 2, 3].map((r) => trailWordBudget('cite', 4, r, false)), [26, 23, 17, 13]);
  assert.deepEqual([0, 1, 2, 3].map((r) => trailWordBudget('label', 4, r, false)), [22, 19, 15, 11]);
  assert.equal(trailWordBudget('cite', 8, 3, false), 6, 'past six tiers the 6-tier figure scales down');
  assert.equal(trailWordBudget('cite', 1, 0, false), 58, 'one tier is judged as two');
  assert.equal(trailWordBudget('cite', 4, 3, true), 11, 'the hand face has its own table');
  assert.equal(trailWordBudget('label', 4, 3, true), 10);
});

test('trail-budget: a citation word past its column warns at the venue that clips it', () => {
  const word = 'X'.repeat(14);
  assert.equal(found({ tiers: four(word) }).length, 0, 'laptop holds 26');
  assert.equal(found({ fm: ['venue: conference'], tiers: four(word) }).length, 0, 'conference holds 17');
  const hall = found({ fm: ['venue: hall'], tiers: four(word) });
  assert.equal(hall.length, 1, 'hall holds 13');
  assert.match(hall[0].message, /citation word "X{14}" is 14 characters; a column of a 4-tier trail holds 13 at hall/);
  assert.equal(found({ cls: 'authority-chain trail scale-2xl', tiers: four(word) }).length, 1,
    'a slide scale class counts as its venue rung');
  const hand = found({ fm: ['venue: hall', 'mode: sketch'], tiers: four('X'.repeat(12)) });
  assert.equal(hand.filter((f) => /citation word/.test(f.message)).length, 1, 'the hand face holds 11 at hall');
  assert.equal(hand.filter((f) => /tier label/.test(f.message)).length, 0, 'REGULATION is 10, a hand hall label holds 10');
});

test('trail-budget: a word is what Chromium will not break', () => {
  // Breaks at a space, after a hyphen (digits too), around an en or em dash: each part fits.
  for (const cite of ['16 C.F.R. Part 312 Subpart', 'EpicGames-v-FTC-2022', '2019-2022-2026-2030',
    'Epic Games—FTC—Order', 'Epic Games–FTC–Order']) {
    assert.equal(found({ fm: ['venue: hall'], tiers: four(cite) }).length, 0, cite);
  }
  // `/`, `.`, `§` and an unspaced `·` hold, so the whole run is one word.
  for (const cite of ['EpicGames/FTC/2022x', 'EpicGames.v.FTC.2022', '§§6501(a)(1)(A)(ii)', 'EpicGames·FTC·2022']) {
    assert.equal(found({ fm: ['venue: hall'], tiers: four(cite) }).length, 1, cite);
  }
});

test('trail-budget: a tier label is judged on its own, tighter table', () => {
  const r = found({ fm: ['venue: hall'], tiers: four('A', 'Jurisprudence') });
  assert.equal(r.length, 1, 'JURISPRUDENCE is 13; a hall label holds 11');
  assert.match(r[0].message, /tier label word "Jurisprudence"/);
  assert.equal(found({ fm: ['venue: hall'], tiers: four('A', 'Case law') }).length, 0, 'two short words wrap');
});

test('trail-budget: only the trail, only the wide stage', () => {
  const word = 'X'.repeat(30);
  assert.equal(found({ fm: ['venue: hall'], cls: 'authority-chain', tiers: four(word) }).length, 0,
    'the default chain runs its body the full width');
  assert.equal(found({ fm: ['venue: hall', 'size: square'], tiers: four(word) }).length, 0,
    'unmeasured stage: no finding rather than a guess');
  assert.equal(found({ fm: ['venue: hall'], tiers: [['Statute', word]] }).length, 0, 'one tier is not a trail');
});

test('trail-budget: reads the tiers the engine renders', () => {
  const long = 'X'.repeat(14);
  const fm = ['---', 'theme: indaco', 'venue: hall'];
  const lint = (lines, extra = []) => lintText([...fm, ...extra, '---', '', ...lines, ''].join('\n'))
    .filter((f) => f.rule === 'trail-budget');
  // A second list after the tiers is not more tiers: two tiers hold 30 at hall.
  assert.equal(lint(['<!-- _class: authority-chain trail -->', '', '## T.', '', '1. Statute', `   - \`${'X'.repeat(20)}\``,
    '2. Case', '   - `B`', '', '- one', '- two', '- three', '- four']).length, 0);
  // A lazy continuation line joins the label, as the lift does.
  assert.equal(lint(['<!-- _class: authority-chain trail -->', '', '## T.', '', '1. Statute', '   Jurisprudence',
    '   - `A`', '2. B', '   - `B`', '3. C', '   - `C`', '4. D', '   - `D`']).length, 1);
  // A double-backtick citation is still a citation.
  assert.equal(lint(['<!-- _class: authority-chain trail -->', '', '## T.', '', '1. A', `   - \`\` ${long} \`\``,
    '2. B', '   - `B`', '3. C', '   - `C`', '4. D', '   - `D`']).length, 1);
  // The variant may come from the deck's `class:`.
  assert.equal(lint(['<!-- _class: authority-chain -->', '', '## T.', '', '1. A', `   - \`${long}\``,
    '2. B', '   - `B`', '3. C', '   - `C`', '4. D', '   - `D`'], ['class: trail']).length, 1);
});
