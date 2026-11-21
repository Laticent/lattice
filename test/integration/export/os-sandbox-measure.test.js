/**
 * Integration: the OS sandbox layer is MEASURED on every platform the code door runs on (threat-model
 * note engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 decision 13, owner 2026-10-19).
 * Linux reads each renderer's seccomp mode, macOS asks `sandbox_check` for each renderer pid, and
 * Windows reads Chromium's `chrome://sandbox` page (lib/core/os-sandbox.js `rendererSandboxed`).
 *
 *   MEASURED  launchCodeSandbox's layer is never `unmeasured`; on macOS and Windows, whose CI runners
 *             start Chromium's sandbox, it reads `on`. (A Linux runner may read OFF: Ubuntu 24.04's
 *             AppArmor blocks it. That is a real reading, and the per-PR CI is that runner.)
 *   CONTROL   the same probe on a browser started with `--no-sandbox` reads `false`, so a probe that
 *             cannot see a missing sandbox fails here instead of reading `on` everywhere.
 *
 * Runs in the per-PR integration tier on Linux, and on real macOS and Windows runners as the
 * `os-sandbox-measure` platform suite (.github/platform-suites.json). When a reading fails, the
 * assertion prints what the probe saw, which is how a new Chromium's page or process layout shows up.
 *
 * Needs Chromium.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { launchCodeSandbox, rendererSandboxed } = require('../../../lib/core/os-sandbox.js');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');

const TIMEOUT = 180000;
const CHROME = process.env.CHROME_PATH || undefined;

test(`MEASURED: the code sandbox's OS layer is read, not assumed, on ${process.platform}`, { timeout: TIMEOUT }, async () => {
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath: CHROME });
  try {
    const { layer } = sandbox;
    const diag = {};
    // Read again with the diagnostics on, so a failure says what the probe saw.
    // Read again with the diagnostics on, OFF included: when the launch itself measured OFF, this is what shows why.
    const again = await rendererSandboxed(sandbox.browser, sandbox.pid, process.platform, diag);
    assert.notEqual(layer.os, 'unmeasured', `the layer could not be measured here: ${layer.summary}; the probe saw ${JSON.stringify(diag.seen ?? [])}`);
    if (process.platform === 'darwin' || process.platform === 'win32') {
      assert.equal(layer.os, 'on', `${process.platform} runs Chromium's sandbox, and the layer read ${layer.os}: ${layer.summary}; tried ${layer.tried.join('; ')}; the probe saw ${JSON.stringify(diag.seen ?? [])}`);
      assert.equal(again, true, `the second read did not agree: the probe saw ${JSON.stringify(diag.seen ?? [])}`);
    }
  } finally {
    await sandbox.close();
  }
});

test(`CONTROL: on ${process.platform}, a browser started without the sandbox reads false`, { timeout: TIMEOUT }, async () => {
  const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const diag = {};
    const on = await rendererSandboxed(browser, browser.process()?.pid, process.platform, diag);
    assert.equal(on, false, `the probe did not see the missing sandbox; it saw ${JSON.stringify(diag.seen ?? [])}`);
  } finally {
    await browser.close();
  }
});

// HELD PROFILE: the profile removal survives a file Windows still holds (#3276). On Windows, Chromium's helper
// processes can hold `Default/Cache/Cache_Data/sqldb0` for a moment after the browser exits, and a single
// `fs.rmSync` threw EBUSY (platform-suites run 44011046237). Here a PowerShell child opens that file with no sharing,
// the way Chromium's cache does, says `locked`, and holds it until the test writes `go`; it then lets go 1.5 s later.
// While it holds the file, a bare `rmSync` must fail, which proves the lock is real; that check does not race the
// clock, because the holder waits for `go`. `removeProfile` then runs while the file is still held and must outlast
// the 1.5 s inside its ~5.5 s retry budget. Only Windows can hold a file against deletion, so elsewhere this checks
// only that the folder goes.
test(`HELD PROFILE: removeProfile outlasts a file held open on ${process.platform}`, { timeout: TIMEOUT }, async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawn } = require('node:child_process');
  const { removeProfile } = require('../../../lib/core/os-sandbox.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  const file = path.join(dir, 'Default', 'Cache', 'Cache_Data', 'sqldb0');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'cache');
  if (process.platform !== 'win32') {
    removeProfile(dir);
    assert.equal(fs.existsSync(dir), false);
    return;
  }
  const script = `$f = [System.IO.File]::Open($env:HELD, 'Open', 'ReadWrite', 'None'); [Console]::Out.WriteLine('locked'); [Console]::Out.Flush(); [void][Console]::In.ReadLine(); Start-Sleep -Milliseconds 1500; $f.Close()`;
  const holder = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, HELD: file }, stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => holder.once('exit', resolve));
  // The signal, not a duration: go on once the child says it holds the file.
  await new Promise((resolve, reject) => {
    let out = '';
    holder.stdout.on('data', (d) => {
      out += d;
      if (out.includes('locked')) resolve();
    });
    holder.once('exit', (code) => reject(new Error(`the holder exited (${code}) before it locked the file`)));
  });
  try {
    assert.throws(() => fs.rmSync(dir, { recursive: true, force: true }), (e) => ['EBUSY', 'EPERM'].includes(e.code), 'a bare rmSync removed a folder whose file is held: the lock is not real, so this test proves nothing');
    // `go` must reach the holder before removeProfile blocks the event loop, so wait for the write to flush.
    await new Promise((resolve) => holder.stdin.write('go\n', resolve));
    removeProfile(dir);
    assert.equal(fs.existsSync(dir), false, 'removeProfile left the folder behind');
  } finally {
    holder.stdin.end();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

// REAPED: the host's `reap()` leaves no browser and no profile behind (followups.d/3276-p4). Two arms, both through the
// real code sandbox and the state file the worker writes:
//   KILLED WORKER  the fixture worker (test/fixtures/code-door-reap-worker.js) launches the sandbox the way
//                  lib/packages/code-door-worker.js does, opens a page and says `ready`; the test SIGKILLs it, as the
//                  host's spawnSync timeout does, then reaps. On windows-2025 the worker's job object already ends the
//                  browser (0 of 9 processes left), so there `reap()` finds only a stale pid, which it must not kill.
//   LIVE BROWSER   the browser is still running when `reap()` reads the state file, so on Windows `reap()` itself must
//                  end it, helpers included. (#3310's failing arm ran main's kill by pid through both arms on
//                  windows-2025 and macos-26, run 44445163876: nothing was left either, since Chromium ends its own
//                  helpers once the main process dies. These arms pin that outcome, whichever mechanism delivers it.)
// Each arm asserts that the profile folder is gone and that no process names it on its command line. It prints how
// many processes named the profile before, and the `lattice-code-sandbox-*` listing of the temp folder. The suite's
// `node --test` runs its files in parallel, so a folder in that listing can be another file's browser still running.
const reapHarness = () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  /** The pids whose command line names `name` (Chromium copies `--user-data-dir` to its helpers). */
  const processesUsing = (name) => {
    if (process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%${name}%'" | Where-Object { $_.ProcessId -ne $PID } | ForEach-Object { $_.ProcessId }`;
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 60000 }).split(/\s+/).filter(Boolean).map(Number);
    }
    return execFileSync('ps', ['-A', '-o', 'pid=,stat=,args='], { encoding: 'utf8', timeout: 10000 })
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/))
      .filter((m) => m && !m[2].startsWith('Z') && m[3].includes(name))
      .map((m) => Number(m[1]));
  };
  // A killed process can still be listed for a moment while the kernel tears it down (F3, read once too early). So
  // await the state, then assert: read the list again until it is empty or the reads run out. Each read is a whole
  // `ps` or PowerShell run; no sleep sits between them.
  const processesLeft = (name, reads = process.platform === 'win32' ? 20 : 200) => {
    let left = processesUsing(name);
    for (let i = 1; i < reads && left.length; i++) left = processesUsing(name);
    return left;
  };
  const sandboxFolders = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('lattice-code-sandbox-'));
  return { fs, os, path, processesUsing, processesLeft, sandboxFolders };
};

