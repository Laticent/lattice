
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { renderCard, displayWidth, WIDTH } = require('../../../tools/agent-card');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES = path.join(ROOT, 'engineering', 'card-examples');
const load = (name) => YAML.parse(fs.readFileSync(path.join(EXAMPLES, `${name}.yml`), 'utf8'));

test('every shipped example renders, and no line is wider than the phone', () => {
  for (const name of ['pre-merge', 'standup', 'continuation', 'decision']) {
    const r = renderCard(load(name));
    assert.equal(r.ok, true, `${name}: ${r.errors.join('; ')}`);
    for (const line of r.lines) {
      assert.ok(displayWidth(line) <= WIDTH, `${name}: "${line}" is ${displayWidth(line)} columns`);
    }
    assert.ok(r.text.startsWith('```\n') && r.text.endsWith('\n```'), `${name} is fenced`);
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
