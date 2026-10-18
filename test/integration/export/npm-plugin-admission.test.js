/**
 * Integration: the three rules an npm plugin runs under (threat-model note
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 decisions 7 to 9), through the real
 * door and the real sandbox browser.
 *
 *   LAYER (7)   an npm plugin does not run where the OS layer reads OFF or cannot be measured.
 *               The same plugin as a plain, approved entry is the CONTROL: it reports the layer this
 *               machine gives, and the npm entry must run exactly when that layer is admissible.
 *   BUNDLE (8)  the door admits bytes against the pinned hash and leaves no dependency external.
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
