/**
 * Unit: `redline-blocks` with `noteOwn` gives the why list a page of its own after the after page (lib/core/carousel.js
 * `redlineBlockSplit`; owner, 2026-11-16; fit-everywhere-model.md §25). Rendered through the real engine.
 *
 * FALSIFIABLE: without the flag's branch the run is cover, before, after-with-list (three pages), and the list rides
 * the after page.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { carouselize } = require('../../../lib/core/carousel');

const md = `---\ntheme: indaco\n---\n\n<!-- _class: redline three-col -->\n\n## Old, new and why.\n\n\`Cal. Civ. Code §1798.135\`\n\n> The old clause, as it read.\n\n> The new clause, as it reads now.\n\n- **Scope.** Sale and sharing fold into one duty.\n- **Floor.** One method now suffices.\n`;
const s = splitSections(createEngine().render(md, 'indaco').html).filter((p) => p.type === 'section')[0];
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('without noteOwn the list rides the after page', () => {
  const parts = carouselize(s.openTag, s.inner, { strategy: 'redline-blocks' }, 1, 'redline');
  assert.equal(parts.length, 3);
  assert.match(text(parts[2]), /new clause[\s\S]*Scope/);
});

test('with noteOwn the list takes a page of its own, under the heading and citation, every part once', () => {
  const parts = carouselize(s.openTag, s.inner, { strategy: 'redline-blocks', noteOwn: true }, 1, 'redline');
  assert.equal(parts.length, 4, JSON.stringify(parts.map(text)));
  const [, before, after, note] = parts.map(text);
  assert.match(before, /old clause/);
  assert.match(after, /new clause/);
  assert.doesNotMatch(after, /Scope/);
  assert.match(note, /Cal\. Civ\. Code[\s\S]*Scope[\s\S]*Floor/);
  assert.doesNotMatch(note, /old clause|new clause/);
});
