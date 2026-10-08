const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// A REBUILD THAT WOULD CHANGE NOTHING MUST TOUCH NOTHING (tools/lib/build-workspace-lib.js).
//
// `npm pack` runs every workspace library's build through `prepack`, and
// package-nodenext-types.test.js packs all nine while other unit tests walk docs/src/lib in
// parallel. The builder used to delete `dist/` and rename a `.dist.tmp-<pid>` folder into its
// place on every run, so a walker could list a file and find it gone a moment later: CI failed
// twice on #2613 with ENOENT, once under `.dist.tmp-12417/` and once under `suono/dist/`.
//
// So the second of two builds in a row must leave `dist/` as the same directory (same inode)
// and must not create anything in the library's folder while it runs. Before the fix, `dist/`'s
// inode changed on every build (measured on ltt: 885356, then 885409).

const ROOT = path.join(__dirname, '..', '..', '..');
const LIB = path.join(ROOT, 'docs', 'src', 'lib', 'ltt');
const BUILDER = path.join(ROOT, 'tools', 'build-ltt-lib.js');

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BUILDER, '--silent'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`build-ltt-lib exited ${code}: ${err}`))));
  });
}

test('a rebuild with nothing to change leaves dist/ in place and creates nothing beside it', async () => {
  await build(); // makes dist/ current, whatever state it was in
  const before = fs.statSync(path.join(LIB, 'dist')).ino;
  const created = [];
  const watcher = fs.watch(LIB, (event, name) => {
    if (event === 'rename' && name && name !== 'dist' && fs.existsSync(path.join(LIB, name))) created.push(name);
    if (name?.startsWith('.dist.tmp-')) created.push(name);
  });
  try {
    await build();
  } finally {
    watcher.close();
  }
  assert.equal(fs.statSync(path.join(LIB, 'dist')).ino, before, 'the second build replaced dist/ although nothing changed');
  assert.deepEqual([...new Set(created)], [], 'the second build created entries in the library folder');
  assert.deepEqual(fs.readdirSync(LIB).filter((n) => n.startsWith('.dist.tmp-')), []);
});
