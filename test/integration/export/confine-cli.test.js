// The CLI's request guard (lattice.js, "LOCAL FILES stay inside the deck") on the real surface: Chromium
// loads a deck, and a file whose REAL path is outside the deck is answered with the stand-in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
// The CLI's own render watchdog (lattice.js RENDER_WATCHDOG_MS) fires BEFORE this spawn's kill, so a hang names the step it
// stuck in instead of reading as `null !== 0` with an empty stderr (Windows platform suite, run 41877087984: two children
// killed at 120 s, silent; the same commit passed in 5.4 s on the re-run).
const run = (args) => spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, LATTICE_RENDER_WATCHDOG_MS: '60000' } });
/** Why a child failed: its exit, the signal that killed it (the spawn timeout reads as SIGTERM with status null), and its output. */
const why = (r) => `status ${r.status}, signal ${r.signal}${r.error ? `, ${r.error.code || r.error.message}` : ''}\nstderr: ${r.stderr}\nstdout: ${String(r.stdout).slice(-2000)}`;

test('a symlink out of the deck is refused, a host-qualified file address does not crash, a symlinked output folder renders', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'confine-cli-'));
  try {
    const deck = path.join(base, 'deck');
    const outside = path.join(base, 'outside');
    const realout = path.join(base, 'realout');
    for (const d of [deck, outside, realout]) fs.mkdirSync(d);
    fs.copyFileSync(path.join(ROOT, 'lib/samples/photo-wide.jpg'), path.join(outside, 'secret.jpg'));
    fs.symlinkSync(path.join(outside, 'secret.jpg'), path.join(deck, 'linked.jpg'));
    fs.symlinkSync(realout, path.join(base, 'linkout'));
    fs.writeFileSync(path.join(deck, 'd.md'), '---\ntheme: indaco\n---\n<!-- _class: image -->\n![bg right](linked.jpg)\n# T\n<iframe src="file://evilhost/share/x.png"></iframe>\n');
    const r = run([path.join(deck, 'd.md'), path.join(base, 'linkout', 'o.png')]);
    assert.equal(r.status, 0, why(r));
    assert.match(r.stderr, /refused file:\/\/\/.*linked\.jpg/);
    assert.match(r.stderr, /refused file:\/\/evilhost\/share\/x\.png/);
    assert.ok(fs.existsSync(path.join(realout, 'o.001.png')));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
