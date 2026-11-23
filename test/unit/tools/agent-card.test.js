
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { renderCard, renderFleetTable, computeMeter, displayWidth, WIDTH } = require('../../../tools/agent-card');
const renderFleet = renderCard;

const ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES = path.join(ROOT, 'engineering', 'card-examples');
const load = (name) => YAML.parse(fs.readFileSync(path.join(EXAMPLES, `${name}.yml`), 'utf8'));

test('every shipped example renders, and no line is wider than the phone', () => {
  for (const name of ['pre-merge', 'standup', 'continuation', 'decision', 'fleet', 'meter']) {
    const r = renderCard(load(name));
    assert.equal(r.ok, true, `${name}: ${r.errors.join('; ')}`);
    for (const line of r.lines) {
      assert.ok(displayWidth(line) <= WIDTH, `${name}: "${line}" is ${displayWidth(line)} columns`);
    }
    assert.ok(r.text.startsWith('```\n'), `${name} opens with a fence`);
    // A fleet board ends with its last card's link row, which must sit outside the fence.
    if (name !== 'fleet') assert.ok(r.text.endsWith('\n```'), `${name} is fenced`);
  }
});

test('pre-merge card: BOTTOM LINE first, CAPS on the pick and the confidence level', () => {
  const { lines } = renderCard(load('pre-merge'));
  assert.equal(lines[3], 'BOTTOM LINE');
  assert.ok(lines.includes('    HOLD: wait for D1; the linter will'));
  assert.ok(lines.includes('    HIGH · limited by: unknowns'));
});

test('a label sits on its own line with the value indented under it', () => {
  const { lines } = renderCard(load('pre-merge'));
  const i = lines.indexOf('  ask');
  assert.equal(lines[i + 1], '    squash-merge #2778?');
});

test('a value that needs more than two lines is rejected, not squeezed', () => {
  const card = load('pre-merge');
  card.change.what = 'word '.repeat(40).trim();
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /change\.what.*wraps to \d+ lines/);
});

test('a long branch name breaks at a dash instead of overflowing', () => {
  const r = renderCard(load('standup'));
  const i = r.lines.indexOf('  branch');
  assert.equal(r.lines[i + 1], '    claude/open-items-card-design-');
  assert.equal(r.lines[i + 2], '    5r0wqc');
});

test('raise_it may say "nothing outstanding" only when nothing was left unrun', () => {
  const card = load('pre-merge');
  card.raise_it = 'nothing outstanding';
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /nothing is left to raise.*not_run/);
  delete card.proof.not_run;
  assert.equal(renderCard(card).ok, true);
});

test('the confidence level must be one of the four', () => {
  const card = load('pre-merge');
  card.confidence.level = 'medium-high';
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /confidence\/level/);
});

test('unfilled template text is rejected', () => {
  const card = load('standup');
  card.thread.notes = '<N notes>';
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /unfilled template text/);
});

test('an unknown card type and an extra field are both rejected', () => {
  assert.equal(renderCard({ card: 'weekly' }).ok, false);
  const card = load('standup');
  card.mood = 'great';
  assert.equal(renderCard(card).ok, false);
});

test('a decision pick must name one of the options, and an empty card is refused', () => {
  const card = load('decision');
  card.decisions[0].pick = 'C';
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /not one of the options/);
  assert.equal(renderCard({ card: 'decision', subject: 'x' }).ok, false);
});

test('the decision reply hint is built from the items, so it cannot disagree with them', () => {
  const { lines } = renderCard(load('decision'));
  assert.equal(lines[1], 'reply: "D1 A, W1 keep, Q1 yes"');
});

test('the continuation card prints the agent count and keeps the standing orders inline', () => {
  const card = load('continuation');
  card.agents = 5;
  const text = renderCard(card).lines.join('\n');
  assert.match(text, /Up to 5 agents are\s+pre-approved/);
  assert.match(text, /STANDING ORDERS/);
  assert.match(text, /STOP at the merge gate/);
});

