/**
 * Integration: lattice-emulator's chart-family DOM transform.
 *
 * Builds a small fixture deck with one slide per chart layout (progress,
 * timeline-list, piechart) plus modifier composition, then asserts the
 * HTML sidecar contains the expected chart-frame skeleton and the
 * layout-specific markup the runtime/emulator parity contract depends on.
 *
 * The runtime path is verified at structural parity with the emulator in
 * the integration smoke test under .scratch/integration; this test pins
 * the build-path output so a regression in either path fails CI.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const { ROOT, runEmulator } = require('../../helpers/render');

describe('chart-family', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'chart-family.md');

  // Module-scoped memoization: the cached helper returns the same PDF path
  // for matching inputs, so all six tests below read the same sidecar.
  let _html;
  function getHtml() {
    if (_html !== undefined) return _html;
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const htmlPath = pdf.replace(/\.pdf$/, '.html');
    if (!fs.existsSync(htmlPath)) throw new Error(`HTML sidecar missing: ${htmlPath}`);
    _html = fs.readFileSync(htmlPath, 'utf8');
    return _html;
  }

  test('every chart-layout slide gets the chart-frame class', { timeout: 180000 }, () => {
    const html = getHtml();
    const sections = html.match(/<section[^>]*class="[^"]*"/g) || [];
    const charty = sections.filter(s =>
      /\b(progress|timeline-list|piechart)\b/.test(s) && !/\bagenda\b/.test(s)
    );
    assert.ok(charty.length >= 4, `expected ≥4 chart sections, got ${charty.length}`);
    for (const s of charty) {
      assert.match(s, /\bchart-frame\b/, `chart-frame missing from: ${s}`);
    }
  });

  test('progress slide emits progress-bars with one row per item', { timeout: 180000 }, () => {
    const html = getHtml();
    assert.match(html, /<div class="progress-bars">/);
    // Five rows in the first progress slide
    const firstProgress = html.match(/<section[^>]*class="progress chart-frame"[^>]*>[\s\S]*?<\/section>/);
    assert.ok(firstProgress, 'first progress section not found');
    const rows = (firstProgress[0].match(/<div class="progress-row">/g) || []).length;
    assert.equal(rows, 5, `expected 5 progress-row, got ${rows}`);
    // Status data attribute carries the pill token through to the fill
    assert.match(firstProgress[0], /<div class="progress-fill" data-s="on-track"/);
    assert.match(firstProgress[0], /<div class="progress-fill" data-s="blocked"/);
    // Numeric percentage rides the fill's leading edge as an in-bar span
    assert.match(firstProgress[0], /<span class="progress-pct">92%<\/span>/);
  });

  test('progress dark + minimal modifiers compose with chart-frame', { timeout: 180000 }, () => {
    const html = getHtml();
    // The combo slide: progress + dark + minimal + chart-frame all present
    assert.match(html, /class="progress dark minimal chart-frame"/);
  });

  test('timeline-list emits a spine with date pills + status pills + body', { timeout: 180000 }, () => {
    const html = getHtml();
    assert.match(html, /<div class="timeline-spine">/);
    const tl = html.match(/<section[^>]*class="timeline-list chart-frame"[^>]*>[\s\S]*?<\/section>/);
    assert.ok(tl, 'timeline-list section not found');
    const items = (tl[0].match(/<div class="timeline-item">/g) || []).length;
    assert.equal(items, 4, `expected 4 timeline-item, got ${items}`);
    // Date pills
    assert.match(tl[0], /<div class="timeline-pill">2024 Q3<\/div>/);
    assert.match(tl[0], /<div class="timeline-pill">2026 Q1<\/div>/);
    // Trailing status pills
    assert.match(tl[0], /<span class="chart-status" data-s="decision">decision<\/span>/);
    assert.match(tl[0], /<span class="chart-status" data-s="live">live<\/span>/);
    // Body of nested bullets
    assert.match(tl[0], /<div class="timeline-body">/);
  });

  test('piechart donut emits an SVG donut with proportional wedges and a legend', { timeout: 180000 }, () => {
    const html = getHtml();
    const pc = html.match(/<section[^>]*class="piechart donut chart-frame"[^>]*>[\s\S]*?<\/section>/);
    assert.ok(pc, 'piechart donut section not found');
    assert.match(pc[0], /<div class="piechart-figure">/);
    // SVG-native legend (2026-06-13-svg-native-legend.md): diagram + spine + key
    // share one viewBox, widened to 377 (disc 200 + two divider gaps + key rail;
    // the shared builder Math.ceils the exact rail width).
    assert.match(pc[0], /<svg class="piechart-svg" viewBox="0 0 377 200"/);
    // Donut path uses inner radius (r=50) — solid pies wouldn't carry it
    assert.match(pc[0], /A 50 50 0/);
    // 5 wedges + 5 SVG legend rows (swatch <rect> + label <text> per series)
    const wedges = (pc[0].match(/<path class="wedge"/g) || []).length;
    const swatches = (pc[0].match(/<rect class="chart-key-swatch"/g) || []).length;
    const labels = (pc[0].match(/<text class="chart-key-label"/g) || []).length;
    assert.equal(wedges, 5, `expected 5 wedges, got ${wedges}`);
    // Native Anima role on every wedge — the renderer declares `sector` so the chart-anima on-ramp
    // choreographs by the role, not by class-guessing (2026-07-19 §0.75). Attribute-only, non-painting.
    const roled = (pc[0].match(/<path class="wedge" data-mark="\d+" data-anima-role="sector"/g) || []).length;
    assert.equal(roled, 5, `expected 5 sector-roled wedges, got ${roled}`);
    assert.equal(swatches, 5, `expected 5 legend swatches, got ${swatches}`);
    assert.equal(labels, 5, `expected 5 legend labels, got ${labels}`);
  });

  test('chrome/body/caption skeleton extracts eyebrow, subtitle, italic caption', { timeout: 180000 }, () => {
    const html = getHtml();
    const firstProgress = html.match(/<section[^>]*class="progress chart-frame"[^>]*>[\s\S]*?<\/section>/);
    assert.ok(firstProgress);
    // Under the .viz-frame model (2026-07-15-viz-frame-merge) the chrome is
    // emitted flat — no .chart-header wrapper. Eyebrow, h2, and subtitle sit
    // top-level in section order; with Form on they hoist into .masthead-lede,
    // but this fixture pins form: off so they stay flat. Eyebrow is the leading
    // <p><code>...</code></p>, ahead of the h2.
    assert.match(firstProgress[0], /<p class="chart-eyebrow"><code>H1 2026 · Phase 1 readiness<\/code><\/p>\s*<h2>/);
    // Subtitle is the first paragraph after h2
    assert.match(firstProgress[0], /<p class="chart-subtitle">Snapshot taken at 14:00 UTC[^<]*<\/p>/);
    // Body wraps the chart payload; caption trails it as a <figcaption>, stripped of
    // the <em> wrapper. This fixture pins `form: off`, so no stage cell is built and
    // the <figcaption> has no <figure> around it — valid, and exactly the pre-retag
    // association (none). With Form on, the stage cell IS that <figure>.
    assert.match(firstProgress[0], /<div class="chart-body">[\s\S]*<\/div><figcaption class="chart-caption">Source: Linear · refreshed 2026-05-07<\/figcaption>/);
  });
});
