/**
 * Unit: the queue Definition-of-Ready audit (tools/audit-queue-dor.js).
 *
 * This tool exists so the numbers behind the intake bar are re-derivable rather
 * than asserted — a figure quoted in a PR body stops being checkable the moment
 * the session ends. So the thing worth pinning is that its two counts mean what
 * the doc says they mean: what the gate does NOW, and what it would have done
 * without the grandfathering cutoff.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { auditQueue, report } = require(path.join(__dirname, '..', '..', '..', 'tools', 'audit-queue-dor.js'));
const { DOR_CUTOFF } = require(path.join(__dirname, '..', '..', '..', '.github', 'scripts', 'triage.js'));

const OLD = '2026-01-01T00:00:00Z';
const NEW = '2099-01-01T00:00:00Z';
const withDor = ['## Swimlane / governing decision doc', 'decisions/x.md', '', '## Acceptance check', 'npm test passes'].join('\n');

const card = (number, createdAt, body) => ({ number, createdAt, body, labels: [] });

describe('auditQueue — the DoR tally', () => {
  test('splits passing from failing, and says WHICH field is missing', () => {
    const a = auditQueue([
      card(1, OLD, withDor),
      card(2, OLD, 'nothing at all'),
      card(3, OLD, '## Swimlane / governing decision doc\ndecisions/y.md'),
    ]);
    assert.equal(a.open, 3);
    assert.equal(a.pass, 1);
    assert.equal(a.failing, 2);
    assert.deepEqual(a.fail.both, [2]);
    assert.deepEqual(a.fail.acceptance, [3]); // has a swimlane, lacks the check
    assert.deepEqual(a.fail.swimlane, []);
  });

  test('pull requests are not cards — GET /issues returns them too', () => {
    const pr = { ...card(9, OLD, 'nothing'), pull_request: { url: 'x' } };
    assert.equal(auditQueue([card(1, OLD, withDor), pr]).open, 1);
  });

  test('accepts both createdAt (gh) and created_at (REST)', () => {
    const rest = { number: 5, created_at: NEW, body: 'nothing', labels: [] };
    assert.equal(auditQueue([rest]).flaggedLive, 1);
  });
});

describe('auditQueue — the counterfactual is what justifies the cutoff', () => {
  test('a legacy failing card counts age-blind but not live', () => {
    const a = auditQueue([card(1, OLD, 'nothing')]);
    assert.equal(a.flaggedLive, 0, 'grandfathered — the gate leaves it alone');
    assert.equal(a.flaggedAgeBlind, 1, 'and this is the storm the cutoff avoids');
  });

  test('a post-cutoff failing card counts in both', () => {
    const a = auditQueue([card(1, NEW, 'nothing')]);
    assert.equal(a.flaggedLive, 1);
    assert.equal(a.flaggedAgeBlind, 1);
  });

  test('a card that MEETS the DoR counts in neither, whatever its age', () => {
    const a = auditQueue([card(1, NEW, withDor), card(2, OLD, withDor)]);
    assert.equal(a.flaggedLive, 0);
    assert.equal(a.flaggedAgeBlind, 0);
  });

  test('a card filed exactly at the cutoff is judged, not spared', () => {
    assert.equal(auditQueue([card(1, DOR_CUTOFF, 'nothing')]).flaggedLive, 1);
  });
});

describe('report — the numbers a reader acts on', () => {
  test('names both replay counts and the cutoff they turn on', () => {
    const out = report(auditQueue([card(1, OLD, 'nothing'), card(2, NEW, 'nothing')]));
    assert.match(out, /open issues:\s+2/);
    assert.match(out, /fail it:\s+2/);
    assert.match(out, /flagged as it stands:\s+1/);
    assert.match(out, /flagged if age-blind:\s+2/);
    assert.match(out, new RegExp(DOR_CUTOFF));
  });
});
