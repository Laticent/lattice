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
    assert.deepEqual(r, { add: [], remove: [], comment: null, sentinels: [] });
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

// ── The Definition-of-Ready arm (the intake bar) ──────────────────────────────
// dor-gate.yml checks the same two fields, but only when someone applies
// `status:ready` — a transition nobody performs. Measured 2026-09-14 across all
// 318 open cards: 100 meet the DoR, 218 do not, and every one of those 218 is
// missing the SWIMLANE. These cases pin the bar to intake, and pin the two exits
// that keep it from storming a backlog it was never meant to re-litigate.
const NEW = '2026-09-20T12:00:00Z'; // after DOR_CUTOFF
const OLD = '2026-08-01T12:00:00Z'; // before it
const AXED = ['area:infra', 'type:docs', 'priority:low', 'status:backlog'];
const DOR = { swimlane: 'engineering/decisions/x.md', acceptance: 'npm test passes' };

describe('computeTriage — the intake bar flags a card nobody could pull', () => {
  test('a new card with the axes but no DoR fields is flagged needs:definition', () => {
    const r = computeTriage({ labels: AXED, form: {}, createdAt: NEW });
    assert.deepEqual(r.add, ['needs:definition']);
    assert.match(r.comment, /Needs definition/);
    assert.match(r.comment, /Swimlane \/ governing decision doc/);
    assert.match(r.comment, /Acceptance check/);
  });

  test('the swimlane alone is not enough — the acceptance check is named too', () => {
    const r = computeTriage({ labels: AXED, form: { swimlane: 'x.md' }, createdAt: NEW });
    assert.deepEqual(r.add, ['needs:definition']);
    assert.match(r.comment, /missing \*\*an Acceptance check\*\*/);
    assert.doesNotMatch(r.comment, /missing \*\*a Swimlane/);
  });

  test('a card carrying both fields is left alone', () => {
    const r = computeTriage({ labels: AXED, form: DOR, createdAt: NEW });
    assert.deepEqual(r, { add: [], remove: [], comment: null, sentinels: [] });
  });

  test('writing the two fields clears the flag automatically', () => {
    const r = computeTriage({
      labels: [...AXED, 'needs:definition'], form: DOR, createdAt: NEW,
    });
    assert.deepEqual(r.remove, ['needs:definition']);
    assert.equal(r.comment, null);
  });

  test('an already-flagged card does not re-comment', () => {
    const r = computeTriage({
      labels: [...AXED, 'needs:definition'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(r.add, []);
    assert.equal(r.comment, null);
  });
});

describe('computeTriage — the two exits that stop a backlog storm', () => {
  test('GRANDFATHERED: a card opened before the cutoff is never flagged', () => {
    // 218 of 318 open cards fail the DoR. Flagging age-blind would comment on
    // every one as it is touched and bury the 29-card triage banner.
    const r = computeTriage({ labels: AXED, form: {}, createdAt: OLD });
    assert.deepEqual(r, { add: [], remove: [], comment: null, sentinels: [] });
  });

  test('an unknown-age card is treated as old, not as new', () => {
    // A caller that forgets createdAt must under-flag, never storm.
    const r = computeTriage({ labels: AXED, form: {} });
    assert.deepEqual(r.add, []);
  });

  test('EXEMPT: studio feedback is a bug report, not a work item', () => {
    // The reporter cannot name the decision doc their crash belongs to.
    const r = computeTriage({ labels: [...AXED, 'feedback'], form: {}, createdAt: NEW });
    assert.deepEqual(r.add, []);
    assert.equal(r.comment, null);
  });

  test('a flag stranded by an exit is cleared, not left to rot', () => {
    const r = computeTriage({
      labels: [...AXED, 'feedback', 'needs:definition'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(r.remove, ['needs:definition']);
  });
});

describe('computeTriage — a bare card gets ONE comment, not two', () => {
  test('both concerns share a single comment, and both sentinels ride with it', () => {
    const { add, comment, sentinels } = computeTriage({ labels: [], form: {}, createdAt: NEW });
    assert.deepEqual(add, ['status:backlog', 'needs:triage', 'needs:definition']);
    assert.match(comment, /Needs triage/);
    assert.match(comment, /Needs definition/);
    assert.equal(sentinels.length, 2);
    for (const s of sentinels) assert.ok(comment.includes(s), `comment must carry ${s}`);
  });

  test('only the fresh concern is explained when the other is already flagged', () => {
    const { add, comment, sentinels } = computeTriage({
      labels: ['status:backlog', 'needs:triage'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(add, ['needs:definition']);
    assert.doesNotMatch(comment, /Needs triage/);
    assert.match(comment, /Needs definition/);
    assert.deepEqual(sentinels, ['<!-- triage-gate:needs-definition -->']);
  });
});
