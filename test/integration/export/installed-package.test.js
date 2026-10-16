/**
 * Integration: the package as `npm i @laticent/lattice` installs it renders a deck.
 *
 * In this repo every package is installed and every workspace library is symlinked, so code
 * that loads an undeclared package still works here and breaks for every consumer. That is
 * how the installed CLI shipped exiting with `Cannot find module '@laticent/segno/read'`
 * (followup 2577-p1, fixed by the 1.0 packaging work). This builds the install a consumer
 * would get, without the network:
 *
 * - the root package's files are exactly the tarball's (`npm pack --dry-run --json`), and so
 *   are the five workspace libraries it depends on, copied into a scratch node_modules;
 * - every other entry in that node_modules is a link to the repo's copy of a package the root
 *   DECLARES in `dependencies` or `optionalDependencies`, and nothing else. A require from the
 *   copied files resolves only through that folder, so an undeclared package fails as it would
 *   after a real install. One assertion proves the harness has that property (a devDependency
 *   does not resolve), or the rest would prove nothing.
 *
 * The full registry install is the recipe in RELEASE.md §The distribution contract; it needs
 * the network and ~250 downloads, which this tier should not pay per PR.
 *
 * Slow tier: two `npm pack` listings and two CLI renders. See engineering/pipeline.md.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const LIBS = Object.keys(PKG.dependencies).filter((n) => n.startsWith('@laticent/'));
const TIMEOUT = 600000;

/** The files `npm pack` would put in the tarball for the package in `dir`. */
function packedFiles(dir) {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  // npm still runs `prepare` for a directory and its build logs share stdout; the JSON is last.
  const json = JSON.parse(out.slice(out.lastIndexOf('\n[') + 1));
  return json[0].files.map((f) => f.path);
}

function copyPackage(srcDir, destDir) {
  for (const rel of packedFiles(srcDir)) {
    const to = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(srcDir, rel), to);
  }
}

