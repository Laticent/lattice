/**
 * On a phone page a timeline whose stacked entries do not fit at the type ladder's size is drawn whole and scaled
 * (`data-chart-form="over"`, `--tl-k`), the owner's over-capacity rule for every chart (2026-11-12,
 * engineering/decisions/2026-11-10-chart-form.md). Born from gallery-jargon.md's four-entry slide, which ran its last
 * entry 150px off a square page.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { tlHeight, tlScale } = require('../../../lib/plugins/chart-family/kinds/timeline-list/timeline-list.transform');

const render = (size, body) => String(createEngine().render(`---\ntheme: indaco\nsize: ${size}\n---\n\n<!-- _class: timeline-list -->\n\n## The plan.\n\n${body}`).html);
const spine = (html) => (/<div class="timeline-spine"[^>]*>/.exec(html) || [''])[0];

// gallery-jargon.md's slide, as the estimate reads it, and its spine's height measured in Chromium at each phone shape.
const JARGON = [
  { date: '2024 Q3', title: 'Pre-framework prioritization', status: '', body: ['Decisions in meetings. Close: 4 hours. No trail. We called it &quot;being agile.&quot;'] },
  { date: '2025 Q1', title: 'Framework proposal', status: 'decision', body: ['Architecture review approves the build — and is the build team.'] },
  { date: '2025 Q3', title: 'Pilot', status: 'pilot', body: ['One team, one quarter. 18 logged, 340 made.'] },
  { date: '2026 Q1', title: 'Production', status: 'live', body: ['Policy live. 12% adoption. Phase 02 planned for Q2.'] },
];

test('the estimate matches the measured spine at every phone shape, within a pixel', () => {
  for (const [aspect, measured] of [[1080 / 2340, 1095.1], [1080 / 1920, 1086.4], [0.8, 1065.3], [1, 806.25]]) {
    const h = tlHeight(JARGON, 972, aspect, 1);
    assert.ok(Math.abs(h - measured) < 1, `aspect ${aspect.toFixed(3)}: ${h.toFixed(1)} vs ${measured}`);
  }
});

test('the scale is the largest step at which the spine, laid out 1/k wider, fits', () => {
  assert.equal(tlScale(JARGON, 900, 1, 1), 1, 'it fits: no scale');
  const k = tlScale(JARGON, 657, 1, 1);
  assert.ok(k < 1 && k >= 0.4);
  assert.ok(tlHeight(JARGON, 972 / k, 1, 1) * k <= 657, 'fits at k');
  assert.ok(tlHeight(JARGON, 972 / (k + 0.02), 1, 1) * (k + 0.02) > 657, 'and not one step larger');
});

const long = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. \`202${i} Q1\` A milestone with a title long enough to wrap \`live\`\n   - A body line that runs on long enough to take two lines on a square page, as a real one does.\n`).join('');

test('a timeline too tall for a square page is marked over capacity and scaled; one that fits is not', () => {
  const over = spine(render('square', long(6)));
  assert.match(over, /data-chart-form="over"/);
  assert.match(over, /--tl-k:0\.\d+/);
  assert.doesNotMatch(spine(render('square', long(2))), /data-chart-form/);
});

test('a landscape slide is never scaled', () => {
  assert.doesNotMatch(spine(render('16:9', long(6))), /data-chart-form/);
});
