/**
 * Unit: intake-triage logic (.github/scripts/triage.js).
 *
 * The Issue triage gate is the board's universal backstop — it must label every
 * card that arrives off the form path, without spamming the ones that arrive on
 * it. These cases pin that behavior so the YAML stays a thin wire over the
 * tested core.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { computeTriage } = require(
  path.join(__dirname, '..', '..', '..', '.github', 'scripts', 'triage.js'),
);

describe('computeTriage — non-form intake (agent / API / gh / blank issue)', () => {
  test('a bare card gets the full floor + a triage flag and one comment', () => {
    const { add, remove, comment } = computeTriage({ labels: [] });
    assert.deepEqual(add, ['status:backlog', 'needs:triage']);
    assert.deepEqual(remove, []);
    assert.match(comment, /Needs triage/);
    assert.match(comment, /`area:\*`, `type:\*`, `priority:\*`/);
  });

  test('only the genuinely-missing axes are named in the comment', () => {
    const { add, comment } = computeTriage({ labels: ['area:engine', 'status:backlog'] });
    assert.deepEqual(add, ['needs:triage']);
    assert.match(comment, /missing labels: `type:\*`, `priority:\*`/);
    assert.doesNotMatch(comment, /`area:\*`/); // area is satisfied — not in the missing list
  });

  test('an existing status lane is respected — no backlog default forced', () => {
    const { add } = computeTriage({ labels: ['status:in-progress'] });
    assert.ok(!add.includes('status:backlog'), 'keeps the card in its current lane');
    assert.ok(add.includes('needs:triage'));
  });
});

describe('computeTriage — form intake must not be double-flagged', () => {
  test('form dropdown picks count as present even before the labels land', () => {
    // Apply-form-labels will materialize these; the gate must not pre-flag.
    const { add, remove, comment } = computeTriage({
      labels: ['status:backlog'],
      form: { area: 'area:docs', type: 'type:docs', priority: 'priority:low' },
    });
    assert.deepEqual(add, []);
    assert.deepEqual(remove, []);
    assert.equal(comment, null);
  });

  test('a malformed form value does not satisfy an axis', () => {
    const { add } = computeTriage({
      labels: ['status:backlog'],
      form: { area: 'docs', type: 'type:docs', priority: 'priority:low' }, // area missing the prefix
    });
    assert.deepEqual(add, ['needs:triage']);
  });
});

describe('computeTriage — idempotence + clearing', () => {
  test('a fully-labeled card is a no-op (no repeat comment)', () => {
    const r = computeTriage({
      labels: ['area:engine', 'type:feat', 'priority:high', 'status:ready'],
    });
    assert.deepEqual(r, { add: [], remove: [], comment: null });
  });

  test('an already-flagged-but-still-incomplete card does not re-comment', () => {
    const { add, remove, comment } = computeTriage({
      labels: ['status:backlog', 'needs:triage'], // area/type/priority still missing
    });
    assert.deepEqual(add, []);
    assert.deepEqual(remove, []);
    assert.equal(comment, null);
  });

  test('completing the axes clears the flag automatically', () => {
    const { add, remove, comment } = computeTriage({
      labels: ['area:engine', 'type:feat', 'priority:high', 'status:backlog', 'needs:triage'],
    });
    assert.deepEqual(add, []);
    assert.deepEqual(remove, ['needs:triage']);
    assert.equal(comment, null);
  });
});
