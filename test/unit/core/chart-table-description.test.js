// The `{> prose}` description in a chart TABLE (model note decision 5, phase 2): the cell reader, the narrator and lint
// read it the same way the heatmap draws it (HARD RULE #1), and a description in a place nothing reads is a warning.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const engine = require('../../../lib/engine');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const { readCellNote, readDescription } = require('../../../lib/core/cell-note.js');
const { CELL_DESCRIPTION_CHARTS } = require('../../../lib/core/chart-rows.js');

const vocab = buildVocab(loadAll(path.join(__dirname, '../../../lib/components')));
const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n## T\n\n${body}\n`;
const deck = (cls, body) => `---\nmarp: true\n---\n\n${slide(cls, body)}`;
const html = (src) => { const o = engine.render(src, {}); return typeof o === 'string' ? o : o.html; };
const found = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-description-unread');

const GRID = [
  '| Cohort | M0 | M1 `{> The second month}` | `{>}` |',
  '| --- | --: | --: | --- |',
  '| Jan | 100 | 62 `{> dipped}` | Launch cohort |',
  '| Feb | 100 | `{> not reached yet}` | Pilot |',
  '| Mar |  | `{> nobody}` | Empty row |',
].join('\n');

describe('cell-note reads both forms', () => {
  test('a description, with prose commas, pipes and an escaped brace', () => {
    assert.equal(readDescription('{> a, b | c \\} d}'), 'a, b | c } d');
    assert.equal(readDescription('{>}'), '');
    assert.equal(readDescription('{4.2}'), null);
    assert.equal(readDescription('note=x'), null);
  });
  test('readCellNote takes the description and the retired note=, and not a value', () => {
    assert.equal(readCellNote('{> why}'), 'why');
    assert.equal(readCellNote('note=why'), 'why');
    assert.equal(readCellNote('{>}'), null);
    assert.equal(readCellNote('{4.2}'), null);
    assert.equal(readCellNote('{>5}'), '5');
  });
});

describe('the heatmap draws, the narrator says, the same descriptions', () => {
  const h = html(deck('heatmap', GRID));
  const said = narrateChart(slide('heatmap', GRID));
  test('the picture: the {>} column is no data column, the notes reach the marks and the <desc>', () => {
    assert.match(h, /2 rows by 2 columns|3 rows by 2 columns/);
    assert.match(h, /<li>dipped<\/li>/);
    assert.match(h, /<li>not reached yet<\/li>/);
    assert.match(h, /<li>nobody<\/li>/);
    assert.match(h, /Column M1: The second month\./);
    assert.match(h, /Row Jan: Launch cohort\./);
  });
  test('the voice says each one, in the picture\'s words, and keeps a note on a row with no data', () => {
    assert.match(said, /Column M1: The second month\./);
    assert.match(said, /Row Jan: Launch cohort\./);
    assert.match(said, /Jan at M1, sixty-two: dipped\./);
    assert.match(said, /Feb at M1: not reached yet\./);
    assert.match(said, /Mar has no data\. Row Mar: Empty row\. Mar at M1: nobody\./);
    assert.doesNotMatch(said, /\{>/);
  });
  test('the picture and the voice agree on which columns exist', () => {
    assert.match(said, /Each row runs across M0 and M1\./);
    assert.doesNotMatch(said, /M0, M1 and/);
  });
  test('the retired note= form draws and narrates as before', () => {
    const old = '| Cohort | M0 | M1 |\n| --- | --: | --: |\n| Jan | 100 | 62 `note=dipped` |';
    assert.match(html(deck('heatmap', old)), /<li>dipped<\/li>/);
    assert.match(narrateChart(slide('heatmap', old)), /Jan at M1, sixty-two: dipped\./);
  });
});

describe('lint: a description where nothing reads it', () => {
  test('heatmap is the one chart that reads a table cell description', () => {
    assert.deepEqual([...CELL_DESCRIPTION_CHARTS], ['heatmap']);
    assert.equal(found(deck('heatmap', GRID)).length, 0);
  });
  test('a table cell on another chart is warned, not fixed', () => {
    const [f, ...rest] = found(deck('bar', '| A | B |\n| --- | --- |\n| 1 | `{> x}` |'));
    assert.equal(rest.length, 0);
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /not read on a bar slide/);
    assert.equal(f.autofixable, undefined);
  });
  test('a list row after the record loses the row\'s value; the fix moves the prose to a quote', () => {
    const src = deck('bar', '- North `{40}` `{> grew fast}`\n- South `{30}`');
    const [f] = found(src);
    assert.equal(f.autofixable, true);
    const fixed = lintCore.applyAllFixes(src, vocab);
    assert.match(fixed, /- North `\{40\}`\n {2}> grew fast\n- South/);
    assert.equal(found(fixed).length, 0);
    assert.match(html(fixed), /data-label="North" data-value="40"/);
  });
  test('two spans on one row join into one quote, unescaped', () => {
    const fixed = lintCore.applyAllFixes(deck('bar', '- North `{40}` `{> grew \\} fast}` `{> and more}`'), vocab);
    assert.match(fixed, /- North `\{40\}`\n {2}> grew } fast and more/);
  });
  test('a nested row keeps its indent', () => {
    const fixed = lintCore.applyAllFixes(deck('bar', '- FY23\n  - Licenses `{18}` `{> up}`'), vocab);
    assert.match(fixed, /- FY23\n {2}- Licenses `\{18\}`\n {4}> up/);
  });
  test('a chart whose rows take no quote is warned without a fix', () => {
    const [f] = found(deck('progress', '- Build `{68%}` `{> on track}`'));
    assert.equal(f.autofixable, undefined);
    assert.match(f.message, /no row description/);
  });
  test('a fenced example and a quote line are left alone', () => {
    assert.equal(found(deck('bar', '- A `{4}`\n\n```\n- B `{4}` `{> x}`\n```')).length, 0);
    assert.equal(found(deck('bar', '- A `{4}`\n  > see `{> x}`')).length, 0);
  });
});

