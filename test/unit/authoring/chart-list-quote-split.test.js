// A row's `>` description on the list charts (lib/core/chart-rows.js), and the two lint rules
// around it (lib/authoring/lint-core.js):
//   - `chart-list-split-quote`: a `>` at the left margin between two items ends the chart's list,
//     so every row after it drops out of the chart. Born from the adversarial trio on #2686.
//   - `chart-row-quote-unread`: a `>` under a row with no mark of its own (a radar series, a
//     quadrant group) is shown nowhere.
// The owner's preview test on #2690 found that an indented `>` under a bar row dropped the row.
// The charts now read it as the row's description; these tests pin the render, the narration and
// the lint together, because the three must agree (HARD RULE #1).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const ROW_DETAIL = require('../../../lib/core/chart-rows.js');
const { readChartRows } = require('../../../lib/core/chart-row-source.js');

const manifests = loadAll(path.join(__dirname, '../../../lib/components'));
const vocab = buildVocab(manifests);
const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const findings = (src, rule) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === rule);
const splits = (src) => findings(src, 'chart-list-split-quote');
// A drawn mark carries `data-mark`; so does its hover-detail <template>, which is not a mark.
const marks = (h) => (h.match(/<(?!template)[a-z]+\b[^>]*\bdata-mark="\d+"/g) || []).length;
const html = (src) => { const o = engine.render(src, {}); return typeof o === 'string' ? o : o.html; };
const template = (h, i = 0) => (h.match(new RegExp(`<template class="chart-detail" data-mark="${i}">([\\s\\S]*?)</template>`)) || [])[1] || '';

// The red team's repro: a quote at the margin before the last row ends the list, and End, a row
// no edge names, is no longer a node.
const FLOW = deck('flowchart', '- Start\n  - -> Middle\n- Middle\n> Middle waits on review\n- End');

// The owner's slide, written in Compose: a rich description with a list, a blank line before it
// and a blank `>` between its items.
const OWNER = deck('bar', '- Germany `1.234,5`\n\n  > Hi **bold** `{LIVE, tag}` `~{1 3 2 5}`\n  > - we\n  >\n  > - us\n- France `987,6`\n- Italy `2.345,8`');

