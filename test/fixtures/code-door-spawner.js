/**
 * A stand-in for a browser that keeps starting helpers, for os-sandbox-measure's `REAPED, SPAWNING` arm (#3333's
 * windows-2025 run 44789928753). Chromium can start a helper while `reap()` sweeps; a sweep that lists once and stops
 * once leaves that helper running. This parent makes the race certain instead of rare: it starts a child, waits for
 * it to start, ends its oldest child once it has KEEP of them, and starts the next, until it is killed. Every command
 * line names the profile folder (argv[2]), as Chromium's helpers do with `--user-data-dir`.
 *
 *   node code-door-spawner.js <profile dir>          the parent; prints `ready` once KEEP children are running
 *   node code-door-spawner.js <profile dir> child    a helper: it only waits
 *
 * On Windows each child is started DETACHED, which breaks it away from the parent's libuv job object: otherwise the
 * job would end every child when the parent dies, and the arm would pass against the one-pass sweep it exists to
 * catch. Off Windows the children stay in the parent's process group, as a browser's helpers do, and `reap()` ends
 * the group. A child the test fails to end exits on its own after LIFETIME_MS, so a red run leaks nothing for long;
 * that bound is a leak guard, not a wait, and it is longer than the test's own check.
 */
const { spawn } = require('node:child_process');

const [dir, role] = process.argv.slice(2);
const LIFETIME_MS = 180000;
const KEEP = 6;

if (role === 'child') {
  setTimeout(() => process.exit(0), LIFETIME_MS);
} else {
  setTimeout(() => process.exit(0), LIFETIME_MS);
  const children = [];
  let announced = false;
  const next = () => {
    const child = spawn(process.execPath, [__filename, dir, 'child'], { stdio: 'ignore', detached: process.platform === 'win32', windowsHide: true });
    child.once('error', () => setImmediate(next));
    child.once('spawn', () => {
      children.push(child);
      if (children.length > KEEP) {
        try {
          children.shift().kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      if (!announced && children.length >= KEEP) {
        announced = true;
        process.stdout.write('ready\n');
      }
      setImmediate(next);
    });
  };
  next();
}