function runCli(yaml) {
  return spawnSync(process.execPath, [path.join(ROOT, 'tools', 'card.js'), '-'], {
    input: yaml,
    encoding: 'utf8',
  });
}

test('CLI: an unquoted #N reference is refused, not printed with the sentence cut off', () => {
  const card = fs
    .readFileSync(path.join(EXAMPLES, 'decision.yml'), 'utf8')
    .replace('"Merge #2778 before the generator exists?"', 'Merge #2778 before the generator exists?');
  const r = runCli(card);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /trailing # comment/);
});

test('CLI: valid YAML exits 0 and prints the fenced card; broken YAML exits 2', () => {
  const ok = runCli(fs.readFileSync(path.join(EXAMPLES, 'standup.yml'), 'utf8'));
  assert.equal(ok.status, 0);
  assert.ok(ok.stdout.startsWith('```\n📋 Standup'));
  const bad = runCli('card: standup\nthread: [\n');
  assert.equal(bad.status, 2);
});

// Regressions from the independent bug-hunt of the generator.

function standup(overrides = {}) {
  return { ...load('standup'), ...overrides };
}

test('wide (CJK) characters count two columns each and wrap inside the limit', () => {
  const r = renderCard(standup({ state: '合并完成'.repeat(6) }));
  assert.equal(r.ok, true);
  for (const line of r.lines) assert.ok(displayWidth(line) <= WIDTH, `"${line}" overflows`);
});

test('a block scalar or a blank value is refused, not flattened', () => {
  assert.equal(renderCard(standup({ state: 'one\ntwo' })).ok, false);
  assert.equal(renderCard(standup({ state: '   ' })).ok, false);
});

test('an unknown field is named in the error', () => {
  const card = load('pre-merge');
  card.change.whyy = 'typo';
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /unknown field "whyy"/);
});

test('a long title names the field at fault', () => {
  const card = load('pre-merge');
  card.title = 'a very long title that cannot fit on the header line at all';
  const r = renderCard(card);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /title: the header line is \d+ columns \(max 38\)/);
});

test('real text with angle brackets passes; the contract\'s own template text does not', () => {
  const ok = (text) => renderCard(standup({ state: text })).ok;
  assert.equal(ok('merged on claude/<slug> branch'), true);
  assert.equal(ok('fixed Map<String> handling'), true);
  assert.equal(ok('the TODO list gate is green'), true);
  assert.equal(ok('<N notes>'), false);
  assert.equal(ok('omit if none'), false);
  assert.equal(ok('merged #N'), false);
  assert.equal(ok('TODO'), false);
});

test('raise_it cannot claim nothing is left while something was not run', () => {
  for (const text of ['none, all done', 'nothing left to raise', 'n/a']) {
    const card = load('pre-merge');
    card.raise_it = text;
    assert.equal(renderCard(card).ok, false, text);
  }
});

test('inherited object keys are not card types', () => {
  assert.equal(renderCard({ card: 'constructor' }).ok, false);
  assert.equal(renderCard({ card: 'toString' }).ok, false);
});

