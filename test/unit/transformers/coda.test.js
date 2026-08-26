/**
 * Unit tests for the universal CODA kernel (lib/core/coda.js) and its registry
 * adapter (lib/transformers/coda.js).
 *
 * Contract: a slide's trailing editorial beats — a `> …` blockquote (the Key
 * Insight) and a trailing `<p>` after a structural block (the below-note) — are
 * lifted into one `<div class="cell-coda" data-dock="…">` at the END of the
 * section body, before any Marp `<footer>` chrome. A layout that declares
 * `coda.claims` keeps that element; the cell is never built for it.
 *
 * The two arms must AGREE — `applyToHtml` runs on the engine/export path,
 * `applyToDom` in the browser runtime — so every behavioral case below is
 * asserted through both. That parity is the point of the kernel: a
 * DOM-path-only or string-path-only rule is how the two renderers diverged
 * before (see the below-note kernel's header).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const coda = require('../../../lib/core/coda');
const adapter = require('../../../lib/transformers/coda');

const sec = (cls, inner) => `<section class="${cls}">${inner}</section>`;
const CELL = 'class="cell-coda"';

/** Run BOTH arms on the same section and return the two resulting inner HTMLs. */
function bothArms(cls, inner) {
  const html = adapter.applyToHtml(sec(cls, inner));
  const dom = new JSDOM(`<body>${sec(cls, inner)}</body>`);
  adapter.applyToDom(dom.window.document.body);
  return {
    html: html.replace(/^<section[^>]*>/, '').replace(/<\/section>$/, ''),
    dom: dom.window.document.querySelector('section').innerHTML,
  };
}

/** Normalize whitespace between tags so the two arms are comparable. */
const norm = (s) => s.replace(/>\s+</g, '><').trim();