describe('a header description needs the column\'s name (inversion finding, 2026-10-23)', () => {
  const body = '| Cohort | M0 | `{> churn spike}` |\n| --- | --: | --: |\n| Jan | 90 | 70 |';
  test('picture and voice both keep the column, named by the cell\'s own text, as main drew it', () => {
    assert.match(html(deck('heatmap', body)), /1 rows by 2 columns/);
    const said = narrateChart(slide('heatmap', body));
    assert.match(said, /Each row runs across M0 and \{> churn spike\}\./);
    assert.doesNotMatch(said, /Column : /);
  });
  test('lint says the name is missing', () => {
    const f = found(deck('heatmap', body));
    assert.equal(f.length, 1);
    assert.match(f[0].message, /no column name before it/);
  });
  test('a second `{>}` column is warned: only the first is the description column', () => {
    const two = '| Cohort | M0 | `{>}` | `{>}` |\n| --- | --: | --- | --- |\n| Jan | 90 | a | b |';
    const f = found(deck('heatmap', two));
    assert.equal(f.length, 1);
    assert.match(f[0].message, /2 `\{>\}` columns/);
  });
  test('`note=` in a header cell was never an annotation, so a deck that writes one renders as it did', () => {
    const old = '| Cohort | M0 `note=x` |\n| --- | --: |\n| Jan | 90 |';
    assert.doesNotMatch(html(deck('heatmap', old)), /Column M0/);
    assert.doesNotMatch(narrateChart(slide('heatmap', old)), /Column M0/);
  });
});

describe('red team and checker findings (2026-10-23): picture and voice read each form alike', () => {
  test('every `{>}` column is out of the data in the voice too; the first holds the row notes', () => {
    const two = '| C | M0 | `{>}` | M1 | `{>}` |\n| --- | --: | --- | --: | --- |\n| Feb | 4 | f2 | 6 | s2 |';
    const said = narrateChart(slide('heatmap', two));
    assert.match(said, /Each row runs across M0 and M1\./);
    assert.match(said, /Row Feb: f2\./);
    assert.match(html(deck('heatmap', two)), /1 rows by 2 columns/);
  });
  test('a documented `\\|` in a description is part of the prose, in a header cell and a body cell, picture and voice', () => {
    const t = '| C | M0 `{> a \\| b, c}` | M1 |\n| --- | --: | --: |\n| Jan | 62 `{> d \\| e}` | 3 |';
    const said = narrateChart(slide('heatmap', t));
    assert.match(said, /Column M0: a \| b, c\./);
    assert.match(said, /Jan at M0, sixty-two: d \| e\./);
    assert.match(html(deck('heatmap', t)), /Column M0: a \| b, c\./);
  });
  test('a description on a row label is not read: picture and voice both take the cell as the name, and lint says so', () => {
    const t = '| C | M0 |\n| --- | --: |\n| Jan `{> label note}` | 62 |';
    assert.match(html(deck('heatmap', t)), /Jan \{&gt; label note\}/);
    assert.match(narrateChart(slide('heatmap', t)), /Jan \{> label note\}/);
    assert.match(found(deck('heatmap', t))[0].message, /row label is not read/);
  });
  test('a `{> …}` typed in the `{>}` column is read as its own text by both, and lint says so', () => {
    const t = '| C | M0 | `{>}` |\n| --- | --: | --- |\n| Jan | 62 | `{> inner}` |';
    assert.match(html(deck('heatmap', t)), /Row Jan: \{&gt; inner\}\./);
    assert.match(narrateChart(slide('heatmap', t)), /Row Jan: \{> inner\}\./);
    assert.match(found(deck('heatmap', t))[0].message, /plain text/);
  });
  test('`{>}` that shares its header cell, and one in the label column, are warned', () => {
    assert.match(found(deck('heatmap', '| C | M0 | Why `{>}` |\n| --- | --: | --- |\n| Jan | 62 | x |'))[0].message, /shares its header cell/);
    assert.match(found(deck('heatmap', '| `{>}` | M0 |\n| --- | --: |\n| a | 62 |'))[0].message, /label column/);
  });
  test('a progress note with a backtick is said as the chart draws it', () => {
    const src = '- Build ``{68%, at-risk, note="a`b"}``\n- Docs `{90%, on-track}`';
    assert.match(html(deck('progress', src)), /progress-note">a`b</);
    assert.match(narrateChart(slide('progress', src)), /a`b\./);
  });
});
