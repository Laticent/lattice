/**
 * A run that also writes the player keeps the deck's own canvas (lib/core/export-canvas.js `player`).
 *
 * A 4K deck's PDF or PowerPoint renders at HD by default, but `a.pdf --player` writes the player as `a.html` from the
 * SAME render, and the player never follows the canvas. Before this, that player came out at 1280 x 720
 * (tools/verify-player-input.mjs "4K: the deck keeps its OWN canvas"). Both the extension and the extensionless sidecar
 * forms are driven, through the real CLI.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-player-canvas-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const deck = path.join(tmp, 'four-k.md');
fs.writeFileSync(deck, '---\nsize: 4k\ntheme: indaco\n---\n\n# Four K\n\nOne slide.\n');

function render(out, extra = []) {
  const r = spawnSync(process.execPath, ['lattice.js', deck, out, '--quiet', ...extra], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}
const pageWidthPt = (pdf) => Number(/Page size:\s+([\d.]+) x/.exec(spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout)[1]);
const playerIs4k = (html) => fs.readFileSync(html, 'utf8').includes('3840px');

test('`a.pdf --player` and an extensionless `--player` keep a 4K deck at 4K, the player and the PDF beside it', { timeout: 240_000 }, () => {
  render(path.join(tmp, 'with-ext.pdf'), ['--player']);
  assert.ok(playerIs4k(path.join(tmp, 'with-ext.html')), 'the player beside a .pdf keeps 3840px');
  assert.equal(pageWidthPt(path.join(tmp, 'with-ext.pdf')), 2880, 'one render serves both, so the PDF is 4K too');

  render(path.join(tmp, 'sidecar'), ['--player']);
  assert.ok(playerIs4k(path.join(tmp, 'sidecar.html')), 'the extensionless sidecar player keeps 3840px');
});

test('without --player a 4K deck still exports its PDF at HD, and --size hd lowers a player run', { timeout: 240_000 }, () => {
  render(path.join(tmp, 'plain.pdf'));
  assert.equal(pageWidthPt(path.join(tmp, 'plain.pdf')), 960, 'the HD default for a 4K deck is unchanged');

  render(path.join(tmp, 'asked.pdf'), ['--player', '--size', 'hd']);
  assert.equal(pageWidthPt(path.join(tmp, 'asked.pdf')), 960, 'an asked --size wins over the player rule');
  assert.ok(!playerIs4k(path.join(tmp, 'asked.html')));
});
