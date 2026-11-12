/**
 * THE PHONE LADDER IS A PAGE RULE: it never reaches a pane on a wide slide.
 *
 * A pane carries its own `data-family` (lib/core/panes.js), and lib/core/pane-css.js twins every `section.<kind>` rule
 * onto it as `section lat-pane.<kind>…`. So a ladder rule keyed on a bare family test, `section.progress:where(
 * [data-family="square"] …)`, also matched a 35% progress pane on a 16:9 slide, and set its labels at a phone page's
 * 11pt measured against the whole 1920px slide: examples/panes-row-labels.md p4 printed its names at 3x and clipped.
 * The ladder's rules read `:where(:not(lat-pane):is([data-family=…]))` instead; a pane only ever sits on a wide slide
 * (a phone deck splits its panes) and the dispatch already leaves one out (`ctx.paneView`).
 *
 * This walks every rule of the chart family's sheets, widened for a progress pane exactly as a panes deck's sheet is,
 * and matches each against the same progress markup twice: as a phone page, and as a pane on a wide slide. The ladder's
 * rules (the ones that declare or read a `--chart-role-*` / `--chart-fs-*` size, or the progress rows' tighter line)
 * must match the phone page and nothing in the pane. The failing arm drops `:not(lat-pane)` and shows the pane caught.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const postcss = require('postcss');
const { JSDOM } = require('jsdom');
const { widenForPanes } = require('../../../lib/core/pane-css.js');

const ROOT = join(__dirname, '..', '..', '..');
const SHEETS = [
  'lib/plugins/chart-family/chart-family.styles.css',
  'lib/plugins/chart-family/kinds/progress/progress.styles.css',
].map((p) => readFileSync(join(ROOT, p), 'utf8'));

const BODY = `<div class="cell-stage"><div class="chart-body"><div class="progress-bars" role="list">
  <div class="progress-row" role="listitem"><div class="progress-label">Signal intake review</div>
  <div class="progress-track"><div class="progress-fill"></div></div><span class="progress-pct">92%</span>
  <span class="chart-status" data-s="on-track">on-track</span></div></div></div></div>`;
const PHONE = `<section class="progress form chart-frame" data-family="square" data-orientation="square">${BODY}</section>`;
const PANE = `<section class="lat-pane-host form" data-family="wide" data-orientation="landscape">
  <div class="cell-stage"><div class="lat-panes" data-panes="side">
  <lat-pane class="progress form chart-frame" data-pane="progress" data-family="square" data-orientation="square">${BODY}</lat-pane>
  </div></div></section>`;

/** A ladder rule: it declares or reads a phone role size, or sets the progress rows' phone line. */
const isLadder = (rule) => rule.nodes.some((d) => d.type === 'decl' && (/--chart-(role|fs)-/.test(d.prop) || /var\(--chart-(role|fs)-/.test(d.value)
  || (d.prop === 'line-height' && /progress-label/.test(rule.selector) && /data-family="tall"\], \[data-family="square"\]/.test(rule.selector))));

/** The selectors of every ladder rule in the sheets, widened for a progress pane. */
function ladderSelectors(transform = (s) => s) {
  const out = [];
  for (const sheet of SHEETS) {
    const widened = widenForPanes(transform(sheet), ['progress', 'form', 'chart-frame'], ['progress']);
    postcss.parse(widened).walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
      if (isLadder(rule)) out.push(rule.selector);
    });
  }
  return out;
}

/** The ladder selectors that match any element in `html`. */
function matching(html, selectors) {
  const { document } = new JSDOM(`<!doctype html><body>${html}</body>`).window;
  const els = [...document.querySelectorAll('body *')];
  return selectors.filter((sel) => {
    try {
      return els.some((el) => el.matches(sel));
    } catch {
      return false;
    }
  });
}

describe('the phone ladder is a page rule', () => {
  test('a progress chart on a phone page takes the ladder', () => {
    const hits = matching(PHONE, ladderSelectors());
    assert.ok(hits.some((s) => /progress-label/.test(s)), 'the label role reaches the phone page');
    assert.ok(hits.some((s) => /chart-status/.test(s)), 'the status role reaches the phone page');
  });

  test('a progress pane on a wide slide takes none of it', () => {
    const selectors = ladderSelectors();
    assert.ok(selectors.some((s) => s.includes('section lat-pane.progress')), 'the sheet was widened for the pane');
    assert.deepEqual(matching(PANE, selectors), []);
  });

  test('failing arm: a bare family test catches the pane', () => {
    const bare = ladderSelectors((css) => css.replaceAll(':where(:not(lat-pane):is(', ':where(:is('));
    assert.ok(matching(PANE, bare).length > 0, 'without :not(lat-pane) the ladder reaches the pane');
  });
});
