/**
 * Unit: the iOS Simulator suite's NEXT-DEVICE budget (docs/scripts/ios-safari/suite-budget.mjs) and its wiring in run.sh.
 *
 * Main's nightly of 2026-11-15 (run 43712612297) spent 1031 s on the iPad, started the iPhone at 1064 s, and the job was
 * cancelled at its 30-minute timeout with the iPhone's session just made. run.sh checked the deadline only before a device's
 * OWN second start, never before the next device. Now a device that would end past the deadline is not started, and the job
 * goes RED (exit 1, an `out-of-time` mark), never green and never "no test ran" (exit 3).
 *
 * The run.sh cases drive the real script on Linux with every macOS tool stubbed on PATH (xcodebuild, xcrun, safaridriver,
 * curl, ...), and run.mjs replaced by a fake that holds each device for one second. No timing is asserted: with a deadline of
 * 0 s the second device can never fit (it costs at least that one second), and with a deadline of 100 000 s it always does.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BUDGET = path.join(ROOT, 'docs', 'scripts', 'ios-safari', 'suite-budget.mjs');
const RUN_SH = path.join(ROOT, 'docs', 'scripts', 'ios-safari', 'run.sh');
const load = () => import(BUDGET);

test('a device that ends by the deadline runs', async () => {
  const { nextDevice } = await load();
  assert.equal(nextDevice({ device: 'iPhone', gone: 897, cost: 518, deadline: 1560 }).run, true);
  assert.equal(nextDevice({ device: 'iPhone', gone: 1000, cost: 560, deadline: 1560 }).run, true, 'ending exactly at the deadline fits');
});

test("main's 2026-11-15 iPhone would not have fit: refused, with the line the artifact carries", async () => {
  const { nextDevice } = await load();
  const v = nextDevice({ device: 'iPhone', gone: 1064, cost: 600, deadline: 1560 });
  assert.equal(v.run, false);
  assert.equal(v.line, 'not run: out of time: iPhone (1064 s gone, needs about 600 s, budget 1560 s)');
});

test('a number that is not one is an error, never a pass', async () => {
  const { nextDevice } = await load();
  assert.throws(() => nextDevice({ device: 'iPhone', gone: Number.NaN, cost: 1, deadline: 10 }), /--gone/);
  assert.throws(() => nextDevice({ device: 'iPhone', gone: 1, cost: -1, deadline: 10 }), /--cost/);
});

test('the command line: exit 10 and the mark appended when out of time, exit 0 and no mark when it fits, 2 on bad input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-budget-'));
  try {
    const mark = path.join(dir, 'out-of-time');
    const cli = (...args) => spawnSync(process.execPath, [BUDGET, ...args, '--mark', mark], { encoding: 'utf8' });
    const fits = cli('--device', 'iPhone', '--gone', '10', '--cost', '10', '--deadline', '100');
    assert.equal(fits.status, 0, fits.stderr);
    assert.equal(fs.existsSync(mark), false);
    const late = cli('--device', 'iPhone', '--gone', '1064', '--cost', '600', '--deadline', '1560');
    assert.equal(late.status, 10, late.stderr);
    assert.match(late.stdout, /^not run: out of time: iPhone \(1064 s gone, needs about 600 s, budget 1560 s\)$/m);
    assert.equal(fs.readFileSync(mark, 'utf8'), 'not run: out of time: iPhone (1064 s gone, needs about 600 s, budget 1560 s)\n');
    assert.equal(cli('--device', 'iPhone', '--gone', 'soon', '--cost', '1', '--deadline', '1').status, 2);
    assert.equal(cli('--gone', '1', '--cost', '1', '--deadline', '1').status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Run the real run.sh (PROBE=photo-memory, the iPad and the iPhone) in a temp folder, with macOS stubbed out. Each device's fake
 * run.mjs holds it one second and passes; with `failFirst`, the iPad's first one exits 3 (no session) instead, as the
 * 2026-11-15 iPad's first start did. Returns the exit code, the output and what landed in the artifacts.
 */
