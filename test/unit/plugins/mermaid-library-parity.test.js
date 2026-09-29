/**
 * The Mermaid library ships twice, and the two copies must be ONE build.
 *
 *   node_modules/mermaid/dist/mermaid.min.js   the Mermaid plugin's `payload` — what every browser
 *                                              surface draws with (lib/plugins/mermaid/…manifest.json,
 *                                              staged beside lattice-runtime.js), and the package the
 *                                              CLI bake resolves (`mermaid/dist/mermaid.js`, the same
 *                                              version, lib/integrations/mermaid/render-worker.js)
 *   mermaid-v11-min.js (committed, repo root)  what the Export-to-Marp kit ships and what the
 *                                              integration tier's browser harness loads
 *                                              (test/helpers/render.js)
 *
 * They are byte-identical today. Dependabot bumps `mermaid` on its own, so without this the
 * preview and the export would move to a new Mermaid while the kit and every browser test stayed on
 * the old one — the preview drawing with a build no browser test ran (HARD RULE #25 inversion lens,
 * phase D's browser half). When this fails, refresh the committed copy:
 *   cp node_modules/mermaid/dist/mermaid.min.js mermaid-v11-min.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('the committed mermaid-v11-min.js is the payload build, byte for byte', () => {
  const payload = require.resolve('mermaid/dist/mermaid.min.js', { paths: [ROOT] });
  const committed = path.join(ROOT, 'mermaid-v11-min.js');
  assert.equal(sha(committed), sha(payload),
    `mermaid-v11-min.js differs from ${path.relative(ROOT, payload)} (mermaid ${require('mermaid/package.json').version}). ` +
    'Refresh the committed copy: cp node_modules/mermaid/dist/mermaid.min.js mermaid-v11-min.js');
});
