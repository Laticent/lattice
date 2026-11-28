/**
 * The helpers that replace sleeps and stopwatches (HARD RULE #32) see what they claim to see, and are blind where
 * they say they are. A counter that reads zero on everything would turn every test built on it into a pass.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { scanWork, charReads } = require('../../helpers/work-count');
const { virtualClock } = require('../../helpers/runtime-boot');
const { trackConnections } = require('../../helpers/request-log');
const { runNode, runNodeSync, cpuMs, treeCpu } = require('../../helpers/spawn-progress');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { EventEmitter, once } = require('node:events');

describe('scanWork', () => {
  const text = 'ab'.repeat(5000);

  test('a single pass covers the text once; a search restarted from every position covers it n / 2 times', () => {
    const once = scanWork(() => text.indexOf('zz')).scanned;
    assert.equal(once, text.length);
    const rescan = scanWork(() => { for (let i = 0; i < text.length; i += 100) text.indexOf('zz', i); }).scanned;
    assert.ok(rescan > 40 * text.length, `restarting every 100 characters covered ${rescan}`);
  });

  test('a regex reached through replace, match, test and split is counted, from lastIndex on a global one', () => {
    for (const fn of [() => text.replace(/z/g, ''), () => text.match(/z/), () => /z/.test(text), () => text.split(/z/)]) {
      assert.ok(scanWork(fn).scanned >= text.length, String(fn));
    }
    const re = /b/g;
    re.lastIndex = text.length - 2;
    assert.equal(scanWork(() => re.exec(text)).scanned, 2);
  });

  test('a wrapped search behaves as the native one: includes still refuses a regex', () => {
    assert.throws(() => scanWork(() => 'a/a/'.includes(/a/)), TypeError);
    assert.equal(scanWork(() => 'abcabc'.lastIndexOf('c', Number.NaN)).scanned, 1, 'a NaN start searches from the end');
  });

  test('the prototypes are restored, even when the work throws', () => {
    const { indexOf } = String.prototype;
    const { exec } = RegExp.prototype;
    assert.throws(() => scanWork(() => { throw new Error('x'); }));
    assert.equal(String.prototype.indexOf, indexOf);
    assert.equal(RegExp.prototype.exec, exec);
  });
});

describe('charReads', () => {
  test('a charCodeAt walk reads each character once; restarting it from every position reads n / 2 each', () => {
    const text = 'ab'.repeat(500);
    const walk = (from) => { let n = 0; for (let k = from; k < text.length; k++) n += text.charCodeAt(k); return n; };
    assert.equal(charReads(() => walk(0)).reads, text.length);
    const { reads } = charReads(() => { for (let i = 0; i < text.length; i++) walk(i); });
    assert.equal(reads, (text.length * (text.length + 1)) / 2);
  });

  test('a scan that slices off the rest at every step is charged for the copies, with no character read', () => {
    const text = 'x'.repeat(1000);
    const { reads } = charReads(() => { let rest = text; while (rest.length) rest = rest.slice(1); });
    assert.equal(reads, (text.length * (text.length - 1)) / 2);
  });

  test('an array search charges the array it walks, and the prototypes come back', () => {
    const { charCodeAt } = String.prototype;
    const { some } = Array.prototype;
    assert.equal(charReads(() => [1, 2, 3, 4].some((x) => x > 9)).reads, 4);
    assert.equal(String.prototype.charCodeAt, charCodeAt);
    assert.equal(Array.prototype.some, some);
  });
});

describe('virtualClock', () => {
  test('settle fires timers in time order, frames included, and resolves once none are queued', async () => {
    const win = new JSDOM('').window;
    const { settle, now } = virtualClock(win);
    const seen = [];
    win.setTimeout(() => seen.push('b'), 50);
    win.setTimeout(() => { seen.push('a'); win.setTimeout(() => seen.push('c'), 100); }, 10);
    win.requestAnimationFrame(() => seen.push('frame'));
    const cleared = win.setTimeout(() => seen.push('never'), 5);
    win.clearTimeout(cleared);
    assert.equal(await settle(), 4);
    assert.deepEqual(seen, ['a', 'frame', 'b', 'c']);
    assert.equal(now(), 110);
  });

  test('a window that runs scripts reads the virtual time; a plain one leaves Node\'s clock alone', async () => {
    const scripted = new JSDOM('', { runScripts: 'dangerously' }).window;
    const { settle } = virtualClock(scripted);
    scripted.setTimeout(() => {}, 110);
    await settle();
    assert.equal(scripted.performance.now(), 110, 'the window reads the virtual time');
    assert.equal(scripted.eval('Date.now()'), Date.UTC(2026, 0, 1) + 110, 'and so does its Date, from a fixed epoch');
    // A plain jsdom window shares Node's Date: pinning it would freeze Date.now() for the rest of the file.
    const plain = new JSDOM('').window;
    assert.equal(plain.Date, Date, 'precondition: this window shares Node\'s Date');
    const nodeNow = Date.now;
    virtualClock(plain);
    assert.equal(Date.now, nodeNow, 'Node\'s Date.now is untouched');
  });

  test('work that never stops is an error, not a hang', async () => {
    const win = new JSDOM('').window;
    const { settle } = virtualClock(win);
    win.setInterval(() => {}, 16);
    await assert.rejects(settle({ maxSteps: 20 }), /never settles/);
  });
});

describe('trackConnections', () => {
  // The listener is a stand-in that is told of a connection only when the test says so, so the order of events is the
  // test's, not the kernel's. Its address is a real listener's, so the probe's own connection still opens.
  test('a closed socket from an earlier client that carries our port does not end the wait; only ours does', async (t) => {
    const real = net.createServer((s) => s.on('error', () => {}));
    await new Promise((resolve) => real.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => real.close(resolve)));
    const server = Object.assign(new EventEmitter(), { address: () => real.address() });
    const { drained } = trackConnections(server);
    let mine;
    const connect = net.connect;
    t.mock.method(net, 'connect', (...args) => (mine = connect.apply(net, args)));
    const fakeSocket = (port) => Object.defineProperties(new EventEmitter(), { remotePort: { get: port }, remoteAddress: { get: () => mine?.localAddress } });
    // An earlier client, long closed, whose ephemeral port the OS hands to the probe.
    const stale = fakeSocket(() => mine?.localPort);
    server.emit('connection', stale);
    stale.emit('close');
    let done = false;
    const waiting = drained().then(() => {
      done = true;
    });
    await once(mine, 'connect');
    await new Promise((resolve) => setImmediate(resolve)); // every promise job queued so far has run
    assert.equal(done, false, 'the wait ended on a stale socket that only shares our port');
    const port = mine.localPort;
    server.emit('connection', fakeSocket(() => port));
    await waiting;
    assert.equal(done, true);
  });
});

// The deadline that replaced cli.test.js's fixed 10 s total (F4): a child fails for a hang, never for a slow machine.
// Without /proc (macOS, Windows, or `watchProc: false`) the wall-clock ceiling is the only check; this arm runs on every
// platform, so it proves a hang is still caught there.
test('failing arm: with no /proc to watch by, the ceiling alone still kills a spinning child', async () => {
  await assert.rejects(runNode('-e', ['for (;;) {}'], { watchProc: false, cpuBudgetMs: 100, stallMs: 100, ceilingMs: 1000 }), /still running after 1 s/);
});

// ci-skip: every CI unit job runs on ubuntu-24.04, where this block runs; only a macOS or Windows box (no /proc) skips it.
describe('runNode', { skip: process.platform !== 'linux' && 'watches /proc, which only Linux has; elsewhere it is a wall-clock total' }, () => {
  test('reads a process\'s own CPU time from /proc', () => {
    const t = cpuMs(process.pid);
    assert.ok(Number.isFinite(t) && t > 0, `cpu ${t}`);
    assert.equal(cpuMs(2 ** 22 + 7), null, 'a pid that does not exist reads as null');
  });

  test('a child that exits is resolved with its status and output', async () => {
    const r = await runNode('-e', ['console.log("out"); console.error("err"); process.exit(3)']);
    assert.deepEqual(r, { status: 3, stdout: 'out\n', stderr: 'err\n' });
  });

  test('failing arm: a child that spins is killed once it has used its CPU budget', async () => {
    await assert.rejects(runNode('-e', ['for (;;) {}'], { cpuBudgetMs: 500, stallMs: 60_000 }), /spun \d+ s of CPU without exiting/);
  });

  test('failing arm: a child that waits forever and uses no CPU is killed after the stall limit', async () => {
    await assert.rejects(runNode('-e', ['setInterval(() => {}, 1e9)'], { cpuBudgetMs: 60_000, stallMs: 1000 }), /used no CPU for \d+ s/);
  });

  test('failing arm: a child that polls forever, its CPU never stalling, is killed at the ceiling', async () => {
    const poller = 'setInterval(() => { const end = Date.now() + 5; while (Date.now() < end); }, 100);';
    await assert.rejects(runNode('-e', [poller], { cpuBudgetMs: 60_000, stallMs: 60_000, ceilingMs: 1500 }), /still running after 1.5 s/);
  });

  test('failing arm: a child that exits while a process it started holds its output is reported, not waited on', async () => {
    const orphan = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: 'inherit', detached: true }).unref();";
    await assert.rejects(runNode('-e', [orphan], { stallMs: 1000 }), /exited, but its output was still open/);
  });

  test('a slow child that keeps working is never killed, though it runs longer than the stall limit', async () => {
    // Runs about 2.3 s and never sits idle for more than 0.2 s: a starved process looks like this, a hung one does not.
    const slow = 'let n = 0; const step = () => { const end = Date.now() + 30; while (Date.now() < end); if (++n < 10) setTimeout(step, 200); else console.log("done"); }; step();';
    const r = await runNode('-e', [slow], { cpuBudgetMs: 60_000, stallMs: 1500 });
    assert.deepEqual(r, { status: 0, stdout: 'done\n', stderr: '' });
  });
  // A child that starts processes (lattice.js starts Chromium) is judged by its whole tree, not by its own CPU alone.
  // Each grandchild below is a plain Node process, so the arms run in a unit job; the real-Chromium arms live in
  // test/integration/export/spawn-progress-chromium.test.js.
  const grandchild = (code) => `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(code)}], { stdio: 'ignore' }); setInterval(() => {}, 1e9);`;

  test('failing arm: a grandchild that spins while the child waits on it counts as the child spinning', async () => {
    await assert.rejects(runNode('-e', [grandchild('for (;;) {}')], { cpuBudgetMs: 500, stallMs: 60_000, ceilingMs: 20_000 }), /spun \d+ s of CPU without exiting/);
  });

  test('failing arm: a tree that only ticks, under the stall floor, is stuck though its CPU never stands still', async () => {
    // 5 ms of work every 200 ms: about 25 ms per second, the shape of an idle Chromium waiting on a page that never loads.
    const ticker = 'setInterval(() => { const end = Date.now() + 5; while (Date.now() < end); }, 200);';
    await assert.rejects(runNode('-e', [grandchild(ticker)], { cpuBudgetMs: 60_000, stallMs: 2000, stallCpuMs: 200, ceilingMs: 20_000 }), /used \d+ ms of CPU in 2 s, no more than an idle process/);
  });

  test('a hung tree is killed whole: no grandchild outlives the test', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-progress-'));
    const pidFile = path.join(dir, 'grandchild.pid');
    const code = `const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(() => {}, 1e9);`;
    await assert.rejects(runNode('-e', [code], { stallMs: 1000 }), /used no CPU for \d+ s/);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    // runNode rejects only once the tree is dead, so this reads the state right after the hang, with no wait.
    let state = 'gone';
    try { state = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0]; } catch { /* reaped */ }
    assert.ok(state === 'gone' || state === 'Z', `grandchild ${pid} survived its tree's hang (state ${state})`);
  });

  test('the tree count keeps a grandchild\'s work after it exits', async () => {
    // The grandchild works 400 ms and exits; the child says "gone" once it has, then waits. The count is read every
    // 20 ms until then, and once after: it must never fall, and must still hold the grandchild's work at the end.
    const work = 'const end = Date.now() + 400; while (Date.now() < end);';
    const code = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(work)}], { stdio: 'ignore' }).on('exit', () => console.log('gone')); setInterval(() => {}, 1e9);`;
    const child = require('node:child_process').spawn(process.execPath, ['-e', code]);
    const reads = [];
    let sample;
    try {
      const tree = treeCpu(child.pid); // inside the try, so a helper that throws still kills the child below
      sample = setInterval(() => reads.push(tree.read()), 20);
      await once(child.stdout, 'data'); // "gone": the grandchild has exited
      clearInterval(sample);
      reads.push(tree.read());
      for (let i = 1; i < reads.length; i++) assert.ok(reads[i] >= reads[i - 1], `the count went down: ${reads[i - 1]} → ${reads[i]}`);
      assert.ok(reads.at(-1) >= 300, `the grandchild's 400 ms of work reads as ${reads.at(-1)} ms once it has exited`);
    } finally {
      clearInterval(sample);
      child.kill('SIGKILL');
    }
  });

  test('runNodeSync relays status and output, and throws, with the reason, when the child hangs', () => {
    const r = runNodeSync('-e', ['console.log("out"); console.error("err"); process.exit(3)']);
    assert.deepEqual(r, { status: 3, stdout: 'out\n', stderr: 'err\n' });
    assert.throws(() => runNodeSync('-e', ['console.error("before"); for (;;) {}'], { cpuBudgetMs: 500, stallMs: 60_000 }), /spun \d+ s of CPU without exiting[\s\S]*--- its stderr ---\nbefore/);
  });

  test('runNodeSync refuses a wall-clock timeout, the F4 shape it replaces', () => {
    assert.throws(() => runNodeSync('-e', ['0'], { timeout: 60_000 }), /takes no `timeout`/);
  });
});
