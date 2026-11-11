/**
 * A roadmap on a page read on a phone (roadmap.transform.js § ON A PAGE READ ON A PHONE): the phase cards stack, a
 * roadmap that fits one page stays one page, and one that does not is cut between whole cards into balanced pages. The
 * owner's call (2026-11-11), the same exception to the one-element-per-page split that kanban takes. Born from a
 * three-phase roadmap that split into five pages at mobile, one short card on each.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { carouselize } = require('../../../lib/core/carousel');

const deck = (size, phases, streams) => {
  const head = `| Workstream | ${phases.join(' | ')} |\n|---${phases.map(() => '|---').join('')}|\n`;
  const rows = Array.from({ length: streams }, (_, i) =>
    `| Stream ${i + 1} | ${phases.map((p) => `[x] ${p} item ${i + 1}`).join(' | ')} |\n`).join('');
  return `---\ntheme: indaco\nsize: ${size}\n---\n\n<!-- _class: roadmap -->\n\n## The plan.\n\n${head}${rows}`;
};
const split = (size, phases, streams) => {
  const m = createEngine().render(deck(size, phases, streams)).html.match(/(<section[^>]*class="roadmap[^"]*"[^>]*>)([\s\S]*?)<\/section>/);
  return { inner: m[2], pages: carouselize(m[1], m[2], { strategy: 'roadmap-horizons' }, 2, 'roadmap') };
};

test('a roadmap that fits a phone page stays one page', () => {
  for (const size of ['mobile', 'story']) {
    const { inner, pages } = split(size, ['Q1', 'Q2', 'Q3'], 2);
    assert.match(inner, /data-roadmap-fits/, `${size}: the grid says it fits`);
    assert.equal(pages, null, `${size}: the splitter leaves it whole`);
  }
});

test('a roadmap too tall for one page is cut between whole cards, the pages balanced', () => {
  const { inner, pages } = split('4:5', ['Q1', 'Q2', 'Q3', 'Q4'], 3);
  assert.doesNotMatch(inner, /data-roadmap-fits/);
  const groups = inner.split('<div class="horizons-page">').slice(1).map((g) => (g.match(/class="horizon-card"/g) || []).length);
  assert.ok(groups.length >= 2, `${groups.length} pages`);
  assert.equal(groups.reduce((a, b) => a + b, 0), 4, 'every card on a page, whole');
  assert.ok(Math.max(...groups) - Math.min(...groups) <= 1, `pages of ${groups.join(' + ')} cards`);
  assert.equal(pages.filter((p) => p.includes('class="horizon-card"')).length, groups.length, 'one body page per group');
});

test('a square page keeps the table, and stacks the cards when the author asks for them', () => {
  // The table sets its cells at 11pt or more at square and holds the roadmap on one page; the cards took five.
  assert.match(split('square', ['Q1', 'Q2'], 2).inner, /<table/);
  const m = createEngine().render(deck('square', ['Q1'], 2).replace('_class: roadmap', '_class: roadmap horizons')).html;
  assert.match(m, /<div class="horizons" data-roadmap-fits>/);
});

test('a landscape roadmap is drawn as it always was', () => {
  const html = createEngine().render(deck('16:9', ['Q1', 'Q2', 'Q3'], 3)).html;
  assert.doesNotMatch(html, /data-roadmap-fits|horizons-page/);
});
