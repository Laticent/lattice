const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// THE SLICE-EQUIVALENCE SWEEP, RUN BY THE UNIT TIER — which is the point of this file existing at
// all. `npm run equiv:check` was on-demand and NOTHING invoked it: not a CI job, not a lefthook
// hook, not a test. It sat red from 154 decks to 158 while its own message said the measurement had
// "changed shape", and nobody read it, because reading it was a thing somebody had to remember to
// do. An unread gate is not a gate. Importing the harness here costs ~2s and makes `npm test` the
// reader.
//
// It is deliberately a TEST rather than a new CI job or hook: the pipeline already runs the unit
// tier, so this needs no change to what CI executes (CLAUDE.md reserves the CI/hook contract for
// the owner). Promoting it to its own job is a separate, owner-side decision — see the PR body.
//
// What it enforces is the CONTRACT in the harness header, via the harness's own `compareToBaseline`
// rather than a second reading of it here (HARD RULE #1). Two copies of a threshold agreeing by
// inspection is exactly what the neutralizer set and the generated-id list each got wrong once.

let harness;
let measured;
let baseline;

test.before(async () => {
  harness = await import('../../../tools/slice-equivalence.mjs');
  measured = harness.measure();
  baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../../benchmark/slice-equivalence.json'), 'utf8'));
});

test('the corpus sweep meets the committed baseline contract', () => {
  const failures = harness.compareToBaseline(baseline, measured);
  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n\nRe-bless with \`npm run equiv:bless\` ONLY with a stated reason.`);
});

// THE ACCOUNTING IDENTITY, asserted separately from the contract above so a failure names itself.
// Every measured slide either got a supplied deck position or was counted as a refusal. `positions`
// on its own cannot tell "the supply path broke" from "these decks were never eligible", and the
// second was invisible until `refusals` existed — the sweep reported a shortfall and left the
// reader to guess. A slide falling out of both counts means the denominator is lying.
test('every measured slide is either positioned or a counted refusal', () => {
  assert.equal(measured.positions + measured.refusals, measured.slides);
});

// NO UNATTRIBUTED RESIDUAL — issue #1442's acceptance clause, and the one worth a standing test.
// 27 of 49 residuals were `unclassified` when it was audited, and 25 of those turned out to be a
// REAL preview defect (`logo-on: title` painting the deck logo onto every slice) wearing the
// clothes of measurement noise. An unnamed bucket is where that hides. If a new cause appears, the
// job is to name it in `classifyDivergence`, not to widen this.
test('no residual is unclassified', () => {
  const unclassified = measured.byCause.get('unclassified') || 0;
  const named = [...measured.byCause].map(([c, n]) => `${n} ${c}`).join(', ');
  assert.equal(unclassified, 0, `${unclassified} residual slides have no named cause. Residuals: ${named || 'none'}`);
});

// The refusals are the sweep's blind spot, so they are pinned BY DECK, not just by count. A refusal
// arriving on a deck that did not have one is a change in which slides the sweep measures without a
// position — the "plausible lie" case Amendment 5 of #1442 names — and it should be read, not
// absorbed into a rate that rounds it away.
test('the decks the position guard refuses are the expected ones', () => {
  assert.deepEqual([...measured.refusalsByDeck.keys()].sort(), ['slide-class-forms.md']);
});
