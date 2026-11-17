// A figure keeps the stage (lib/core/carousel.js `insightOwnPage`; owner, 2026-11-17: "we always split chart and key
// insight so the chart has the stage"). The slide as authored without its trailing beats, then the run's closing page
// holding them; the figure is never cut, and a slide with no beats gives no run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { insightOwnPage } = require('../../../lib/core/carousel');

const OPEN = '<section data-lattice-slide="1" id="1" class="line form" data-class="line">';
const FIG = '<svg viewBox="0 0 100 50"><text x="1" y="9">Jan</text></svg>';
const inner = (coda) => `<header class="cell-masthead"><h2>Churn fell.</h2></header><div class="cell-stage">${FIG}</div>${coda}<div class="cell-footer"><span>1</span></div>`;
const CODA = '<div class="cell-coda" data-dock="column"><blockquote><p>The drop starts in week one.</p></blockquote></div>';

test('the figure page keeps the figure and drops the beats; the closing page holds them, once', () => {
  const run = insightOwnPage(OPEN, inner(CODA), 'line');
  assert.equal(run.length, 2);
  assert.doesNotMatch(run[0], /data-split-role=/, 'the figure page is the slide itself, title and all');
  assert.ok(run[0].includes(FIG), 'the figure, whole');
  assert.doesNotMatch(run[0], /The drop starts/);
  assert.match(run[1], /data-split-role="closing"/);
  assert.match(run[1], /The drop starts in week one\./);
  assert.ok(!run[1].includes('<svg'), 'no figure on the closing page');
  assert.match(run[1], /split-runhead">Churn fell\./, 'the closing page names the slide it closes');
});

test('no beats, no run', () => {
  assert.equal(insightOwnPage(OPEN, inner(''), 'line'), null);
});