describe('coda — what gets harvested', () => {
  test('a trailing blockquote becomes the cell', () => {
    const { html, dom } = bothArms('list', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote>');
    for (const out of [html, dom]) {
      assert.match(out, /class="cell-coda"/);
      assert.match(out, /<div class="cell-coda"[^>]*><blockquote>/);
    }
    assert.equal(norm(html), norm(dom), 'the two arms must produce the same markup');
  });

  test('a trailing paragraph after a structural block becomes a below-note inside the cell', () => {
    const { html, dom } = bothArms('list', '<ul><li>a</li></ul><p>note</p>');
    for (const out of [html, dom]) {
      assert.match(out, /<div class="cell-coda"[^>]*><div class="below-note"><p>note<\/p><\/div><\/div>/);
    }
    assert.equal(norm(html), norm(dom));
  });

  test('both beats share one cell, insight first', () => {
    const { html, dom } = bothArms('list', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote><p>note</p>');
    for (const out of [html, dom]) {
      const cell = out.slice(out.indexOf(CELL));
      assert.ok(cell.indexOf('<blockquote>') < cell.indexOf('below-note'), 'insight must precede the note');
    }
    assert.equal(norm(html), norm(dom));
  });

  test('a paragraph after a paragraph is body copy, not a note — on either arm', () => {
    const { html, dom } = bothArms('list', '<p>one</p><p>two</p>');
    assert.doesNotMatch(html, /cell-coda/);
    assert.doesNotMatch(dom, /cell-coda/);
  });

  test('nothing to harvest leaves the body untouched', () => {
    const inner = '<h2>T</h2><ul><li>a</li></ul>';
    const { html, dom } = bothArms('list', inner);
    assert.equal(norm(html), norm(inner));
    assert.equal(norm(dom), norm(inner));
  });
});

describe('coda — claims', () => {
  test('a layout that claims the blockquote never gets a cell for it', () => {
    const { html, dom } = bothArms('quote', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote>');
    assert.doesNotMatch(html, /cell-coda/);
    assert.doesNotMatch(dom, /cell-coda/);
  });

  test('a CLAIMED trailing element is STEPPED OVER, not treated as a wall', () => {
    // A chart claims its final <p> for the caption. The insight before it must
    // still be harvested — and the cell still lands last, after the caption.
    const { html, dom } = bothArms('radar', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote><p>caption</p>');
    for (const out of [html, dom]) {
      assert.match(out, /<p>caption<\/p><div class="cell-coda"/, 'the caption stays put and the cell follows it');
      assert.match(out, /<div class="cell-coda"[^>]*><blockquote>/);
      assert.doesNotMatch(out, /cell-coda[^>]*>[\s\S]*caption/, 'the claimed caption must not be swept into the cell');
    }
    assert.equal(norm(html), norm(dom));
  });

  test('the `no-note` opt-out withholds the note and keeps the insight', () => {
    const { html, dom } = bothArms('list no-note', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote><p>note</p>');
    for (const out of [html, dom]) {
      assert.match(out, /cell-coda/);
      assert.doesNotMatch(out, /below-note/);
      assert.match(out, /<p>note<\/p>/, 'the paragraph stays as body copy');
    }
  });
});

describe('coda — placement', () => {
  test('the cell goes before the footer even when the beats WERE the whole body', () => {
    // The arms diverged here: the string arm fell through to "append at the end",
    // landing the cell AFTER the footer, which stops the footer reaching
    // `.cell-footer` and breaks `no-footer`. The existing case below has a <ul>
    // before the blockquote and so never reached that branch.
    const { html, dom } = bothArms('content', '<blockquote><p>k</p></blockquote><footer>f</footer>');
    for (const out of [html, dom]) {
      assert.ok(out.indexOf(CELL) < out.indexOf('<footer>'), `chrome must stay last: ${out}`);
    }
    assert.equal(norm(html), norm(dom), 'both arms must place it identically');
  });

  test('the cell goes BEFORE a Marp running <footer>', () => {
    const { html, dom } = bothArms('list', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote><footer>f</footer>');
    for (const out of [html, dom]) {
      assert.ok(out.indexOf(CELL) < out.indexOf('<footer>'), 'chrome stays last');
    }
    assert.equal(norm(html), norm(dom));
  });

  test('the declared dock is stamped on the cell — on BOTH arms', () => {
    // Asserting only `.html` left the DOM arm unpinned: stamping a constant
    // `column` there survived the entire 7000-test suite. `applyToDom` is the
    // RUNTIME path, so that regression would put the band in a third column in
    // every browser preview while every gate stayed green.
    for (const [cls, dock] of [['list', 'column'], ['premise', 'row'], ['image', 'grid']]) {
      const { html, dom } = bothArms(cls, '<ul><li>a</li></ul><blockquote><p>k</p></blockquote>');
      assert.match(html, new RegExp(`data-dock="${dock}"`), `string arm: ${cls} should dock ${dock}`);
      assert.match(dom, new RegExp(`data-dock="${dock}"`), `DOM arm: ${cls} should dock ${dock}`);
    }
  });

  test('an unknown layout takes both beats in a column — opt-out means a new component works untouched', () => {
    const { html } = bothArms('some-new-layout', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote><p>note</p>');
    assert.match(html, /data-dock="column"/);
    assert.match(html, /below-note/);
  });
});

describe('coda — idempotence and safety', () => {
  test('a second pass is a no-op on both arms', () => {
    const once = adapter.applyToHtml(sec('list', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote>'));
    assert.equal(adapter.applyToHtml(once), once);
    const dom = new JSDOM(`<body>${sec('list', '<ul><li>a</li></ul><blockquote><p>k</p></blockquote>')}</body>`);
    adapter.applyToDom(dom.window.document.body);
    const after = dom.window.document.querySelector('section').innerHTML;
    adapter.applyToDom(dom.window.document.body);
    assert.equal(dom.window.document.querySelector('section').innerHTML, after);
  });

  test('safely returns on null / non-DOM root and non-string html', () => {
    assert.doesNotThrow(() => adapter.applyToDom(null));
    assert.doesNotThrow(() => adapter.applyToDom({}));
    assert.equal(adapter.applyToHtml(''), '');
    assert.equal(adapter.applyToHtml('no sections here'), 'no sections here');
  });

  test('peelCoda round-trips: rest + coda reconstructs the body', () => {
    const inner = coda.harvestBody('<h2>T</h2><ul><li>a</li></ul><blockquote><p>k</p></blockquote>', 'list');
    const { rest, coda: cell } = coda.peelCoda(inner);
    assert.match(cell, /^<div class="cell-coda"/);
    assert.doesNotMatch(rest, /cell-coda/);
    assert.equal(norm(rest + cell), norm(inner));
  });

  test('peelCoda is a no-op when there is no cell', () => {
    const { rest, coda: cell } = coda.peelCoda('<ul><li>a</li></ul>');
    assert.equal(cell, '');
    assert.equal(rest, '<ul><li>a</li></ul>');
  });

  test('isFrameCell recognizes the frame cells a rebuilder must step over', () => {
    const dom = new JSDOM('<body><div class="cell-coda"></div><div class="cell-stage"></div><div class="code-col"></div></body>');
    const [codaEl, stageEl, colEl] = [...dom.window.document.body.children];
    assert.equal(coda.isFrameCell(codaEl), true);
    assert.equal(coda.isFrameCell(stageEl), true);
    assert.equal(coda.isFrameCell(colEl), false);
    assert.equal(coda.isFrameCell(null), false);
  });
});


describe('coda — the class is matched as a TOKEN, not an exact attribute', () => {
  test('a cell carrying a second class is still recognized by both call sites', () => {
    // The split envelope stamps `lat-split-note` onto a carried note's own open
    // tag, so the cell reads `class="cell-coda lat-split-note"`. An exact-string
    // guard stops recognizing the kernel's own output at exactly that point.
    const marked = '<ul><li>a</li></ul><div class="cell-coda lat-split-note" data-dock="column"><div class="below-note"><p>n</p></div></div>';
    assert.equal(coda.harvestBody(marked, 'list'), marked, 'idempotence must survive a second class');
    const { rest, coda: cell } = coda.peelCoda(marked);
    assert.match(cell, /lat-split-note/);
    assert.equal(rest, '<ul><li>a</li></ul>');
  });

  test('hasCodaClass does not match a merely similar class name', () => {
    assert.equal(coda.hasCodaClass(' class="cell-coda"'), true);
    assert.equal(coda.hasCodaClass(' class="x cell-coda y"'), true);
    assert.equal(coda.hasCodaClass(' class="cell-coda-inner"'), false);
    assert.equal(coda.hasCodaClass(' class="not-cell-coda"'), false);
  });
});


describe('coda — a claimed element must still work AFTER the cell is inserted', () => {
  const chartFamily = require('../../../lib/components/chart/_chart-family/chart-family');

  // The claim ("the chart consumes its trailing <p>") is only honored if the
  // component's own transform can still FIND that <p>. `liftChartCaption` anchors on
  // `/<p…>…<\/p>\s*$/`, so a coda cell inserted after the caption puts it past the end
  // anchor and it renders as body copy at full width. That function already peels a
  // trailing <footer> for exactly this reason; the cell is the same hazard.
  const withBoth =
    '<h2>Rollout</h2>' +
    '<ul><li>Alpha <code>60%</code></li><li>Beta <code>35%</code></li></ul>' +
    '<p><em>Scores are self-reported.</em></p>' +
    '<div class="cell-coda" data-dock="column"><blockquote><p>Key insight.</p></blockquote></div>';

  for (const layout of ['progress', 'timeline-list', 'funnel', 'piechart']) {
    test(`${layout}: the caption still lifts with a Key Insight on the slide`, () => {
      const out = chartFamily.applyToRenderedHtml(sec(layout, withBoth));
      assert.match(out, /<p class="chart-caption">/, 'the claimed caption must still be lifted');
      assert.ok(
        out.indexOf('chart-caption') < out.indexOf('cell-coda'),
        'and the coda band stays below it',
      );
    });
  }
});

describe('coda — a stray `cell-coda` class in AUTHOR content is content, not a cell', () => {
  // The idempotence guard used to scan the whole body at any depth, so any author markup
  // carrying the class — a deck ABOUT Lattice, pasted engine output, an AI-generated deck
  // in the Studio — aborted the harvest and the slide's Key Insight printed as plain body
  // text. That is #1651's silent failure, reintroduced by the guard meant to prevent it.
  // It was also an arm divergence: applyToDom has always scoped its guard to
  // `:scope > .cell-coda`, so the same slide rendered WITH a panel on the runtime path and
  // WITHOUT one on the engine/export path.
  const stray = '<h2>T</h2><ul><li>One <span class="cell-coda">x</span></li></ul>' +
                '<blockquote><p>Key insight.</p></blockquote>';

  test('the beat is still harvested, on BOTH arms, and they agree', () => {
    const { html, dom } = bothArms('list form', stray);
    assert.match(html, /<div class="cell-coda" data-dock="column">/, 'string arm dropped the panel');
    assert.match(dom, /<div class="cell-coda" data-dock="column">/, 'DOM arm dropped the panel');
    assert.equal(norm(html), norm(dom));
  });

  test('a REAL cell among the section\'s own children still stops a second harvest', () => {
    const already = '<h2>T</h2><ul><li>One</li></ul>' +
                    '<div class="cell-coda" data-dock="column"><blockquote><p>Done.</p></blockquote></div>';
    const { html, dom } = bothArms('list form', already);
    assert.equal((html.match(/class="cell-coda"/g) || []).length, 1, 'string arm harvested twice');
    assert.equal((dom.match(/class="cell-coda"/g) || []).length, 1, 'DOM arm harvested twice');
    assert.equal(norm(html), norm(dom));
  });
});
