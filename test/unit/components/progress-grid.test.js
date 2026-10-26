/**
 * A progress list is ONE grid: `.progress-bars` owns the columns and every `.progress-row` is a
 * `subgrid` of them (progress.styles.css), so every bar shares one track width and the pill column
 * fits the widest pill. A rule that gives a ROW its own `grid-template-columns` turns that row back
 * into a standalone grid with no column gap: in a side-by-side pane the label touched its bar and
 * the bar ran under its status pill (measured on examples/panes-row-labels.md, #2887's checker).
 * So a context that needs other columns (a pane) sets them on the list, never on the row.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '../../../lib');
const cssFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return cssFiles(p);
  return e.name.endsWith('.css') && !e.name.endsWith('.generated.css') ? [p] : [];
});

describe('progress — one grid for every row', () => {
  test('no stylesheet gives .progress-row columns of its own; only `subgrid`', () => {
    const offenders = [];
    for (const file of cssFiles(LIB)) {
      const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].trim();
        const cols = /grid-template-columns:\s*([^;]+)/.exec(m[2]);
        if (cols && /\.progress-row\b(?![\w-])/.test(sel.split(',').pop()) && cols[1].trim() !== 'subgrid') {
          offenders.push(`${path.relative(LIB, file)}: ${sel.slice(-80)} → ${cols[1].trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, [], 'set the columns on .progress-bars instead');
  });

  test('the list owns three columns and the pane narrows them on the list', () => {
    const own = fs.readFileSync(path.join(LIB, 'components/chart/progress/progress.styles.css'), 'utf8');
    assert.match(own, /\.progress-bars \{[^}]*grid-template-columns: 18\.75cqi 1fr minmax\(7\.5cqi, max-content\)/);
    const pane = fs.readFileSync(path.join(LIB, 'forms/cell/pane/pane.css'), 'utf8');
    assert.match(pane, /lat-pane\[data-pane="progress"\][^{]*\.progress-bars \{[^}]*grid-template-columns:[^;]*minmax\(/);
  });
});
