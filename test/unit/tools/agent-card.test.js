
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { renderCard, renderFleetTable, displayWidth, WIDTH } = require('../../../tools/agent-card');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES = path.join(ROOT, 'engineering', 'card-examples');
const load = (name) => YAML.parse(fs.readFileSync(path.join(EXAMPLES, `${name}.yml`), 'utf8'));

test('every shipped example renders, and no line is wider than the phone', () => {
  for (const name of ['pre-merge', 'standup', 'continuation', 'decision', 'fleet']) {
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
    ['🔴', '🟠', '🔵'],
    'cards are sorted needs-you, at-risk, review; the done item gets no card',
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
    ['CSP stage 2', 'Universal Coda audit', 'Studio presets', '· P0 plumbing', '· WP-cover', 'rename-toast test'],
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
