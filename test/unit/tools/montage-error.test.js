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
const { montageTriptych, pngsToPdf } = require('../../../tools/pixel-check.js');

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

// Stub `montage` and `convert` that fail the way ImageMagick does, so the test needs no ImageMagick and
// passes or fails on pixel-check.js alone (HARD RULE #32): CI's unit job does not install it.
test('a montage or PDF ImageMagick rejects reports ImageMagick\'s own message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montage-err-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const tool of ['montage', 'convert']) {
    fs.writeFileSync(path.join(bin, tool), `#!/bin/sh\necho "${tool}-im6.q16: improper image header" >&2\nexit 1\n`, { mode: 0o755 });
  }
  const savedPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${savedPath}`;
  try {
    const a = path.join(dir, 'old.png');
    const b = path.join(dir, 'new.png');
    fs.writeFileSync(a, 'x');
    fs.writeFileSync(b, 'x');
    assert.equal(montageTriptych({ page: 1, oldPng: a, newPng: b }, path.join(dir, 'm.png')), null);
    assert.equal(montageTriptych.lastError, 'montage exited 1: montage-im6.q16: improper image header');
    assert.equal(pngsToPdf([a], path.join(dir, 'out.pdf')), null);
    assert.equal(pngsToPdf.lastError, 'convert exited 1: convert-im6.q16: improper image header');
  } finally {
    process.env.PATH = savedPath;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
