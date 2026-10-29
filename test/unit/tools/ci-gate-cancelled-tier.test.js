/**
 * The `ci` job's Verify gate, run for real: the bash in `.github/workflows/ci.yml`, with each
 * `${{ … }}` expression filled in and a stub `gh` on PATH standing in for the PR read.
 *
 * What it pins (followups 2909-p2 and 2494-p1, engineering/gotchas/ci.md): a tier `cancelled`
 * on a PR run passes only when the PR's head has moved past the run's SHA, which is what a
 * supersession by `concurrency: cancel-in-progress` looks like. A tier cancelled on the PR's
 * current head was cut off by its own timeout or by hand, ran none of its remaining tests, and
 * fails the gate. #2909's `aa0302c` went green with integration shard 3/4 hung and cancelled.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ci = YAML.parse(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
const step = ci.jobs.ci.steps.find((s) => s.name === 'Verify gate');

const RUN_SHA = 'a'.repeat(40);
const NEWER = 'b'.repeat(40);

/** Run the gate with `results` for each tier, on `event`, with the PR's head reading `head` (null: the read fails). */
function gate({ results = {}, event = 'pull_request', head = RUN_SHA }) {
  const r = { changes: 'success', lint: 'success', unit: 'success', integration: 'success', 'docs-build': 'success', 'player-webkit': 'success', ...results };
  const values = {
    'github.event_name': event,
    'github.repository': 'Laticent/lattice',
    'github.event.pull_request.number': '1',
    'github.event.pull_request.head.sha': RUN_SHA,
  };
  for (const [k, v] of Object.entries(r)) values[`needs.${k}.result`] = v;
  const script = step.run.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
    if (!(expr in values)) throw new Error(`the gate reads ${expr}, which this test does not fill in`);
    return values[expr];
  });
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-'));
  // The stub answers only the call the gate makes: the PR's head SHA.
  fs.writeFileSync(path.join(bin, 'gh'), head === null ? '#!/bin/sh\nexit 1\n' : `#!/bin/sh\necho ${head}\n`, { mode: 0o755 });
  const out = spawnSync('bash', ['-e', '-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  fs.rmSync(bin, { recursive: true, force: true });
  return { code: out.status, text: out.stdout + out.stderr };
}

test('a full green run passes', () => {
  assert.equal(gate({}).code, 0);
});

test('a skipped tier passes, a failed one fails', () => {
  assert.equal(gate({ results: { integration: 'skipped' } }).code, 0);
  assert.equal(gate({ results: { unit: 'failure' } }).code, 1);
});

test('a tier cancelled on the PR\'s current head fails: a timeout or a hand cancel', () => {
  const r = gate({ results: { integration: 'cancelled' } });
  assert.equal(r.code, 1);
  assert.match(r.text, /cancelled on the PR's current head/);
});

test('a tier cancelled because a newer push superseded the run still passes', () => {
  const r = gate({ results: { integration: 'cancelled', unit: 'cancelled' }, head: NEWER });
  assert.equal(r.code, 0);
  assert.match(r.text, /cancelled by a newer push/);
});

test('when the PR cannot be read, a cancelled tier fails closed', () => {
  const r = gate({ results: { integration: 'cancelled' }, head: null });
  assert.equal(r.code, 1);
  assert.match(r.text, /could not read the PR's head/);
});

test('in the merge queue a cancelled tier fails, without reading any PR', () => {
  const r = gate({ results: { integration: 'cancelled' }, event: 'merge_group', head: NEWER });
  assert.equal(r.code, 1);
  assert.match(r.text, /cancelled in the merge queue/);
});

test('a path filter that did not succeed fails the gate', () => {
  assert.equal(gate({ results: { changes: 'cancelled' }, head: NEWER }).code, 1);
});
