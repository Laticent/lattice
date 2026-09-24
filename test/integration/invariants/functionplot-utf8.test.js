/**
 * A function-plot's non-ASCII text survives the bake, byte for byte.
 *
 * The fence packs its config as UTF-8 base64 (`lib/core/base64-utf8.js`). Both inflaters,
 * the runtime's and the one the emulator writes into the render page, decoded it with a
 * bare `atob`, which hands each UTF-8 byte back as its own character. So an axis label
 * `x²` shipped as `xÂ²` (drawn `XÂ²`) in the PDF, in every `--player` export, and in the
 * `--read` article that re-hosts the baked plot. Measured before the fix on this deck:
 * `--player` carried `Â²` twice and `x²` never; `--read` carried `Â²` once.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');

const DECK = '---\ntheme: indaco\n---\n\n# A plot with a superscript\n\n' +
  'The next slide draws a parabola and labels its axis with a superscript two.\n\n---\n\n' +
  '## The square\n\n```functionplot\n{\n  "data": [{ "fn": "x^2" }],\n' +
  '  "xAxis": { "domain": [-3, 3], "label": "x" },\n  "yAxis": { "domain": [0, 9], "label": "x²" },\n' +
  '  "grid": true\n}\n```\n';

function render(dir, name, args) {
  const out = path.join(dir, name);
  const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), path.join(dir, 'deck.md'), out, 'indaco', ...args, '-q'], {
    cwd: ROOT, encoding: 'utf8', timeout: 900000,
  });
  assert.equal(res.status, 0, `render failed (${args.join(' ')}):\n${res.stderr}`);
  return fs.readFileSync(out, 'utf8');
}

for (const flag of ['--player', '--read']) {
  test(`${flag} keeps a function-plot's x² as x²`, { timeout: 900000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-fp-utf8-'));
    try {
      fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
      const html = render(dir, 'out.html', [flag]);
      assert.match(html, />x²<\/text>/, 'the baked axis label must read x²');
      assert.doesNotMatch(html, /Â²/, 'Â² is x² decoded one byte per character');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
