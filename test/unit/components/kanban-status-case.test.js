/**
 * Unit: lib/components/chart/kanban/kanban.transform.js — a card's status word.
 *
 * The kernel recognizes a status by folding case against the frozen
 * CHART_STATUS vocabulary, so the `data-s` it stamps must be folded the same
 * way. Before this pin, `AT-RISK` passed the gate and was stamped verbatim,
 * matching neither `.kanban-card[data-s="at-risk"]` nor the shared
 * `.chart-status[data-s="at-risk"]` arm: the card and pill painted untinted.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildKanbanBoard } = require('../../../lib/components/chart/kanban/kanban.transform');
const { CHART_STATUS } = require('../../../lib/components/chart/_chart-family/transform-utils');

const board = (pill) =>
  buildKanbanBoard(`<li>Doing<ul><li>Migrate API<ul><li>Platform <code>${pill}</code></li></ul></li></ul></li>`);

describe('kanban status word — gate and stamp agree on case', () => {
  for (const word of CHART_STATUS) {
    for (const spelled of [word, word.toUpperCase(), word[0].toUpperCase() + word.slice(1)]) {
      test(`\`${spelled}\` stamps data-s="${word}" on the card and the pill`, () => {
        const html = board(spelled);
        assert.match(html, new RegExp(`<div class="kanban-card" data-s="${word}"`));
        assert.match(html, new RegExp(`<span class="chart-status" data-s="${word}">${spelled}</span>`));
      });
    }
  }

  test('a word outside the vocabulary is not a status — it stays in the lane label', () => {
    const html = board('someday');
    assert.doesNotMatch(html, /data-s=/);
    assert.doesNotMatch(html, /chart-status/);
  });
});
