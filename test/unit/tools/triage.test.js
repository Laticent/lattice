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

const fs = require('node:fs');

const {
  computeTriage, freshNotices, dorApplies,
  DOR_EXEMPT_LABELS, COMMENT_SENTINEL, DEFINITION_SENTINEL,
} = require(
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
    assert.deepEqual(r, { add: [], remove: [], notices: [], comment: null, sentinels: [] });
  });

  test('an already-flagged-but-still-incomplete card re-adds no label, and freshNotices silences it', () => {
    const { add, remove, notices } = computeTriage({
      labels: ['status:backlog', 'needs:triage'], // area/type/priority still missing
    });
    assert.deepEqual(add, []);
    assert.deepEqual(remove, []);
    // The concern is still UNMET, so it is still reported; whether it gets SAID
    // again is decided against the card's comments, not against the label.
    assert.deepEqual(notices.map((n) => n.sentinel), [COMMENT_SENTINEL]);
    assert.deepEqual(freshNotices(notices, `already explained ${COMMENT_SENTINEL}`), []);
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
    assert.deepEqual(r, { add: [], remove: [], notices: [], comment: null, sentinels: [] });
  });

  test('writing the two fields clears the flag automatically', () => {
    const r = computeTriage({
      labels: [...AXED, 'needs:definition'], form: DOR, createdAt: NEW,
    });
    assert.deepEqual(r.remove, ['needs:definition']);
    assert.equal(r.comment, null);
  });

  test('an already-flagged card re-adds no label, and freshNotices silences it', () => {
    const r = computeTriage({
      labels: [...AXED, 'needs:definition'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(r.add, []);
    assert.deepEqual(freshNotices(r.notices, `said before ${DEFINITION_SENTINEL}`), []);
  });
});

describe('computeTriage — the two exits that stop a backlog storm', () => {
  test('GRANDFATHERED: a card opened before the cutoff is never flagged', () => {
    // 218 of 318 open cards fail the DoR. Flagging age-blind would comment on
    // every one as it is touched and bury the 29-card triage banner.
    const r = computeTriage({ labels: AXED, form: {}, createdAt: OLD });
    assert.deepEqual(r, { add: [], remove: [], notices: [], comment: null, sentinels: [] });
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

  test('EXEMPT: a flag stranded by the exempt exit is cleared, not left to rot', () => {
    const r = computeTriage({
      labels: [...AXED, 'feedback', 'needs:definition'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(r.remove, ['needs:definition']);
  });

  test('GRANDFATHERED: a flag a HUMAN applied to a legacy card survives the gate', () => {
    // The two exits are not interchangeable. The documented remediation for the
    // ~218 legacy cards is a deliberate labeling pass, and applying the label
    // fires `issues.labeled`, which re-enters this gate. Clearing there would
    // delete the label seconds after it was applied, silently — so the sweep
    // would produce nothing and the 📐 banner could never list a legacy card.
    const r = computeTriage({
      labels: [...AXED, 'needs:definition'], form: {}, createdAt: OLD,
    });
    assert.deepEqual(r.remove, [], 'the cutoff governs what the GATE flags, not what a human may flag');
    assert.deepEqual(r.add, []);
  });
});

describe('dorApplies — the date guard fails toward under-flagging, never toward a storm', () => {
  // The compare is lexicographic, which is exact for the `YYYY-MM-DDTHH:MM:SSZ`
  // GitHub emits and nonsense for anything else. `String(new Date(...))` is
  // "Mon Jan 01 2024…", which sorts ABOVE "2026…" — so an unchecked guard would
  // grandfather NOTHING for a caller that helpfully parsed the date first.
  const cases = [
    ['2026-09-20T12:00:00Z', true, 'a normal post-cutoff webhook value'],
    ['2026-08-01T12:00:00Z', false, 'a normal pre-cutoff webhook value'],
    ['2026-09-14T00:00:00Z', true, 'the cutoff itself is inclusive'],
    [new Date('2024-01-01T00:00:00Z'), false, 'a Date object is not a storm'],
    ['not-a-date', false, 'garbage is treated as old'],
    [1690000000000, false, 'epoch ms is treated as old'],
    [undefined, false, 'an absent value is treated as old'],
    [null, false, 'a null value is treated as old'],
    ['', false, 'an empty string is treated as old'],
  ];
  for (const [value, expected, why] of cases) {
    test(`${why}`, () => {
      assert.equal(dorApplies({ labels: [], createdAt: value }), expected);
    });
  }
});

describe('the feedback exemption is a three-file join, so pin it', () => {
  // The exemption keys on a label name that must ALSO be applied by the template
  // and created by the taxonomy. It was missing from labels.json when the bar was
  // written: `sync-labels` never creates a label absent from that file, and an
  // issue form silently drops a label that does not exist — so every Studio bug
  // reporter would have been handed a demand for a governing decision doc.
  const root = path.join(__dirname, '..', '..', '..');
  const labels = JSON.parse(fs.readFileSync(path.join(root, '.github', 'labels.json'), 'utf8'));
  const template = fs.readFileSync(
    path.join(root, '.github', 'ISSUE_TEMPLATE', 'studio-feedback.yml'), 'utf8',
  );

  for (const name of DOR_EXEMPT_LABELS) {
    test(`\`${name}\` is in the committed taxonomy, so sync:labels creates it`, () => {
      assert.ok(labels.some((l) => l.name === name), `${name} missing from .github/labels.json`);
    });
  }

  test('the studio-feedback template applies a label the exemption honors', () => {
    const applied = /^labels:\s*\[(.+)\]/m.exec(template);
    assert.ok(applied, 'studio-feedback.yml declares no labels: front-matter');
    const names = applied[1].split(',').map((t) => t.trim().replace(/^["']|["']$/g, ''));
    assert.ok(
      names.some((n) => DOR_EXEMPT_LABELS.includes(n)),
      `studio-feedback.yml applies [${names}], none of which is exempt — its reporters would be asked for a swimlane`,
    );
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

  test('only the FRESH concern is posted when the other was already explained', () => {
    // The regression this pins: posting the joined body whenever any one concern
    // went fresh repeated the other concern's explainer verbatim, so a card could
    // carry the identical "Needs triage" comment twice.
    const { notices } = computeTriage({
      labels: ['status:backlog', 'needs:triage'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(notices.map((n) => n.sentinel), [COMMENT_SENTINEL, DEFINITION_SENTINEL]);
    const fresh = freshNotices(notices, `earlier comment ${COMMENT_SENTINEL}`);
    assert.deepEqual(fresh.map((n) => n.sentinel), [DEFINITION_SENTINEL]);
    const posted = fresh.map((n) => n.body).join('\n');
    assert.match(posted, /Needs definition/);
    assert.doesNotMatch(posted, /Needs triage/);
  });

  test('a card flagged but never explained still gets its explanation', () => {
    // If a run is cancelled between the label write and the comment write, the
    // label is on the card and nothing was said. Keying dedup off the label would
    // leave it silent forever.
    const { notices } = computeTriage({
      labels: ['status:backlog', 'needs:triage', 'needs:definition'], form: {}, createdAt: NEW,
    });
    assert.deepEqual(freshNotices(notices, '').map((n) => n.sentinel), [COMMENT_SENTINEL, DEFINITION_SENTINEL]);
  });
});
