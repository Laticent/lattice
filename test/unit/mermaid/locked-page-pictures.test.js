/**
 * Unit: the Mermaid worker's locked page re-addresses each `file:` picture onto its own origin and puts the address
 * back in the drawn SVG (lib/plugins/mermaid/shared/render-worker.js `readdressPictures` / `restorePictures`), so the
 * export's markup is what the old `file:` page drew. The end-to-end arm is test/integration/export/mermaid-worker-confine.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdressPictures, restorePictures, LOCKED_ORIGIN } = require('../../../lib/plugins/mermaid/shared/render-worker.js');

test('every file: address leaves the definition and comes back in the SVG unchanged', () => {
  const a = 'file:///home/me/deck/pic%20one.svg';
  const b = "file:///home/me/deck/it's.png";
  const back = new Map();
  const def = `flowchart LR\n A@{ img: "${a}" }\n B@{ img: "${b}" }\n C@{ img: "${a}" }`;
  const out = readdressPictures(def, back);
  assert.doesNotMatch(out, /file:/);
  assert.equal(back.size, 2, 'one origin address per distinct picture');
  for (const there of back.keys()) assert.ok(there.startsWith(`${LOCKED_ORIGIN}/__file__/`) && /^[\w:/.-]+$/.test(there), there);
  const drawn = out.replace(/img: "([^"]+)"/g, '<image href="$1"/>');
  assert.equal(restorePictures(drawn, back), def.replace(/img: "([^"]+)"/g, '<image href="$1"/>'));
});

test('a definition with no file: address is untouched', () => {
  const back = new Map();
  assert.equal(readdressPictures('graph TD\n A["https://x.example"] --> B', back), 'graph TD\n A["https://x.example"] --> B');
  assert.equal(back.size, 0);
});
