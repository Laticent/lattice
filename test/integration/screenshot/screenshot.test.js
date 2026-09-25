/**
 * Integration: end-to-end screenshot pipeline.
 *
 * Renders a small fixture deck via lattice-emulator (HTML sidecar
 * dropped alongside the PDF), then runs tools/screenshot-slides.js
 * against it. Asserts the resulting PNGs exist at the expected
 * dimensions for the requested scale factor, and that selectors
 * resolve to the right slide.
 *
 * Slow tier (spawns Chromium) — kept tight by using a 3-slide
 * fixture (test/fixtures/preview-deck.md) with no Mermaid, so the
 * full render+screenshot cycle is under 5 s.
 */

const { readStartMark } = require('../../../lib/core/export-shell-marks.js');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync } = require('child_process');

describe('screenshot', () => {
  const ROOT       = path.join(__dirname, '..', '..', '..');
  const EMULATOR   = path.join(ROOT, 'lattice-emulator.js');
  const SCREENSHOT = path.join(ROOT, 'tools', 'screenshot-slides.js');
  const FIXTURE    = path.join(ROOT, 'test', 'fixtures', 'preview-deck.md');

  const TIMEOUT = 60000;

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-screenshot-'));
  }

  function run(script, args, env = {}) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: TIMEOUT,
    });
  }

  // PNG dimension probe — read the IHDR chunk (bytes 16-23) without
  // pulling in sharp or pngjs.
  function readPngDimensions(file) {
    const buf = fs.readFileSync(file);
    assert.equal(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a', `not a PNG: ${file}`);
    const width  = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  function renderFixture() {
    const dir = tmpDir();
    const pdf = path.join(dir, 'deck.pdf');
    const html = path.join(dir, 'deck.html');
    const r = run(EMULATOR, [FIXTURE, pdf, '--quiet']);
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.ok(fs.existsSync(html), `expected HTML sidecar at ${html}`);
    return { dir, html, pdf };
  }

  test('integration: emulator + screenshot at scale=3 produces a 3840×2160 PNG', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', '1', '--scale', '3', '--quiet']);
    assert.equal(r.status, 0, `screenshot failed: ${r.stderr}`);

    const png = path.join(dir, '001.png');
    assert.ok(fs.existsSync(png), `expected ${png}`);
    const { width, height } = readPngDimensions(png);
    assert.equal(width, 3840, 'scale=3 should produce 3840 width');
    assert.equal(height, 2160, 'scale=3 should produce 2160 height');
    assert.ok(fs.statSync(png).size > 5000, 'PNG should be non-trivial size (catches blank-screenshot bugs)');
  });

  test('integration: scale=1 produces a 1280×720 PNG', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', '1', '--scale', '1', '--quiet']);
    assert.equal(r.status, 0);
    const { width, height } = readPngDimensions(path.join(dir, '001.png'));
    assert.equal(width, 1280);
    assert.equal(height, 720);
  });

  test('integration: h2-substring selector resolves end-to-end', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    // 'h2:Three cards' should match slide 2 (the cards-grid title).
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', 'h2:Three cards', '--scale', '1', '--quiet']);
    assert.equal(r.status, 0, `screenshot failed: ${r.stderr}`);
    assert.ok(fs.existsSync(path.join(dir, '002.png')), 'h2:Three cards should match slide 2');
    assert.ok(!fs.existsSync(path.join(dir, '001.png')), 'should not screenshot slide 1');
  });

  test('integration: class-substring selector resolves end-to-end', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', 'class:closing', '--scale', '1', '--quiet']);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(path.join(dir, '003.png')), 'class:closing should match slide 3');
  });

  test('integration: selector matching nothing exits 1 with helpful stderr', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', 'h2:no-such-text', '--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /matched no slide/);
    assert.match(r.stderr, /available h2 titles/);
  });

  test('integration: bad selector syntax exits 2', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', 'gibberish:foo', '--quiet']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /selector not understood/);
  });

  test('integration: --selector all screenshots every slide in the fixture', { timeout: TIMEOUT }, () => {
    const { dir, html } = renderFixture();
    const r = run(SCREENSHOT, ['--html', html, '--out', dir, '--selector', 'all', '--scale', '1', '--quiet']);
    assert.equal(r.status, 0);
    // Fixture has 3 slides.
    for (const num of ['001', '002', '003']) {
      assert.ok(fs.existsSync(path.join(dir, `${num}.png`)), `expected ${num}.png`);
    }
  });

  test('integration: emulator HTML sidecar contains expected palette declaration', { timeout: TIMEOUT }, () => {
    const { html } = renderFixture();
    const text = fs.readFileSync(html, 'utf8');
    // Fixture declares `theme: indaco`. The deck sheet is the engine's composed flat sheet,
    // which strips the palette's `/* @theme` banner, so its start mark names the palette.
    assert.equal(readStartMark(text)?.theme, 'indaco');
    // And the layout engine is inside it: a token only the base declares resolves in it.
    assert.match(text, /--fs-body\s*:/);
  });

  test('integration: emulator produces 3 sections for the 3-slide fixture', { timeout: TIMEOUT }, () => {
    const { html } = renderFixture();
    const text = fs.readFileSync(html, 'utf8');
    // Count `<section ` (with trailing space, to skip CSS comment hits like "<section>...").
    const matches = text.match(/<section [^>]*data-lattice-slide=/g) || [];
    assert.equal(matches.length, 3, `expected 3 slide sections, got ${matches.length}`);
  });
});
