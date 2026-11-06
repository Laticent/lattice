/**
 * Unit: the self-contained progress Tile kernel
 * (lib/forms/tile/progress/progress.transform.js).
 *
 * The progress Tile owns both render adapters in one file (issue #356), so this
 * single test exercises both and PINS the cross-path parity that previously
 * lived split across separate render-path test files (retired in the same
 * consolidation).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const progress = require('../../../lib/forms/tile/progress/progress.transform');

const sec = (cls, inner = '') => `<section class="${cls}" data-lattice-slide="x">${inner}</section>`;
const deckHtml = (sections) => sections.join('');
// A closing SECOND section. The rail draws nothing below MIN_SECTIONS (a scale of one says
// nothing), so a fixture about docking or suppression appends this to clear the floor without
// changing which section its own slides sit in.
const ENDER = sec('divider no-progress', '<h2>End</h2>');
const formRails = (d) => [...d.querySelectorAll('section.form .tile-progress')];
const doc = (html) => new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
const tilesIn = (html) => [...doc(html).querySelectorAll('.tile-progress')].map((n) => n.outerHTML).sort();
const domTilesIn = (d) => [...d.querySelectorAll('.tile-progress')].map((n) => n.outerHTML).sort();

const deck = sec('divider', '<h2>The Lift</h2>') + sec('content form') +
             sec('divider', '<h2>The Bay</h2>') + sec('content form no-progress') +
             sec('content form');

describe('progress Tile — the rail\'s width budget (dot bucketing)', () => {
  // Rank 2 of the footer band's allocation policy: the dots never yield, which is only
  // affordable because their number is bounded. One dot per section drew 24 dots on every page
  // of a 24-section deck, in a band shared with the author's footer text — so past MAX_DOTS the
  // sections are BUCKETED. This is pure boundary arithmetic, and boundary arithmetic that is
  // *nearly* right is this branch's recurring failure, so it is pinned directly rather than
  // inferred from rendered markup.
  const { dotPlan, MAX_DOTS } = progress;

  test('at or under the cap, bucketing is the IDENTITY — nothing changes for a normal deck', () => {
    for (const total of [1, 2, 5, MAX_DOTS]) {
      for (let idx = 1; idx <= total; idx++) {
        assert.deepEqual(dotPlan(idx, total), { shown: total, on: idx - 1 },
          `${idx}/${total}: a deck within budget must render exactly one dot per section`);
      }
    }
  });

  test('over the cap, the rail is capped and every section still lands on a dot', () => {
    for (const total of [MAX_DOTS + 1, 17, 24, 99]) {
      const seen = new Set();
      let prev = -1;
      for (let idx = 1; idx <= total; idx++) {
        const { shown, on } = dotPlan(idx, total);
        assert.equal(shown, MAX_DOTS, `${idx}/${total}: the rail must stay within its budget`);
        assert.ok(on >= 0 && on < MAX_DOTS, `${idx}/${total}: lit dot ${on} is outside the rail`);
        assert.ok(on >= prev, `${idx}/${total}: the lit dot went BACKWARDS (${prev} → ${on})`);
        prev = on;
        seen.add(on);
      }
      // The two ends are what a reader checks against: section 1 must light the first dot and
      // the last section the last one, or the rail lies about where the deck starts and ends.
      assert.equal(dotPlan(1, total).on, 0, `${total}: the first section must light the first dot`);
      assert.equal(dotPlan(total, total).on, MAX_DOTS - 1,
        `${total}: the last section must light the LAST dot — off-by-one here reads as "not finished"`);
      assert.equal(seen.size, MAX_DOTS, `${total}: every dot must be reachable, else one never lights`);
    }
  });
});

describe('progress Tile — applyToHtml (HTML-string path)', () => {
  test('injects a dot-rail into form slides within a section', () => {
    const html = deckHtml([
      sec('divider', '<h2>One</h2>'),
      sec('content form'),
      sec('divider', '<h2>Two</h2>'),
      sec('content form'),
    ]);
    const out = progress.applyToHtml(html);
    // Two form slides and the two dividers that open their sections.
    assert.equal((out.match(/class="tile-progress"/g) || []).length, 4);
  });

  test('injects the rail without a vestigial class (footer zones are independent Cells)', () => {
    const html = deckHtml([sec('divider', '<h2>S</h2>'), sec('content form'), ENDER]);
    const out = progress.applyToHtml(html);
    assert.match(out, /class="content form"/);   // class untouched — no has-progress
    assert.doesNotMatch(out, /has-progress/);
    assert.match(out, /class="tile-progress"/);   // the rail itself is present
  });

  test('the rail carries NO section label — dots only', () => {
    // Rank 4 of the footer band's allocation policy. The rail used to print the divider's
    // eyebrow beside the dots, and that one `white-space: nowrap` string is what made the band
    // unresolvable: it could not yield, so it either overprinted the author's footer text or bid
    // the footer's width away and deleted words from the exported PDF. Not emitted at all now —
    // hiding it in CSS would leave a node that can still bid.
    // engineering/decisions/2026-07-27-footer-band-allocation.md
    const html = deckHtml([
      sec('divider', '<p><code>Section 01</code></p><h2>A long editorial heading</h2>'),
      sec('content form'),
      ENDER,
    ]);
    const out = progress.applyToHtml(html);
    const rail = out.match(/<div class="tile-progress"[\s\S]*?<\/div>/)[0];
    assert.doesNotMatch(rail, /class="seg"/);
    // Scoped to the RAIL, not the whole deck — the divider slide itself still carries its own
    // eyebrow and heading, which is the point: the section is named where the reader is looking.
    assert.doesNotMatch(rail, /Section 01|A long editorial heading/,
      'neither the eyebrow nor the heading may reach the rail');
    assert.match(rail, /class="dot on"/, 'the dots still say where you are');
  });

  test('no dividers → no-op (nothing to orient against)', () => {
    const html = deckHtml([sec('content form')]);
    assert.equal(progress.applyToHtml(html), html);
  });

  test('ONE section → no rail anywhere: a scale of one says nothing', () => {
    // The owner's report (2026-11-06): a one-section deck drew a single lit pill beside every page
    // number, which nobody could read as anything. The floor is the topic track's own
    // (MIN_TRACK_LABELS), and both arms hold it.
    const html = deckHtml([sec('divider', '<h2>Only</h2>'), sec('content form'), sec('content form')]);
    assert.equal(progress.applyToHtml(html), html);
    const d = doc(html);
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress'), null, 'the live-DOM path agrees');
    assert.equal(progress.MIN_SECTIONS, 2);
  });

  test('a divider carries the rail, lit on the section it OPENS', () => {
    // The divider is where the reader learns what the dots mean: the section's name in display
    // type beside its own lit dot.
    const html = deckHtml([
      sec('divider', '<h2>One</h2>'), sec('content form'),
      sec('divider', '<h2>Two</h2>'), sec('content form'),
      sec('divider', '<h2>Three</h2>'),
    ]);
    const d = doc(progress.applyToHtml(html));
    const lit = [...d.querySelectorAll('section.divider')].map((s) =>
      [...s.querySelectorAll('.tile-progress .dot')].findIndex((x) => x.classList.contains('on')));
    assert.deepEqual(lit, [0, 1, 2]);
  });

  test('non-form, non-divider slides get no rail — a `topic` already draws its own track', () => {
    const html = deckHtml([sec('divider no-progress', '<h2>S</h2>'), sec('content'), sec('topic'), ENDER]);
    assert.ok(!/tile-progress/.test(progress.applyToHtml(html)));
    const d = doc(html);
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress'), null, 'the live-DOM path agrees');
  });

  test('`no-progress` and `silent` suppress the rail', () => {
    const html = deckHtml([
      sec('divider', '<h2>S</h2>'),
      sec('content form no-progress'),
      sec('content form silent'),
      ENDER,
    ]);
    assert.ok(!/class="content form[^"]*"[^>]*><div class="tile-progress"/.test(progress.applyToHtml(html)));
    assert.equal((progress.applyToHtml(html).match(/class="tile-progress"/g) || []).length, 1,
      'only the opening divider carries one');
  });

  // The owner's rule (2026-11-03): a deck-wide `class: no-progress` reaches every slide, and a slide
  // overrides it with an explicit token. The deck class is ON every slide, so the override has to win.
  test('`with-progress` opts a slide back in, over a deck-wide `no-progress` and over `silent`', () => {
    const html = deckHtml([
      sec('divider no-progress', '<h2>S</h2>'),
      sec('content form no-progress'),
      sec('content form no-progress with-progress'),
      sec('content form silent with-progress'),
      ENDER,
    ]);
    assert.equal((progress.applyToHtml(html).match(/class="tile-progress"/g) || []).length, 2);
    const d = doc(html);
    progress.applyToDom(d);
    assert.equal(d.querySelectorAll('.tile-progress').length, 2, 'the live-DOM path agrees');
    assert.equal(progress.railShown({ contains: (t) => ['no-progress', 'with-progress'].includes(t) }), true);
  });

  test('idempotent', () => {
    const html = deckHtml([sec('divider', '<h2>S</h2>'), sec('content form'), ENDER]);
    const once = progress.applyToHtml(html);
    assert.equal(progress.applyToHtml(once), once);
  });

  test('docks the rail INTO the footer Cell, just left of the page number', () => {
    const html = deckHtml([
      sec('divider', '<h2>S</h2>'),
      sec('content form', '<div class="cell-stage"><p>B</p></div><div class="cell-footer"><footer>F</footer><span class="lat-pagination">2</span></div>'),
      ENDER,
    ]);
    const out = progress.applyToHtml(html);
    // rail is inside the footer cell, between footer text and the page number
    assert.match(out, /<div class="cell-footer"><footer>F<\/footer><div class="tile-progress"[\s\S]*?<\/div><span class="lat-pagination">2<\/span><\/div>/);
    // the stage cell is untouched
    assert.doesNotMatch(out, /cell-stage"><p>B<\/p><nav/);
  });

  test('docks into a footer Cell that has no page number', () => {
    const html = deckHtml([
      sec('divider', '<h2>S</h2>'),
      sec('content form', '<div class="cell-stage"><p>B</p></div><div class="cell-footer"><footer>F</footer></div>'),
      ENDER,
    ]);
    const out = progress.applyToHtml(html);
    assert.match(out, /<div class="cell-footer"><footer>F<\/footer><div class="tile-progress"[\s\S]*?<\/div><\/div>/);
  });
});

describe('progress Tile — applyToDom (live-DOM path)', () => {
  test('one rail per eligible form slide; dots + .on correct, and no label', () => {
    const d = doc(deck);
    progress.applyToDom(d);
    const rails = formRails(d);
    assert.equal(rails.length, 2, 'skips the no-progress slide');
    assert.equal(d.querySelectorAll('section.divider > .tile-progress').length, 2, 'each divider carries one');
    assert.equal(rails[0].querySelector('.seg'), null, 'the rail carries dots only — see applyToHtml');
    assert.deepEqual([...rails[0].querySelectorAll('.dot')].map((x) => x.className), ['dot on', 'dot']);
    assert.deepEqual([...rails[1].querySelectorAll('.dot')].map((x) => x.className), ['dot', 'dot on']);
  });

  test('no dividers → no-op; idempotent', () => {
    const d = doc(sec('content form'));
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress'), null);
    const d2 = doc(deck);
    progress.applyToDom(d2);
    progress.applyToDom(d2);
    assert.equal(d2.querySelectorAll('.tile-progress').length, 4);
  });

  // A deck-wide `no-progress` can land AFTER the first pass (a re-rendered deck's settings are
  // resolved again; the VS Code preview reads the saved file asynchronously). A rail injected before
  // it must go with it, and come back when the class does.
  test('reconciles: a slide that gains `no-progress` loses its rail, and gets it back when the class goes', () => {
    const d = doc(deck);
    progress.applyToDom(d);
    const first = d.querySelectorAll('section')[1];
    assert.ok(first.querySelector('.tile-progress'));
    first.classList.add('no-progress');
    progress.applyToDom(d);
    assert.equal(first.querySelector('.tile-progress'), null);
    first.classList.remove('no-progress');
    progress.applyToDom(d);
    assert.ok(first.querySelector('.tile-progress'));
  });

  test('null document → no throw', () => {
    assert.doesNotThrow(() => progress.applyToDom(null));
  });

  test('docks the rail into the footer Cell, left of the page number', () => {
    const d = doc(deckHtml([
      sec('divider', '<h2>S</h2>'),
      sec('content form', '<div class="cell-stage"><p>B</p></div><div class="cell-footer"><footer>F</footer><span class="lat-pagination">2</span></div>'),
      ENDER,
    ]));
    progress.applyToDom(d);
    const fc = d.querySelector('.cell-footer');
    const kids = [...fc.children].map((n) => n.className || n.tagName.toLowerCase());
    assert.deepEqual(kids, ['footer', 'tile-progress', 'lat-pagination'], 'rail sits between footer and page number');
    assert.equal(d.querySelector('.cell-stage .tile-progress'), null, 'rail is not in the stage');
  });
});

describe('progress Tile — cross-path parity', () => {
  test('applyToDom and applyToHtml inject byte-identical Tile markup', () => {
    const d = doc(deck);
    progress.applyToDom(d);
    assert.deepEqual(domTilesIn(d), tilesIn(progress.applyToHtml(deck)));
  });
});
