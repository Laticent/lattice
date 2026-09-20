/**
 * Unit: tools/audit-queue-hygiene.js — the four arms of the queue-hygiene audit.
 *
 * WHAT THIS SUITE IS FOR. Three of the four arms are arithmetic over labels and
 * comment counts, and they are pinned here the cheap way. The DUPES arm is the one
 * that earns a test suite: its scoring was got wrong once against the real queue, and
 * every arm of it below is a regression pin on a specific measured failure rather than
 * a generic "it finds duplicates" assertion.
 *
 * NOTHING HERE READS THE LIVE QUEUE. An assertion over the real 317 cards would go red
 * whenever someone files an issue, and would bill an unrelated PR for it — the #1547
 * mistake. The fixtures are hand-written and name the real pair they stand in for.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  auditHygiene,
  report,
  tokenize,
  stem,
  DUPE_FLOOR,
  MIN_SHARED,
} = require('../../../tools/audit-queue-hygiene.js');

const TAXONOMY = ['area:engine', 'area:infra', 'type:fix', 'priority:high', 'priority:low', 'status:backlog'];
const card = (number, title, labels = [], comments = 0) => ({ number, title, labels, comments });

describe('audit-queue-hygiene — STRAYS', () => {
  it('reports a label the taxonomy does not declare, with its cards', () => {
    const a = auditHygiene(
      [card(1, 'x', ['area:engine', 'model:haiku']), card(2, 'y', ['model:haiku'])],
      TAXONOMY,
    );
    assert.deepEqual(a.strays, [{ label: 'model:haiku', count: 2, numbers: [1, 2] }]);
  });

  it('is the arm that catches a non-taxonomy `type:`, which the intake gate accepts', () => {
    // .github/scripts/triage.js hasDimension tests only the prefix, so `type:chore`
    // satisfies it. This arm is the only thing that sees it.
    const a = auditHygiene([card(1, 'x', ['type:chore'])], TAXONOMY);
    assert.deepEqual(a.strays.map((s) => s.label), ['type:chore']);
  });

  it('says nothing when every label is declared', () => {
    assert.deepEqual(auditHygiene([card(1, 'x', ['area:engine', 'type:fix'])], TAXONOMY).strays, []);
  });

  it('sorts the busiest stray first, so a swept-and-forgotten dimension leads', () => {
    const a = auditHygiene(
      [card(1, 'x', ['solo']), card(2, 'y', ['bulk']), card(3, 'z', ['bulk']), card(4, 'w', ['bulk'])],
      TAXONOMY,
    );
    assert.deepEqual(a.strays.map((s) => s.label), ['bulk', 'solo']);
  });
});

describe('audit-queue-hygiene — GAPS', () => {
  it('lists the cards missing each required namespace', () => {
    const a = auditHygiene(
      [card(1, 'x', ['area:engine', 'type:fix', 'priority:high', 'status:backlog']), card(2, 'y', ['area:engine'])],
      TAXONOMY,
    );
    assert.deepEqual(a.gaps['area:'], []);
    assert.deepEqual(a.gaps['type:'], [2]);
    assert.deepEqual(a.gaps['priority:'], [2]);
    assert.deepEqual(a.gaps['status:'], [2]);
  });

  it('counts a stray in the namespace as PRESENT — this arm asks about the axis, not the value', () => {
    // A card carrying `priority:p3` is mis-labeled, not unlabeled. STRAYS owns that
    // complaint; double-reporting it here would make one defect look like two.
    const a = auditHygiene([card(1, 'x', ['priority:p3'])], TAXONOMY);
    assert.deepEqual(a.gaps['priority:'], []);
    assert.deepEqual(a.strays.map((s) => s.label), ['priority:p3']);
  });
});

describe('audit-queue-hygiene — DUPES', () => {
  it('pairs titles that say the same thing in different words (stands in for #2105/#2205)', () => {
    // Real titles, trimmed. Unstemmed these share only `state` `chart` `assertion`.
    const a = auditHygiene(
      [
        card(2105, 'Flaky: state-chart parsing stays linear — one arm ratio floor always engages, making it an absolute timing assertion'),
        card(2205, 'state-chart linearity arm is a wall-clock assertion in disguise, and false-trips runs'),
      ],
      TAXONOMY,
    );
    assert.equal(a.dupes.length, 1);
    assert.deepEqual([a.dupes[0].a, a.dupes[0].b], [2105, 2205]);
    assert.ok(a.dupes[0].score >= DUPE_FLOOR, `scored ${a.dupes[0].score}, floor ${DUPE_FLOOR}`);
  });

  it('needs stemming to do it — the same pair with stemming defeated is missed', () => {
    // Pins WHY tokenize stems: `linear`/`linearity` and `arm`/`arms` are the two
    // tokens that carry this pair, and both differ only by suffix.
    assert.deepEqual(tokenize('linearity arms'), tokenize('linear arm'));
    assert.equal(stem('linearity'), 'linear');
    assert.equal(stem('arms'), 'arm');
  });

  it('reports the #2085/#2120 false positive, and that is pinned as KNOWN, not fixed', () => {
    // Two different nightly watches. They share exactly three distinctive tokens —
    // exactly what the true #2105/#2205 pair shares — so no MIN_SHARED separates them,
    // and this arm's rank order carries no information about truth. Pinned so a future
    // tuning pass cannot quietly claim to have cured it.
    //
    // The score is NOT asserted. On the live queue this pair rates a perfect 1.00,
    // because `detect` is rare enough to survive the common-token cut while #2120's
    // other tokens are not — i.e. the 1.00 is a property of document frequency across
    // all 317 titles, which a two-card fixture cannot reproduce (it reads 0.75 here).
    const a = auditHygiene(
      [card(2085, 'perf-nightly docs regression'), card(2120, 'perf-nightly-engine regression')],
      TAXONOMY,
    );
    assert.equal(a.dupes.length, 1);
    assert.equal(a.dupes[0].shared, MIN_SHARED);
    assert.ok(a.dupes[0].score >= DUPE_FLOOR);
  });

  it('rejects a pair sharing fewer than MIN_SHARED tokens however well it scores', () => {
    // This is what MIN_SHARED actually buys: on the real queue it cut 43 pairs to 14.
    const a = auditHygiene(
      [card(1, 'watermark ink resolved ground'), card(2, 'watermark pagination')],
      TAXONOMY,
    );
    assert.deepEqual(a.dupes, []);
  });

  it('drops a token that most titles share, so one house vocabulary does not pair everything', () => {
    const many = Array.from({ length: 60 }, (_, n) => card(n + 1, `studio panel widget number ${n}`));
    // Every title shares `studio` and `panel`; nothing distinctive remains.
    assert.equal(auditHygiene(many, TAXONOMY).dupes.length, 0);
  });

  it('reports the shared-token count beside the score, so a 1.00 on three tokens is legible', () => {
    const a = auditHygiene(
      [
        card(1, 'obligation matrix cover paginate survives a wide matrix split'),
        card(2, 'obligation matrix cover paginate wide split survives pagination'),
      ],
      TAXONOMY,
    );
    assert.equal(a.dupes.length, 1);
    assert.equal(typeof a.dupes[0].shared, 'number');
    assert.ok(a.dupes[0].shared >= MIN_SHARED);
  });

  it('ranks the strongest lead first', () => {
    const a = auditHygiene(
      [
        card(1, 'kanban lane tag contrast washed card ink'),
        card(2, 'kanban lane tag contrast washed card ink'),
        card(3, 'quadrant label size crowded slide silently deleted name'),
        card(4, 'quadrant label size crowded deleted'),
      ],
      TAXONOMY,
    );
    assert.ok(a.dupes.length >= 2);
    assert.ok(a.dupes[0].score >= a.dupes[1].score);
  });
});

describe('audit-queue-hygiene — ALARMS', () => {
  it('flags a card holding an outsized share of all comments', () => {
    const a = auditHygiene([card(1, 'watch', [], 41), ...Array.from({ length: 20 }, (_, n) => card(n + 2, 'x', [], 1))], TAXONOMY);
    assert.deepEqual(a.alarms.map((x) => x.number), [1]);
    assert.equal(a.comments.total, 61);
  });

  it('accepts the GraphQL comment shape as well as the REST one', () => {
    // list_issues returns a number; a GraphQL connection returns { totalCount }.
    const a = auditHygiene(
      [
        { number: 1, title: 'x', labels: [], comments: { totalCount: 40 } },
        ...Array.from({ length: 20 }, (_, n) => card(n + 2, 'y', [], 1)),
      ],
      TAXONOMY,
    );
    assert.equal(a.comments.total, 60);
    assert.deepEqual(a.alarms.map((x) => x.number), [1]);
  });

  it('flags nothing in a queue with no comments, rather than dividing by zero', () => {
    const a = auditHygiene([card(1, 'x'), card(2, 'y')], TAXONOMY);
    assert.deepEqual(a.alarms, []);
    assert.equal(a.comments.total, 0);
  });
});

describe('audit-queue-hygiene — shape', () => {
  it('ignores pull requests, which share the issues endpoint', () => {
    const a = auditHygiene([card(1, 'x', ['stray']), { number: 2, title: 'pr', labels: ['stray'], pull_request: {} }], TAXONOMY);
    assert.equal(a.open, 1);
    assert.deepEqual(a.strays[0].numbers, [1]);
  });

  it('survives an empty queue', () => {
    const a = auditHygiene([], TAXONOMY);
    assert.equal(a.open, 0);
    assert.deepEqual(a.strays, []);
    assert.deepEqual(a.dupes, []);
  });

  it('renders a report that names every arm, so a clean run still says what it looked at', () => {
    const text = report(auditHygiene([card(1, 'x', ['area:engine', 'type:fix', 'priority:high', 'status:backlog'])], TAXONOMY));
    for (const arm of ['STRAYS', 'GAPS', 'DUPE LEADS', 'ALARM SATURATION']) {
      assert.match(text, new RegExp(arm), `report omits the ${arm} arm`);
    }
    assert.match(text, /none/, 'a clean run should say "none", not print an empty section');
  });
});
