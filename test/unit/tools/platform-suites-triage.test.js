/**
 * Unit: tools/platform-suites-triage.js — which failed platform-suite jobs are the infrastructure (re-run once) and which
 * are findings (alert now). The shapes are the job records GET /actions/runs/{id}/jobs returns.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { triage, artifactFor, noSessionMarks, lines } = require(path.join(__dirname, '..', '..', '..', 'tools', 'platform-suites-triage.js'));

const ran = (name, conclusion) => ({ name, status: 'completed', conclusion, steps: [{ name: 'Suite' }], runner_name: 'GitHub Actions 1', html_url: `https://x/${name}` });

test('the job name maps to the artifact its job uploads', () => {
  assert.equal(artifactFor('ios-safari-photo (macos-26)'), 'platform-suite-ios-safari-photo-macos-26');
  assert.equal(artifactFor('plan'), null);
});

test('nothing failed: verdict none', () => {
  assert.equal(triage([ran('plan', 'success'), ran('export-confine (macos-26)', 'success')], new Set()).verdict, 'none');
});

test('a job GitHub never gave a runner is no-runner, cancelled or failed', () => {
  // The shape of the 19 red macOS jobs on pull requests (2026-11-02..04): cancelled, no steps, no runner name.
  const r = triage([{ name: 'export-confine (macos-26)', status: 'completed', conclusion: 'cancelled', steps: [], runner_name: '' }], new Set());
  assert.equal(r.verdict, 'infra');
  assert.equal(r.failed[0].kind, 'no-runner');
});

test('an iOS job with the no-session mark is no-session; without it, the same failure is a finding', () => {
  const job = ran('ios-safari-photo (macos-26)', 'failure');
  assert.equal(triage([job], new Set(['platform-suite-ios-safari-photo-macos-26'])).failed[0].kind, 'no-session');
  assert.equal(triage([job], new Set()).verdict, 'finding');
});

test('one finding among infrastructure failures makes the verdict finding: a real failure is never held for a re-run', () => {
  const r = triage(
    [ran('ios-safari-photo (macos-26)', 'failure'), ran('ios-safari-undo (macos-26)', 'failure')],
    new Set(['platform-suite-ios-safari-photo-macos-26']),
  );
  assert.equal(r.verdict, 'finding');
});

test('the reporting jobs and a job still running are not judged', () => {
  const r = triage([{ name: 'alert', status: 'in_progress', conclusion: null }, { name: 'supervise', status: 'completed', conclusion: 'failure' }], new Set());
  assert.equal(r.verdict, 'none');
});

test('a failed plan or build job is a finding', () => {
  assert.equal(triage([ran('plan', 'failure')], new Set()).verdict, 'finding');
  assert.equal(triage([ran('docs-site', 'failure')], new Set()).verdict, 'finding');
});

test('marks are read from one folder per artifact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-'));
  try {
    fs.mkdirSync(path.join(dir, 'platform-suite-ios-safari-studio-macos-26'));
    fs.writeFileSync(path.join(dir, 'platform-suite-ios-safari-studio-macos-26', 'no-session'), 'no-session\n');
    fs.mkdirSync(path.join(dir, 'platform-suite-ios-safari-jpeg-macos-26'));
    assert.deepEqual([...noSessionMarks(dir)], ['platform-suite-ios-safari-studio-macos-26']);
    assert.equal(noSessionMarks(path.join(dir, 'absent')).size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('each failed job gets a line that says what happened', () => {
  const body = lines([{ name: 'x (macos-26)', conclusion: 'cancelled', kind: 'no-runner', url: 'u' }]);
  assert.match(body, /no runner/);
});