test('a numeric sha says to quote it', () => {
  const r = renderCard(standup({ sha: 1234567 }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /quotes/);
});

test('CLI: any trailing # comment on a value is refused, not only #<digit>', () => {
  const card = fs
    .readFileSync(path.join(EXAMPLES, 'standup.yml'), 'utf8')
    .replace('state: merged,', 'state: merged # because CI;');
  const r = runCli(card);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /trailing # comment/);
});

test('CLI: a comment on its own line is fine', () => {
  const r = runCli(`# a note to the next author\n${fs.readFileSync(path.join(EXAMPLES, 'standup.yml'), 'utf8')}`);
  assert.equal(r.status, 0);
});

test('pre-merge: the maker cannot grade its own card', () => {
  for (const who of ['self', 'maker', 'me, after the gates', 'this session']) {
    const card = load('pre-merge');
    card.confidence.graded_by = who;
    const r = renderCard(card);
    assert.equal(r.ok, false, who);
    assert.match(r.errors.join('\n'), /graded_by: the maker cannot grade/);
  }
  for (const ok of ['maker-checker agent (opus)', 'checker agent, against the artifacts']) {
    const c = load('pre-merge');
    c.confidence.graded_by = ok;
    assert.equal(renderCard(c).ok, true, ok);
  }
  const card = load('pre-merge');
  delete card.confidence.graded_by;
  assert.equal(renderCard(card).ok, false, 'graded_by is required');
});

test('pre-merge: below VERY HIGH the raise loop must have run', () => {
  for (const text of ['none', 'not attempted', '0 rounds', 'skipped, ran out of time', 'nothing', 'no rounds', 'zero rounds', 'did not run']) {
    const card = load('pre-merge');
    card.raised = text;
    const r = renderCard(card);
    assert.equal(r.ok, false, text);
    assert.match(r.errors.join('\n'), /raise loop must run before the ask/);
  }
  const card = load('pre-merge');
  card.confidence.level = 'very high';
  card.raised = 'none';
  assert.equal(renderCard(card).ok, true, 'VERY HIGH needs no raise round');
});

test('pre-merge: left_behind is required and printed under RISK', () => {
  const card = load('pre-merge');
  const { lines } = renderCard(card);
  assert.equal(lines[lines.indexOf('  left behind') + 1], '    none');
  delete card.risk.left_behind;
  assert.equal(renderCard(card).ok, false);
});

test('fleet board: loudest card first, done folds into hindsight, links sit outside the fences', () => {
  const r = renderCard(load('fleet'));
  assert.equal(r.ok, true, r.errors.join('; '));
  const heads = r.text.split('\n').filter((l) => /^(🔴|🟠|🟢|🔵|✅) /u.test(l));
  assert.deepEqual(
    heads.map((h) => [...h][0]),
    ['🔴', '🟠', '🟢', '🟢'],
    'cards are sorted loudest first; Studio presets wears its 🟢 child; the done item gets no card',
  );
  assert.match(r.text, /done\n {4}rename-toast test #3306 merged/);
  // Every link is on a line outside any fence, so it can be clicked.
  let fenced = false;
  for (const line of r.text.split('\n')) {
    if (line === '```') fenced = !fenced;
    else if (line.includes('](https://')) assert.equal(fenced, false, `link inside a fence: ${line}`);
  }
  assert.match(r.text, /\[Pull Request\]\(https:\/\/github\.com\/Laticent\/lattice\/pull\/3307\) \| \[Session\]\(https:\/\/claude\.ai\/code\/session_/);
});

test('fleet board: a needs-you card must say what it needs; a bad level or link is refused', () => {
  const card = load('fleet');
  delete card.items[1].needs;
  assert.match(renderCard(card).errors.join('\n'), /needs-you card must say what it needs/);
  const bad = load('fleet');
  bad.items[1].level = 'urgent';
  bad.items[1].build = 'http://example.com';
  const errors = renderCard(bad).errors.join('\n');
  assert.match(errors, /level must be one of: needs-you, at-risk, moving, review, done/);
  assert.match(errors, /build/);
});

test('fleet board: with no actions there is no reply line, and no 🔴 says NOTHING', () => {
  const card = load('fleet');
  delete card.actions;
  card.items = card.items.filter((x) => x.level !== 'needs-you');
  const r = renderCard(card);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.doesNotMatch(r.text, /reply: go/);
  assert.match(r.text, /needs you\n {4}NOTHING/);
});

test('fleet table: a row per session, loudest first, children under their parent, done last', () => {
  const r = renderFleetTable(load('fleet'));
  assert.equal(r.ok, true, r.errors.join('; '));
  const rows = r.lines.filter((l) => /^\| (🔴|🟠|🟢|🔵|✅) \|/u.test(l));
  assert.deepEqual(
    rows.map((l) => l.split(' | ')[1].replace(/\]\(.*$/, '').replace(/\[/g, '')),
    ['CSP stage 2', 'Universal Coda audit', 'Studio presets', '· P0 plumbing', '· WP-cover', '🚢 Release desk', 'rename-toast test'],
  );
  assert.match(rows[0], /\[#3307\]\(https:\/\/github\.com\/Laticent\/lattice\/pull\/3307\) \| \[run\]\(https:\/\/github\.com\//);
  assert.match(rows[0], /\*\*needs:\*\* merge decision \|$/);
});

test('fleet table: a | in a value cannot split the row, and a non-fleet card is refused', () => {
  const card = load('fleet');
  card.items[1].state = 'ci red | lint';
  const row = renderFleetTable(card).lines.find((l) => l.includes('CSP stage 2'));
  assert.equal(row.split(/(?<!\\)\|/).length, 7, 'six cells, so seven pieces around the bars');
  // A value that already holds `\|` must not turn into `\\|` (an escaped backslash, then a bare bar).
  card.items[1].state = 'regex a\\|b';
  const tricky = renderFleetTable(card).lines.find((l) => l.includes('CSP stage 2'));
  assert.ok(tricky.includes('regex a\\\\\\|b'), tricky);
  const bars = tricky.replace(/\\./g, '').split('|').length;
  assert.equal(bars, 7, 'after dropping escape pairs, six cells remain');
  assert.match(renderFleetTable(load('standup')).errors.join(''), /only on a fleet card/);
  card.items[1].level = 'urgent';
  assert.equal(renderFleetTable(card).ok, false, 'the table shares the cards\' validation');
});

test('CLI: --table prints the fleet board as a markdown table', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'card.js'), '--table', path.join(EXAMPLES, 'fleet.yml')], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^🛰️ \*\*Fleet\*\*/u);
  assert.match(r.stdout, /\n\| \| Session \| PR \| CI \| State \|\n/);
});

// The checker's case on #3359: a 🔴 child under a ✅ or 🟢 parent must not be hidden.
const hiddenChild = () => ({
  card: 'fleet',
  as_of: 'Fri 20 Nov 21:00 UTC',
  items: [
    { level: 'moving', title: 'Busy work', state: 'building' },
    {
      level: 'done',
      title: 'Shipped parent',
      state: 'merged',
      children: [{ level: 'needs-you', title: 'Blocked child', state: 'asked a question', needs: 'answer the question' }],
    },
  ],
});

test('fleet board: a 🔴 child under a ✅ parent is counted, gets a card, and sorts first', () => {
  const r = renderFleet(hiddenChild());
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.match(r.text, /needs you\n {4}1 — the 🔴 cards below/);
  assert.doesNotMatch(r.text, /NOTHING/);
  const firstCard = r.text.split('\n\n```\n')[1];
  assert.match(firstCard, /^🔴 Shipped parent/, 'the line of work holding the 🔴 child comes first');
  assert.match(firstCard, /🔴 Blocked child\n {4}asked a question\n {4}needs you: answer the question/);
  assert.doesNotMatch(r.text, /done\n {4}Shipped parent/, 'it is not folded into hindsight');
});

test('fleet table: a 🔴 child under a ✅ parent sorts above a 🟢 row', () => {
  const rows = renderFleetTable(hiddenChild()).lines.filter((l) => /^\| (🔴|🟠|🟢|🔵|✅) \|/u.test(l));
  assert.deepEqual(rows.map((l) => [...l][2]), ['✅', '🔴', '🟢']);
  assert.match(rows[1], /\*\*needs:\*\* answer the question/);
});

test('fleet board: a needs-you child must say what it needs; brackets cannot break a table link', () => {
  const card = hiddenChild();
  delete card.items[1].children[0].needs;
  assert.match(renderFleet(card).errors.join('\n'), /children\[0\]: a needs-you session must say what it needs/);
  const t = hiddenChild();
  t.items[0].title = 'Fix ] bracket';
  t.items[0].session = 'session_abc123';
  const row = renderFleetTable(t).lines.find((l) => l.includes('bracket'));
  assert.ok(row.includes('[Fix \\] bracket](https://claude.ai/code/session_abc123)'), row);
});

test('fleet board: a card header wears its loudest session icon; a done child is listed in hindsight', () => {
  const card = hiddenChild();
  card.items[0].children = [{ level: 'done', title: 'Merged slice', pr: 42, state: 'merged' }];
  const r = renderFleet(card);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.match(r.text, /```\n🔴 Shipped parent\n/, 'the ✅ parent holding a 🔴 child shows 🔴 in its header');
  assert.match(r.text, /done\n {4}Merged slice #42 merged/);
});

test('fleet board: an optional spend line sits in BOTTOM LINE', () => {
  const card = load('fleet');
  assert.doesNotMatch(renderFleet(card).text, /\n {2}spend\n/);
  card.spend = '$41 today across 23 sessions';
  const r = renderFleet(card);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.match(r.text.split('HINDSIGHT')[0], /\n {2}spend\n {4}\$41 today across 23 sessions\n/);
});

test('fleet table: link text escapes \\ | [ ] exactly once', () => {
  const t = hiddenChild();
  t.items[0].title = 'a\\]b|c[d';
  t.items[0].session = 'session_abc123';
  const row = renderFleetTable(t).lines.find((l) => l.includes('session_abc123'));
  assert.ok(row.includes('[a\\\\\\]b\\|c\\[d](https://claude.ai/code/session_abc123)'), row);
});

// ── Completion meter (workflow.md §Desks, "Completion meter") ──────────────

/** A one-item-per-stage ledger: `stages` maps id -> stage; PR stages get a PR number. */
const ledger = (items, extra = {}) => ({ today: '2026-11-23', items, ...extra });
const PR_STAGES = new Set(['pr-open', 'green', 'queued', 'merged', 'closed']);
const item = (id, stage, more = {}) => ({
  id,
  title: `item ${id}`,
  stage,
  ...(PR_STAGES.has(stage) ? { pr: 100 + id.charCodeAt(0) } : {}),
  ...(stage === 'merged' ? { merged: '2026-11-23' } : {}),
  ...more,
});

test('meter: each stage has its weight, so one item at that stage reads that percent', () => {
  const want = { 'not-started': 0, working: 25, 'pr-open': 50, green: 75, queued: 90, merged: 100, closed: 0 };
  for (const [stage, percent] of Object.entries(want)) {
    const r = computeMeter(ledger([item('A', stage)]));
    assert.deepEqual(r.errors, [], stage);
    assert.equal(r.percent, percent, stage);
  }
});

test('meter: the percent is the mean weight, and the same ledger always gives the same line', () => {
  // 5 merged + 1 queued + 2 PR open + 1 not started = 6.9 / 9 = 76.7%
  const items = [
    ...['A', 'B', 'C', 'D', 'E'].map((id) => item(id, 'merged')),
    item('F', 'queued'),
    item('G', 'pr-open'),
    item('H', 'pr-open'),
    item('I', 'not-started'),
  ];
  const a = computeMeter(ledger(items));
  assert.equal(a.percent, 77);
  assert.equal(a.bar, '▓▓▓▓▓▓▓▓░░ 77%');
  assert.deepEqual(a.summary, ['9 items: 5 merged', '1 queued', '2 PR open', '1 not started']);
  assert.deepEqual(computeMeter(ledger(structuredClone(items))), a);
});

test('meter: the bar is full only at 100% and empty only at 0%; the percent never rounds to either', () => {
  // 1 working of 100 items is 0.25%: shows 1%, one cell, not 0% and an empty bar.
  const low = computeMeter(ledger([item('A0', 'working'), ...Array.from({ length: 99 }, (_, i) => item(`N${i}`, 'not-started'))]));
  assert.equal(low.bar, '▓░░░░░░░░░ 1%');
  // 99 merged + 1 queued is 99.9%: shows 99% and nine cells, not a finished bar.
  const high = computeMeter(ledger([item('Q', 'queued'), ...Array.from({ length: 99 }, (_, i) => item(`M${i}`, 'merged'))]));
  assert.equal(high.bar, '▓▓▓▓▓▓▓▓▓░ 99%');
  // Plain rounding in between: 3 of 4 merged is 75% and 8 cells (7.5 rounds up).
  const mid = computeMeter(ledger([item('A', 'merged'), item('B', 'merged'), item('C', 'merged'), item('D', 'not-started')]));
  assert.equal(mid.bar, '▓▓▓▓▓▓▓▓░░ 75%');
  assert.equal(computeMeter(ledger([item('A', 'merged')])).bar, '▓▓▓▓▓▓▓▓▓▓ 100%');
  assert.equal(computeMeter(ledger([item('A', 'not-started')])).bar, '░░░░░░░░░░ 0%');
});

test('meter: a closed PR counts 1 only when it is dropped with a reason', () => {
  const kept = computeMeter(ledger([item('A', 'closed'), item('B', 'merged')]));
  assert.equal(kept.percent, 50);
  assert.deepEqual(kept.summary, ['2 items: 1 merged', '1 closed']);
  const dropped = computeMeter(ledger([item('A', 'closed', { dropped: 'superseded by #3400' }), item('B', 'merged')]));
  assert.equal(dropped.percent, 100);
  assert.deepEqual(dropped.summary, ['2 items: 1 merged', '1 dropped']);
  assert.equal(dropped.estimate, 'all done');
  // Only a closed PR can be dropped.
  const r = computeMeter(ledger([item('A', 'working', { dropped: 'cut' })]));
  assert.match(r.errors.join('\n'), /only a PR closed without merging can be dropped/);
});

test('meter: an empty ledger has no percent and no estimate, and still renders', () => {
  const r = computeMeter(ledger([]));
  assert.deepEqual(r.errors, []);
  assert.equal(r.percent, null);
  assert.equal(r.bar, '░░░░░░░░░░ no items');
  assert.deepEqual(r.summary, ['0 items']);
  assert.equal(r.estimate, 'no estimate: the ledger is empty');
  const card = renderCard({ card: 'meter', title: '📚 Docs desk', meter: ledger([]) });
  assert.equal(card.ok, true, card.errors.join('; '));
  assert.equal(card.lines[0], '📚 Docs desk  ░░░░░░░░░░ no items');
});

test('meter: "+N new" counts ids the previous report did not have, and a drop says why', () => {
  const items = [item('A', 'merged'), item('B', 'merged'), item('C', 'not-started'), item('D', 'not-started')];
  // The last report knew A and B (100%); C and D are new, so the drop is scope growth.
  const grew = computeMeter(ledger(items, { previous: { date: '2026-11-22', percent: 100, ids: ['A', 'B'] } }));
  assert.equal(grew.percent, 50);
  assert.deepEqual(grew.scope, ['down from 100%: +2 new since yesterday']);
  // Same-day report: "today". No drop: just the count.
  const same = computeMeter(ledger(items, { previous: { date: '2026-11-23', percent: 40, ids: ['A', 'B', 'C'] } }));
  assert.deepEqual(same.scope, ['+1 new today']);
  // Nothing new, yet lower: an old item went back (a PR went red), and the line says so.
  const back = computeMeter(ledger(items, { previous: { date: '2026-11-20', percent: 60, ids: ['A', 'B', 'C', 'D', 'E'] } }));
  assert.deepEqual(back.scope, ['down from 60%: an item went back a stage or left', '1 removed']);
  // An older report is named by its weekday, a far one by its date.
  const far = computeMeter(ledger(items, { previous: { date: '2026-11-02', percent: 10, ids: ['A'] } }));
  assert.deepEqual(far.scope, ['+3 new since Mon Nov 2']);
});

test('meter: the finish estimate uses merges per day over the last 2 days of merge history', () => {
  const open = (n) => Array.from({ length: n }, (_, i) => item(`P${i}`, 'pr-open'));
  // 0 days of merges: no estimate.
  assert.equal(computeMeter(ledger(open(3))).estimate, 'no estimate: no merges yet');
  // 1 day of history (both merged today): 2/day; 3 left -> 2 days -> Wed (today is Mon 2026-11-23).
  const one = computeMeter(ledger([item('A', 'merged'), item('B', 'merged'), ...open(3)]));
  assert.equal(one.estimate, '~2 merges/day → done Wed');
  // 2+ days: only the last 2 count. 1 yesterday + 2 today = 1.5/day; 3 left -> 2 days.
  const two = computeMeter(
    ledger([
      item('A', 'merged', { merged: '2026-11-10' }),
      item('B', 'merged', { merged: '2026-11-22' }),
      item('C', 'merged'),
      item('D', 'merged'),
      ...open(3),
    ]),
  );
  assert.equal(two.estimate, '~1.5 merges/day → done Wed');
  // One merge in 2 days, 9 left: 18 days out, so the date is written out.
  const slow = computeMeter(ledger([item('A', 'merged', { merged: '2026-11-22' }), ...open(9)]));
  assert.equal(slow.estimate, '~0.5 merges/day → done Fri Dec 11');
  // Merges exist, but none in the last 2 days: stalled.
  const stalled = computeMeter(ledger([item('A', 'merged', { merged: '2026-11-15' }), ...open(1)]));
  assert.equal(stalled.estimate, 'no estimate: no merges in 2 days');
});

test('meter: a PR item takes its stage from GitHub; a merged item needs its date', () => {
  const errs = (x) => computeMeter(ledger([x])).errors.join('\n');
  assert.match(errs({ id: 'A', title: 't', pr: 12, stage: 'working' }), /#12 exists, so its stage comes from GitHub/);
  assert.match(errs({ id: 'A', title: 't', stage: 'queued' }), /stage "queued" belongs to a PR/);
  assert.match(errs({ id: 'A', title: 't', pr: 12, stage: 'merged' }), /needs its merged date/);
  assert.match(errs({ id: 'A', title: 't', pr: 12, stage: 'merged', merged: '2026-11-30' }), /after today/);
  assert.match(errs({ id: 'A', title: 't', pr: 12, stage: 'merged', merged: '2026-02-30' }), /not a real date/);
  assert.match(errs(item('A', 'merged', { blocking: true })), /a finished item cannot be blocking/);
  assert.match(computeMeter(ledger([item('A', 'working'), item('A', 'merged')])).errors.join('\n'), /used twice/);
  // Schema: an unknown stage is refused by name, through the card.
  const r = renderCard({ card: 'meter', title: 'x', meter: ledger([{ id: 'A', title: 't', stage: 'done' }]) });
  assert.match(r.errors.join('\n'), /stage must be one of: not-started, working, pr-open, green, queued, merged, closed/);
});

test('meter card: the header carries the bar; counts and the scope line never split mid-count', () => {
  const r = renderCard(load('meter'));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.lines[0], '🚢 Release 1.0.0  ▓▓▓▓▓▓▓▓░░ 77%');
  assert.deepEqual(r.lines.slice(1, 6), [
    '   9 items: 5 merged · 1 queued ·',
    '     2 PR open · 1 not started',
    '   down from 85%: +2 new today ·',
    '     ~2 merges/day → done Wed',
    '   blocking: B9 Segno rename',
  ]);
  assert.ok(r.lines.includes('  B9 · not started · Segno rename'));
});

test('fleet board: a desk with a meter shows it in its card and in the table row', () => {
  const card = load('fleet');
  const r = renderCard(card);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.match(r.text, /METER\n {2}▓▓▓▓▓▓▓▓░░ 81%\n {2}7 items: 3 merged · 1 dropped ·\n/);
  assert.match(r.text, /blocking: B7 Segno rename/);
  const t = renderFleetTable(card);
  assert.match(t.text, /\| `▓▓▓▓▓▓▓▓░░ 81%` 7 items: 3 merged · 1 dropped · 1 queued · 1 green · 1 not started · dry run queued/);
  // A bad ledger on a fleet item names the item.
  card.items[4].meter.items[0].stage = 'working';
  assert.match(renderCard(card).errors.join('\n'), /items\[4\]\.meter\.items\[0\]: #3390 exists/);
});
