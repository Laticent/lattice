/**
 * Unit: lib/components/chart/funnel/funnel.transform.js — kernel for the
 * `funnel` chart-family member.
 *
 * Section dispatch + chart-frame wrapping live in chart-family.js (funnel is
 * one of CHART_LAYOUTS); this kernel just produces the figure HTML. Tests
 * here cover the layers chart-family delegates to:
 *
 *   1. Source parsing: parseFunnel — label / value split, comma + unit
 *      tolerance, the depth-aware top-level <li> walk, the < 2-stage bail.
 *   2. Geometry: buildFunnel band widths are proportional to value, the
 *      widest sets full width, and a tiny stage is floored to minW.
 *   3. Conversion read: the stage-to-stage % printed in the gaps (n − 1 of
 *      them, rounded), and the per-band --i palette index.
 *   4. Escaping: author text with &, <, > survives into the SVG escaped.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFunnel,
  buildFunnel,
  GEOM,
} = require('../../../lib/components/chart/funnel/funnel.transform');

// Build the <ul> inner HTML the dispatcher hands the kernel. Each stage is
// `<li>Label <code>value</code></li>`, matching Marp Core / emulator output.
function ul(rows) {
  return rows
    .map(([label, value]) => `<li>${label}${value != null ? ` <code>${value}</code>` : ''}</li>`)
    .join('');
}

describe('funnel kernel', () => {
  describe('parseFunnel — source parsing', () => {
    test('splits each li into label, raw value, and a parsed number', () => {
      const m = parseFunnel(ul([['Visitors', '12,000'], ['Signups', '4,800'], ['Paid', '864']]));
      assert.deepEqual(m.stages.map((s) => s.label), ['Visitors', 'Signups', 'Paid']);
      assert.deepEqual(m.stages.map((s) => s.valueRaw), ['12,000', '4,800', '864']);
      assert.deepEqual(m.stages.map((s) => s.num), [12000, 4800, 864]);
    });

    test('tolerates commas and units in the value, keeping the raw text', () => {
      const m = parseFunnel(ul([['Impressions', '240,000 views'], ['Clicks', '$38.4k']]));
      assert.equal(m.stages[0].num, 240000);
      assert.equal(m.stages[0].valueRaw, '240,000 views');
      // The first numeric run wins; the raw label text is preserved verbatim.
      assert.equal(m.stages[1].num, 38.4);
      assert.equal(m.stages[1].valueRaw, '$38.4k');
    });

    test('maxNum is the largest stage value (full-width anchor)', () => {
      const m = parseFunnel(ul([['A', '600'], ['B', '1000'], ['C', '320']]));
      assert.equal(m.maxNum, 1000);
    });

    test('a flat all-zero series falls back to maxNum 1 (never divides by zero)', () => {
      const m = parseFunnel(ul([['A', '0'], ['B', '0']]));
      assert.equal(m.maxNum, 1);
    });

    test('returns null below two stages — nothing to taper', () => {
      assert.equal(parseFunnel(''), null);
      assert.equal(parseFunnel(ul([['Only one', '1']])), null);
      assert.ok(parseFunnel(ul([['A', '2'], ['B', '1']])), 'two stages is the floor');
    });

    test('the top-level <li> walk is depth-aware — a nested list adds no stage', () => {
      const m = parseFunnel('<li>Top <code>10</code><ul><li>child</li></ul></li><li>Bottom <code>5</code></li>');
      assert.equal(m.stages.length, 2, 'nested <li> is not counted as its own stage');
    });
  });

  describe('buildFunnel — figure scaffold', () => {
    test('wraps an SVG in a funnel-figure carrying the stage count', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50'], ['C', '25']])));
      assert.match(html, /<div class="funnel-figure" style="--funnel-stages:3">/);
      assert.match(html, new RegExp(`viewBox="${GEOM.viewBox}"`));
    });

    test('the SVG is NAMED and reachable — never aria-hidden', () => {
      // This assertion used to be `assert.match(html, /aria-hidden="true"/)` — it
      // pinned the defect in place. Every stage label and conversion percentage is
      // an SVG <text> inside this root, and `.funnel-figure` wraps nothing else but
      // an inert <template>, so hiding the root made the entire chart absent from
      // the accessibility tree: a screen reader found an empty box. Semantic-html
      // ADR §17.5.
      const html = buildFunnel(parseFunnel(ul([['Visitors', '10000'], ['Signups', '2300'], ['Paid', '410']])));
      assert.doesNotMatch(html, /aria-hidden="true"/, 'the chart must stay in the accessibility tree');
      assert.match(html, /<svg[^>]*role="img"[^>]*>/, 'it is a graphic, and says so');
      assert.match(html, /<title>Funnel chart<\/title>/, 'and it has an accessible name');
      // The <desc> carries the DATA a sighted reader gets from the labels — the
      // title alone names the chart type without saying anything about it.
      assert.match(html, /<desc>Stages — Visitors 10000, Signups 2300, Paid 410<\/desc>/);
    });

    test('emits one band per stage, each tagged with its palette index', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50'], ['C', '25']])));
      const idx = [...html.matchAll(/funnel-band" data-mark="\d+"[^>]*style="--i:(\d+)"/g)].map((x) => +x[1]);
      assert.deepEqual(idx, [0, 1, 2]);
    });

    test('each band carries data-mark aligned with its stage index', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50'], ['C', '25']])));
      const marks = [...html.matchAll(/funnel-band" data-mark="(\d+)"/g)].map((x) => +x[1]);
      assert.deepEqual(marks, [0, 1, 2]);
    });

    test('emits native data-anima-role metadata (bar on bands, label on text) and NO id', () => {
      // The renderer declares the ANIMATION ROLE so Anima choreographs authoritatively (not by
      // class-guessing) — but mints per-mark ids at ingest, so the marks carry no id (a fixed
      // funnel-band-N would collide across two funnels). 2026-07-19 §0.75.
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50'], ['C', '25']])));
      assert.equal((html.match(/class="funnel-band" data-mark="\d+" data-anima-role="bar"/g) || []).length, 3, 'each band roled "bar"');
      assert.match(html, /class="funnel-label"[^>]*data-anima-role="label"/, 'labels roled "label"');
      assert.match(html, /class="funnel-conv"[^>]*data-anima-role="label"/, 'conversion text roled "label"');
      assert.doesNotMatch(html, /\bid="funnel-/, 'no non-unique funnel-* ids baked into the export');
    });
  });

  describe('buildFunnel — per-mark detail (interactive reveal substrate)', () => {
    // A stage may carry an optional nested sublist — captured as present-mode
    // detail (inert <template>) + a speaker-note fallback, byte-identical export.
    const withDetail =
      '<li>Visitors <code>12000</code><ul><li>Top of funnel</li><li>Organic <code>60%</code></li></ul></li>' +
      '<li>Paid <code>864</code></li>';

    test('a plain funnel emits no detail payload and no note (byte-identical)', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50']])));
      assert.doesNotMatch(html, /chart-details/);
      assert.doesNotMatch(html, /<!--/);
    });

    test('a detailed stage emits an inert template keyed by data-mark', () => {
      const html = buildFunnel(parseFunnel(withDetail));
      assert.match(html, /<div class="chart-details" hidden>/);
      assert.match(html, /<template class="chart-detail" data-mark="0">/);
      // Only the detailed stage gets a template (stage 1 has none).
      assert.equal((html.match(/class="chart-detail"/g) || []).length, 1);
    });

    test('the same detail folds into a Marp-faithful speaker-note comment', () => {
      const html = buildFunnel(parseFunnel(withDetail));
      assert.match(html, /<!-- Visitors \(12000\): Top of funnel · Organic 60% -->/);
    });

    test('the nested detail sublist does not leak into a visible text node', () => {
      const html = buildFunnel(parseFunnel(withDetail));
      assert.match(html, /<text class="funnel-label"[^>]*>(?:<tspan[^>]*>)?Visitors</);
      // The detail rides the inert <template> only — never a painted SVG <text>.
      assert.doesNotMatch(html, /<t(?:ext|span)[^>]*>Top of funnel</);
    });

    test('emits a label and a value text node per stage', () => {
      const html = buildFunnel(parseFunnel(ul([['Visitors', '12,000'], ['Paid', '864']])));
      assert.equal((html.match(/class="funnel-label"/g) || []).length, 2);
      assert.equal((html.match(/class="funnel-value"/g) || []).length, 2);
      assert.match(html, />Visitors</);
      assert.match(html, />12,000</);
    });
  });

  describe('buildFunnel — portrait box (render-time orientation)', () => {
    const model = parseFunnel(ul([['A', '100'], ['B', '50'], ['C', '25']]));

    test('portrait emits a TALL viewBox so the funnel fills a portrait box', () => {
      assert.match(buildFunnel(model, 'portrait'), /viewBox="0 0 320 420"/);
    });

    test('landscape output is BYTE-IDENTICAL for no-arg / undefined / landscape / square', () => {
      const base = buildFunnel(model);
      assert.equal(buildFunnel(model, undefined), base, 'undefined === no-arg');
      assert.equal(buildFunnel(model, 'landscape'), base, 'landscape === no-arg');
      assert.equal(buildFunnel(model, 'square'), base, 'square stays landscape geom');
      assert.match(base, new RegExp(`viewBox="${GEOM.viewBox}"`));
    });

    test('ONLY portrait diverges from the landscape geometry', () => {
      assert.notEqual(buildFunnel(model, 'portrait'), buildFunnel(model));
    });
  });

  describe('buildFunnel — band geometry', () => {
    // Pull each polygon's top-edge width (x of second point − x of first).
    const topWidths = (html) =>
      [...html.matchAll(/points="([\d.]+),[\d.]+ ([\d.]+),/g)].map((x) => +x[2] - +x[1]);

    test('the widest value spans full width; others scale proportionally', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50']])));
      const [wA, wB] = topWidths(html);
      assert.equal(wA, GEOM.fullW, 'the max-value band is full width');
      assert.ok(Math.abs(wB - GEOM.fullW / 2) < 0.5, 'half the value → half the width');
    });

    test('a tiny stage is floored to minW so it still renders', () => {
      const html = buildFunnel(parseFunnel(ul([['Big', '1000'], ['Tiny', '1']])));
      const [, wTiny] = topWidths(html);
      assert.equal(wTiny, GEOM.minW, 'below the floor clamps to minW, not to ~0');
    });
  });

  describe('buildFunnel — conversion read', () => {
    test('prints a rounded stage-to-stage % in each gap (n − 1 of them)', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '100'], ['B', '50'], ['C', '20']])));
      const convs = [...html.matchAll(/funnel-conv[^>]*>(?:<tspan[^>]*>)?(\d+)%/g)].map((x) => +x[1]);
      assert.deepEqual(convs, [50, 40], 'B/A = 50%, C/B = 40%; no conv after the last stage');
    });

    test('rounds to the nearest integer percent', () => {
      const html = buildFunnel(parseFunnel(ul([['A', '12000'], ['B', '4800']])));
      const convs = [...html.matchAll(/funnel-conv[^>]*>(?:<tspan[^>]*>)?(\d+)%/g)].map((x) => +x[1]);
      assert.deepEqual(convs, [40]);
    });
  });

  describe('buildFunnel — escaping', () => {
    test('author text with &, <, > is escaped into the SVG', () => {
      const html = buildFunnel(parseFunnel(ul([['R&D pipeline', '100'], ['Shipped', '40']])));
      assert.match(html, />R&amp;D pipeline</);
      assert.doesNotMatch(html, /R&D pipeline/);
    });
  });
});
