/**
 * parser-bakeoff loc — code lines each candidate needed for the SAME behavior (comments and
 * blank lines out). A readability proxy, not a verdict: 40 lines of dense combinators can
 * read worse than 80 of plain grammar.
 *
 * The incumbent's figure is the STRUCTURAL code only, counted by function, so it is
 * comparable with a challenger's grammar (policy lives in shared.mjs and is not counted
 * for anyone). Usage:  node tools/parser-bakeoff/loc.mjs
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const here = (p) => new URL(p, import.meta.url).pathname;

export function codeLines(src) {
  // errors.mjs's `diagnose` hook is harness, not grammar, so it is not counted.
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/export function diagnose\([\s\S]*?\n\}\n?/g, '');
  return noBlock.split('\n').filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('#'); }).length;
}

/** The body of a top-level function or const in a kernel file, by name. */
function fnBody(file, name) {
  const src = readFileSync(`${ROOT}${file}`, 'utf8');
  const start = src.search(new RegExp(`^(?:function ${name}\\b|const ${name}\\b)`, 'm'));
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  const rest = src.slice(start);
  const end = rest.search(/\n(?=\S)(?!\})/);
  return rest.slice(0, end < 0 ? rest.length : end + 1);
}

const INCUMBENT = [
  ['lib/core/bracket-list.js', ['parseBracketList']],
  ['tools/segno-legacy/flowchart-row.js', ['readArrow', 'splitRow']], // frozen: Segno phase 3 replaced it
  ['lib/core/gantt-time.js', ['parseTimePoint', 'parseSpanToken']],
  ['lib/core/chart-values.js', ['NUMERIC_PILL', 'isValuePill']],
  ['lib/core/inline-pills.js', ['parse']],
  ['lib/core/state-marks.js', ['parseInlineState']],
];

export function locRows() {
  const rows = [];
  let inc = 0;
  for (const [f, names] of INCUMBENT) for (const n of names) inc += codeLines(fnBody(f, n));
  rows.push({ candidate: 'incumbent', lines: inc, note: 'structural functions only; tidy/isWs/unquote and resolveMods are policy every challenger calls, so out' });
  const peggy = ['axis', 'flow', 'gantt', 'value', 'inline'].map((n) => codeLines(readFileSync(here(`grammars/peggy/${n}.peggy`), 'utf8'))).reduce((a, b) => a + b, 0);
  rows.push({ candidate: 'peggy', lines: peggy + codeLines(readFileSync(here('impl/peggy.mjs'), 'utf8')), note: `${peggy} in .peggy files, the rest is the glue module` });
  for (const n of ['chevrotain', 'ohm', 'nearley', 'parsimmon', 'lezer']) {
    rows.push({ candidate: n, lines: codeLines(readFileSync(here(`impl/${n}.mjs`), 'utf8')), note: n === 'lezer' ? 'three targets of five' : '' });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) console.table(locRows());