function runSuite(deadline, { failFirst = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-run-sh-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(path.join(ROOT, 'docs'), path.join(dir, 'docs'));
  const xcodeDev = path.join(dir, 'Xcode', 'Developer');
  fs.mkdirSync(path.join(xcodeDev, 'Applications', 'Simulator.app'), { recursive: true });
  const realSleep = spawnSync('bash', ['-c', 'command -v sleep'], { encoding: 'utf8' }).stdout.trim();
  const stub = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  stub('xcodebuild', "echo 'Xcode 26.5'; echo 'Build version 17F0'");
  stub('xcode-select', `echo '${xcodeDev}'`);
  stub('sudo', 'exit 0');
  stub('curl', 'exit 0');
  stub('python3', `exec '${realSleep}' 600`);
  stub('safaridriver', `exec '${realSleep}' 600`);
  stub('sleep', 'exit 0');
  stub(
    'xcrun',
    `case "$*" in
  'simctl list runtimes --json') echo '{"runtimes":[{"platform":"iOS","isAvailable":true,"version":"26.5","identifier":"rt"}]}' ;;
  'simctl list devices available --json') echo '{"devices":{"rt":[{"name":"iPad Pro","deviceTypeIdentifier":"ipad"},{"name":"iPhone 17","deviceTypeIdentifier":"iphone"}]}}' ;;
  simctl\\ create*) echo "udid-$3" ;;
esac
exit 0`,
  );
  // node: the fake run.mjs for a device, the real node for everything else (suite-budget.mjs above all).
  stub(
    'node',
    `if [ "$1" = docs/scripts/ios-safari/run.mjs ]; then
  '${realSleep}' 1
  if [ -n "$FAIL_FIRST" ] && [ "$SIM_LABEL" = iPad ] && [ ! -e "$RUNNER_TEMP/failed-once" ]; then
    : > "$RUNNER_TEMP/failed-once"; echo "$SIM_LABEL: fake no session"; exit 3
  fi
  echo "$SIM_LABEL: fake session"
  printf '{"ok":true,"steps":[],"width":1,"session":{"label":"%s"}}\\n' "$SIM_LABEL" > "$ARTIFACT_DIR/$PROBE-$SIM_LABEL.json"
  exit 0
fi
exec '${process.execPath}' "$@"`,
  );
  const summary = path.join(dir, 'summary.md');
  const r = spawnSync('bash', [RUN_SH], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PROBE: 'photo-memory', SUITE_DEADLINE: String(deadline), RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: summary, FAIL_FIRST: failFirst ? '1' : '' },
  });
  const art = path.join(dir, 'platform-suite-artifacts');
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  const out = {
    status: r.status,
    output: `${r.stdout}\n${r.stderr}`,
    outOfTime: read(path.join(art, 'out-of-time')),
    noSession: read(path.join(art, 'no-session')),
    results: fs.existsSync(path.join(art, 'ios-safari')) ? fs.readdirSync(path.join(art, 'ios-safari')).filter((f) => f.endsWith('.json')).sort() : [],
    summary: read(summary) || '',
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

test('run.sh: a device that does not fit is not started, and the job is red with the out-of-time mark (never 0, never 3)', () => {
  const r = runSuite(0);
  assert.equal(r.status, 1, r.output);
  assert.deepEqual(r.results, ['photo-memory-iPad.json'], `the iPad ran and the iPhone did not\n${r.output}`);
  assert.match(r.outOfTime ?? '', /^not run: out of time: iPhone \(\d+ s gone, needs about \d+ s, budget 0 s\)\n$/, r.output);
  assert.match(r.output, /not run: out of time: iPhone/);
  assert.equal(r.noSession, null, 'out of time is a finding, not "no probe ran"');
  assert.match(r.summary, /\| iPhone \(.*\) \| NOT RUN: out of time \|/);
});

test('run.sh: with time for both, both devices run and the job passes with no mark', () => {
  const r = runSuite(100000);
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(r.results, ['photo-memory-iPad.json', 'photo-memory-iPhone.json'], r.output);
  assert.equal(r.outOfTime, null);
  assert.match(r.output, /iPhone: starting at \d+ s; about \d+ s ends by \d+ s, inside 100000 s/);
});

/** The iPad's own time and its waste, as run.sh prints them, and the cost the next device's check was given. */
function costs(output) {
  const took = /iPad: took (\d+) s, (\d+) s of it on failed session starts/.exec(output);
  const asked = /iPhone(?: \(\d+ s gone, needs about (\d+) s|: starting at \d+ s; about (\d+) s)/.exec(output);
  assert.ok(took && asked, output);
  return { took: Number(took[1]), wasted: Number(took[2]), cost: Number(asked[1] ?? asked[2]) };
}

test('run.sh: the next device is costed WITHOUT the failed session attempts a refused second start made in place', () => {
  // Deadline 0: the iPad gets no second start, so its third attempt runs in place, as on 2026-11-15.
  const r = runSuite(0, { failFirst: true });
  assert.match(r.output, /iPad: no second start/);
  assert.match(r.output, /iPad: one more session attempt in place/);
  const c = costs(r.output);
  assert.ok(c.wasted >= 1, `the failed attempt counts as waste\n${r.output}`);
  assert.equal(c.cost, c.took - c.wasted, r.output);
  assert.equal(r.status, 1, r.output);
});

test('run.sh: the next device is costed WITHOUT a first start that a second start replaced', () => {
  const r = runSuite(100000, { failFirst: true });
  assert.match(r.output, /iPad: no session on start 1 of 2; rebooting it/);
  const c = costs(r.output);
  assert.ok(c.wasted >= 1, `the first start counts as waste\n${r.output}`);
  assert.equal(c.cost, c.took - c.wasted, r.output);
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(r.results, ['photo-memory-iPad.json', 'photo-memory-iPhone.json'], r.output);
});
