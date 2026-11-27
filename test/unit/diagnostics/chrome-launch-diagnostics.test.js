/**
 * Unit: `launchOrExplain` in test/helpers/chrome.js adds the machine's state to a failed Chrome launch,
 * and changes nothing else: one attempt, the same error object, no wait of its own (HARD RULE #33).
 *
 * Browser-free: the "puppeteer" here is a stub whose `launch` resolves or rejects on cue.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { launchOrExplain, launchDiagnostics, parsePsiAvg10, describeDescendants } = require('../../helpers/chrome.js');

const stub = (impl) => {
  const calls = [];
  return {
    calls,
    launch: async (opts) => {
      calls.push(opts);
      return impl(opts);
    },
  };
};

test('a failed launch rethrows the same error, its message followed by the diagnostics line', async () => {
  const original = new Error('Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!');
  const pp = stub(() => {
    throw original;
  });
  await assert.rejects(
    () => launchOrExplain(pp, { headless: 'new' }),
    (e) => {
      assert.equal(e, original, 'the same error object, so its stack and type survive');
      const [first, second] = e.message.split('\n');
      assert.equal(first, 'Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!');
      assert.match(second, /^launch diagnostics: waited=\d+ms /);
      return true;
    },
  );
  assert.equal(pp.calls.length, 1, 'one attempt: the helper never retries');
});

test('a successful launch returns the browser untouched and passes the options through', async () => {
  const browser = { marker: 'browser' };
  const opts = { headless: 'new', args: ['--no-sandbox'] };
  const pp = stub(() => browser);
  assert.equal(await launchOrExplain(pp, opts), browser);
  assert.deepEqual(pp.calls, [opts]);
});

test('a non-Error rejection still surfaces, with the diagnostics', async () => {
  const pp = stub(() => {
    throw 'boom';
  });
  await assert.rejects(
    () => launchOrExplain(pp, {}),
    (e) => e instanceof Error && e.message.startsWith('boom\nlaunch diagnostics: '),
  );
});

test('the diagnostics name the fields a starved launch would leave a trace in', () => {
  const line = launchDiagnostics(1234.4);
  assert.match(line, /^launch diagnostics: waited=1234ms /);
  for (const key of ['load=', 'cpus=', 'mem_free=']) assert.ok(line.includes(key), `${key} in ${line}`);
  if (process.platform === 'linux') assert.match(line, /chrome_procs=\d+/);
});

test('parsePsiAvg10 reads the `some avg10` share, and says "?" when the line is missing', () => {
  assert.equal(parsePsiAvg10('some avg10=12.30 avg60=4.00 avg300=1.00 total=99\nfull avg10=1.00 avg60=0 avg300=0 total=1\n'), '12.30%');
  assert.equal(parsePsiAvg10(''), '?');
});

test('a stalled-launch snapshot passed to launchDiagnostics is printed with when it was taken', () => {
  const line = launchDiagnostics(30000, { atMs: 20000, procs: 'chrome:D(io_schedule)' });
  assert.match(line, / at_20000ms: chrome:D\(io_schedule\)$/);
});

// ci-skip: CI runs on Linux, so it never takes this branch; it only spares a macOS or Windows laptop.
test('describeDescendants lists a child process with its kernel state', { skip: process.platform !== 'linux' && 'reads /proc' }, async () => {
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  try {
    // After 'spawn' the exec has happened, so the child's comm is `sleep`; its state is R or S.
    assert.match(describeDescendants(process.pid), /(^|,)sleep:[RS]/);
  } finally {
    child.kill('SIGKILL');
  }
});