describe('a row\'s `>` description', () => {
  test('the owner\'s slide: every bar draws, and the quote is Germany\'s rich description', () => {
    const h = html(OWNER);
    assert.equal(marks(h), 3, 'Germany is no longer dropped');
    const t = template(h, 0);
    assert.match(t, /^<li><p>Hi <strong>bold/, 'the description is the first detail entry');
    assert.match(t, /<strong>bold<\/strong>/);
    assert.match(t, /class="lat-pill"/);
    assert.match(t, /class="lat-spark"/);
    assert.match(t, /<ul>[\s\S]*we[\s\S]*us[\s\S]*<\/ul>/, 'the sub-list survives');
    assert.doesNotMatch(h.replace(/<template[\s\S]*?<\/template>/g, ''), /<blockquote>/, 'no stray quote on the slide');
    assert.deepEqual(findings(OWNER, 'chart-row-quote-unread'), []);
    assert.deepEqual(splits(OWNER), []);
  });

  test('every detail chart keeps its marks when a row carries a description', () => {
    const rows = {
      bar: ['`12`', '`8`'], line: ['`12`', '`8`'], piechart: ['`60%`', '`40%`'], funnel: ['`12`', '`8`'],
      waterfall: ['`12`', '`-3`'], map: ['`12`', '`8`'], scatter: ['`{1, 2}`', '`{3, 4}`'],
      bullet: ['`4` `5`', '`3` `5`'], 'word-cloud': ['`5`', '`3`'],
    };
    for (const [chart, [a, b]] of Object.entries(rows)) {
      const names = chart === 'map' ? ['India', 'Kenya'] : ['Alpha', 'Beta'];
      const src = deck(chart, `- ${names[0]} ${a}\n  > why it moved\n- ${names[1]} ${b}`);
      const h = html(src);
      assert.match(template(h, 0), /why it moved/, `${chart}: the description is the first row's detail`);
      if (chart !== 'line' && chart !== 'word-cloud') {
        assert.equal(marks(h), marks(html(deck(chart, `- ${names[0]} ${a}\n- ${names[1]} ${b}`))), `${chart}: no mark lost`);
      }
    }
  });

  test('a series point\'s description joins its group\'s detail, named', () => {
    const h = html(deck('stacked-bar', '- FY24\n  - Licenses `19`\n    > two renewals\n  - Services `9`\n- FY25\n  - Licenses `20`\n  - Services `15`'));
    assert.match(h, /<strong>Licenses<\/strong> <p>two renewals<\/p>/);
  });

  test('a radar series and a quadrant group have no mark: the quote is lifted, the name stays clean', () => {
    const radar = html(deck('radar', '- Meridian\n  > series note\n  - X `9`\n  - Y `7`\n  - Z `8`\n- Vantage\n  - X `7`\n  - Y `8`\n  - Z `6`'));
    assert.doesNotMatch(radar, /series note/);
    const quad = html(deck('quadrant', '- Quick Wins\n  > group note\n  - Alpha `{2, 8}`\n- Defer\n  - Gamma `{1, 2}`'));
    assert.doesNotMatch(quad, /group note/);
  });

  test('narration says a description exactly as it says the same nested detail bullet', () => {
    for (const [chart, row] of [['bar', '`12`'], ['bullet', '`4` `5`'], ['piechart', '`60%`'], ['word-cloud', '`5`']]) {
      const quote = narrateChart(deck(chart, `- Alpha ${row}\n  > because of X\n  > - and Y\n- Beta ${chart === 'bullet' ? '`3` `5`' : chart === 'piechart' ? '`40%`' : '`3`'}`));
      const bullet = narrateChart(deck(chart, `- Alpha ${row}\n  - because of X\n    - and Y\n- Beta ${chart === 'bullet' ? '`3` `5`' : chart === 'piechart' ? '`40%`' : '`3`'}`));
      assert.equal(quote, bullet, chart);
    }
  });

  test('an author\'s `</template>` inside a description cannot end the inert template', () => {
    const h = html(deck('bar', '- A `1`\n  > x </template><img src=x onerror=alert(1)>\n- B `2`'));
    const t = template(h, 0);
    assert.match(t, /&lt;\/template>/);
    assert.doesNotMatch(h.replace(/<template[\s\S]*?<\/template>/g, ''), /onerror/);
  });
});

