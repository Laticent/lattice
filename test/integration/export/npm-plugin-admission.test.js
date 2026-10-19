/**
 * Integration: the three rules an npm plugin runs under (threat-model note
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 decisions 7 to 9), through the real
 * door and the real sandbox browser.
 *
 *   LAYER (7)   an npm plugin does not run where the OS layer reads OFF or cannot be measured.
 *               The same plugin as a plain, approved entry is the CONTROL: it reports the layer this
 *               machine gives, and the npm entry must run exactly when that layer is admissible.
 *   BUNDLE (8)  the door admits bytes against the pinned hash and leaves no dependency external.
 *   LOADER      `lattice packages fetch` downloads a real `npm pack` tarball from a local registry,
 *               approves it where the layer allows, and a real CLI render of a deck that lists it
 *               runs it as `source: 'npm'` (lib/packages/npm-plugin-loader.js). Where the layer does
 *               not allow it, the approval is refused and the render names the plugin, not its output.
 *   NEVER LOADED IN NODE (9, G5)  a plugin whose code writes a file when LOADED IN NODE leaves no
 *               file after admission and render. The CONTROL imports it in Node and finds the file,
 *               so the probe can see a load. Exit criterion for phase G, like the canary.
 *
 * Needs Chromium. Slow tier: one real sandbox launch per case that runs code.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const TIMEOUT = 300000;
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-npm-admission-'));
process.env.LATTICE_HOME = home;
const engine = require('../../../lib/engine');
const { renderWithCodePackages } = require('../../../lib/packages/code-door.js');
const { pluginDigest, grantTrust } = require('../../../lib/packages/trust.js');
const { npmLayerRefusal } = require('../../../lib/core/os-sandbox.js');

after(() => fs.rmSync(home, { recursive: true, force: true }));

const DECK = '---\ntheme: indaco\n---\n\n## Plan\n\n```gantt\nA 1\n```\n';
const GOOD = 'function render(f){ return "<p>drawn " + f.body.trim() + "</p>"; }\nexport { render as default };';
const sha = (c) => crypto.createHash('sha256').update(c).digest('hex');
const CHROME = process.env.CHROME_PATH || undefined;

const run = (entry) => {
  const e = engine.createEngine();
  const lines = { warn: [], info: [] };
  grantTrust('plugin', entry.name, pluginDigest(typeof entry.code === 'string' ? entry.code : Buffer.from(entry.code).toString('utf8'), entry.fence), { layer: null });
  const r = renderWithCodePackages((hook, more) => e.render(DECK, 'indaco', { codePackages: hook, ...more }), {
    packages: [],
    plugins: [entry],
    executablePath: CHROME,
    warn: (l) => lines.warn.push(l),
    info: (l) => lines.info.push(l),
  });
  return { ...r, lines };
};
const plain = { name: 'gantt-plugin', fence: 'gantt', code: GOOD };
const npm = { ...plain, name: 'gantt-npm', source: 'npm', pin: sha(GOOD) };

describe('npm plugin admission through the real door', () => {
  test('LAYER: an npm plugin runs exactly when this machine’s OS layer is admissible, and a code package of the same code always runs', { timeout: TIMEOUT }, () => {
    const control = run(plain);
    assert.ok(control.rendered, `the control did not render: ${JSON.stringify(control.refusal)}`);
    assert.match(control.rendered.html, /drawn A 1/);
    const layerLine = [...control.lines.info, ...control.lines.warn].find((l) => /OS sandbox/.test(l)) ?? '';
    const level = /OS sandbox OFF/.test(layerLine) ? 'off' : /not measured/.test(layerLine) ? 'unmeasured' : /OS sandbox on/.test(layerLine) ? 'on' : null;
    assert.ok(level, `could not read the layer from: ${layerLine}`);
    const expectRefused = npmLayerRefusal({ os: level, summary: layerLine }) !== null;
    const r = run(npm);
    if (expectRefused) {
      assert.equal(r.rendered, undefined, `an npm plugin ran where the layer reads ${level}`);
      assert.match(r.refusal.join('\n'), /the npm plugin gantt-npm does not run here/);
      assert.match(r.refusal.join('\n'), /counts as OFF|reads OFF/);
    } else {
      assert.ok(r.rendered, `the layer reads ${level} and the npm plugin was refused: ${JSON.stringify(r.refusal)}`);
      assert.match(r.rendered.html, /drawn A 1/);
    }
  });

  test('BUNDLE: bytes that are not the pinned hash, or that leave a dependency external, never reach the sandbox', { timeout: TIMEOUT }, () => {
    for (const [why, entry, pattern] of [
      ['a changed download', { ...npm, code: `${GOOD}\n// swapped` }, /not the pinned/],
      ['no pin', { ...npm, pin: undefined }, /no SHA-256 is pinned/],
      ['a left-over require', { ...npm, code: `const d = require("dep");\n${GOOD}`, pin: sha(`const d = require("dep");\n${GOOD}`) }, /names require/],
    ]) {
      const r = run(entry);
      assert.ok(r.rendered, `${why}: the deck still renders`);
      assert.match(r.rendered.html, /language-gantt/, `${why}: the block stays code`);
      assert.doesNotMatch(r.rendered.html, /drawn/);
      assert.ok(
        r.lines.warn.some((l) => /npm plugin gantt-npm is refused/.test(l) && pattern.test(l)),
        `${why}: ${r.lines.warn.join(' | ')}`,
      );
    }
  });

  test('BYTES: a bundle handed over as bytes is admitted on the bytes and then runs as text', { timeout: TIMEOUT }, () => {
    const r = run({ ...plain, name: 'gantt-bytes', code: new TextEncoder().encode(GOOD) });
    assert.ok(r.rendered, JSON.stringify(r.refusal));
    assert.match(r.rendered.html, /drawn A 1/);
  });

  test('LOADER: fetch a real npm tarball from a registry, then render a deck that lists it through the real CLI', { timeout: TIMEOUT }, async () => {
    const http = require('node:http');
    const { spawnSync, execFileSync } = require('node:child_process');
    const loader = require('../../../lib/packages/npm-plugin-loader.js');
    // The tarball npm itself packs, so the loader reads what a registry really serves.
    const pkgDir = fs.mkdtempSync(path.join(home, 'pack-'));
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@acme/lattice-gantt', version: '1.4.2', files: ['lattice-plugin.js'] }));
    fs.writeFileSync(path.join(pkgDir, 'lattice-plugin.js'), GOOD);
    // Windows ships npm as `npm.cmd`, which only a shell starts; every argument here is a fixed word (the folder is the
    // cwd), so the shell has nothing to split or expand.
    const win = process.platform === 'win32';
    const tgzName = execFileSync(win ? 'npm.cmd' : 'npm', ['pack', '--silent', '--pack-destination', '.'], { cwd: pkgDir, encoding: 'utf8', shell: win }).trim().split('\n').pop().trim();
    const tgz = fs.readFileSync(path.join(pkgDir, tgzName));
    const hits = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url);
      if (req.url === '/@acme/lattice-gantt/-/lattice-gantt-1.4.2.tgz') return res.writeHead(200).end(tgz);
      res.writeHead(404).end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const store = fs.mkdtempSync(path.join(home, 'loader-'));
    const proj = path.join(store, 'proj');
    fs.mkdirSync(proj);
    fs.writeFileSync(path.join(proj, loader.LIST_FILE), JSON.stringify({ registry: `http://127.0.0.1:${server.address().port}`, plugins: [{ name: 'gantt-npm', package: '@acme/lattice-gantt', version: '1.4.2', fence: 'gantt', sha256: sha(GOOD) }] }));
    fs.writeFileSync(path.join(proj, 'deck.md'), DECK.replace('theme: indaco', 'theme: indaco\nplugins: [gantt-npm]'));
    const cli = path.join(__dirname, '../../../lattice.js');
    const env = { ...process.env, LATTICE_HOME: store };
    try {
      const fetched = await new Promise((resolve) => {
        const { spawn } = require('node:child_process');
        const c = spawn(process.execPath, [cli, 'packages', 'fetch', proj, '--trust'], { env });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.stderr.on('data', (d) => (out += d));
        c.on('close', (code) => resolve({ code, out }));
      });
      assert.match(fetched.out, /fetched {2}plugin\/gantt-npm {2}@acme\/lattice-gantt@1\.4\.2/, fetched.out);
      assert.deepEqual(hits, ['/@acme/lattice-gantt/-/lattice-gantt-1.4.2.tgz']);
      const approved = /approved plugin\/gantt-npm/.test(fetched.out);
      const r = spawnSync(process.execPath, [cli, path.join(proj, 'deck.md'), path.join(proj, 'deck.html')], { encoding: 'utf8', timeout: TIMEOUT, env });
      const html = fs.existsSync(path.join(proj, 'deck.html')) ? fs.readFileSync(path.join(proj, 'deck.html'), 'utf8') : '';
      assert.equal(hits.length, 1, 'the render reached the registry');
      // A list the deck relies on that breaks is said out loud, not dropped (the checker, 2026-10-19).
      const listFile = path.join(proj, loader.LIST_FILE);
      const good = fs.readFileSync(listFile, 'utf8');
      fs.writeFileSync(listFile, good.replace('"1.4.2"', '"^1.4.2"'));
      const broken = spawnSync(process.execPath, [cli, path.join(proj, 'deck.md'), path.join(proj, 'broken.html')], { encoding: 'utf8', timeout: TIMEOUT, env });
      fs.writeFileSync(listFile, good);
      assert.match(broken.stderr, /warning: .*lattice-plugins\.json plugins\[0\].*exact version/, broken.stderr);
      if (approved) {
        assert.equal(r.status, 0, r.stderr);
        assert.match(html, /drawn A 1/, `the fetched plugin did not draw: ${r.stderr}`);
      } else {
        // This machine's layer does not admit npm plugins: the approval says so, and the render does not run it.
        assert.match(fetched.out, /not approved: plugin\/gantt-npm is an npm plugin, and npm plugins do not run here/, fetched.out);
        assert.doesNotMatch(html, /drawn A 1/);
        assert.match(r.stderr, /npm plugin gantt-npm, and you have not approved its code[\s\S]*the deck’s folder/);
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test('G5: a plugin that writes a file when loaded in Node leaves no file after admission and render', { timeout: TIMEOUT }, async () => {
    const marker = path.join(home, 'loaded-in-node.txt');
    // No `require(` (admission refuses that); `process.getBuiltinModule` is how a Node-only effect
    // is reached without it. In the locked page `process` does not exist, so the same code throws there.
    const writer = `process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(marker)}, "loaded");\nfunction render(){ return "<p>x</p>"; }\nexport { render as default };`;
    // CONTROL: loaded in Node, it writes. A probe that cannot see a load proves nothing.
    const file = path.join(home, 'writer.mjs');
    fs.writeFileSync(file, writer);
    await import(pathToFileURL(file).href);
    assert.ok(fs.existsSync(marker), 'the control: importing the plugin in Node must write the marker');
    fs.rmSync(marker);
    // Admission of the bytes, then a render, for an npm entry and for a plain entry.
    const { admitNpmBundle } = require('../../../lib/packages/npm-plugin-admission.js');
    assert.equal(admitNpmBundle({ name: 'w', code: writer, sha256: sha(writer) }).ok, true, 'it is a well-formed bundle, so admission reaches the point where a load would happen');
    assert.equal(fs.existsSync(marker), false, 'admission loaded the plugin in Node');
    run({ name: 'gantt-npm', fence: 'gantt', source: 'npm', code: writer, pin: sha(writer) });
    assert.equal(fs.existsSync(marker), false, 'the door loaded the npm plugin in Node');
    run({ name: 'gantt-plugin', fence: 'gantt', code: writer });
    assert.equal(fs.existsSync(marker), false, 'the door loaded the plugin in Node');
  });
});