/** Reap `scratch`, whose state file names `dir`, and assert that nothing of the browser is left. */
const reapAndCheck = (t, scratch, dir, before) => {
  const { fs, os, path, processesUsing, processesLeft, sandboxFolders } = reapHarness();
  const { reap } = require('../../../lib/cli/code-door.js');
  const ended = reap(scratch);
  // Which path ended the browser. On Windows it must be the sweep by profile name: a pass by the pid fallback, or by
  // Chromium's own cleanup, would look the same in the process list below (#3310's grader).
  t.diagnostic(`reap ended the browser by: ${JSON.stringify(ended)}`);
  assert.deepEqual(ended, [process.platform === 'win32' ? 'sweep' : 'group'], 'reap did not end the browser the way this platform should');
  // What reap itself ended, before any helper has had time to exit on its own.
  t.diagnostic(`processes naming the profile at the first read after reap: ${processesUsing(path.basename(dir)).length}`);
  t.diagnostic(`lattice-code-sandbox-* in ${os.tmpdir()} after reap: ${JSON.stringify(sandboxFolders())}`);
  assert.equal(fs.existsSync(dir), false, `reap left the profile ${dir} behind`);
  assert.deepEqual(processesLeft(path.basename(dir)), [], `a browser process still names the profile after reap (of ${before} before)`);
  assert.equal(fs.existsSync(scratch), false, 'reap left its scratch folder behind');
};

