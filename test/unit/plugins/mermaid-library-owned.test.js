/**
 * The Mermaid plugin OWNS its copy of the Mermaid library, and every surface ships that copy.
 *
 * We host third-party libraries ourselves: lib/plugins/mermaid/vendor/mermaid.min.js, recorded in the
 * plugin's manifest (`payload.vendored`: version + SHA-256), is what the browser pages stage beside the
 * runtime, what the CLI bake draws with, and what the Marp kit and the Export-to-Marp bundle carry.
 * `node_modules` is only the source `npm run vendor:plugins` refreshes it from when WE upgrade, so no
 * user downloads Mermaid and no install changes what ships (lib/plugins/payload-path.js).
 *
 * This replaced three builds held equal by a parity test (the root `mermaid-v11-min.js`, the npm
 * payload, and the bake's unminified `mermaid.js`). What is pinned here is that each reader reads the
 * ONE copy, and that the package an install brings is the version the copy was taken from — so a
 * Dependabot bump fails here until someone refreshes the copy on purpose and looks at the result.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const { payloadOf, payloadPath } = require('../../../lib/plugins/payload-path.js');
const COPY = 'lib/plugins/mermaid/vendor/mermaid.min.js';

test('the plugin vendors its library, and the copy is the one its manifest records', () => {
  const payload = payloadOf('mermaid');
  assert.equal(payload?.vendored?.file, 'vendor/mermaid.min.js');
  assert.equal(path.relative(ROOT, payloadPath('mermaid')), COPY);
  assert.equal(sha(path.join(ROOT, COPY)), payload.vendored.sha256);
});

test('the version is pinned exactly, and the installed package is the build the copy came from', () => {
  const payload = payloadOf('mermaid');
  const pin = require(path.join(ROOT, 'package.json')).dependencies.mermaid;
  assert.equal(pin, payload.vendored.version, `package.json pins mermaid "${pin}"; the copy is ${payload.vendored.version} — pin the exact version the plugin vendors`);
  const installed = require.resolve('mermaid/dist/mermaid.min.js', { paths: [ROOT] });
  assert.equal(sha(installed), payload.vendored.sha256,
    `the installed mermaid (${require('mermaid/package.json').version}) is not the build the plugin vendors (${payload.vendored.version}). ` +
    'Upgrading is deliberate: npm run vendor:plugins, then look at the diagram gallery.');
});

test('every surface reads the plugin\'s copy', () => {
  // The Marp kit and the Export-to-Marp bundle (lib/core/marp-bundle.js STATIC_ASSETS; the kit derives from it).
  const { STATIC_ASSETS } = require('../../../lib/core/marp-bundle.js');
  assert.equal(STATIC_ASSETS.find((a) => a.to === 'mermaid-v11-min.js')?.from, COPY);
  // The CLI bake and the CLI export page's hydrators resolve through payload-path.js.
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.match(read('lib/plugins/mermaid/shared/render-worker.js'), /const mermaidIife = payloadPath\('mermaid'\);/);
  assert.match(read('lib/plugins/hydrate-script.js'), /return libraryPath\(h\.name\);/);
  // The docs site stages the plugin's copy beside the runtime.
  assert.match(read('docs/scripts/sync-playground-assets.mjs'), /\.map\(\(\[name, d\]\) => \[d\.payload\.file, libraryPath\(name\)\]\)/);
  // No other build of Mermaid is read by our code.
  for (const dir of ['lib', 'tools', 'docs/scripts']) {
    // `git grep` exits 1 when nothing matches, which is the passing case.
    const r = require('node:child_process').spawnSync('git', ['grep', '-l', '-E', "mermaid/dist/mermaid(\\.min)?\\.js'", '--', dir], { cwd: ROOT, encoding: 'utf8' });
    assert.ok(r.status === 0 || r.status === 1, `git grep failed: ${r.stderr}`);
    const hits = r.stdout.trim().split('\n').filter(Boolean)
      // The manifest names its update source; remote-ref.js only ADMITS that path in a sample deck's
      // <script> (a development tree's deck may load it) — neither reads a build.
      .filter((f) => !f.includes('/vendor/') && f !== 'lib/plugins/mermaid/mermaid.manifest.json' && f !== 'lib/core/remote-ref.js');
    assert.deepEqual(hits, [], `${hits.join(', ')} reads Mermaid from node_modules; read the plugin's copy (lib/plugins/payload-path.js)`);
  }
});
