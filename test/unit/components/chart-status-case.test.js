/**
 * Unit: the chart family's ONE case rule for a status word — every
 * CHART_STATUS consumer folds case and stamps the folded word.
 *
 * `[data-s="at-risk"]` is case-sensitive, so a kernel that stamps `AT-RISK`
 * verbatim paints nothing, and one that rejects it pushes the word into the
 * label. Before this pin the family did both: gantt and kanban folded,
 * progress and timeline-list stamped verbatim (untinted), state-chart and slope
 * rejected. `chartStatus` in _chart-family/transform-utils.js is the rule; each
 * block below pins one consumer to it. Kanban's own pin is
 * kanban-status-case.test.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { CHART_STATUS, chartStatus } = require('../../../lib/components/chart/_chart-family/transform-utils');
const { buildProgressBars } = require('../../../lib/components/chart/progress/progress.transform');
const { buildTimelineSpine } = require('../../../lib/components/chart/timeline-list/timeline-list.transform');
const { parseStateChart } = require('../../../lib/components/chart/state-chart/state-chart.transform');
const { outlineFromMarkdown } = require('../../../lib/core/flowchart-grammar');
const parseState = (md) => parseStateChart(outlineFromMarkdown(md)).states[0];
const { parseSlope, buildSlope } = require('../../../lib/components/chart/slope/slope.transform');
const { transformSection: gantt } = require('../../../lib/components/chart/gantt/gantt.transform');

// Every word, three ways: as the vocabulary spells it, SHOUTED, and Capitalized.
const spellings = (word) => [word, word.toUpperCase(), word[0].toUpperCase() + word.slice(1)];

describe('chartStatus — the rule itself', () => {
  for (const word of CHART_STATUS) {
    for (const spelled of spellings(word)) {
      test(`\`${spelled}\` folds to "${word}"`, () => assert.equal(chartStatus(spelled), word));
    }
  }
  test('a word outside the vocabulary is not a status', () => {
    assert.equal(chartStatus('someday'), '');
    assert.equal(chartStatus(''), '');
    assert.equal(chartStatus(undefined), '');
  });
});

describe('progress — the bar and the pill stamp the folded word', () => {
  for (const word of CHART_STATUS) {
    for (const spelled of spellings(word)) {
      test(`\`${spelled}\` stamps data-s="${word}"`, () => {
        const html = buildProgressBars(`<li>Migrate API <code>60%</code> <code>${spelled}</code></li>`);
        assert.match(html, new RegExp(`<div class="progress-fill" data-s="${word}"`));
        assert.match(html, new RegExp(`<span class="chart-status" data-s="${word}">${spelled}</span>`));
      });
    }
  }
  test('a word outside the vocabulary still stamps verbatim (the info fallback)', () => {
    const html = buildProgressBars('<li>Migrate API <code>60%</code> <code>Someday</code></li>');
    assert.match(html, /<span class="chart-status" data-s="Someday">Someday<\/span>/);
  });
});

describe('timeline-list — the pill stamps the folded word', () => {
  for (const word of CHART_STATUS) {
    for (const spelled of spellings(word)) {
      test(`\`${spelled}\` stamps data-s="${word}"`, () => {
        const html = buildTimelineSpine(`<li><code>Q3</code> Migrate API <code>${spelled}</code></li>`);
        assert.match(html, new RegExp(`<span class="chart-status" data-s="${word}">${spelled}</span>`));
      });
    }
  }
  test('a word outside the vocabulary still stamps verbatim', () => {
    const html = buildTimelineSpine('<li><code>Q3</code> Migrate API <code>Someday</code></li>');
    assert.match(html, /data-s="Someday"/);
  });
});

describe('state-chart — a capitalized status is a status, not a label', () => {
  for (const word of CHART_STATUS) {
    for (const spelled of spellings(word)) {
      test(`\`${spelled}\` becomes status "${word}"`, () => {
        const s = parseState(`- In Review \`${spelled}\``);
        assert.equal(s.status, word);
        assert.equal(s.name, 'In Review', 'the word must not fall into the name');
      });
    }
  }
  test('a word outside the vocabulary stays in the label', () => {
    // An unknown span is literal code: it stays in the name, and `lint:deck` names it.
    const s = parseState('- In Review `Someday`');
    assert.equal(s.status, undefined);
    assert.equal(s.name, 'In Review Someday');
  });
});

describe('slope — a capitalized status marks the line', () => {
  const ul = (pill) =>
    `<li>Atlas <code>${pill}</code><ul><li>2024 <code>12</code></li><li>2026 <code>19</code></li></ul></li>` +
    '<li>Borealis<ul><li>2024 <code>18</code></li><li>2026 <code>14</code></li></ul></li>';
  for (const word of CHART_STATUS) {
    for (const spelled of spellings(word)) {
      test(`\`${spelled}\` marks the entity "${word}" and stamps it`, () => {
        const model = parseSlope(ul(spelled));
        assert.equal(model.entities[0].status, word);
        assert.match(buildSlope(model), new RegExp(`data-s="${word}"`));
      });
    }
  }
  test('a word outside the vocabulary is ignored', () => {
    assert.equal(parseSlope(ul('Hot')).entities[0].status, '');
  });
});

describe('gantt — the bar stamps the folded word (already folded; pinned here with the rest)', () => {
  test('`AT-RISK` stamps data-s="at-risk"', () => {
    const html = gantt('<p><code>[{Timeline, 2026 Q1 .. 2026 Q4}]</code></p><ul><li>Build<ul><li>API <code>Q1..Q2</code> <code>AT-RISK</code></li></ul></li></ul>', { classTokens: [] });
    assert.match(html, /data-s="at-risk"/);
    assert.doesNotMatch(html, /data-s="AT-RISK"/);
  });
});

describe('state-chart narration — the voice folds case with the slide', () => {
  const { narrateStateChart } = require('../../../lib/core/chart-narration');
  const md = (pill) => ['<!-- _class: state-chart -->', '', '## Flow.', '', '- Draft', '  - -submit-> In Review',
    `- In Review \`${pill}\``, '  - -ok-> Done', '- Done'].join('\n');
  // The status is spoken in words ("is at risk"), whatever its spelling, and the state's
  // NAME, in the transition sentences, never carries it.
  test('`AT-RISK` is a status, never part of the spoken state name', () => {
    const out = narrateStateChart(md('AT-RISK'));
    assert.match(out, /From Draft, submit goes to In Review\. From In Review, ok goes to Done\./);
    assert.match(out, /In Review is at risk\./);
    assert.equal(out, narrateStateChart(md('at-risk')));
  });
});