/**
 * Start the fixture worker, wait for its `ready`, and read the profile it launched. Every arm drives the browser
 * through this separate process, so no puppeteer connection lives in the test process: one to a browser `reap()` has
 * killed can keep the file's process from exiting.
 */
const startWorker = async () => {
  const { fs, os, path, processesUsing } = reapHarness();
  const { spawn } = require('node:child_process');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-door-'));
  const state = path.join(scratch, 'state.json');
  const worker = spawn(process.execPath, [path.join(__dirname, '../../fixtures/code-door-reap-worker.js'), state], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => worker.once('exit', resolve));
  const stop = async () => {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL');
    await exited;
  };
  try {
    // The signal, not a duration: go on once the worker says its page is open.
    await new Promise((resolve, reject) => {
      let out = '';
      worker.stdout.on('data', (d) => {
        out += d;
        if (out.includes('ready')) resolve();
        else if (out.includes('fatal')) reject(new Error(`the worker could not launch the sandbox: ${out.trim()}`));
      });
      worker.once('exit', (code) => reject(new Error(`the worker exited (${code}) before it was ready`)));
    });
  } catch (e) {
    await stop();
    fs.rmSync(scratch, { recursive: true, force: true });
    throw e;
  }
  const { dir } = JSON.parse(fs.readFileSync(state, 'utf8')).at(-1);
  const before = processesUsing(path.basename(dir)).length;
  const cleanup = async () => {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    fs.rmSync(scratch, { recursive: true, force: true });
  };
  return { worker, stop, cleanup, scratch, dir, before };
};

test(`REAPED, KILLED WORKER: a worker killed mid-render leaves no browser or profile on ${process.platform}`, { timeout: TIMEOUT }, async (t) => {
  const { os, path, processesUsing, sandboxFolders } = reapHarness();
  t.diagnostic(`lattice-code-sandbox-* in ${os.tmpdir()} before this test: ${JSON.stringify(sandboxFolders())}`);
  const w = await startWorker();
  try {
    assert.ok(w.before >= 2, `a browser with helpers should name its profile on 2 or more command lines, and ${w.before} did`);
    await w.stop();
    t.diagnostic(`processes naming the profile before the kill: ${w.before}; after the worker died, before reap: ${processesUsing(path.basename(w.dir)).length}`);
    reapAndCheck(t, w.scratch, w.dir, w.before);
  } finally {
    await w.cleanup();
  }
});

