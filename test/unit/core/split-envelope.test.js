/**
 * Unit: lib/core/split-envelope.js — the UNIVERSAL split envelope
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §0a, rule 9).
 *
 * The invariants a split run must satisfy, whatever layout it came from:
 *   · exactly ONE cover page, first;
 *   · at most ONE key-insight page, last, and only when a key-insight blockquote exists —
 *     it is never shared with the note or the body (owner review, 2026-07-26);
 *   · a trailing below-note (or an unwrapped trailing `<p>`) rides the LAST body page —
 *     never its own page, never repeated per body page (the FM-2 duplication bug:
 *     partitionAxis repeats the collection's `post` verbatim, so it used to be stamped on
 *     EVERY body page; the first fix hoisted it to a shared closing page, which a second
 *     owner review corrected — it is a footnote of the content above it, not a takeaway,
 *     so it stays attached to that content rather than earning a page of its own);
 *   · nothing is lost — every collection member and every leaf of the source survives.
 * Driven both directly and through auto-split's two passes, since the point of the
 * envelope is that BOTH paths produce the same shape (HARD RULE #1).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitEnvelope, balancedPerPage, readCover, readMasthead, splitRegions, topLevelElements,
  chromeOf, footerCell, stripChrome, partitionKeepingNote, injectTrailing, markNote, deriveAxis,
  closingPageFromMaterial, trailingMaterialOf, existingNoteIn,
} = require('../../../lib/core/split-envelope');
const { dockInFooterCell } = require('../../../lib/core/footer-dock');
const { evenGroups } = require('../../../lib/core/collections');
const { splitDoc, applyRails } = require('../../../lib/core/auto-split');
const { splitSections } = require('../../../lib/core/split-sections');

// A rendered `form` slide: the masthead band masthead-lift builds, a `.cell-stage`
// content cell, and the `.cell-footer` chrome cell. The shape every autosplit-eligible
// component actually reaches the splitter in.
const band = ({ eyebrow = '', title = 'Launch readiness', subtitle = '' } = {}) =>
  '<div class="cell-masthead"><div class="masthead-lede">' +
  (eyebrow ? `<p><code>${eyebrow}</code></p>` : '') +
  `<h2>${title}</h2>` +
  (subtitle ? `<p><code>${subtitle}</code></p>` : '') +
  '<hr class="masthead-rule"></div><div class="masthead-bay"></div></div>';

const items = (n) => `<ul>${Array.from({ length: n }, (_, i) => `<li>item ${i + 1}</li>`).join('')}</ul>`;

const formInner = ({ eyebrow = '', subtitle = '', lede = '', n = 9, note = '', insight = '' } = {}) =>
  '<header>Deck</header>' +
  band({ eyebrow, subtitle }) +
  '<div class="cell-stage">' +
    (lede ? `<p>${lede}</p>` : '') +
    items(n) +
    (insight ? `<blockquote><p>${insight}</p></blockquote>` : '') +
    (note ? `<div class="below-note"><p>${note}</p></div>` : '') +
  '</div>' +
  '<div class="cell-footer"><footer>Probe</footer><span class="lat-pagination">1</span></div>';

// The shape the engine ACTUALLY emits since the universal coda cell (lib/core/coda.js):
// both trailing beats live inside one `.cell-coda`, not as bare siblings. The envelope
// still has to tell them apart — the insight earns its own page, the note rides the last
// body page — so it decomposes the cell rather than treating it as one opaque block.
//
// THE CELL IS A SIBLING OF `.cell-stage`, NOT A CHILD OF IT, and getting that wrong here
// is not cosmetic: this fixture previously nested the cell INSIDE the stage, and because
// every scan in split-envelope.js bounds itself by `extractStage`, all eight tests below
// passed against a DOM the engine cannot produce while the real export duplicated the
// Key Insight onto every body page and emitted no insight page at all. A fixture that
// drifts from the render is worse than no fixture — it certifies the bug. Measured on
// examples/split-envelope.md at the time: 27 pages, the insight 6x, the note lost.
const codaInner = ({ n = 9, note = '', insight = '' } = {}) =>
  '<header>Deck</header>' +
  band({}) +
  '<div class="cell-stage">' + items(n) + '</div>' +
  ((insight || note)
    ? '<div class="cell-coda" data-dock="column">' +
        (insight ? `<blockquote><p>${insight}</p></blockquote>` : '') +
        (note ? `<div class="below-note"><p>${note}</p></div>` : '') +
      '</div>'
    : '') +
  '<div class="cell-footer"><footer>Probe</footer><span class="lat-pagination">1</span></div>';

const openTag = '<section data-lattice-slide="4" id="s4" data-lattice-pagination="4" class="checklist form">';
const build = (inner, per = 4, opts = {}) =>
  splitEnvelope(openTag, inner, chromeOf(inner), { axis: 'item', per, layoutName: 'checklist', ...opts });
const classOf = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];

describe('core: balancedPerPage — the BODY pacing (§0b granularity)', () => {
  test('spreads evenly over the pages the target implies — never a runt last page', () => {
    // The defect this exists to kill: 14 checklist items at a target of 6 used to emit
    // 6/6/2, and because members stretch to fill the stage that 2-item page rendered with
    // grotesquely tall rows. 5/5/4 instead.
    assert.equal(balancedPerPage(14, 6), 5);
    assert.equal(balancedPerPage(9, 4), 3);   // 3/3/3, not 4/4/1
    assert.equal(balancedPerPage(7, 4), 4);   // 4/3 — already as even as it gets
    assert.equal(balancedPerPage(6, 3), 3);   // exact fit is unchanged
  });

  // …but the SCALAR above is only the ceiling. The actual page sizes come from
  // `evenGroups`, and asserting the scalar is what let a runt ship: a ceiling of 4 over 13
  // members chunked to 4/4/4/1. Assert the DISTRIBUTION, and do it exhaustively rather than
  // on sampled pairs — every pair the old test picked was one where ceiling and balance
  // coincide, which is exactly how the defect hid. Found by the HARD RULE #25 trio.
  test('evenGroups: the cases a greedy chunk got wrong', () => {
    const g = (n, t) => evenGroups(n, t).join('/');
    assert.equal(g(13, 4), '4/3/3/3');        // was 4/4/4/1
    assert.equal(g(7, 3), '3/2/2');           // was 3/3/1
    assert.equal(g(21, 5), '5/4/4/4/4');      // was 5/5/5/5/1
    assert.equal(g(10, 4), '4/3/3');          // was 4/4/2
    assert.equal(g(14, 6), '5/5/4');          // unchanged — already balanced
    assert.equal(g(6, 1), '1/1/1/1/1/1');     // a HEAVY member atomizes
  });

  test('evenGroups holds three invariants for every (count, ceiling) up to 60×8', () => {
    for (let n = 1; n <= 60; n += 1) {
      for (let t = 1; t <= 8; t += 1) {
        const sizes = evenGroups(n, t);
        assert.equal(sizes.reduce((a, b) => a + b, 0), n, `conserves members: n=${n} t=${t}`);
        assert.ok(Math.max(...sizes) <= t, `never exceeds the ceiling: n=${n} t=${t} -> ${sizes}`);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `no runt: n=${n} t=${t} -> ${sizes}`);
      }
    }
  });

  test('never exceeds the target, and a target of 1 atomizes', () => {
    assert.equal(balancedPerPage(6, 1), 1);   // a HEAVY member: one per page
    assert.equal(balancedPerPage(100, 1), 1);
    for (const [n, t] of [[14, 6], [9, 4], [7, 4], [13, 5], [2, 9]]) {
      assert.ok(balancedPerPage(n, t) <= Math.max(t, 1) || n <= t, `${n}/${t}`);
    }
  });

  test('degenerate input does not divide by zero or emit a non-positive page size', () => {
    for (const [n, t] of [[0, 3], [5, 0], [5, null], [5, undefined], [-1, 3], [3, 2.5]]) {
      const r = balancedPerPage(n, t);
      assert.ok(Number.isInteger(r) && r >= 1, `balancedPerPage(${n}, ${t}) = ${r}`);
    }
  });

  test('the authoring lint predicts the SAME page count AND sizes the kernel will produce', () => {
    // lint-core cannot require the kernel (it is fs-free and rides the browser bundle), so it
    // recomputes the arithmetic. Pin BOTH numbers: pinning only the page count is what let the
    // advisory promise "4 pages of 4" for a render that came out 4/3/3/3 (and claim "every page
    // is paced the same" while it wasn't). Mirrors lint-core's `pages`/`base`/`extra`/`paced`.
    const lintPrediction = (n, target) => {
      const pages = Math.max(1, Math.ceil(n / target));
      const base = Math.floor(n / pages);
      const extra = n % pages;
      return { pages, paced: extra ? `${base + 1}–${base}` : `${base}`, even: extra === 0 };
    };
    for (let n = 1; n <= 40; n += 1) {
      for (const t of [1, 2, 3, 4, 5, 6, 8]) {
        const sizes = evenGroups(n, t);
        const lint = lintPrediction(n, t);
        assert.equal(lint.pages, sizes.length, `page count: n=${n} target=${t}`);
        const hi = Math.max(...sizes);
        const lo = Math.min(...sizes);
        assert.equal(lint.paced, hi === lo ? `${hi}` : `${hi}–${lo}`, `sizes: n=${n} target=${t}`);
        assert.equal(lint.even, hi === lo, `same-pacing claim: n=${n} target=${t}`);
      }
    }
  });
});

describe('core: splitEnvelope — the envelope shape (§0a)', () => {
  test('COVER → BODY(1…n): exactly one cover, first, then the native body pages', () => {
    const parts = build(formInner({ n: 9 }), 4);
    assert.equal(parts.length, 4); // cover + 3 bodies
    assert.match(classOf(parts[0]), /\blat-split-cover\b/);
    assert.equal(parts.filter((p) => /\blat-split-cover\b/.test(classOf(p))).length, 1);
    for (const body of parts.slice(1)) {
      assert.match(classOf(body), /\bchecklist\b/);          // the layout's OWN finish
      assert.match(classOf(body), /\blat-split-native\b/);   // the re-split guard
    }
  });

  // The role class REPLACES the layout class, but the CANVAS axis (lib/core/color-mode.js
  // COLOR_MODE_TOKENS) is orthogonal to layout and must survive. Replacing the whole class
  // attribute dropped it, so a `dark` deck opened every split run with a LIGHT accent page and
  // a `print` deck got a full-bleed near-black flood between two ink-on-white slides. Found by
  // the adversarial trio on real renders (two lenses independently); body pages were never
  // affected because they use the additive `addClass`.
  for (const canvas of ['dark', 'light', 'print']) {
    test(`the cover keeps the canvas class \`${canvas}\` across the layout-class swap`, () => {
      const tag = openTag.replace('class="checklist form"', `class="checklist ${canvas} form"`);
      const parts = splitEnvelope(tag, formInner({ n: 9 }), chromeOf(formInner({ n: 9 })), {
        axis: 'item', per: 4, layoutName: 'checklist',
      });
      // Compare CLASS TOKENS, not substrings: the cover legitimately carries the
      // `split-cover-checklist` tell, and /\bchecklist\b/ matches inside it (`-` is a word
      // boundary), so a substring assertion here would be meaningless.
      const tokens = classOf(parts[0]).trim().split(/\s+/);
      assert.ok(tokens.includes('lat-split-cover'), 'still the cover role');
      assert.ok(!tokens.includes('checklist'), 'the layout class is still swapped out');
      assert.ok(tokens.includes(canvas), `the cover must keep \`${canvas}\` (got: ${tokens.join(' ')})`);
      for (const body of parts.slice(1)) {
        assert.ok(classOf(body).trim().split(/\s+/).includes(canvas), 'body pages keep it too');
      }
    });
  }

  test('a layout-scoped modifier does NOT ride onto the content-classed cover', () => {
    const tag = openTag.replace('class="checklist form"', 'class="checklist compact form"');
    const inner = formInner({ n: 9 });
    const parts = splitEnvelope(tag, inner, chromeOf(inner), { axis: 'item', per: 4, layoutName: 'checklist' });
    assert.doesNotMatch(classOf(parts[0]), /\bcompact\b/);
  });

  test('the cover carries the masthead: eyebrow · title · subtitle · lede', () => {
    const [cover] = build(formInner({ eyebrow: 'Readiness', subtitle: 'fourteen checks', lede: 'All true before we ship.' }));
    assert.match(cover, /split-feat-eye">Readiness</);
    assert.match(cover, /split-feat-h">Launch readiness</);
    assert.match(cover, /split-feat-sub">fourteen checks</);
    assert.match(cover, /split-feat-lede">All true before we ship\.</);
    assert.match(cover, /<header>Deck<\/header>/); // chrome rides the cover
    assert.match(cover, /<footer>Probe<\/footer>/);
  });

  test('the cover carries a `split-cover-<layout>` tell, never the layout base class', () => {
    const [cover] = build(formInner());
    assert.match(classOf(cover), /\bsplit-cover-checklist\b/);
    assert.doesNotMatch(classOf(cover), /(^|\s)checklist(\s|$)/);
  });

  test('only the cover keeps the engine id — no page of the run duplicates it', () => {
    const parts = build(formInner());
    assert.equal(parts.filter((p) => /\sid="s4"/.test(p)).length, 1);
    assert.match(parts[0], /\sid="s4"/);
  });

  test('(cont.) marks the repeated heading from the SECOND body page on', () => {
    const parts = build(formInner({ n: 9 }), 4);
    assert.doesNotMatch(parts[1], /lat-cont/);
    assert.match(parts[2], /lat-cont/);
    assert.match(parts[3], /lat-cont/);
  });
});

describe('core: splitEnvelope — the CLOSING page carries the trailing material (2026-09-01)', () => {
  // Replaces two suites: "the NOTE rides the last body page" and "the INSIGHT page". Both
  // pinned the 2026-07-26 treatment, which split the trailing material in two — the insight
  // got a page, the note got a footnote slot one size down on a page already full of members.
  // A note, a key insight and an annotation are the three ways a section says something ABOUT
  // its content rather than more OF it, so they close the run together.
  test('a trailing below-note lands ONCE, on a CLOSING page of its own', () => {
    const parts = build(formInner({ n: 9, note: 'Source: the launch board.' }), 4);
    assert.equal(parts.length, 5); // cover + 3 bodies + the closing page
    const withNote = parts.filter((p) => /\bbelow-note\b/.test(p));
    assert.equal(withNote.length, 1, 'the below-note must appear on exactly one page');
    assert.equal(withNote[0], parts.at(-1), 'and it must be the CLOSING page');
    assert.match(classOf(parts.at(-1)), /\blat-split-closing\b/);
    assert.match(classOf(parts.at(-1)), /\bchecklist\b/); // keeps the layout class
    assert.doesNotMatch(parts.at(-1), /<li>/, 'no collection member shares the closing page');
  });

  test('the note is at FULL size — the compact marker is gone with the page it was for', () => {
    // `lat-split-note` stepped the note down one size because it shared a page with real
    // content. On its own page there is nothing to compete with.
    const parts = build(formInner({ n: 9, note: 'Trailing note.' }), 4);
    assert.ok(!parts.some((p) => /lat-split-note/.test(p)));
  });

  test('a raw trailing <p> on a below-note-EXCLUDED layout also closes the run', () => {
    // stats/content/etc. never get the `.below-note` wrap (lib/core/below-note.js EXCLUDED) —
    // placement is orthogonal to that styling decision.
    const raw = `${band()}<div class="cell-stage">${items(9)}<p>Raw trailing note.</p></div>`;
    const parts = build(raw, 4);
    const withP = parts.filter((p) => /Raw trailing note\./.test(p));
    assert.equal(withP.length, 1);
    assert.equal(withP[0], parts.at(-1));
    assert.match(classOf(parts.at(-1)), /\blat-split-closing\b/);
  });

  test('a trailing key-insight blockquote closes the run too', () => {
    const parts = build(formInner({ n: 9, insight: 'The board is the source of truth.' }), 4);
    assert.equal(parts.length, 5); // cover + 3 bodies + closing
    const withInsight = parts.filter((p) => /<blockquote>/.test(p));
    assert.equal(withInsight.length, 1);
    assert.equal(withInsight[0], parts.at(-1));
    assert.match(classOf(parts.at(-1)), /\blat-split-closing\b/);
    assert.match(parts.at(-1), /<div class="cell-stage">/);
    assert.doesNotMatch(parts.at(-1), /<li>/);
  });

  test('the closing page carries NO "(cont.)" — it continues no list', () => {
    const parts = build(formInner({ n: 9, insight: 'Insight.' }), 4);
    assert.doesNotMatch(parts.at(-1), /lat-cont/);
  });

  test('insight and note SHARE the closing page — one page, both beats', () => {
    // The direct reversal of the old "insight and note NEVER share a page".
    const parts = build(formInner({ n: 9, insight: 'The board is the source of truth.', note: 'Reviewed weekly.' }), 4);
    assert.equal(parts.length, 5); // cover + 3 bodies + ONE closing page
    const closing = parts.at(-1);
    assert.match(classOf(closing), /\blat-split-closing\b/);
    assert.match(closing, /\bbelow-note\b/);
    assert.match(closing, /<blockquote>/);
    assert.equal(parts.filter((p) => /lat-split-closing/.test(p)).length, 1);
  });

  test('no trailing material at all → no closing page', () => {
    const parts = build(formInner({ n: 9 }), 4);
    assert.equal(parts.length, 4); // cover + 3 bodies, and nothing after
    assert.ok(!parts.some((p) => /lat-split-closing/.test(p)));
  });

  test('the lede is hoisted to the cover, so it appears exactly once too', () => {
    const parts = build(formInner({ n: 9, lede: 'All true before we ship.' }), 4);
    const hits = parts.filter((p) => p.includes('All true before we ship.'));
    assert.equal(hits.length, 1);
    assert.equal(hits[0], parts[0]);
  });
});

describe('core: splitEnvelope — conservation and refusal', () => {
  test('no content lost: every member and every leaf survives the split', () => {
    const inner = formInner({ eyebrow: 'Readiness', subtitle: 'fourteen checks', lede: 'Framing.', n: 9, insight: 'Insight.', note: 'Note.' });
    const all = build(inner, 4).join('');
    assert.equal((all.match(/<li>item /g) || []).length, 9);
    for (const leaf of ['Readiness', 'Launch readiness', 'fourteen checks', 'Framing.', 'Insight.', 'Note.']) {
      assert.ok(all.includes(leaf), `lost: ${leaf}`);
    }
  });

  test('with no title: no COVER page, but the rest of the envelope still builds', () => {
    // Was `null` — which handed the slide to the caller's bare partition, and that hoists only a
    // note a PREVIOUS pass already marked. On a first cut there is none, so a title-less slide's
    // key insight was copied onto every body page with no closing page to land on. The cover is
    // the only part that needs a title.
    const inner = `<div class="cell-stage">${items(9)}</div>`;
    const parts = build(inner, 4);
    assert.ok(Array.isArray(parts) && parts.length >= 2, 'a title-less slide still splits');
    assert.ok(!parts.some((p) => /\blat-split-cover\b/.test(p)), 'emitted a cover with no title');
    assert.ok(parts.every((p) => /data-split-role="(?:body|closing)"/.test(p)),
      'every page of a title-less run is a body or the closing page');
  });

  test('with no title, the FIRST body page keeps the engine id the cover would have held', () => {
    const inner = `<div class="cell-stage">${items(9)}</div>`;
    const tag = '<section data-lattice-slide="1" id="7" class="cards">';
    const parts = splitEnvelope(tag, inner, chromeOf(inner), { axis: 'item', per: 4 });
    const ids = parts.filter((p) => /\sid="7"/.test(p));
    assert.equal(ids.length, 1, 'the id must appear exactly once across the run');
    assert.match(parts[0], /\sid="7"/, 'it belongs on the first page');
  });

  test('refuses when the collection already fits the per-page cut', () => {
    assert.equal(build(formInner({ n: 4 }), 4), null);
    assert.equal(build(formInner({ n: 1 }), 4), null);
  });

  test('refuses a non-splittable axis and a bad per-page cut', () => {
    assert.equal(build(formInner(), 4, { axis: 'col' }), null);
    assert.equal(build(formInner(), 0), null);
  });

  test('refuses when the only collection sits OUTSIDE the content cell (rule 12b)', () => {
    // A list in the masthead band is chrome, not this slide's split seam.
    const inner = `<div class="cell-masthead"><div class="masthead-lede"><h2>T</h2>${items(9)}</div></div><div class="cell-stage"><p>prose</p></div>`;
    assert.equal(build(inner, 4), null);
  });
});

describe('core: splitEnvelope — readers', () => {
  test('readMasthead: a code-only <p> BEFORE the title is the eyebrow, AFTER it the subtitle', () => {
    const head = band({ eyebrow: 'Kicker', title: 'Title', subtitle: 'Sub' });
    assert.deepEqual(readMasthead(head), { eyebrow: 'Kicker', heading: 'Title', subtitle: 'Sub' });
    assert.deepEqual(readMasthead(band({ title: 'Title', subtitle: 'Sub' })), { eyebrow: null, heading: 'Title', subtitle: 'Sub' });
    assert.deepEqual(readMasthead(band({ eyebrow: 'Kicker', title: 'Title' })), { eyebrow: 'Kicker', heading: 'Title', subtitle: null });
    assert.equal(readMasthead('<p>no title here</p>'), null);
  });

  test('readCover: joins multiple framing paragraphs, ignores masthead chrome', () => {
    const inner = `${band({ subtitle: 'Sub' })}<div class="cell-stage"><p>One.</p><p>Two.</p>${items(3)}</div>`;
    assert.deepEqual(readCover(inner, 'item'), { eyebrow: null, heading: 'Launch readiness', subtitle: 'Sub', lede: 'One. Two.' });
  });

  test('splitRegions: bounds the collection, the lede, and the two trailing kinds separately', () => {
    const inner = formInner({ lede: 'Framing.', n: 3, insight: 'Insight.', note: 'Note.' });
    const r = splitRegions(inner, 'item');
    assert.equal(r.lede.length, 1);
    assert.match(r.lede[0].outer, /Framing\./);
    assert.equal(r.insight.length, 1);
    assert.match(r.insight[0].outer, /<blockquote>/);
    assert.equal(r.note.length, 1);
    assert.match(r.note[0].outer, /below-note/);
    assert.equal(inner.slice(r.coll.start, r.coll.end).startsWith('<ul>'), true);
  });

  // The `premise` defect (#1234 group C): a component whose transform groups the title
  // and its lede into ONE wrapper. `readMasthead` finds the `<h2>` by regex at any
  // depth, but the lede scan only looked at depth 0 — so the cover got a heading with
  // no lede, and the lede stayed in the body and `partitionAxis` repeated it on EVERY
  // page. Reproduced on a real portrait render before the fix: "Past eight rows the
  // categorical hues repeat…" printed on both body pages and on neither cover.
  //
  // The three shapes are asserted together, because the first fix of this broke the
  // common one: when the title lives in the `.cell-masthead` BAND it is outside the
  // content cell entirely, so `<h2>` is legitimately absent from the scanned region and
  // guarding on "no h2 → no lede" silently dropped every ordinary cover's lede.
  test('ledeSpansIn: the lede lives in the TITLE\'S OWN container, at any of three depths', () => {
    // 1. banded — the <h2> is outside the cell; every stage <p> before the collection is a lede.
    const banded = formInner({ lede: 'Framing.', n: 3 });
    assert.deepEqual(splitRegions(banded, 'item').lede.map((s) => s.outer), ['<p>Framing.</p>']);

    // 2. bandless — the <h2> is a depth-0 sibling; only what FOLLOWS it is a lede.
    const bandless = '<div class="cell-stage"><p>Pre-title chrome.</p><h2>T</h2><p>Framing.</p>'
      + `${items(3)}</div>`;
    assert.deepEqual(splitRegions(bandless, 'item').lede.map((s) => s.outer), ['<p>Framing.</p>']);

    // 3. NESTED — premise's shape (lib/core/premise.js wraps <h2> + lede in .premise-claim).
    const nested = `<div class="premise-claim"><h2>T</h2>\n<p>Framing.</p></div>\n${items(3)}`;
    const r = splitRegions(nested, 'item');
    assert.deepEqual(r.lede.map((s) => s.outer), ['<p>Framing.</p>']);
    assert.equal(readCover(nested, 'item').lede, 'Framing.');
    // ...and removing it leaves the wrapper intact, so `.premise-claim > h2` still styles.
    const body = nested.slice(0, r.lede[0].start) + nested.slice(r.lede[0].end);
    assert.match(body, /<div class="premise-claim"><h2>T<\/h2>\s*<\/div>/);
  });

  test('ledeSpansIn: descends exactly ONE level — deeper is component structure, not a masthead', () => {
    // A title buried two levels down is not a "title + lede" group; treating it as one
    // would let the envelope reach into a component's own DOM and lift a paragraph that
    // belongs to it. Nothing is hoisted, so nothing is lost — it just repeats, which is
    // the pre-existing behavior for a shape the envelope does not understand.
    const deep = `<div class="outer"><div class="inner"><h2>T</h2><p>Not a lede.</p></div></div>${items(3)}`;
    assert.deepEqual(splitRegions(deep, 'item').lede, []);
  });

  test('trailingSpansIn: only the TRAILING run — a lead-in before another block is not trailing', () => {
    // `…</ul><p>lead-in</p><table>` — the <p> introduces the table, so nothing trails.
    const lead = `${band()}<div class="cell-stage">${items(9)}<p>What the table shows.</p><table><tbody><tr><td>a</td></tr></tbody></table></div>`;
    const r0 = splitRegions(lead, 'item');
    assert.equal(r0.insight.length + r0.note.length, 0);
    const parts = build(lead, 4);
    assert.ok(!parts.some((p) => /lat-split-note|lat-split-insight/.test(p)));
    assert.equal(parts.filter((p) => p.includes('What the table shows.')).length, 3); // unchanged: still per body page
    // …but a note AFTER an opaque block still hoists (the run ends at that block).
    const tail = `${band()}<div class="cell-stage">${items(9)}<div class="foo">x</div><div class="below-note"><p>Note.</p></div></div>`;
    const r = splitRegions(tail, 'item');
    assert.equal(r.note.length, 1);
    assert.match(r.note[0].outer, /below-note/);
  });

  test('chrome does not end the trailing run — a cell-less slide still moves its note', () => {
    // A STAGE_DEFERRED / non-Form layout has no `.cell-stage`, so the region runs to the end
    // of the section and the Marp <footer> sits AFTER the note. Chrome must be stepped over,
    // or the FM-2 duplication survives here (and would flip on whether the deck sets `footer:`).
    const bare = `<header>H</header><h2>T</h2>${items(9)}<div class="below-note"><p>Note.</p></div><footer>F</footer>`;
    assert.equal(splitRegions(bare, 'item').note.length, 1);
    const parts = build(bare, 4);
    assert.equal(parts.filter((p) => /\bbelow-note\b/.test(p)).length, 1);
    // It lands on the CLOSING page now, at full size — `lat-split-note` was the compact marker
    // for the days it shared a body page (2026-09-01).
    assert.match(classOf(parts.at(-1)), /\blat-split-closing\b/);
    assert.ok(!parts.some((x) => /lat-split-note/.test(x)));
    // …and identically with no footer at all, so the shape can't depend on deck chrome.
    const noFooter = bare.replace('<footer>F</footer>', '');
    assert.equal(splitRegions(noFooter, 'item').note.length, 1);
  });

  test('topLevelElements: depth-aware, void tags open no level, stops at the parent close', () => {
    const els = topLevelElements('<p>a</p><div><p>nested</p></div><hr class="x"><blockquote>q</blockquote></div><p>outside</p>');
    assert.deepEqual(els.map((e) => e.name), ['p', 'div', 'hr', 'blockquote']);
  });
});

// There is ONE pass and it takes no verdict: `splitDoc` is a pure function of the markup
// (2026-09-01). `firstCut` survives as a name because these tests pin the envelope's SHAPE
// through the real entry point rather than calling `splitEnvelope` directly.
const firstCut = (html, capacity) => {
  const r = splitDoc(html, capacity);
  return { html: r.html, splits: r.changed };
};

describe('core: the envelope through the auto-split passes (HARD RULE #1)', () => {
  const cap = { checklist: { axis: 'item', hard: 5, sweet: 4 } };
  const doc = (inner) => `<section data-lattice-slide="1" data-lattice-pagination="1" data-lattice-pagination-total="1" class="checklist form">${inner}</section>`;

  test('the cut: cover → one body per member → closing carrying the note', () => {
    const { html, splits } = firstCut(doc(formInner({ n: 9, note: 'Note.' })), cap);
    assert.equal(splits, 1);
    assert.equal((html.match(/<section/g) || []).length, 11); // cover + 9 bodies + closing
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1);
  });

  test('the cut: a note AND an insight close the run together, on ONE page', () => {
    const { html, splits } = firstCut(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    assert.equal(splits, 1);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1);
    assert.equal((html.match(/<blockquote>/g) || []).length, 1);
  });

  test('re-running the pass over its own output is a no-op — the cut has nowhere left to go', () => {
    // The old loop could re-cut a page it had already cut, which is why the run-level
    // adornments had to be deferred to a post-convergence pass. One element per page IS the
    // fixed point, so a second run changes nothing.
    const once = firstCut(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    assert.equal(once.splits, 1);
    const twice = splitDoc(once.html, cap);
    assert.equal(twice.changed, 0);
    assert.equal(twice.html, once.html, 'the structural cut is idempotent');
  });

  test('the run addresses itself — 1 · 1.2 · 1.3 …, attribute AND visible span in step', () => {
    const { html } = firstCut(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    const attrs = [...html.matchAll(/data-lattice-pagination="([^"]*)"/g)].map((m) => m[1]);
    const spans = [...html.matchAll(/class="lat-pagination">([^<]*)</g)].map((m) => m[1]);
    // The fixture's one slide is number 1, so its run is 1 · 1.2 … 1.11 (cover + 9 bodies +
    // closing). The COVER keeps the authored number bare — that is what makes an unsplit deck
    // and a split one read the same at the top of every run.
    const expected = ['1', ...Array.from({ length: 10 }, (_, i) => `1.${i + 2}`)];
    assert.deepEqual(attrs, expected);
    // Every page carries a real `.lat-pagination` element in its own `.cell-footer` — the cover
    // included. (Before it built that Cell, the cover fell back to the `section.form::after`
    // pseudo, and the four absolutely-positioned marks overlapped on a portrait cover: the rail
    // struck through the footer text and the section label truncated.)
    assert.deepEqual(spans, expected);
    assert.ok([...html.matchAll(/data-lattice-pagination-total="([^"]*)"/g)].every((m) => m[1] === '1'),
      'the total is the authored slide count, which a split does not change');
  });

  // The engine's contract: absolute position, whole-deck total, hidden slides counted
  // (lib/engine/slides.js §3). The envelope must not shift a slide the split never saw.
  test('a hidden (paginate:false) slide keeps its position — the envelope numbers absolutely', () => {
    const hidden = '<section data-lattice-slide="1" class="title"><h1>cover</h1></section>';
    const trailing = '<section data-lattice-slide="3" data-lattice-pagination="3" data-lattice-pagination-total="3" class="content form"><p>after</p></section>';
    const { html } = firstCut(hidden + doc(formInner({ n: 9, insight: 'Insight.' })).replace('data-lattice-pagination="1"', 'data-lattice-pagination="2"') + trailing, cap);
    const attrs = [...html.matchAll(/data-lattice-pagination="([^"]*)"/g)].map((m) => m[1]);
    // The hidden slide holds 1 and is untouched; the run addresses itself from 2; the trailing
    // slide is still 3, because a split never moves anything after it.
    assert.deepEqual(attrs.map(String), ['2', ...Array.from({ length: 10 }, (_, i) => `2.${i + 2}`), '3']);
    // Totals are never rewritten, so each section keeps the one it was authored with — the
    // run's `1` and the trailing slide's `3` in this synthetic fixture. Asserting they are
    // UNCHANGED is the real contract; asserting a single value would only pin the fixture.
    const totalsIn = ['1', '3'];
    assert.deepEqual([...new Set([...html.matchAll(/data-lattice-pagination-total="([^"]*)"/g)].map((m) => m[1]))].sort(), totalsIn);
  });

  test('a page the splitter emitted never grows a SECOND cover', () => {
    const { html } = firstCut(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    assert.equal((splitDoc(html, cap).html.match(/lat-split-cover/g) || []).length, 1);
  });

  test('a slide with nothing to divide is byte-identical', () => {
    // One member, so there is no seam. The pass must not touch it at all — not renumber it,
    // not re-stamp it, not wrap it.
    const html = doc(formInner({ n: 1, insight: 'Insight.', note: 'Note.' }));
    const r = splitDoc(html, cap);
    assert.equal(r.changed, 0);
    assert.equal(r.html, html);
  });
});

// The gate rule 9 asks for: over a WHOLE deck, run by run, exactly one cover FIRST and at
// most one insight page LAST. Grouped by `data-split-run` — the same grouping `applyRails`
// uses — so it also pins that the cover and the insight page join their run rather than
// standing alone.
describe('core: the envelope invariant, per split RUN across a whole deck (rule 9)', () => {
  const cap = { checklist: { axis: 'item', hard: 5, sweet: 4 }, cards: { axis: 'item', hard: 3, sweet: 2 } };
  const slide = (n, cls, inner) =>
    `<section data-lattice-slide="${n}" id="s${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="4" class="${cls}">${inner}</section>`;

  // A deck with: a plain slide, a splitting run WITH a trailing note AND a key insight, a
  // splitting run WITHOUT either, and a title-less splitting slide (bare partition).
  const deck =
    slide(1, 'content form', `${band({ title: 'Opening' })}<div class="cell-stage"><p>prose</p></div>`) +
    slide(2, 'checklist form', formInner({ n: 9, lede: 'Framing.', insight: 'Insight.', note: 'Note.' })) +
    slide(3, 'cards form', formInner({ n: 7, subtitle: 'sub' })) +
    slide(4, 'cards form', `<div class="cell-stage">${items(7)}</div>`);

  // Collect each run's pages as { cls, role }. The ROLE is the kernel's own stamp
  // (`data-split-role`, split-envelope.js `withRole`) and is what the invariant keys on —
  // see the note on assertEnvelope below for why the class cannot serve.
  const runsOf = (html) => {
    const runs = new Map();
    for (const p of splitSections(html)) {
      if (p.type !== 'section') continue;
      const rid = (p.openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1];
      if (!rid) continue;
      if (!runs.has(rid)) runs.set(rid, []);
      runs.get(rid).push({
        cls: p.cls || '',
        role: (p.openTag.match(/\sdata-split-role="([^"]*)"/) || [])[1] || null,
      });
    }
    return runs;
  };

  // §8 rule 9's gate. Keyed on the kernel's ROLE, not on a class.
  //
  // It used to filter `/\blat-split-cover\b/`, which ONLY the plain path and
  // `cover-paginate`/`cover-cards` emit — the per-layout strategies emit their own
  // (`split-panel-cover`, `list-tabular-cover`, `decision-cover`, `compare-code-cover`).
  // So for 6 of the 9 strategies `covers.length` was 0, `covers.length <= 1` passed
  // trivially, and the `if (covers.length)` ordering checks SKIPPED: a gate blind to two
  // thirds of its subject. Found by the HARD RULE #25 trio (two lenses independently).
  const assertEnvelope = (html, label) => {
    const runs = runsOf(html);
    assert.ok(runs.size > 0, `${label}: expected at least one split run`);
    for (const [rid, pages] of runs) {
      const roles = pages.map((p) => p.role);
      // EVERY page of a run carries a role — so a new strategy that forgets to stamp one
      // FAILS here instead of quietly falling outside the invariant.
      assert.ok(
        roles.every((r) => r && ['cover', 'body', 'closing', 'insight'].includes(r)),
        `${label} run ${rid}: un-stamped or unknown split role(s): ${JSON.stringify(roles)}`,
      );
      const covers = roles.filter((r) => r === 'cover');
      // `insight` remains a legal role: the carousel strategies that re-author their own body
      // (carousel.js) still attach `insightPageFrom`. The PLAIN path emits `closing` instead,
      // which carries the note as well. Either way a run ends on at most one of them.
      const enders = roles.filter((r) => r === 'closing' || r === 'insight');
      assert.ok(covers.length <= 1, `${label} run ${rid}: ${covers.length} covers`);
      assert.ok(enders.length <= 1, `${label} run ${rid}: ${enders.length} closing/insight pages`);
      if (covers.length) assert.equal(roles[0], 'cover', `${label} run ${rid}: cover is not first`);
      if (enders.length) assert.ok(['closing', 'insight'].includes(roles.at(-1)), `${label} run ${rid}: the closing page is not last`);
      // Body pages are contiguous between them — no body after the run's ending beat.
      const lastBody = roles.lastIndexOf('body');
      if (enders.length) {
        const enderAt = roles.findIndex((r) => r === 'closing' || r === 'insight');
        assert.ok(lastBody < enderAt, `${label} run ${rid}: body page after the closing`);
      }
      const titled = pages.some((p) => /\bchecklist\b|\bcards\b/.test(p.cls));
      assert.ok(titled, `${label} run ${rid}: unexpected run shape`);
    }
  };

  test('the first cut, then rails: every run is a well-formed envelope', () => {
    const { html, splits } = firstCut(deck, cap);
    assert.equal(splits, 3); // slides 2, 3, 4 all split
    assertEnvelope(html, 'first cut');
    assertEnvelope(applyRails(html), 'first cut + rails'); // rails must not disturb the shape
    // Slide 4 is title-less → bare partition, so the deck carries 2 covers, not 3.
    assert.equal((html.match(/lat-split-cover/g) || []).length, 2);
    // Slide 2 is the only one with trailing material, so it is the only run with a closing page —
    // and its note and insight are on that ONE page.
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1);
    assert.equal((html.match(/<blockquote>/g) || []).length, 1);
  });

  test('re-running the pass converges immediately — one element per page is the fixed point', () => {
    let html = firstCut(deck, cap).html;
    // The old measured loop ran up to five passes and could re-cut a page it had already cut,
    // which is why the run-level adornments had to wait for convergence. Re-run it five times
    // anyway: after the first, nothing may change, and the envelope must stay singular per run.
    for (let pass = 0; pass < 5; pass++) {
      const r = splitDoc(html, cap);
      assert.equal(r.changed, 0, `pass ${pass + 1} re-cut an already-split deck`);
      assert.equal(r.html, html, `pass ${pass + 1} was not a no-op`);
      html = r.html;
      assertEnvelope(html, `pass ${pass + 1}`);
    }
    assert.equal((html.match(/lat-split-cover/g) || []).length, 2);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1); // still exactly once
    // Page numbers stay monotonic 1..N with the total matching, however many passes ran.
    const pages = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(pages, pages.map((_, i) => i + 1));
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => Number(m[1]) === pages.length));
  });
});

// ── The two placement primitives, pinned ────────────────────────────────────────
// Both were fixed under mutation testing (a deliberate break that no test caught) and then
// again on a real render; these are the tests that were owed.
describe('core: split-envelope — partitionKeepingNote is a true no-op when the cut does not fit', () => {
  const cell = (body) => `<header>H</header><div class="cell-masthead"><div class="masthead-lede"><h2>T</h2></div></div>` +
    `<div class="cell-stage">${body}</div><div class="cell-footer"><footer>F</footer></div>`;

  test('a page whose collection already fits comes back BYTE-IDENTICAL, note and all', () => {
    // `partitionAxis`'s "already fits" return is a length-1 array holding its INPUT — which here
    // is the note-STRIPPED html, so returning it as-is silently dropped the note. The guard
    // re-injects on the untouched original instead, which must be indistinguishable from a bare
    // `partitionAxis` call on a slide with no note at all.
    const inner = cell('<ul><li>a</li><li>b</li></ul><p class="lat-split-note">A footnote.</p>');
    const out = partitionKeepingNote(inner, 'item', 5);
    assert.equal(out.length, 1);
    assert.equal(out[0], inner, 'the no-split path must not rewrite the page');
  });

  test('when it DOES cut, the note rides the last piece only', () => {
    const inner = cell('<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul><p class="lat-split-note">A footnote.</p>');
    const out = partitionKeepingNote(inner, 'item', 2);
    assert.equal(out.length, 2);
    assert.doesNotMatch(out[0], /lat-split-note/, 'the note must not repeat on every piece');
    assert.match(out.at(-1), /lat-split-note/);
    assert.equal((out.join('').match(/lat-split-note/g) || []).length, 1);
  });

  test('a page with no note at all is exactly a bare partitionAxis', () => {
    const inner = cell('<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul>');
    const out = partitionKeepingNote(inner, 'item', 2);
    assert.equal(out.length, 2);
    assert.ok(out.every((p) => !/lat-split-note/.test(p)));
  });
});

describe('core: split-envelope — injectTrailing places the note before the TRAILING CHROME RUN', () => {
  test('with a `.cell-stage`, the note lands at the end of the content cell', () => {
    const inner = '<header>H</header><div class="cell-stage"><ul><li>a</li></ul></div><footer>F</footer>';
    const out = injectTrailing(inner, '<p class="lat-split-note">N</p>');
    assert.match(out, /<\/ul><p class="lat-split-note">N<\/p><\/div>/);
  });

  test('with NO stage, it lands before the footer AND the section rail that follows it', () => {
    // The earlier rule was "right before the last `<footer>`, but only if nothing but whitespace
    // follows its close". A rendered Form slide ends `…</footer><div class="tile-progress">…</div>`,
    // so something DID follow, the check failed, and the note was appended AFTER the section's own
    // chrome. Keyed on the trailing chrome RUN now.
    const inner = '<header>H</header><ul><li>a</li></ul><footer>F</footer><div class="tile-progress"><span class="seg">S</span></div>';
    const out = injectTrailing(inner, '<p class="lat-split-note">N</p>');
    assert.match(out, /<\/ul><p class="lat-split-note">N<\/p><footer>/);
    assert.ok(out.indexOf('lat-split-note') < out.indexOf('<footer>'));
    assert.ok(out.indexOf('lat-split-note') < out.indexOf('tile-progress'));
  });

  test('a page whose CONTENT mentions a literal <footer> is not misplaced (the lazy-regex trap)', () => {
    const inner = '<header>H</header><ul><li>see &lt;footer&gt; below</li></ul><p>tail text</p><footer>F</footer>';
    const out = injectTrailing(inner, '<p class="lat-split-note">N</p>');
    assert.ok(out.indexOf('lat-split-note') > out.indexOf('tail text'), 'the note must follow the real content');
    assert.ok(out.indexOf('lat-split-note') < out.indexOf('<footer>F'));
  });

  test('no note is a no-op', () => {
    const inner = '<header>H</header><ul><li>a</li></ul><footer>F</footer>';
    assert.equal(injectTrailing(inner, ''), inner);
    assert.equal(injectTrailing(inner, markNote([])), inner);
  });
});

describe('core: split-envelope — footerCell / stripChrome', () => {
  const chrome = { header: '<header>H</header>', footer: '<footer>F</footer>', rail: '<div class="tile-progress"><span class="seg">S</span></div>' };

  test('a paginated slide gets footer + rail + a page-number element seeded from its own tag', () => {
    const cellHtml = footerCell('<section data-lattice-pagination="3" class="x">', chrome);
    assert.match(cellHtml, /^<div class="cell-footer">/);
    assert.match(cellHtml, /<footer>F<\/footer>/);
    assert.match(cellHtml, /tile-progress/);
    // Seeded from the openTag's own `data-lattice-pagination`, not minted as a placeholder `0`
    // for a later pass to overwrite — nothing re-stamps a run's first page any more.
    assert.match(cellHtml, /<span class="lat-pagination">3<\/span>/);
  });

  test('a `paginate: false` slide gets the Cell WITHOUT a number — never a literal "0"', () => {
    const cellHtml = footerCell('<section class="x">', chrome);
    assert.doesNotMatch(cellHtml, /lat-pagination/);
    assert.match(cellHtml, /<footer>F<\/footer>/);
  });

  test('no chrome at all → no empty Cell', () => {
    assert.equal(footerCell('<section class="x">', { header: '', footer: '', rail: '' }), '');
  });

  test('stripChrome removes the EXACT chrome strings, and nothing that merely looks like them', () => {
    const slice = `${chrome.header}<div class="chart-header"><h2>T</h2></div>${chrome.footer}`;
    assert.equal(stripChrome(slice, chrome), '<div class="chart-header"><h2>T</h2></div>');
    // A component's own nested <nav> is not the slide rail and must survive.
    const nested = `${chrome.header}<div><nav class="pager">1</nav></div>`;
    assert.equal(stripChrome(nested, chrome), '<div><nav class="pager">1</nav></div>');
    // Tolerates a slice that begins mid-nesting (kanban's board closes).
    assert.equal(stripChrome(`</div></div>${chrome.footer}`, chrome), '</div></div>');
  });
});

describe('core: deriveAxis — the DOM is the authority, within the manifest\'s claim (§8 rule 1)', () => {
  const svg = '<svg viewBox="0 0 10 10"><text>x</text></svg>';
  const ul = '<ul><li>a</li><li>b</li></ul>';
  const table = '<table><tbody><tr><td>a</td></tr></tbody></table>';

  test('reads the rendered container when nothing is declared', () => {
    assert.equal(deriveAxis(`<h2>T</h2>${ul}`), 'item');
    assert.equal(deriveAxis(`<h2>T</h2>${table}`), 'row');
    assert.equal(deriveAxis('<h2>T</h2><p>prose</p>'), null);
  });

  test('a bare inline <svg> (no viewBox) is an icon, not the slide\'s collection', () => {
    assert.equal(deriveAxis(`<h2>T</h2><svg><path/></svg>${ul}`), 'item');
  });

  test('the DECLARED axis wins over a foreign container that happens to come first', () => {
    // An author's table above an `inventory` slide's record bullets used to derive `row`: the
    // splitter cut between table rows and repeated all six records on all three pages.
    assert.equal(deriveAxis(`<h2>T</h2>${table}${ul}`, ['item']), 'item');
    // …and symmetrically, a component that really is row-shaped still gets `row`.
    assert.equal(deriveAxis(`<h2>T</h2>${table}${ul}`, ['row']), 'row');
  });

  test('a declared col/cell axis is a VETO — read-across has no seam to derive', () => {
    assert.equal(deriveAxis(`<h2>T</h2>${table}`, ['col']), null);
    assert.equal(deriveAxis(`<h2>T</h2>${table}`, ['cell']), null);
    assert.equal(deriveAxis(`<h2>T</h2>${ul}`, ['cell']), null);
  });

  test('with nothing declared, a real collection outranks a figure whatever the order', () => {
    // `figure` is not splittable, so first-by-position let a decorative caption veto the split.
    assert.equal(deriveAxis(`<h2>T</h2>${svg}${ul}`), 'item');
    assert.equal(deriveAxis(`<h2>T</h2>${svg}${table}`), 'row');
    // A figure ALONE still derives `figure` — that is rule 8's subject, and it has no seam.
    assert.equal(deriveAxis(`<h2>T</h2>${svg}`), 'figure');
  });
});

describe('core: dockInFooterCell — ONE docking rule for both footer marks (HARD RULE #15)', () => {
  const mark = '<div class="lat-split-rail"></div>';

  test('docks just LEFT of the page number when the band has one', () => {
    const inner = '<div class="cell-footer"><footer>F</footer><span class="lat-pagination">3</span></div>';
    assert.equal(
      dockInFooterCell(inner, mark),
      `<div class="cell-footer"><footer>F</footer>${mark}<span class="lat-pagination">3</span></div>`,
    );
  });

  test('docks at the END of the cell when the deck is `paginate: false`', () => {
    const inner = '<div class="cell-footer"><footer>F</footer></div>';
    assert.equal(dockInFooterCell(inner, mark), `<div class="cell-footer"><footer>F</footer>${mark}</div>`);
  });

  test('no footer Cell → appended at section level, where CSS keeps its own berth', () => {
    assert.equal(dockInFooterCell('<h2>T</h2>', mark), `<h2>T</h2>${mark}`);
  });

  test('finds the cell wherever it sits — a NESTED, non-terminal band never drops the mark', () => {
    // The `$`-anchored regex both call sites used to carry only matched a `.cell-footer`
    // whose `</div>` ended the section. kanban-lanes docks the band INSIDE the board, so on a
    // `paginate: false` kanban page neither branch matched and the k-of-N rail vanished.
    const inner = '<div class="board"><div class="cell-footer"><footer>F</footer></div><div class="col">c</div></div>';
    const out = dockInFooterCell(inner, mark);
    assert.equal(
      out,
      `<div class="board"><div class="cell-footer"><footer>F</footer>${mark}</div><div class="col">c</div></div>`,
    );
  });

  test('nesting INSIDE the cell is respected — the mark lands at the cell\'s own close', () => {
    const inner = '<div class="cell-footer"><div class="x"><footer>F</footer></div></div>';
    assert.equal(
      dockInFooterCell(inner, mark),
      `<div class="cell-footer"><div class="x"><footer>F</footer></div>${mark}</div>`,
    );
  });
});


describe('core: the universal CODA cell rides the split (lib/core/coda.js)', () => {
  test('an insight inside the cell still earns its own page, wrapped in a cell', () => {
    const secs = build(codaInner({ n: 9, insight: 'Ship it.' }));
    const last = secs[secs.length - 1];
    assert.ok(last.includes('Ship it.'), 'the insight should be on the final page');
    assert.ok(last.includes('class="cell-coda"'), 'the insight page must carry a real coda cell, not a bare blockquote');
    for (const s of secs.slice(0, -1)) {
      assert.ok(!s.includes('Ship it.'), 'the insight must not repeat on a body page (FM-2)');
    }
  });

  test('a note inside the cell rides the CLOSING page, still wrapped in its cell', () => {
    const secs = build(codaInner({ n: 9, note: 'Source: filings.' }));
    const withNote = secs.filter((s) => s.includes('Source: filings.'));
    assert.equal(withNote.length, 1, 'the note must appear exactly once');
    assert.equal(withNote[0], secs.at(-1), 'and it must be the closing page');
    assert.match(withNote[0], /class="[^"]*\blat-split-closing\b[^"]*"/);
    // The coda cell and the below-note wrapper survive untouched — the closing page removes
    // only the lede and the collection, so nothing about the note's own markup is rewritten.
    assert.match(withNote[0], /class="[^"]*\bcell-coda\b[^"]*"/, 'the note must stay inside a coda cell');
    assert.ok(withNote[0].includes('class="below-note"'), 'and keep its below-note wrapper');
    assert.ok(!secs.some((x) => /lat-split-note/.test(x)), 'the compact marker is gone with the page it was for');
  });

  test('both beats in one cell separate cleanly and leave no empty shell', () => {
    const secs = build(codaInner({ n: 9, insight: 'Ship it.', note: 'Source: filings.' }));
    const joined = secs.join('');
    assert.equal(joined.split('Ship it.').length - 1, 1, 'insight appears once');
    assert.equal(joined.split('Source: filings.').length - 1, 1, 'note appears once');
    // An empty cell would render as a 24px band of nothing.
    assert.ok(
      !/<div class="cell-coda"[^>]*>\s*<\/div>/.test(joined),
      'decomposing the cell must not leave an empty coda shell on a body page',
    );
    // Both beats close the run TOGETHER now (2026-09-01) — the direct reversal of the old
    // "the note must not follow the insight onto its own page".
    const closing = secs.at(-1);
    assert.match(closing, /lat-split-closing/);
    assert.ok(closing.includes('Ship it.') && closing.includes('Source: filings.'),
      'the insight and the note share the closing page');
  });
});


describe('core: the CLOSING page does not repeat what the COVER hoisted', () => {
  // `closingPage` removes the lede (hoisted to the cover) and the collection (the body pages'
  // whole job). It called `spliceSpans` directly, which REPLACES a span with its own `outer` when
  // the span carries one — and a lede span does. So the lede was substituted for itself and the
  // closing page repeated the cover's framing paragraph. The collection span carries no `outer`,
  // so that one went, which is why the page looked almost right.
  //
  // Measured on `examples/split-relationship.md`, where the duplicated sentence is the one
  // claiming it "hoists to the run's cover instead of repeating on every body page". Two
  // reviewers found it in the QUALITY BAR sweep; the conservation gate cannot: it counts words,
  // and a duplicate only ever raises a count.
  const inner = () =>
    '<div class="cell-masthead"><div class="masthead-lede"><h2>Readiness</h2></div></div>' +
    '<div class="cell-stage"><p>FRAMING-PARA hoists to the cover.</p>' +
    `<ul>${['a', 'b', 'c'].map((x) => `<li>item ${x}</li>`).join('')}</ul></div>` +
    '<div class="cell-coda"><div class="below-note"><p>NOTE-TEXT</p></div></div>';

  test('the lede appears exactly once across the run, on the cover', () => {
    const src = inner();
    const parts = splitEnvelope('<section data-lattice-slide="8" id="s8" class="checklist form">',
      src, chromeOf(src), { axis: 'item', per: 1 });
    assert.ok(Array.isArray(parts) && parts.length >= 3, 'expected a split');
    const copies = parts.join('').split('FRAMING-PARA').length - 1;
    assert.equal(copies, 1, `the lede appears ${copies} times across the run`);
    assert.match(parts[0], /FRAMING-PARA/, 'the cover must carry the lede');
    const closing = parts.filter((p) => /\sdata-split-role="closing"/.test(p));
    assert.equal(closing.length, 1, 'expected one closing page');
    assert.doesNotMatch(closing[0], /FRAMING-PARA/, 'the closing page repeated the cover lede');
    assert.match(closing[0], /NOTE-TEXT/, 'the closing page must still carry the note');
  });
});

describe('core: the CLOSING page carries a two-beat coda without losing or breaking it', () => {
  // Regression pins for the half-span design that shipped in the first cut of the coda:
  // `codaSpans` returned cell-open..cut and cut..cell-close, which is correct ONLY for a caller
  // that removes both. One insight-page builder keyed `keep` on a span's range and so never
  // matched the cell (the page shipped blank); the other removed just the note half and stripped
  // `.cell-stage`'s closing tag.
  //
  // Both builders were deleted on 2026-09-02 when the closing page replaced them, and these pins
  // MOVED here rather than going with them: `closingPageFromMaterial` unwraps a coda-cell span to
  // merge the beats into one cell, so it depends on that span being a WHOLE, well-formed cell in
  // exactly the way those two did. Deleting the pins with their old caller would have retired the
  // coverage and kept the hazard.
  const bothBeats = () =>
    '<div class="cell-masthead"><div class="masthead-lede"><h2>T</h2></div></div>' +
    '<div class="cell-stage">' +
      items(3) +
      '<div class="cell-coda" data-dock="column">' +
        '<blockquote><p>INSIGHT-SENTINEL</p></blockquote>' +
        '<div class="below-note"><p>NOTE-SENTINEL</p></div>' +
      '</div>' +
    '</div>';
  const balanced = (html) => (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length;

  const closingOf = (inner) => {
    const { insight, note } = trailingMaterialOf(inner);
    return closingPageFromMaterial('<section data-lattice-slide="1" class="checklist form">',
      { header: '' }, [...insight, ...note], 'checklist', 'T');
  };

  test('the closing page keeps BOTH beats, in one cell, and stays balanced', () => {
    const page = closingOf(bothBeats());
    assert.ok(page, 'a closing page must be produced');
    assert.match(page, /INSIGHT-SENTINEL/, 'the author\'s Key Insight must survive onto the closing page');
    assert.match(page, /NOTE-SENTINEL/, 'the note closes the run BESIDE the insight (2026-09-01)');
    assert.match(page, /class="cell-coda"/, 'and both must be inside a real coda cell');
    // ONE cell, not two nested — the unwrap is what this pin is really about.
    assert.equal((page.match(/class="cell-coda"/g) || []).length, 1, 'the beats must merge into ONE coda cell');
    assert.ok(balanced(page), `closing page must be balanced markup:\n${page}`);
  });

  test('the stage cell is closed, and the beat survives in the coda beside it', () => {
    // The empty-stage check this used to make was a PROXY for "content was dropped and
    // the markup broke". It stopped being one when the frame peeled `.cell-coda` out to
    // sit beside the stage: on an insight page the beat IS the content, it lives in the
    // cell, and the stage is legitimately empty because there is no body on that page.
    // What still has to hold is what the proxy stood in for — balanced markup, the stage
    // closed, and the beat actually present.
    const page = closingOf(bothBeats());
    // NOT `/<div class="cell-stage">[\s\S]*?<\/div>/` — a lazy match happily ends on the
    // CODA cell's closing tag, so it passes on an unclosed stage, which is the one defect
    // this line exists to catch. Count the tags instead.
    const opens = (page.match(/<div\b/g) || []).length;
    const closes = (page.match(/<\/div>/g) || []).length;
    assert.equal(opens, closes, `unbalanced <div> on the closing page:\n${page}`);
    assert.match(page, /<div class="cell-stage">/, 'cell-stage must be present');
    assert.match(page, /<div class="cell-coda"[^>]*>[\s\S]*?<blockquote>/, 'the beat must survive in the coda cell');
    assert.ok(balanced(page), `closing page must be balanced markup:\n${page}`);
  });

  test('the OTHER caller — splitEnvelope\'s own closingPage — is balanced too', () => {
    // S2's actual path, through the SUBTRACTIVE builder rather than the composed one. It splices
    // the lede and the collection out of the source and keeps the coda cell whole, so a shared
    // two-beat range must not strip the cell's closing tag and leave `.cell-stage` unclosed.
    const secs = build(codaInner({ n: 9, insight: 'Ship it.', note: 'Source: filings.' }));
    for (const sec of secs) {
      assert.equal(
        (sec.match(/<div\b/g) || []).length, (sec.match(/<\/div>/g) || []).length,
        `unbalanced <div> in a split section:\n${sec}`,
      );
      // An empty stage is correct on the CLOSING page (the beats ride the coda cell beside
      // it); anywhere else it means the body was dropped.
      if (!/lat-split-(?:insight|closing)/.test(sec)) {
        assert.doesNotMatch(sec, /<div class="cell-stage"><\/div>/, 'no body section may ship an empty stage');
      }
    }
    assert.ok(secs.some((s) => s.includes('Ship it.')), 'the insight must survive the split');
  });

  test('a one-beat coda is unaffected', () => {
    const one =
      '<div class="cell-stage">' + items(3) +
      '<div class="cell-coda" data-dock="column"><blockquote><p>ONLY-INSIGHT</p></blockquote></div></div>';
    const page = closingOf(one);
    assert.match(page, /ONLY-INSIGHT/);
    assert.ok(balanced(page));
  });
});

describe('split-envelope — EVERY arm that reaches the sibling coda Cell is pinned', () => {
  // Five functions bound their scans by `extractStage`, and all five went blind when the
  // frame peeled `.cell-coda` out of the stage to sit beside it. That defect shipped a Key
  // Insight onto all six body pages of examples/split-envelope.md and lost a below-note.
  //
  // The fix was landed with only ONE of the five arms actually pinned: mutation-testing the
  // other four — removing each sibling merge in turn — left the whole 7,295-test suite AND
  // the integration tier green. An unpinned fix is one refactor away from being the same
  // bug again, which is precisely how this one got here (a fixture that had drifted from
  // the render certified the original break). Each test below was verified to FAIL with its
  // arm removed.
  const sib = ({ insight = '', note = '' } = {}) =>
    '<div class="cell-masthead"><h2>T</h2></div>' +
    '<div class="cell-stage"><ul><li>a</li><li>b</li><li>c</li><li>d</li></ul></div>' +
    '<div class="cell-coda" data-dock="column">' +
      (insight ? `<blockquote><p>${insight}</p></blockquote>` : '') +
      (note ? `<div class="below-note"><p>${note}</p></div>` : '') +
    '</div>';

  test('trailingMaterialOf sees a coda Cell that is the stage\'s SIBLING', () => {
    const got = trailingMaterialOf(sib({ insight: 'INSIGHT', note: 'NOTE' }));
    assert.equal(got.insight.length, 1, 'insight not found beside the stage');
    assert.equal(got.note.length, 1, 'note not found beside the stage');
    assert.match(got.insight[0].outer, /INSIGHT/);
    assert.match(got.note[0].outer, /NOTE/);
  });

  test('splitRegions merges the sibling cell into its trailing regions', () => {
    const regions = splitRegions(sib({ insight: 'INSIGHT' }), 'item');
    assert.ok(regions, 'no regions derived');
    assert.equal(regions.insight.length, 1, 'the sibling insight was not merged in');
  });

  test('closingPageFromMaterial carries the sibling cell onto the closing page', () => {
    const inner = sib({ insight: 'INSIGHT', note: 'NOTE' });
    const { insight, note } = trailingMaterialOf(inner);
    const page = closingPageFromMaterial('<section class="checklist form">', { header: '' },
      [...insight, ...note], 'checklist', 'T');
    assert.ok(page, 'no closing page built');
    assert.match(page, /INSIGHT/, 'the insight did not reach the closing page');
    // BOTH beats close the run now — the co-resident note is carried, not dropped (2026-09-01).
    assert.match(page, /NOTE/, 'the co-resident note must ride the closing page beside the insight');
  });

  test('injectTrailing seats a coda Cell BESIDE the stage, never inside it', () => {
    const page = '<div class="cell-stage"><ul><li>a</li></ul></div>';
    const cell = '<div class="cell-coda lat-split-note" data-dock="column"><div class="below-note"><p>N</p></div></div>';
    const out = injectTrailing(page, cell);
    assert.match(out, /<\/div><div class="cell-coda lat-split-note"/, 'cell was not seated after the stage');
    const stage = out.slice(out.indexOf('<div class="cell-stage">'), out.indexOf('<div class="cell-coda'));
    assert.ok(!stage.includes('cell-coda'), 'the stage swallowed the injected cell');
  });

  test('existingNoteIn finds a marked note riding in the sibling cell', () => {
    const withNote =
      '<div class="cell-stage"><ul><li>a</li></ul></div>' +
      '<div class="cell-coda lat-split-note" data-dock="column"><div class="below-note"><p>N</p></div></div>';
    const found = existingNoteIn(withNote);
    assert.ok(found, 'a note already on the page was not found — the next pass would duplicate it');
    assert.match(found.outer, /lat-split-note/);
  });
});