describe('chart-list-split-quote', () => {
  test('a flowchart: the warning names the dropped row, and the fix indents the quote under its item', () => {
    const [f, ...rest] = splits(FLOW);
    assert.equal(rest.length, 0);
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'flowchart');
    assert.equal(f.line, '> Middle waits on review');
    assert.match(f.message, /`- End`/);
    assert.equal(f.autofixable, true);
    const fixed = lintCore.applyAllFixes(FLOW, vocab);
    assert.match(fixed, /\n {2}> Middle waits on review\n- End/);
    assert.deepEqual(splits(fixed), []);
  });

  test('the render proves it: before the fix End is a stray list below the chart, after it End is a node', () => {
    const before = html(FLOW);
    assert.match(before, /data-shapes="2"/);
    assert.match(before, /<\/blockquote>\s*<ul>\s*<li>End<\/li>/, 'End renders as a stray list below the chart');
    const after = html(lintCore.applyAllFixes(FLOW, vocab));
    assert.match(after, /data-shapes="3"/);
    assert.doesNotMatch(after, /<li>End<\/li>/);
  });

  test('a bar chart: the indent fix makes the quote the row\'s description, and both bars draw', () => {
    const bar = deck('bar', '- EMEA `4.2`\n> Two renewals landed\n- APAC `1.8`');
    const [f] = splits(bar);
    assert.match(f.message, /bar list: `- APAC `1.8`` and every row after it/);
    assert.match(f.fix, /becomes that row's description/);
    const fixed = lintCore.applyAllFixes(bar, vocab);
    assert.match(fixed, /- EMEA `4.2`\n {2}> Two renewals landed\n- APAC/);
    const h = html(fixed);
    assert.equal(marks(h), 2);
    assert.match(template(h, 0), /Two renewals landed/);
  });

  test('a chart that reads no description under its rows gets no machine fix', () => {
    const [f] = splits(deck('hub-spoke', '- Hub\n  - Spoke `{icon=user}`\n> note\n- Other'));
    assert.equal(f.autofixable, undefined);
    assert.match(f.fix, /Move the quote above or below the list/);
  });

  test('the indent follows the item above: a nested row and an ordered row', () => {
    const nested = deck('flowchart', '- Start\n  - -> End\n> note\n- End');
    assert.equal(splits(nested)[0].indent, 4, 'under `  - -> End`, whose text starts at column 4');
    const ordered = deck('funnel', '1. Visitors `1200`\n> note\n2. Signups `480`');
    assert.equal(splits(ordered)[0].indent, 3);
  });

  test('a quote of several lines warns once, with no one-line fix', () => {
    const [f, ...rest] = splits(deck('bar', '- EMEA `4.2`\n> one\n> two\n- APAC `1.8`'));
    assert.equal(rest.length, 0);
    assert.equal(f.autofixable, undefined);
    assert.match(f.fix, /each of the quote's 2 lines/);
  });

  test('no warning where nothing splits', () => {
    for (const [why, src] of [
      ['indented under its item', deck('bar', '- EMEA `4.2`\n  > note\n- APAC `1.8`')],
      ['a quote above the list', deck('bar', '> Source: ERP\n\n- EMEA `4.2`\n- APAC `1.8`')],
      ['a quote after the list, with no list after it', deck('bar', '- EMEA `4.2`\n- APAC `1.8`\n\n> Source: ERP')],
      ['not a chart', '---\nmarp: true\n---\n\n## A\n\n- One\n> note\n- Two\n'],
      ['a table chart', deck('heatmap', '| | M0 |\n|---|--:|\n| Jan | 100 |\n\n> note\n\n- stray')],
    ]) assert.deepEqual(splits(src), [], why);
  });
});

describe('chart-row-quote-unread', () => {
  test('a quote under a radar series or a quadrant group is named, with where it belongs', () => {
    const [r] = findings(deck('radar', '- Meridian\n  > note\n  - X `9`\n  - Y `7`\n  - Z `8`'), 'chart-row-quote-unread');
    assert.match(r.message, /radar series has no mark/);
    assert.match(r.fix, /under an axis/);
    assert.equal(r.autofixable, undefined);
    const [q] = findings(deck('quadrant', '- Quick Wins\n  > note\n  - Alpha `{2, 8}`'), 'chart-row-quote-unread');
    assert.match(q.fix, /under a point/);
  });

  test('a quote under an axis or a point is its description: no finding', () => {
    assert.deepEqual(findings(deck('radar', '- Meridian\n  - X `9`\n    > axis note\n  - Y `7`\n  - Z `8`'), 'chart-row-quote-unread'), []);
    assert.deepEqual(findings(deck('quadrant', '- Quick Wins\n  - Alpha `{2, 8}`\n    > point note'), 'chart-row-quote-unread'), []);
    assert.deepEqual(findings(OWNER, 'chart-row-quote-unread'), []);
  });
});

describe('the chart lists agree', () => {
  test('LIST_CHARTS is every chart whose rows are a list: the chart bucket less its three tables', () => {
    const charts = manifests.filter((m) => m.bucket === 'chart').map((m) => m.name);
    const tables = ['heatmap', 'matrix-grid', 'roadmap'];
    assert.ok(charts.length >= 24, `the chart bucket loads (${charts.length})`);
    assert.deepEqual([...lintCore.LIST_CHARTS].sort(), charts.filter((c) => !tables.includes(c)).sort());
  });

  test('the quote readers are list charts, and the detail and grammar readers do not overlap', () => {
    for (const c of lintCore.QUOTE_READERS) assert.ok(lintCore.LIST_CHARTS.includes(c), c);
    assert.deepEqual(ROW_DETAIL.QUOTE_CHARTS.filter((c) => ROW_DETAIL.DETAIL_CHARTS.includes(c)), []);
  });

  test('every detail chart writes its detail through the shared payload', () => {
    const fs = require('node:fs');
    for (const c of ROW_DETAIL.DETAIL_CHARTS) {
      const src = fs.readFileSync(path.join(__dirname, `../../../lib/components/chart/${c}/${c}.transform.js`), 'utf8');
      assert.match(src, /detailPayload/, `${c} emits its templates through mark-detail.detailPayload (the </template> guard)`);
    }
  });
});

// The adversarial review of the description change (red team, inversion, checker).
describe('a description cannot break the slide, the narration or the card', () => {
  const say = (src) => {
    const r = narrateChart(src);
    return Array.isArray(r) ? r.join(' ') : String(r?.sentences?.join(' ') ?? r ?? '');
  };

  test('an unclosed raw tag stays inside the row: every bar draws and the next slide survives', () => {
    for (const q of ['> <!-- hmm', '> <textarea>', '> <title>', '> <xmp>', '> <plaintext>', '> <div>', '> <template>x', '- <!-- hmm']) {
      const src = `<!-- _class: bar -->\n\n## T\n\n- Alpha \`10\`\n  ${q}\n- Beta \`20\`\n\n---\n\n## Next slide\n`;
      const h = html(src);
      assert.equal((h.match(/<section\b/g) || []).length, 2, `${q}: the next slide survives`);
      assert.equal(marks(h), 2, `${q}: both bars draw`);
    }
  });

  test('templateSafe balances what it was given and turns raw-text openers into text', () => {
    const md = require('../../../lib/components/chart/_chart-family/mark-detail.js');
    assert.equal(md.templateSafe('<li><div>x</li>'), '<li><div>x</div></li>');
    assert.equal(md.templateSafe('<li>a</div></li>'), '<li>a&lt;/div></li>');
    assert.equal(md.templateSafe('<li><!-- x</li>'), '<li>&lt;!-- x</li>');
    assert.equal(md.templateSafe('<li></template><b>x</b></li>'), '<li>&lt;/template><b>x</b></li>');
    assert.equal(md.templateSafe('<li><svg><path d="M0 0"/></svg><br></li>'), '<li><svg><path d="M0 0"/></svg><br></li>');
  });

  test('a decoded point label is escaped back, so `&lt;b&gt;` stays text', () => {
    const h = html(deck('line', '- Q1\n  - &lt;b&gt;x `10`\n    > point note\n- Q2\n  - &lt;b&gt;x `12`'));
    assert.match(template(h, 0), /<strong>&lt;b&gt;x<\/strong>/);
  });

  test('narration agrees with the engine on tabs, lazy lines, ordered rows and markless rows', () => {
    const bar = (body) => deck('bar', body);
    assert.match(say(bar('- Alpha `10`\n\t> tab note here\n- Beta `20`')), /Alpha, ten\. tab note here\. Beta/);
    assert.match(say(bar('- Alpha `10`\n  > first line\n  continued lazily\n- Beta `20`')), /first line continued lazily\. Beta/);
    // `1. ` puts its content at column 3: a two-space quote ends the list in the engine, and is no
    // row's description to the narrator either.
    assert.deepEqual(readChartRows('1. A `1`\n  > q\n2. B `2`', 'bar').descriptions, []);
    const three = readChartRows('1. A `1`\n   > q\n2. B `2`', 'bar');
    assert.equal(three.markdown, '1. A `1`\n2. B `2`');
    assert.deepEqual(three.descriptions.map((d) => [d.anchor, d.blocks[0].text]), [[0, 'q']]);
    // A radar series draws no mark of its own: its quote is dropped, never read as an axis at zero.
    const radar = say(deck('radar', '- Speed\n  > series desc\n  - A `3`\n  - B `4`\n  - C `5`'));
    assert.doesNotMatch(radar, /series desc|, at zero/);
    assert.match(radar, /weakest on A, at three/);
  });

  test('a pill in a description is spoken as its text and a spark says nothing', () => {
    const s = say(OWNER);
    assert.match(s, /Hi bold LIVE\./);
    assert.doesNotMatch(s, /[{}~]/);
  });

  test('the speaker note pauses between a description and its sublist', () => {
    const md = require('../../../lib/components/chart/_chart-family/mark-detail.js');
    const note = md.detailNote([{ label: 'G', valueRaw: '1', detail: '<li><p>Up on the year</p><ul><li>two</li><li>one</li></ul></li>' }]);
    assert.equal(note, '<!-- G (1): Up on the year · two · one -->');
  });
});
