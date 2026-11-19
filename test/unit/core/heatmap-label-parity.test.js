/**
 * A heatmap's narrator names each cell by the label the CHART DRAWS. The Guide finds a cell by its
 * `data-label` (`{row} · {col}`, heatmap.manifest.json `gesture.units.cell`), so a narrator label that
 * differs by one character leaves that sentence pointing at nothing. The kernel reads the rendered table;
 * the narrator reads the Markdown (`renderedText`), so this holds the two together on the label shapes
 * that used to differ: a lone `*`, an entity, a `~`, a backslash escape, an intra-word underscore.
 *
 * The oracle is the real render, read by attribute rather than by selector: jsdom's selector engine
 * misses an `&` or an astral character inside a quoted attribute value that Chromium matches, and this
 * test is about the labels, not that engine.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { narrateChartScript } = require('../../../lib/core/chart-narration.js');

const ROWS = ['**EMEA**', '_Derby_', '`API`', '[Acme](https://example.com)', 'R&D', 'AT&amp;T', 'AT&#38;T', '5* hotels', '2*3 grid',
  '~approx', 'a\\*b', 'snake_case_row', '__init__ hook', 'x < y', 'C# team', '&euro;5 tier', 'Caf&eacute;', '&#x27;quoted&#x27;', '🚀 Launch', 'A \\| B', 'Zürich', '"Core" plan', 'a *b* c'];

test('every cell the heatmap narrator names is a cell the chart draws, label for label', () => {
  const { window } = new JSDOM('');
  const parser = new window.DOMParser();
  const misses = [];
  try {
    for (const row of ROWS) {
      const md = `<!-- _class: heatmap -->\n\n## T\n\n| | Q1 | R&D |\n| --- | --: | --: |\n| ${row} | 1 | 2 |\n| Other | 3 | 4 |\n`;
      const script = narrateChartScript(md);
      const html = engine.render(`---\nmarp: true\n---\n${md}`, 'indaco', { preview: true }).html;
      const drawn = new Set([...parser.parseFromString(html, 'text/html').querySelectorAll('rect.heatmap-cell')].map((el) => el.getAttribute('data-label')));
      assert.equal(drawn.size, 4, `${row}: the chart drew ${drawn.size} cells`);
      for (const ref of script.refs) {
        if (ref.unit !== 'cell') continue;
        const label = `${ref.id.row} · ${ref.id.col}`;
        if (!drawn.has(label)) misses.push(`${JSON.stringify(row)}: narrated "${label}", drawn ${JSON.stringify([...drawn])}`);
      }
    }
  } finally {
    window.close();
  }
  assert.deepEqual(misses, []);
});

test('a lone star is not dropped from what is said, so a label is never read as another number', () => {
  const md = '<!-- _class: heatmap -->\n\n## T\n\n| | Q1 | Q2 |\n| --- | --: | --: |\n| 2*3 grid | 1 | 2 |\n| Other | 3 | 4 |\n';
  assert.match(narrateChartScript(md).text, /2\*3 grid/);
  assert.doesNotMatch(narrateChartScript(md).text, /\b23 grid/);
});

test('the heading decodes an entity as the slide shows it, outside a code span only', () => {
  const md = '<!-- _class: heatmap -->\n\n## AT&amp;T lags; `&amp;` stays.\n\n| | Q1 | Q2 |\n| --- | --: | --: |\n| A | 1 | 2 |\n| B | 3 | 4 |\n';
  assert.match(narrateChartScript(md).text, /AT&T lags; &amp; stays\./);
});
