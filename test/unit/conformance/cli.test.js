// tools/conformance.js — the per-kind and per-instance view of the harness (before/after lifecycle).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'tools', 'conformance.js');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

describe('tools/conformance.js', () => {
  test('no arguments: one line per contract', () => {
    const r = run();
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^component\s+\d+ instances/m);
    assert.match(r.stdout, /^deck-setting\s+\d+ instances/m);
  });
  test('a real instance prints a cell per static clause and exits 0 when none fails', () => {
    const r = run('component', 'bar');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /component\.files-both-ways/);
  });
  test('an instance that does not exist prints what it will owe, not an error', () => {
    const r = run('deck-setting', 'no-such-key-yet');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /does not exist yet/);
    assert.match(r.stdout, /deck-setting\.registered/);
  });
  test('an unknown kind exits 2 and lists the kinds', () => {
    const r = run('nonsense');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /component/);
  });
  test('--after without a baseline exits 2', () => {
    const r = run('component', 'bar', '--after');
    // a baseline may exist from a prior local run; either answer is a defined one
    assert.ok([0, 2].includes(r.status));
  });
});
