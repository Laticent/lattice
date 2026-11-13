/**
 * On a phone page a kanban, roadmap or journey whose stacked form fits the page stays ONE page; one that does not
 * splits as it always has, a lane, card or stage a page. The owner's call (2026-11-12), recorded in
 * engineering/decisions/2026-09-01-autosplit-splits-on-structure.md. Born from a three-lane kanban that split into
 * three near-empty phone pages under main's one-element-per-page rule.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { carouselize } = require('../../../lib/core/carousel');

const render = (size, cls, body) => {
  const html = createEngine().render(`---\ntheme: indaco\nsize: ${size}\n---\n\n<!-- _class: ${cls} -->\n\n## The chart.\n\n${body}`).html;
  return html.match(/(<section[^>]*class="[^"]*\b(?:kanban|roadmap|journey)\b[^"]*"[^>]*>)([\s\S]*?)<\/section>/);
};
const lanes = (n, cards) => Array.from({ length: n }, (_, i) =>
  `- Lane ${i + 1}\n` + Array.from({ length: cards }, (_, j) => `  - Lane ${i + 1} task ${j + 1} \`S\`\n`).join('')).join('');
const roadmap = (phases, streams) => `| Workstream | ${phases.join(' | ')} |\n|---${phases.map(() => '|---').join('')}|\n` +
  Array.from({ length: streams }, (_, i) => `| Stream ${i + 1} | ${phases.map((p) => `[x] ${p} item`).join(' | ')} |\n`).join('');
const journey = (stages, tasks) => Array.from({ length: stages }, (_, i) =>
  `- Stage ${i + 1}\n` + Array.from({ length: tasks }, (_, j) => `  - Task ${j + 1}: 4: prospect\n`).join('')).join('');

const CASES = [
  ['kanban', 'kanban-lanes', lanes(3, 1), lanes(6, 4), /data-kanban-fits/],
  ['roadmap', 'roadmap-horizons', roadmap(['Q1', 'Q2'], 2), roadmap(['Q1', 'Q2', 'Q3', 'Q4'], 4), /data-roadmap-fits/],
  ['journey', 'journey-stages', journey(2, 2), journey(5, 3), /data-journey-fits/],
];

for (const [cls, strategy, small, big, mark] of CASES) {
  test(`${cls}: a stacked chart that fits a phone page stays one page`, () => {
    const m = render('mobile', cls, small);
    assert.match(m[2], mark);
    assert.equal(carouselize(m[1], m[2], { strategy }, 2, cls), null);
  });

  test(`${cls}: one too tall for the page splits as before`, () => {
    const m = render('4:5', cls, big);
    assert.doesNotMatch(m[2], mark);
    const pages = carouselize(m[1], m[2], { strategy }, 2, cls);
    assert.ok(pages && pages.length > 2, `${pages && pages.length} pages`);
  });

  test(`${cls}: a landscape slide is never marked`, () => {
    assert.doesNotMatch(render('16:9', cls, small)[2], mark);
  });
}
