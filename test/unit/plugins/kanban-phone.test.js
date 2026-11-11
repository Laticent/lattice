/**
 * A kanban on a page read on a phone (kanban.transform.js § ON A PAGE READ ON A PHONE): the lanes stack, a board that
 * fits one page stays one page, and one that does not is cut between whole lanes into balanced pages, a lane taller
 * than a page continued under its name marked "(cont.)". The owner's call (2026-11-11), an exception to the
 * one-element-per-page split for kanban and roadmap. Born from a four-lane board that split into five pages at mobile,
 * each page two or three cards in a page built for ten.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { carouselize } = require('../../../lib/core/carousel');

const lane = (name, n) => `- ${name}\n` + Array.from({ length: n }, (_, i) => `  - ${name} task ${i + 1} \`S\`\n`).join('');
const deck = (size, body) => `---\ntheme: indaco\nsize: ${size}\n---\n\n<!-- _class: kanban -->\n\n## The board.\n\n${body}`;
const section = (html) => html.match(/(<section[^>]*class="kanban[^"]*"[^>]*>)([\s\S]*?)<\/section>/);
const split = (size, body) => {
  const m = section(createEngine().render(deck(size, body)).html);
  return { inner: m[2], pages: carouselize(m[1], m[2], { strategy: 'kanban-lanes' }, 2, 'kanban') };
};

test('a board that fits a phone page stays one page', () => {
  for (const size of ['mobile', 'story', '4:5']) {
    const { inner, pages } = split(size, ['Backlog', 'In progress', 'Review', 'Done'].map((n) => lane(n, 1)).join(''));
    assert.match(inner, /data-kanban-fits/, `${size}: the board says it fits`);
    assert.equal(pages, null, `${size}: the splitter leaves it whole`);
  }
});

test('a board too tall for one page is cut between whole lanes, the pages balanced', () => {
  const { inner, pages } = split('square', ['Intake', 'Backlog', 'Build', 'Review', 'Staging', 'Done'].map((n) => lane(n, 2)).join(''));
  assert.doesNotMatch(inner, /data-kanban-fits/);
  const groups = inner.split('<div class="kanban-page">').slice(1).map((g) => (g.match(/class="kanban-column"/g) || []).length);
  assert.ok(groups.length >= 2, `${groups.length} pages`);
  assert.equal(groups.reduce((a, b) => a + b, 0), 6, 'every lane on a page, whole');
  assert.ok(Math.max(...groups) - Math.min(...groups) <= 1, `pages of ${groups.join(' + ')} lanes, not one full and one near empty`);
  // A cover, then one body page per group.
  assert.equal(pages.filter((p) => p.includes('class="kanban-board"')).length, groups.length);
});

test('a lane taller than a page carries its cards on under its name, marked (cont.)', () => {
  const { inner } = split('square', lane('Backlog', 14) + lane('Done', 1));
  assert.match(inner, /<div class="kanban-column-header">Backlog <span class="lat-cont">\(cont\.\)<\/span><\/div>/);
  const cards = (inner.match(/data-label="Backlog task \d+"/g) || []);
  assert.equal(new Set(cards).size, 14, 'every card, once');
  assert.equal(cards.length, 14);
});

test('a landscape board is drawn as it always was', () => {
  const html = createEngine().render(deck('16:9', ['Backlog', 'In progress'].map((n) => lane(n, 2)).join(''))).html;
  assert.doesNotMatch(html, /data-kanban-fits|kanban-page|lat-cont/);
});
