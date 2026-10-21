// tools/conformance.js — the per-kind and per-instance view of the harness (before/after lifecycle).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { diffCells, parseArgs, nearest } = require('../../../tools/conformance');

const CLI = path.join(__dirname, '..', '..', '..', 'tools', 'conformance.js');
const baselines = fs.mkdtempSync(path.join(os.tmpdir(), 'conformance-cli-'));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, LATTICE_CONFORMANCE_BASELINES: baselines } });
const cell = (clause, verdict) => ({ clause, verdict });

describe('diffCells: the before/after logic', () => {
  test('fail → pass is fixed; fail → fail is still failing; pass → fail is newly failing', () => {
    const d = diffCells([cell('a', 'fail'), cell('b', 'fail'), cell('c', 'pass')], [cell('a', 'pass'), cell('b', 'fail'), cell('c', 'fail')]);
    assert.deepEqual([d.fixed, d.stillFailing, d.newlyFailing].map((x) => x.map((c) => c.clause)), [['a'], ['b'], ['c']]);
  });
  test('fail → debt is moved into debt, never fixed', () => {
    const d = diffCells([cell('a', 'fail')], [cell('a', 'debt')]);
    assert.equal(d.fixed.length, 0);
    assert.equal(d.movedToDebt.length, 1);
  });
  test('debt → pass (debt paid) is fixed; pass → debt is newly failing', () => {
    assert.equal(diffCells([cell('a', 'debt')], [cell('a', 'pass')]).fixed.length, 1);
    assert.equal(diffCells([cell('a', 'pass')], [cell('a', 'debt')]).newlyFailing.length, 1);
  });
  test('an empty baseline (a new instance) counts every failing cell as owed and every passing one as fixed', () => {
    const d = diffCells([], [cell('a', 'pass'), cell('b', 'fail'), cell('c', 'n/a')]);
    assert.deepEqual([d.fixed.length, d.stillFailing.length, d.newlyFailing.length], [1, 1, 0]);
  });
});

describe('parseArgs and nearest', () => {
  test('rejects an unknown flag, both lifecycle flags together, and a lifecycle flag with no name', () => {
    assert.match(parseArgs(['component', 'bar', '--befor']).error, /unknown flag/);
    assert.match(parseArgs(['component', 'bar', '--before', '--after']).error, /itself/);
    assert.match(parseArgs(['component', '--before']).error, /need <kind> <name>/);
  });
  test('nearest finds a case or separator slip', () => {
    assert.deepEqual(nearest('Bar', ['bar', 'kpi']), ['bar']);
    assert.deepEqual(nearest('big_number', ['big-number', 'bar']), ['big-number']);
  });
});

describe('tools/conformance.js', () => {
  test('no arguments: one line per contract', () => {
    const r = run();
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^component\s+\d+ instances/m);
    assert.match(r.stdout, /^deck-setting\s+\d+ instances/m);
  });
  test('a real instance holds and says the render tier was not evaluated', () => {
    const r = run('component', 'bar');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /component\.files-both-ways/);
    assert.match(r.stdout, /render clause\(s\) NOT evaluated/);
  });
  test('a typo exits 3 with a suggestion, and does not read as a pass', () => {
    const r = run('component', 'Bar', '--after');
    assert.equal(r.status, 3);
    assert.match(r.stderr, /Did you mean: bar/);
  });
  test('--new prints what a not-yet-made thing owes, and --before saves an empty baseline that --after reads', () => {
    const r = run('deck-setting', 'no-such-key-yet', '--new', '--before');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /deck-setting\.registered/);
    assert.equal(fs.readFileSync(path.join(baselines, 'deck-setting.no-such-key-yet.json'), 'utf8').trim(), '[]');
  });
  test('--after with no baseline treats everything as owed instead of refusing', () => {
    const r = run('component', 'kpi', '--after');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no baseline/);
    assert.match(r.stdout, /since baseline:/);
  });
  test('--before then --after on an unchanged instance reports nothing fixed, failing or new', () => {
    assert.equal(run('component', 'bar', '--before').status, 0);
    const r = run('component', 'bar', '--after');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /0 fixed/);
    assert.match(r.stdout, /0 newly failing/);
  });
  test('a corrupt baseline exits 2 with a message, not a stack trace', () => {
    fs.writeFileSync(path.join(baselines, 'component.bar.json'), 'not json');
    const r = run('component', 'bar', '--after');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unreadable/);
    assert.doesNotMatch(r.stderr, /at Object|node:internal/);
  });
  test('an unknown kind and an unknown flag exit 2', () => {
    assert.equal(run('nonsense').status, 2);
    assert.equal(run('component', 'bar', '--befor').status, 2);
  });
});
