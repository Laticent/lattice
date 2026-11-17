/**
 * `montageTriptych` and `pngsToPdf` say WHY they made nothing.
 *
 * golden-diff printed "ImageMagick `montage`/`convert` missing on the runner" for every failed
 * montage. On #3248, and on every PR with changed slides since at least 2026-11-16, ImageMagick
 * was installed, so the line hid the real failure. On a null return each now records the reason
 * in `lastError`, and golden-diff prints it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { skipUnlessCI } = require('../../helpers/chrome');
const { montageTriptych, pngsToPdf } = require('../../../tools/pixel-check.js');

const hasMagick = spawnSync('montage', ['-version'], { stdio: 'ignore' }).status === 0;

test('a page with no before image names the missing side', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montage-err-'));
  try {
    const out = montageTriptych({ page: 4, oldPng: null, newPng: path.join(dir, 'new.png') }, path.join(dir, 'm.png'));
    assert.equal(out, null);
    assert.match(montageTriptych.lastError, /^page 4: no before image/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a montage ImageMagick rejects reports ImageMagick\'s own message', { skip: skipUnlessCI(!hasMagick, 'ImageMagick') }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montage-err-'));
  try {
    // Two files that exist but are not images: montage exits non-zero with a decode error.
    const a = path.join(dir, 'old.png');
    const b = path.join(dir, 'new.png');
    fs.writeFileSync(a, 'not a png');
    fs.writeFileSync(b, 'not a png');
    assert.equal(montageTriptych({ page: 1, oldPng: a, newPng: b }, path.join(dir, 'm.png')), null);
    assert.match(montageTriptych.lastError, /^montage exited \d+: \S/);
    assert.equal(pngsToPdf([a], path.join(dir, 'out.pdf')), null);
    assert.match(pngsToPdf.lastError, /^convert exited \d+: \S/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
