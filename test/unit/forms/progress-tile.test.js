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
// `progress-rail: on`, deck-wide: lowers the floor to two sections and any length, so a fixture about
// docking, suppression or idempotence stays small. The floors themselves are pinned on their own below.
const ON = 'progress-rail-on';
/** A plain content slide, `n` times. */
const filler = (n, cls = 'content form') => Array.from({ length: n }, () => sec(cls));
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

describe('progress Tile — when the rail is drawn (railWanted)', () => {
  const { railWanted, MIN_SECTIONS, MIN_SECTIONS_FORCED, MIN_SLIDES } = progress;
  const none = () => false;
  const forced = (t) => t === ON;

  test('the floors are three sections and fifteen slides; `progress-rail: on` lowers them to two and any length', () => {
    assert.equal(MIN_SECTIONS, 3);
    assert.equal(MIN_SLIDES, 15);
    assert.equal(MIN_SECTIONS_FORCED, 2);
    assert.equal(railWanted(3, 15, none), true);
    assert.equal(railWanted(2, 40, none), false, 'two sections: first half / second half, which the page number says');
    assert.equal(railWanted(5, 14, none), false, 'a short deck is held in the head');
    assert.equal(railWanted(2, 4, forced), true);
    assert.equal(railWanted(1, 40, forced), false, 'a scale of one is never drawn, forced or not');
  });

  test('a short deck draws nothing on either arm; the same deck with `on` draws', () => {
    const short = deckHtml([sec('divider', '<h2>A</h2>'), sec('content form'), sec('divider', '<h2>B</h2>'),
      sec('content form'), sec('divider', '<h2>C</h2>'), sec('content form')]);
    assert.equal(progress.applyToHtml(short), short);
    const d = doc(short);
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress, .divider-marker'), null);
    const on = short.replaceAll('class="', `class="${ON} `);
    assert.equal((progress.applyToHtml(on).match(/class="tile-progress/g) || []).length, 3);
  });

  test('a long, sectioned deck draws by default', () => {
    const html = deckHtml([sec('divider', '<h2>A</h2>'), ...filler(4), sec('divider', '<h2>B</h2>'), ...filler(4),
      sec('divider', '<h2>C</h2>'), ...filler(4)]);
    assert.equal((progress.applyToHtml(html).match(/class="tile-progress/g) || []).length, 12);
  });

  test('past eight sections the rail and the marker draw as a bar, unless the deck asks for dots', () => {
    const nine = Array.from({ length: 9 }, (_, i) => [sec(`divider ${ON}`, `<h2>S${i}</h2>`), sec(`content form ${ON}`)]).flat();
    const out = progress.applyToHtml(deckHtml(nine));
    assert.match(out, /class="tile-progress bar-auto"/);
    assert.match(out, /class="divider-marker bar-auto"/);
    const dots = progress.applyToHtml(deckHtml(nine).replaceAll(ON, `${ON} progress-rail-dots`));
    assert.doesNotMatch(dots, /bar-auto/);
  });
});

describe('progress Tile — applyToHtml (HTML-string path)', () => {
  test('injects a dot-rail into form slides within a section', () => {
    const html = deckHtml([
      sec(`divider ${ON}`, '<h2>One</h2>'),
      sec(`content form ${ON}`),
      sec(`divider ${ON}`, '<h2>Two</h2>'),
      sec(`content form ${ON}`),
    ]);
    const out = progress.applyToHtml(html);
    assert.equal((out.match(/class="tile-progress"/g) || []).length, 2);
  });

  test('injects the rail without a vestigial class (footer zones are independent Cells)', () => {
    const html = deckHtml([sec(`divider ${ON}`, '<h2>S</h2>'), sec(`content form ${ON}`), ENDER]);
    const out = progress.applyToHtml(html);
    assert.match(out, new RegExp(`class="content form ${ON}"`));   // class untouched — no has-progress
    assert.doesNotMatch(out, /has-progress/);
    assert.match(out, /class="tile-progress"/);
  });

  test('the rail carries NO section label — dots only', () => {
    // Rank 4 of the footer band's allocation policy (engineering/decisions/2026-07-27-footer-band-allocation.md).
    const html = deckHtml([
      sec(`divider ${ON}`, '<p><code>Section 01</code></p><h2>A long editorial heading</h2>'),
      sec(`content form ${ON}`),
      ENDER,
    ]);
    const out = progress.applyToHtml(html);
    const rail = out.match(/<div class="tile-progress"[\s\S]*?<\/div>/)[0];
    assert.doesNotMatch(rail, /class="seg"/);
    assert.doesNotMatch(rail, /Section 01|A long editorial heading/, 'neither the eyebrow nor the heading may reach the rail');
    assert.match(rail, /class="dot on"/, 'the dots still say where you are');
  });

  test('no dividers → no-op (nothing to orient against)', () => {
    const html = deckHtml([sec(`content form ${ON}`)]);
    assert.equal(progress.applyToHtml(html), html);
  });

  test('ONE section → nothing anywhere, even when forced: a scale of one says nothing', () => {
    const html = deckHtml([sec(`divider ${ON}`, '<h2>Only</h2>'), sec(`content form ${ON}`), sec(`content form ${ON}`)]);
    assert.equal(progress.applyToHtml(html), html);
    const d = doc(html);
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress, .divider-marker'), null, 'the live-DOM path agrees');
  });

  test('a divider composes its own MARKER, lit on the section it opens — never the chrome rail', () => {
    // A divider is a sovereign Frame and hosts no chrome Cell (frame-identity-agrees.test.js); its
    // marker is frame content that teaches the footer rail, the count in figures and the same marks.
    const html = deckHtml([
      sec(`divider ${ON}`, '<h2>One</h2>'), sec(`content form ${ON}`),
      sec(`divider light ${ON}`, '<h2>Two</h2>'), sec(`content form ${ON}`),
      sec(`divider numbered ${ON}`, '<h2>Three</h2>'),
    ]);
    for (const [arm, root] of [['string', doc(progress.applyToHtml(html))], ['DOM', (() => { const d = doc(html); progress.applyToDom(d); return d; })()]]) {
      assert.equal(root.querySelector('section.divider .tile-progress'), null, `${arm} arm: no chrome rail on a divider`);
      const markers = [...root.querySelectorAll('section.divider')].map((s) => s.firstElementChild);
      assert.deepEqual(markers.map((m) => m.className), ['divider-marker', 'divider-marker', 'divider-marker'], `${arm} arm: the marker leads each divider`);
      assert.deepEqual(markers.map((m) => m.querySelector('.divider-marker-count').textContent), ['1 / 3', '2 / 3', '3 / 3']);
      assert.deepEqual(markers.map((m) => [...m.querySelectorAll('.dot')].findIndex((x) => x.classList.contains('on'))), [0, 1, 2]);
    }
  });

  test('the marker follows the rail: no rail in the deck, no marker on its dividers', () => {
    const html = deckHtml([sec(`divider ${ON} no-progress`, '<h2>A</h2>'), sec(`content form ${ON} no-progress`), sec(`divider ${ON} no-progress`, '<h2>B</h2>')]);
    assert.doesNotMatch(progress.applyToHtml(html), /divider-marker|tile-progress/);
  });

  test('non-form slides get no rail — a `topic` already draws its own track', () => {
    const html = deckHtml([sec(`divider no-progress ${ON}`, '<h2>S</h2>'), sec(`content ${ON}`), sec(`topic ${ON}`), ENDER]);
    assert.ok(!/tile-progress/.test(progress.applyToHtml(html)));
    const d = doc(html);
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress'), null, 'the live-DOM path agrees');
  });

  test('`no-progress` and `silent` suppress the rail', () => {
    const html = deckHtml([
      sec(`divider ${ON}`, '<h2>S</h2>'),
      sec(`content form no-progress ${ON}`),
      sec(`content form silent ${ON}`),
      ENDER,
    ]);
    assert.ok(!/tile-progress/.test(progress.applyToHtml(html)));
  });

  // The owner's rule (2026-11-03): a deck-wide `class: no-progress` reaches every slide, and a slide
  // overrides it with an explicit token. The deck class is ON every slide, so the override has to win.
  test('`with-progress` opts a slide back in, over a deck-wide `no-progress` and over `silent`', () => {
    const html = deckHtml([
      sec(`divider no-progress ${ON}`, '<h2>S</h2>'),
      sec(`content form no-progress ${ON}`),
      sec(`content form no-progress with-progress ${ON}`),
      sec(`content form silent with-progress ${ON}`),
      ENDER,
    ]);
    assert.equal((progress.applyToHtml(html).match(/class="tile-progress"/g) || []).length, 2);
    const d = doc(html);
    progress.applyToDom(d);
    assert.equal(d.querySelectorAll('.tile-progress').length, 2, 'the live-DOM path agrees');
    assert.equal(progress.railShown({ contains: (t) => ['no-progress', 'with-progress'].includes(t) }), true);
  });

  test('idempotent', () => {
    const html = deckHtml([sec(`divider ${ON}`, '<h2>S</h2>'), sec(`content form ${ON}`), sec(`divider ${ON}`, '<h2>T</h2>')]);
    const once = progress.applyToHtml(html);
    assert.equal(progress.applyToHtml(once), once);
  });

  test('docks the rail INTO the footer Cell, just left of the page number', () => {
    const html = deckHtml([
      sec(`divider no-progress ${ON}`, '<h2>S</h2>'),
      sec(`content form ${ON}`, '<div class="cell-stage"><p>B</p></div><div class="cell-footer"><footer>F</footer><span class="lat-pagination">2</span></div>'),
      ENDER,
    ]);
    const out = progress.applyToHtml(html);
    assert.match(out, /<div class="cell-footer"><footer>F<\/footer><div class="tile-progress"[\s\S]*?<\/div><span class="lat-pagination">2<\/span><\/div>/);
  });

  test('docks into a footer Cell that has no page number', () => {
    const html = deckHtml([
      sec(`divider no-progress ${ON}`, '<h2>S</h2>'),
      sec(`content form ${ON}`, '<div class="cell-stage"><p>B</p></div><div class="cell-footer"><footer>F</footer></div>'),
      ENDER,
    ]);
    const out = progress.applyToHtml(html);
    assert.match(out, /<div class="cell-footer"><footer>F<\/footer><div class="tile-progress"[\s\S]*?<\/div><\/div>/);
  });

  test('a supplied position carries the deck length, so a one-slide preview matches the full deck', () => {
    // Fifteen-slide floor: the slice route renders ONE slide, so it must be told the deck's length.
    const one = deckHtml([sec('content form')]);
    assert.equal(progress.applyToHtml(one, { deckSection: { index: 2, total: 3 } }), one, 'length unknown → a one-slide deck');
    assert.match(progress.applyToHtml(one, { deckSection: { index: 2, total: 3, slides: 20 } }), /class="tile-progress"/);
  });
});

describe('progress Tile — applyToDom (live-DOM path)', () => {
  const forcedDeck = deck.replaceAll('class="', `class="${ON} `);

  test('one rail per eligible form slide; dots + .on correct, and no label', () => {
    const d = doc(forcedDeck);
    progress.applyToDom(d);
    const rails = formRails(d);
    assert.equal(rails.length, 2, 'skips the no-progress slide');
    assert.equal(d.querySelectorAll('section.divider > .divider-marker').length, 2, 'each divider carries its marker');
    assert.equal(d.querySelector('section.divider .tile-progress'), null, 'and never the chrome rail');
    assert.equal(rails[0].querySelector('.seg'), null);
    assert.deepEqual([...rails[0].querySelectorAll('.dot')].map((x) => x.className), ['dot on', 'dot']);
    assert.deepEqual([...rails[1].querySelectorAll('.dot')].map((x) => x.className), ['dot', 'dot on']);
  });

  test('no dividers → no-op; idempotent', () => {
    const d = doc(sec(`content form ${ON}`));
    progress.applyToDom(d);
    assert.equal(d.querySelector('.tile-progress'), null);
    const d2 = doc(forcedDeck);
    progress.applyToDom(d2);
    progress.applyToDom(d2);
    assert.equal(d2.querySelectorAll('.tile-progress').length, 2);
    assert.equal(d2.querySelectorAll('.divider-marker').length, 2);
  });

  test('reconciles: a slide that gains `no-progress` loses its rail, and gets it back when the class goes', () => {
    const d = doc(forcedDeck);
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
      sec(`divider no-progress ${ON}`, '<h2>S</h2>'),
      sec(`content form ${ON}`, '<div class="cell-stage"><p>B</p></div><div class="cell-footer"><footer>F</footer><span class="lat-pagination">2</span></div>'),
      ENDER,
    ]));
    progress.applyToDom(d);
    const fc = d.querySelector('.cell-footer');
    const kids = [...fc.children].map((n) => n.className || n.tagName.toLowerCase());
    assert.deepEqual(kids, ['footer', 'tile-progress', 'lat-pagination'], 'rail sits between footer and page number');
  });
});

describe('progress Tile — cross-path parity', () => {
  test('applyToDom and applyToHtml inject byte-identical markup', () => {
    const forcedDeck = deck.replaceAll('class="', `class="${ON} `);
    const d = doc(forcedDeck);
    progress.applyToDom(d);
    const marks = (root) => [...root.querySelectorAll('.tile-progress, .divider-marker')].map((n) => n.outerHTML).sort();
    assert.deepEqual(marks(d), marks(doc(progress.applyToHtml(forcedDeck))));
  });

  test('a long deck by default: both arms agree slide by slide', () => {
    const long = deckHtml([sec('divider', '<h2>A</h2>'), ...filler(5), sec('divider light', '<h2>B</h2>'), ...filler(5),
      sec('divider numbered', '<h2>C</h2>'), ...filler(5), sec('topic', '<h2>T</h2>')]);
    const d = doc(long);
    progress.applyToDom(d);
    const perSlide = (root) => [...root.querySelectorAll('section')].map((s) => (s.querySelector('.tile-progress, .divider-marker')?.outerHTML || '-'));
    assert.deepEqual(perSlide(d), perSlide(doc(progress.applyToHtml(long))));
  });
});

describe('progress Tile — checker findings, pinned', () => {
  const AG = (items, cls = 'agenda form') => sec(`${ON} ${cls}`, `<h2>Agenda</h2><ol>${items.map((t) => `<li>${t}</li>`).join('')}</ol>`);
  const div = (n) => sec(`${ON} divider`, `<h2>S${n}</h2>`);

  test('a virtual filmstrip window never loses what the engine drew to a recount', () => {
    // The Playground mounts a window of the deck; its section count is not the deck's.
    const full = progress.applyToHtml(deckHtml([sec('divider', '<h2>A</h2>'), ...filler(5), sec('divider', '<h2>B</h2>'), ...filler(5), sec('divider', '<h2>C</h2>'), ...filler(5)]));
    const windowHtml = full.split('</section>').slice(0, 8).join('</section>') + '</section>';
    const d = doc(`<div class="lattice" data-lv>${windowHtml}</div>`);
    const before = d.querySelectorAll('.tile-progress, .divider-marker').length;
    progress.applyToDom(d);
    assert.equal(d.querySelectorAll('.tile-progress, .divider-marker').length, before);
    assert.ok(before > 0);
  });

  test('an agenda inside a section is a legend AND carries the rail', () => {
    const html = deckHtml([div(1), sec(`${ON} content form`), div(2), AG(['A', 'B', 'C']), div(3)]);
    const out = doc(progress.applyToHtml(html));
    const agenda = out.querySelector('section.agenda');
    assert.equal(agenda.querySelectorAll('.agenda-rail').length, 3);
    assert.ok(agenda.querySelector('.tile-progress'), 'string arm');
    const d = doc(html);
    progress.applyToDom(d);
    assert.ok(d.querySelector('section.agenda .tile-progress'), 'DOM arm');
  });

  test('past eight sections the agenda legend draws as a bar too', () => {
    const html = deckHtml([AG(Array.from({ length: 9 }, (_, i) => `I${i}`)), ...Array.from({ length: 9 }, (_, i) => div(i))]);
    assert.match(progress.applyToHtml(html), /class="agenda-rail bar-auto"/);
  });

  test('both arms place the legend alike: whitespace after a page reference, a list in a comment', () => {
    const one = sec(`${ON} agenda form`, '<h2>A</h2><!-- <ol><li>old</li></ol> --><ol><li>A <code>p.1</code>\n</li><li>B</li></ol>');
    const html = deckHtml([one, div(1), div(2)]);
    const legendSpots = (root) => [...root.querySelectorAll('section.agenda li')].map((li) => [...li.childNodes].findIndex((n) => n.nodeType === 1 && n.classList.contains('agenda-rail')));
    const d = doc(html);
    progress.applyToDom(d);
    assert.deepEqual(legendSpots(doc(progress.applyToHtml(html))), legendSpots(d));
    assert.equal(doc(progress.applyToHtml(html)).querySelectorAll('.agenda-rail').length, 2);
  });
});