test(`REAPED, LIVE BROWSER: reap ends a running browser and all its helpers on ${process.platform}`, { timeout: TIMEOUT }, async (t) => {
  const w = await startWorker();
  try {
    assert.ok(w.before >= 2, `a browser with helpers should name its profile on 2 or more command lines, and ${w.before} did`);
    t.diagnostic(`processes naming the profile before reap, browser running: ${w.before}`);
    // The worker is still alive, so the browser is too: `reap()` itself must end it.
    reapAndCheck(t, w.scratch, w.dir, w.before);
  } finally {
    await w.cleanup();
  }
});

// REAPED, STALE PID: on Windows `reap()` never kills by the pid in the state file. When the worker is killed, its job
// object has usually ended the browser already (the KILLED WORKER arm reads 0 processes left), so that pid may now
// belong to another program. Here an unrelated live process sits in the state file under the browser's pid, beside a
// profile folder no process names. On Windows the sweep finds nothing and the bystander must still answer a ping;
// main's reap before #3310 killed it (the failing arm in #3310's body). Off Windows the browser leads its own process
// group and outlives the worker, so its pid is not stale there; `reap()` kills by pid as before, and this arm checks
// only that it still does. Alive or dead is read from the process itself: it answers `pong`, or its pipe closes.
test(`REAPED, STALE PID: reap kills no process by a stale pid on ${process.platform}`, { timeout: TIMEOUT }, async (t) => {
  const { fs, os, path } = reapHarness();
  const { spawn } = require('node:child_process');
  const { reap } = require('../../../lib/cli/code-door.js');
  const bystander = spawn(process.execPath, ['-e', "process.stdin.on('data', () => process.stdout.write('pong\\n'))"], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => bystander.once('exit', () => resolve('exited')));
  // A ping to a process that is gone fails with EPIPE; the answer then comes from its `exit`, not from the write.
  bystander.stdin.on('error', () => {});
  /** `pong` if the process answers, `exited` if it is gone: whichever the process itself says first. */
  const ping = () =>
    Promise.race([
      exited,
      new Promise((resolve) => {
        bystander.stdout.once('data', () => resolve('pong'));
        bystander.stdin.write('ping\n');
      }),
    ]);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-door-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  try {
    assert.equal(await ping(), 'pong', 'the bystander did not answer before the reap');
    fs.writeFileSync(path.join(scratch, 'state.json'), JSON.stringify([{ pid: bystander.pid, dir }]));
    const ended = reap(scratch);
    t.diagnostic(`reap ended the "browser" by: ${JSON.stringify(ended)}`);
    if (process.platform === 'win32') {
      assert.deepEqual(ended, ['sweep']);
      assert.equal(await ping(), 'pong', 'reap killed a process by a stale pid');
    } else {
      assert.deepEqual(ended, ['group']);
      assert.equal(await exited, 'exited', 'off Windows reap still kills the pid it was handed');
    }
    assert.equal(fs.existsSync(dir), false, 'reap left the profile folder');
  } finally {
    if (bystander.exitCode === null && bystander.signalCode === null) bystander.kill('SIGKILL');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// REAPED, SPAWNING: a browser can start a helper WHILE `reap()` sweeps (windows-2025 run 44789928753, on #3333's head:
// LIVE BROWSER read 8 processes before the sweep and 1 left after 20 reads). A sweep that lists once and stops once
// leaves that helper running. code-door-spawner.js makes the race certain: it starts children naming the profile until
// it is killed. Off Windows the spawner leads its own process group, as the browser does.

/** Start code-door-spawner.js on a fresh profile folder; resolves once its children are running. */
const startSpawner = async () => {
  const { fs, os, path, processesUsing } = reapHarness();
  const { spawn } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  const name = path.basename(dir);
  const spawner = spawn(process.execPath, [path.join(__dirname, '../../fixtures/code-door-spawner.js'), dir], { stdio: ['ignore', 'pipe', 'inherit'], detached: process.platform !== 'win32' });
  const exited = new Promise((resolve) => spawner.once('exit', resolve));
  const cleanup = async () => {
    // A red run leaves children behind: end them here so they do not outlive the test.
    for (const pid of processesUsing(name)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
    if (spawner.exitCode === null && spawner.signalCode === null) spawner.kill('SIGKILL');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    // The signal, not a duration: go on once the spawner has its children running.
    await new Promise((resolve, reject) => {
      let out = '';
      spawner.stdout.on('data', (d) => {
        out += d;
        if (out.includes('ready')) resolve();
      });
      spawner.once('exit', (code) => reject(new Error(`the spawner exited (${code}) before it was ready: ${out.trim()}`)));
    });
  } catch (e) {
    await cleanup();
    throw e;
  }
  const before = processesUsing(name).length;
  return { spawner, dir, name, before, cleanup };
};

// The CONTROL comes first and proves the arm can fail, on every run: the weak kill (ONE sweep pass on Windows, the
// parent's pid alone elsewhere) must leave children behind. If it ever leaves none, the fixture stopped racing and the
// arm below would pass for nothing.
test(`CONTROL, SPAWNING: a weak kill leaves the spawner's children behind, on ${process.platform}`, { timeout: TIMEOUT }, async (t) => {
  const { processesLeft } = reapHarness();
  const { killBrowserTree } = require('../../../lib/cli/code-door.js');
  const s = await startSpawner();
  try {
    assert.ok(s.before >= 2, `the spawner and its children should name the profile on 2 or more command lines, and ${s.before} did`);
    if (process.platform === 'win32') assert.equal(killBrowserTree(s.spawner.pid, s.dir, { passes: 1 }), 'sweep');
    else process.kill(s.spawner.pid, 'SIGKILL');
    // Read until the dying ones are gone (processesLeft's own bound); what remains was never killed.
    const left = processesLeft(s.name);
    t.diagnostic(`a weak kill left ${left.length} of ${s.before} processes naming the profile`);
    assert.ok(left.length >= 1, 'a weak kill left nothing behind, so the spawner no longer races and REAPED, SPAWNING proves nothing');
  } finally {
    await s.cleanup();
  }
});

test(`REAPED, SPAWNING: reap ends a browser that starts helpers while it is swept, on ${process.platform}`, { timeout: TIMEOUT }, async (t) => {
  const { fs, os, path } = reapHarness();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-door-'));
  const s = await startSpawner();
  try {
    assert.ok(s.before >= 2, `the spawner and its children should name the profile on 2 or more command lines, and ${s.before} did`);
    fs.writeFileSync(path.join(scratch, 'state.json'), JSON.stringify([{ pid: s.spawner.pid, dir: s.dir }]));
    reapAndCheck(t, scratch, s.dir, s.before);
  } finally {
    await s.cleanup();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// SWEEP ERRORS, on real PowerShell: the decision between 'sweep' and the pid fallback rests on the script's own
// `swept` line, because its exit code cannot tell a failed query (#3358's maker-checker, finding 1). The unit tests
// pin it with faked output; this arm runs the real script with a fault injected through `run`. (1) The FIRST query
// fails (a WMI class that does not exist): exit 3, no `swept`, so the pid fallback runs. (2) A LATER query fails: pass 1
// stops a live process naming the profile and prints `swept`, pass 2 throws, the loop ends, and the answer stays
// 'sweep' with the pid untouched. Off Windows there is no PowerShell, so the arm checks only the first case's outcome.
test(`SWEEP ERRORS: a failed query decides sweep or pid by what ran, on ${process.platform}`, { timeout: TIMEOUT }, async (t) => {
  const { fs, os, path, processesLeft } = reapHarness();
  const { spawn, spawnSync } = require('node:child_process');
  const { killBrowserTree } = require('../../../lib/cli/code-door.js');
  const STALE = 4242;
  /** Run killBrowserTree with `rewrite` applied to the script, and the kill recorded instead of sent. */
  const attempt = (dir, rewrite) => {
    const killed = [];
    let result = null;
    const how = killBrowserTree(STALE, dir, {
      platform: 'win32',
      run: (cmd, args, opts) => {
        result = spawnSync(cmd, [...args.slice(0, -1), rewrite(args.at(-1))], opts);
        return result;
      },
      kill: (p, s) => killed.push([p, s]),
    });
    return { how, killed, status: result?.status ?? null, stdout: String(result?.stdout || '').trim() };
  };

  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  try {
    const r = attempt(first, (script) => script.replace('Get-CimInstance Win32_Process', 'Get-CimInstance Win32_NoSuchClass'));
    t.diagnostic(`first query fails: status ${r.status}, stdout ${JSON.stringify(r.stdout)}, answer ${r.how}`);
    assert.equal(r.how, 'pid', 'no pass ran, so the pid fallback must');
    assert.deepEqual(r.killed, [[STALE, 'SIGKILL']]);
    if (process.platform === 'win32') {
      assert.equal(r.status, 3, 'the script exits 3 when its first query throws');
      assert.equal(r.stdout, '');
    }
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
  }

  if (process.platform !== 'win32') return;
  const later = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  const name = path.basename(later);
  // A live process naming the profile, for pass 1 to find and stop. It only waits; a red run's leak is bounded.
  const helper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 240000)', later], { stdio: 'ignore' });
  const exited = new Promise((resolve) => helper.once('exit', resolve));
  try {
    await new Promise((resolve, reject) => {
      helper.once('spawn', resolve);
      helper.once('error', reject);
    });
    // Pass 2 says it ran (`pass2`, straight to the console, so the two lines may come in either order) before its query
    // throws, so this case cannot pass with no fault injected.
    const laterFault = (script) => script.replace('Get-CimInstance Win32_Process', "Get-CimInstance $(if ($n -eq 1) { 'Win32_Process' } else { [Console]::Out.WriteLine('pass2'); 'Win32_NoSuchClass' })");
    const r = attempt(later, laterFault);
    t.diagnostic(`later query fails: status ${r.status}, stdout ${JSON.stringify(r.stdout)}, answer ${r.how}`);
    assert.equal(r.how, 'sweep', 'a pass ran, so the answer is sweep');
    assert.deepEqual(r.killed, [], 'after a pass ran, the pid must never be killed');
    assert.equal(r.status, 0, 'a later failed query ends the loop, not the script');
    assert.deepEqual(r.stdout.split(/\s+/).sort(), ['pass2', 'swept'], 'pass 1 printed swept, then pass 2 ran into the fault');
    assert.deepEqual(processesLeft(name), [], 'pass 1 did not stop the live process naming the profile');
    // The CONTROL: the same fault with a catch that exits on EVERY pass, the bug this arm guards against. Its answer
    // must differ (exit 3), or the assertions above could not tell a right catch from a wrong one.
    const again = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 240000)', later], { stdio: 'ignore' });
    const againExited = new Promise((resolve) => again.once('exit', resolve));
    try {
      await new Promise((resolve, reject) => {
        again.once('spawn', resolve);
        again.once('error', reject);
      });
      const c = attempt(later, (script) => laterFault(script).replace('if ($n -eq 1) { exit 3 } else { break }', 'exit 3'));
      t.diagnostic(`control, a catch that always exits: status ${c.status}, stdout ${JSON.stringify(c.stdout)}, answer ${c.how}`);
      assert.equal(c.status, 3, 'the broken catch must exit 3 on pass 2, or the control did not inject what it says');
      assert.deepEqual(c.stdout.split(/\s+/).sort(), ['pass2', 'swept']);
    } finally {
      if (again.exitCode === null && again.signalCode === null) again.kill('SIGKILL');
      await againExited;
    }
  } finally {
    if (helper.exitCode === null && helper.signalCode === null) helper.kill('SIGKILL');
    await exited;
    fs.rmSync(later, { recursive: true, force: true });
  }
});
