/**
 * lib/plugins/chart-family/shared/html-tables.js walks tables with one linear `elements` pass in place of regexes that
 * were quadratic on markup with many `<tr` / `<td` and no `>` or close tag (HARD RULE #32,
 * followups.d/3045-p2-regex-recheck-gate.md). Each walker is held to the regex it replaced by a seeded differential fuzz
 * (seed 3045, printed in every failure), and the walk to linear work by a character-read count.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const tables = require('../../../lib/plugins/chart-family/shared/html-tables');
const { mulberry32 } = require('../../helpers/regex-differential');
const { charReads } = require('../../helpers/work-count');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The walkers as they were. Tests sit outside the census, which reads lib/** only.
const OLD = {
  extractFirstTable(src) {
    const html = String(src ?? '');
    const open = html.search(/<table\b[^>]*>/);
    if (open < 0) return null;
    const openTag = html.match(/<table\b[^>]*>/);
    const close = html.indexOf('</table>', open);
    if (close < 0) return null;
    const end = close + '</table>'.length;
    return { start: open, end, full: html.slice(open, end), inner: html.slice(open + openTag[0].length, close) };
  },
  parseRowCells(rowHtml) {
    const cells = [];
    const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = cellRe.exec(String(rowHtml ?? ''))) !== null) cells.push({ tag: m[1], inner: m[2], full: m[0] });
    return cells;
  },
  parseRows(sectionHtml) {
    const rows = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = trRe.exec(String(sectionHtml ?? ''))) !== null) rows.push(OLD.parseRowCells(m[1]));
    return rows;
  },
  parseTable(tableHtml) {
    const html = String(tableHtml ?? '');
    const thead = html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/);
    const tbody = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/);
    if (thead || tbody) {
      const headRows = OLD.parseRows(thead ? thead[1] : '');
      return { head: headRows[0] || [], rows: OLD.parseRows(tbody ? tbody[1] : '') };
    }
    const all = OLD.parseRows(html);
    return { head: all[0] || [], rows: all.slice(1) };
  },
};

// The tag fragments the walkers reason about, and their edges: a name that runs on (`<trx`, `<tdata`), a close of the
// other cell kind, a `>` inside an attribute, an unclosed open, nested tables.
const PIECES = ['<', '>', '/', '<tr', '<tr>', '</tr>', '<td', '<td>', '</td>', '<th', '<th>', '</th>', '<thead>', '</thead>',
  '<tbody>', '</tbody>', '<table', '<table>', '</table>', '<trx>', '<tdata>', ' a="1"', ' ', 'x', '\n', '<th class="c">', '_'];

function draw(rand, n) {
  let s = '';
  const len = Math.floor(rand() * n);
  for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
  return s;
}

describe('the table walkers answer as the regexes they replaced (seeded fuzz, seed 3045)', () => {
  for (const name of ['extractFirstTable', 'parseRowCells', 'parseRows', 'parseTable']) {
    test(`${name}: 60,000 draws, no input where old and new disagree`, () => {
      const rand = mulberry32(3045);
      for (let i = 0; i < 60000; i++) {
        const s = draw(rand, 16);
        assert.deepEqual(tables[name](s), OLD[name](s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
      }
    });
  }

  test('a real markdown-it table reads the same', () => {
    const html = '<table>\n<thead>\n<tr>\n<th></th>\n<th style="text-align:right">A</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>E</td>\n<td style="text-align:right"><code>{1.5}</code></td>\n</tr>\n</tbody>\n</table>';
    assert.deepEqual(tables.parseTable(html), OLD.parseTable(html));
    assert.deepEqual(tables.extractFirstTable(`<p>x</p>${html}`), OLD.extractFirstTable(`<p>x</p>${html}`));
  });
});

// `charReads` does not see `String.prototype.indexOf`, and the walk is mostly that: count the characters each call scans
// (to the hit, or to the end when it misses), so a walk that searched again from every `<` would show here.
function withIndexOfCount(add, fn) {
  const orig = String.prototype.indexOf;
  String.prototype.indexOf = function (needle, from = 0) {
    const at = orig.call(this, needle, from);
    add((at < 0 ? this.length : at + String(needle).length) - Math.max(0, from));
    return at;
  };
  try {
    return fn();
  } finally {
    String.prototype.indexOf = orig;
  }
}

describe('the table walkers are linear on the markup the regexes choked on', () => {
  const hostile = {
    'many `<td` with no `>`': (n) => `<tr>${'<td'.repeat(n)}</tr>`,
    'many `<tr>` with no `</tr>`': (n) => `<tbody>${'<tr>'.repeat(n)}</tbody>`,
    'many `<table` with no `>`': (n) => '<table'.repeat(n),
    'many `<thead>` with no close': (n) => '<thead>'.repeat(n),
  };
  for (const [label, make] of Object.entries(hostile)) {
    test(`${label}: four times the markup costs about four times the reads`, () => {
      const work = (n) => {
        const src = make(n);
        let scanned = 0;
        const { reads } = charReads(() => withIndexOfCount((k) => { scanned += k; }, () => { tables.parseTable(src); tables.extractFirstTable(src); }));
        return reads + scanned;
      };
      const small = work(2000);
      const large = work(8000);
      assert.ok(large <= 4 * small + 64, `reads grew from ${small} to ${large} for 4x the markup`);
    });
  }

  test('the walkers run only regexes the census calls linear', () => {
    assertLinearRegexes(() => {
      tables.parseTable(`<table><tbody>${'<tr><td'.repeat(500)}</tbody></table>`);
      tables.extractFirstTable('<table'.repeat(500));
    });
  });
});