describe('export: an installed @laticent/lattice renders with only what it declares', () => {
  let dir;
  let nm;
  const deck = () => path.join(dir, 'deck.md');

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-installed-'));
    nm = path.join(dir, 'node_modules');
    copyPackage(ROOT, path.join(nm, '@laticent', 'lattice'));
    for (const lib of LIBS) {
      copyPackage(path.dirname(require.resolve(`${lib}/package.json`, { paths: [ROOT] })), path.join(nm, lib));
    }
    const declared = [...Object.keys(PKG.dependencies), ...Object.keys(PKG.optionalDependencies ?? {})];
    for (const name of declared) {
      if (name.startsWith('@laticent/')) continue;
      const real = path.join(ROOT, 'node_modules', name);
      if (!fs.existsSync(real)) continue; // an optional dependency this machine skipped
      fs.mkdirSync(path.dirname(path.join(nm, name)), { recursive: true });
      fs.symlinkSync(fs.realpathSync(real), path.join(nm, name), 'dir');
    }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
    fs.writeFileSync(deck(), [
      '---\ntheme: indaco\n---',
      '## Revenue grew\n\n- EMEA leads\n- APAC holds',
      '## A formula\n\n$$ \\sigma(x) = \\frac{1}{1 + e^{-x}} $$',
      '## A diagram\n\n```mermaid\nflowchart LR\n  A --> B\n```',
    ].join('\n\n---\n\n'));
  });

  after(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const nodeIn = (code) => spawnSync(process.execPath, ['-e', code], { cwd: dir, encoding: 'utf8' });
  const render = (out) => spawnSync(
    process.execPath,
    [path.join(nm, '@laticent', 'lattice', PKG.bin.lattice), deck(), path.join(dir, out), '--quiet'],
    { cwd: dir, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT },
  );

  test('the harness hides what the package does not declare', { timeout: TIMEOUT }, () => {
    const r = nodeIn("require.resolve('lefthook', { paths: [require.resolve('@laticent/lattice/package.json')] })");
    assert.notEqual(r.status, 0, 'a devDependency resolved from the installed package, so this harness cannot catch a missing one');
  });

  test('the engine export loads', { timeout: TIMEOUT }, () => {
    const r = nodeIn("require('@laticent/lattice/engine')");
    assert.equal(r.status, 0, `require('@laticent/lattice/engine') failed:\n${r.stderr}`);
  });

  // The root import is a library import. It once resolved to the CLI bundle, which parsed the
  // HOST's argv, printed the usage text and called process.exit(1) inside the program that
  // imported it (followup 2601-p1). The marker line proves the require RETURNED: an exit
  // inside it never reaches the write, even if some later version exited 0.
  test('the root import is the engine and returns to its caller (require and import)', { timeout: TIMEOUT }, () => {
    const cjs = nodeIn([
      "const root = require('@laticent/lattice');",
      "if (root !== require('@laticent/lattice/engine')) throw new Error('root is not the engine export');",
      "if (typeof root.render !== 'function') throw new Error('root has no render()');",
      "process.stdout.write('RETURNED');",
    ].join('\n'));
    assert.equal(cjs.status, 0, `require('@laticent/lattice') did not return cleanly:\n${cjs.stdout}${cjs.stderr}`);
    assert.equal(cjs.stdout, 'RETURNED', `require('@laticent/lattice') printed to stdout:\n${cjs.stdout}`);
    const esm = spawnSync(process.execPath, ['--input-type=module', '-e', [
      "const root = await import('@laticent/lattice');",
      "if (root.default !== (await import('@laticent/lattice/engine')).default) throw new Error('import is not the engine export');",
      "if (typeof root.default.render !== 'function') throw new Error('import has no render()');",
      "process.stdout.write('RETURNED');",
    ].join('\n')], { cwd: dir, encoding: 'utf8' });
    assert.equal(esm.status, 0, `import('@laticent/lattice') did not return cleanly:\n${esm.stdout}${esm.stderr}`);
    assert.equal(esm.stdout, 'RETURNED');
  });

  test('the CLI bundle is the bin, not an import path', { timeout: TIMEOUT }, () => {
    const r = nodeIn("require('@laticent/lattice/min')");
    assert.notEqual(r.status, 0, "require('@laticent/lattice/min') resolved, so the CLI bundle is still importable");
    assert.match(r.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  });

  // Shell completion's fast path runs lib/cli/complete.js straight from the install, outside the
  // bundle, so every file it loads must ship and resolve with only what the package declares.
  test('shell completion works from the install: the script, the bundle fallback and the fast path', { timeout: TIMEOUT }, () => {
    const bin = path.join(nm, '@laticent', 'lattice', PKG.bin.lattice);
    const script = spawnSync(process.execPath, [bin, 'completion', 'bash'], { cwd: dir, encoding: 'utf8' });
    assert.equal(script.status, 0, script.stderr);
    const self = path.join(nm, '@laticent', 'lattice', 'lib', 'cli', 'complete.js');
    assert.ok(script.stdout.includes(self), 'the script does not call the installed lib/cli/complete.js');
    for (const argv of [[bin, '__complete', '-p', 'ind'], [self, '-p', 'ind']]) {
      const r = spawnSync(process.execPath, argv, { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, ':values\nindaco\nindaco-dark\n');
    }
    const plugins = spawnSync(process.execPath, [self, '--disable-plugin', 'mer'], { cwd: dir, encoding: 'utf8' });
    assert.equal(plugins.stdout, ':values\nmermaid\n', plugins.stderr);
  });

  test('the CLI renders a PDF with math and a Mermaid diagram', { timeout: TIMEOUT }, () => {
    const r = render('deck.pdf');
    assert.equal(r.status, 0, `the installed CLI failed:\n${r.stderr}`);
    assert.equal(fs.readFileSync(path.join(dir, 'deck.pdf')).subarray(0, 5).toString(), '%PDF-');
  });

  test('without a declared library the engine fails, and the bundled CLI still renders (failing arm)', { timeout: TIMEOUT }, () => {
    fs.rmSync(path.join(nm, '@laticent', 'segno'), { recursive: true, force: true });
    const r = nodeIn("require('@laticent/lattice/engine')");
    assert.notEqual(r.status, 0, 'the engine loaded with @laticent/segno removed');
    assert.match(r.stderr, /@laticent\/segno/);
    const cli = render('again.html');
    assert.equal(cli.status, 0, `the CLI bundle should inline segno, but failed:\n${cli.stderr}`);
  });
});
