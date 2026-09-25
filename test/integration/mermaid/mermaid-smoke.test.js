/**
 * Integration: Mermaid pre-rendering smoke test.
 *
 * Renders a deck with one trivial flowchart through lattice-emulator.js.
 * mmdc converts the ```mermaid block to SVG at build time; the emulator
 * inlines the SVG into the HTML. Asserts:
 *
 *   - Source text ("flowchart LR") is absent from the HTML — proves the
 *     pre-render actually fired (a regression that left ```mermaid``` as
 *     literal text would otherwise pass through as styled inline code).
 *   - The Mermaid wrapper survives with `class="mermaid"` so the
 *     palette CSS overrides target the right element.
 *   - Flowchart-specific classes (flowchart-link, edgePaths, flowchart-v2
 *     markers) are present, which proves Mermaid's render layer ran.
 *
 * Slow tier: one Mermaid render is ~3-5 s through mmdc + Puppeteer.
 * Kept to a single fixture (one diagram, one slide) to stay fast.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync } = require('child_process');
const { readStartMark } = require('../../../lib/core/export-shell-marks.js');

describe('mermaid-smoke', () => {
  const ROOT     = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE  = path.join(ROOT, 'test', 'fixtures', 'mermaid-smoke.md');

  const TIMEOUT = 60000;

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mermaid-'));
  }

  function run(args) {
    return spawnSync(process.execPath, [EMULATOR, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: TIMEOUT,
    });
  }

  function render(palette) {
    const dir = tmpDir();
    const pdf = path.join(dir, 'deck.pdf');
    const html = path.join(dir, 'deck.html');
    const args = [FIXTURE, pdf, '--quiet'];
    if (palette) args.push(palette);
    const r = run(args);
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.ok(fs.existsSync(html), 'expected HTML sidecar');
    return fs.readFileSync(html, 'utf8');
  }

  test('mermaid: source text does not leak into rendered HTML (pre-render fired)', { timeout: TIMEOUT }, () => {
    const html = render();
    assert.equal(html.indexOf('flowchart LR'), -1,
      'literal `flowchart LR` should not appear if mmdc rendered the block');
  });

  test('mermaid: rendered SVG carries the .mermaid wrapper class', { timeout: TIMEOUT }, () => {
    const html = render();
    assert.match(html, /class="[^"]*\bmermaid\b[^"]*"/);
  });

  test('mermaid: flowchart-specific classes survive (Mermaid layer ran)', { timeout: TIMEOUT }, () => {
    const html = render();
    // These classes are emitted by Mermaid's flowchart renderer; they would
    // be absent if the SVG were a generic placeholder.
    assert.match(html, /class="flowchart"/);
    assert.match(html, /class="edgePaths"/);
    assert.match(html, /flowchart-link/);
  });

  test('mermaid: arrow markers (flowchart-v2) are present', { timeout: TIMEOUT }, () => {
    const html = render();
    assert.match(html, /flowchart-v2/);
  });

  // The deck sheet is the engine's composed flat sheet, which strips comments — the palette's
  // own `/* @theme <name>` banner included. The sheet's start mark names the palette it was
  // composed for (lib/core/export-shell-marks.js), so that is what these read.
  test('mermaid: deck declared theme:indaco is honored (palette in HTML)', { timeout: TIMEOUT }, () => {
    const html = render();
    assert.equal(readStartMark(html)?.theme, 'indaco');
  });

  test('mermaid: explicit cuoio palette override changes the composed sheet', { timeout: TIMEOUT }, () => {
    const html = render('cuoio');
    assert.equal(readStartMark(html)?.theme, 'cuoio');
  });

  test('mermaid: SVG carries resolved color directives (theme variables resolved)', { timeout: TIMEOUT }, () => {
    const html = render();
    // Mermaid resolves its theme variables into the `<style>` it ships INSIDE the diagram's
    // own `<svg>`. Read THAT sheet: an earlier version of this test searched the whole
    // document for `style="fill:#…"` and passed only because a CSS comment in lattice.css
    // quoted one, so it proved nothing about the diagram.
    const at = html.indexOf('aria-roledescription="flowchart');
    assert.ok(at > 0, 'no flowchart svg in the export');
    const svg = html.slice(html.lastIndexOf('<svg', at), html.indexOf('</svg>', at));
    const sheet = (svg.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    assert.match(sheet, /(?:fill|stroke)\s*:\s*#[0-9A-Fa-f]{3,8}/, "expected a resolved fill/stroke in the diagram's own stylesheet");
  });
});
