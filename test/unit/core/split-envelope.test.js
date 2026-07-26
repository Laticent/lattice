/**
 * Unit: lib/core/split-envelope.js — the UNIVERSAL split envelope
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §0a, rule 9).
 *
 * The invariants a split run must satisfy, whatever layout it came from:
 *   · exactly ONE cover page, first;
 *   · at most ONE closing page, last, and only when there is trailing material;
 *   · the trailing note appears exactly once across the whole run (the FM-2
 *     duplication bug: partitionAxis repeats the collection's `post` verbatim, so a
 *     `.below-note` used to be stamped on EVERY body page);
 *   · nothing is lost — every collection member and every leaf of the source survives.
 * Driven both directly and through auto-split's two passes, since the point of the
 * envelope is that BOTH paths produce the same shape (HARD RULE #1).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { splitEnvelope, readCover, readMasthead, splitRegions, topLevelElements, chromeOf } = require('../../../lib/core/split-envelope');
const { autoSplitDeck, resplitDoc, applyRails } = require('../../../lib/core/auto-split');
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

const openTag = '<section data-lattice-slide="4" id="s4" data-lattice-pagination="4" class="checklist form">';
const build = (inner, per = 4, opts = {}) =>
  splitEnvelope(openTag, inner, chromeOf(inner), { axis: 'item', per, layoutName: 'checklist', ...opts });
const classOf = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];

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

describe('core: splitEnvelope — the CLOSING page (§0a, rule 9)', () => {
  test('a trailing below-note lands ONCE, on a closing page — never per body page', () => {
    const parts = build(formInner({ n: 9, note: 'Source: the launch board.' }), 4);
    assert.equal(parts.length, 5); // cover + 3 bodies + closing
    const withNote = parts.filter((p) => /class="below-note"/.test(p));
    assert.equal(withNote.length, 1, 'the below-note must appear on exactly one page');
    assert.equal(withNote[0], parts.at(-1));
    assert.match(classOf(parts.at(-1)), /\blat-split-closing\b/);
    // The closing keeps the layout class + the content cell, so `section.<layout>
    // .below-note` styling still applies, and carries NO collection member.
    assert.match(classOf(parts.at(-1)), /\bchecklist\b/);
    assert.match(parts.at(-1), /<div class="cell-stage">/);
    assert.doesNotMatch(parts.at(-1), /<li>/);
  });

  test('a trailing key-insight blockquote hoists to the same one closing page', () => {
    const parts = build(formInner({ n: 9, insight: 'The board is the source of truth.', note: 'Reviewed weekly.' }), 4);
    assert.equal(parts.filter((p) => /<blockquote>/.test(p)).length, 1);
    assert.equal(parts.filter((p) => /\blat-split-closing\b/.test(classOf(p))).length, 1);
    assert.match(parts.at(-1), /<blockquote>[\s\S]*below-note/); // both, in source order
  });

  test('no trailing material → NO closing page (never an empty closing slide)', () => {
    const parts = build(formInner({ n: 9 }), 4);
    assert.equal(parts.filter((p) => /\blat-split-closing\b/.test(classOf(p))).length, 0);
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

  test('refuses (null) when there is no title to cover with', () => {
    const inner = `<div class="cell-stage">${items(9)}</div>`;
    assert.equal(build(inner, 4), null);
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

  test('splitRegions: bounds the collection, the lede and the trailing material', () => {
    const inner = formInner({ lede: 'Framing.', n: 3, note: 'Note.' });
    const r = splitRegions(inner, 'item');
    assert.equal(r.lede.length, 1);
    assert.match(r.lede[0].outer, /Framing\./);
    assert.equal(r.closing.length, 1);
    assert.match(r.closing[0].outer, /below-note/);
    assert.equal(inner.slice(r.coll.start, r.coll.end).startsWith('<ul>'), true);
  });

  test('closingSpansIn: only the TRAILING run — a lead-in before another block is not a closing', () => {
    // `…</ul><p>lead-in</p><table>` — the <p> introduces the table, so nothing trails.
    const lead = `${band()}<div class="cell-stage">${items(9)}<p>What the table shows.</p><table><tbody><tr><td>a</td></tr></tbody></table></div>`;
    assert.equal(splitRegions(lead, 'item').closing.length, 0);
    const parts = build(lead, 4);
    assert.equal(parts.filter((p) => /lat-split-closing/.test(p)).length, 0);
    assert.equal(parts.filter((p) => p.includes('What the table shows.')).length, 3); // unchanged: still per body page
    // …but a note AFTER an opaque block still hoists (the run ends at that block).
    const tail = `${band()}<div class="cell-stage">${items(9)}<div class="foo">x</div><div class="below-note"><p>Note.</p></div></div>`;
    const r = splitRegions(tail, 'item');
    assert.equal(r.closing.length, 1);
    assert.match(r.closing[0].outer, /below-note/);
  });

  test('chrome does not end the trailing run — a cell-less slide still hoists its note', () => {
    // A STAGE_DEFERRED / non-Form layout has no `.cell-stage`, so the region runs to the end
    // of the section and the Marp <footer> sits AFTER the note. Chrome must be stepped over,
    // or the FM-2 duplication survives here (and would flip on whether the deck sets `footer:`).
    const bare = `<header>H</header><h2>T</h2>${items(9)}<div class="below-note"><p>Note.</p></div><footer>F</footer>`;
    assert.equal(splitRegions(bare, 'item').closing.length, 1);
    const parts = build(bare, 4);
    assert.equal(parts.filter((p) => /class="below-note"/.test(p)).length, 1);
    assert.match(parts.at(-1), /lat-split-closing/);
    // …and identically with no footer at all, so the shape can't depend on deck chrome.
    const noFooter = bare.replace('<footer>F</footer>', '');
    assert.equal(splitRegions(noFooter, 'item').closing.length, 1);
  });

  test('topLevelElements: depth-aware, void tags open no level, stops at the parent close', () => {
    const els = topLevelElements('<p>a</p><div><p>nested</p></div><hr class="x"><blockquote>q</blockquote></div><p>outside</p>');
    assert.deepEqual(els.map((e) => e.name), ['p', 'div', 'hr', 'blockquote']);
  });
});

describe('core: the envelope through both auto-split passes (HARD RULE #1)', () => {
  const cap = { checklist: { axis: 'item', hard: 5, sweet: 4 } };
  const doc = (inner) => `<section data-lattice-slide="1" data-lattice-pagination="1" data-lattice-pagination-total="1" class="checklist form">${inner}</section>`;

  test('STATIC pass: cover → bodies → one closing, with the note only once', () => {
    const { html, splits } = autoSplitDeck(doc(formInner({ n: 9, note: 'Note.' })), cap);
    assert.equal(splits, 1);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/class="below-note"/g) || []).length, 1);
  });

  test('MEASURED pass: the same shape from the same builder', () => {
    const { html, changed } = resplitDoc(doc(formInner({ n: 9, note: 'Note.' })), [{ slide: 1, ratio: 3 }], cap);
    assert.equal(changed, 1);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/class="below-note"/g) || []).length, 1);
  });

  test('both passes re-stamp the page number — attribute AND the real .lat-pagination span', () => {
    const { html } = autoSplitDeck(doc(formInner({ n: 9, note: 'Note.' })), cap);
    const attrs = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    const spans = [...html.matchAll(/class="lat-pagination">(\d+)</g)].map((m) => Number(m[1]));
    assert.deepEqual(attrs, [1, 2, 3, 4, 5]); // cover + 3 bodies + closing
    assert.deepEqual(spans, [2, 3, 4, 5]);    // the cover has no footer cell (the pseudo renders it)
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '5'));
  });

  // The engine's contract: absolute position, whole-deck total, hidden slides counted
  // (lib/engine/slides.js §3). The envelope must not shift a slide the split never saw.
  test('a hidden (paginate:false) slide keeps its position — the envelope numbers absolutely', () => {
    const hidden = '<section data-lattice-slide="1" class="title"><h1>cover</h1></section>';
    const trailing = '<section data-lattice-slide="3" data-lattice-pagination="3" data-lattice-pagination-total="3" class="content form"><p>after</p></section>';
    const { html } = autoSplitDeck(hidden + doc(formInner({ n: 9, note: 'Note.' })).replace('data-lattice-pagination="1"', 'data-lattice-pagination="2"') + trailing, cap);
    const attrs = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(attrs, [2, 3, 4, 5, 6, 7]); // hidden holds 1; cover 2, bodies 3-5, closing 6, trailing 7
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '7'));
  });

  test('a body page that STILL overflows paginates further — it never grows a second cover', () => {
    const { html } = autoSplitDeck(doc(formInner({ n: 9, note: 'Note.' })), cap);
    // Re-measure: pretend body page 2 overflows. `lat-split-native` must keep it native.
    const tagged = html.replace(/data-lattice-slide="\d+"/g, (() => { let n = 0; return () => `data-lattice-slide="${(n += 1)}"`; })());
    const { html: out } = resplitDoc(tagged, [{ slide: 3, ratio: 2 }], cap);
    assert.equal((out.match(/lat-split-cover/g) || []).length, 1); // still exactly one
  });

  test('a NON-splitting deck is byte-identical through both passes', () => {
    const html = doc(formInner({ n: 3, note: 'Note.' }));
    assert.equal(autoSplitDeck(html, cap).html, html);
    assert.equal(resplitDoc(html, [], cap).html, html);
  });
});

// The gate rule 9 asks for: over a WHOLE deck, run by run, exactly one cover FIRST and at
// most one closing LAST. Grouped by `data-split-run` — the same grouping `applyRails` uses —
// so it also pins that the cover and the closing join their run rather than standing alone.
describe('core: the envelope invariant, per split RUN across a whole deck (rule 9)', () => {
  const cap = { checklist: { axis: 'item', hard: 5, sweet: 4 }, cards: { axis: 'item', hard: 3, sweet: 2 } };
  const slide = (n, cls, inner) =>
    `<section data-lattice-slide="${n}" id="s${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="4" class="${cls}">${inner}</section>`;

  // A deck with: a plain slide, a splitting run WITH a trailing note, a splitting run
  // WITHOUT one, and a title-less splitting slide (which keeps the bare partition).
  const deck =
    slide(1, 'content form', `${band({ title: 'Opening' })}<div class="cell-stage"><p>prose</p></div>`) +
    slide(2, 'checklist form', formInner({ n: 9, lede: 'Framing.', note: 'Note.' })) +
    slide(3, 'cards form', formInner({ n: 7, subtitle: 'sub' })) +
    slide(4, 'cards form', `<div class="cell-stage">${items(7)}</div>`);

  const runsOf = (html) => {
    const runs = new Map();
    for (const p of splitSections(html)) {
      if (p.type !== 'section') continue;
      const rid = (p.openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1];
      if (!rid) continue;
      if (!runs.has(rid)) runs.set(rid, []);
      runs.get(rid).push(p.cls || '');
    }
    return runs;
  };

  const assertEnvelope = (html, label) => {
    const runs = runsOf(html);
    assert.ok(runs.size > 0, `${label}: expected at least one split run`);
    for (const [rid, classes] of runs) {
      const covers = classes.filter((c) => /\blat-split-cover\b/.test(c));
      const closings = classes.filter((c) => /\blat-split-closing\b/.test(c));
      assert.ok(covers.length <= 1, `${label} run ${rid}: ${covers.length} covers`);
      assert.ok(closings.length <= 1, `${label} run ${rid}: ${closings.length} closings`);
      if (covers.length) assert.match(classes[0], /\blat-split-cover\b/, `${label} run ${rid}: cover is not first`);
      if (closings.length) assert.match(classes.at(-1), /\blat-split-closing\b/, `${label} run ${rid}: closing is not last`);
      // A run that HAS a masthead must be covered — the only uncovered run is the
      // title-less slide 4, whose members carry no heading at all.
      const titled = classes.some((c) => /\bchecklist\b|\bcards\b/.test(c));
      assert.ok(titled, `${label} run ${rid}: unexpected run shape`);
    }
  };

  test('static pass, then rails: every run is a well-formed envelope', () => {
    const { html, splits } = autoSplitDeck(deck, cap);
    assert.equal(splits, 3); // slides 2, 3, 4 all split
    assertEnvelope(html, 'static');
    assertEnvelope(applyRails(html), 'static + rails'); // rails must not disturb the shape
    // Slide 4 is title-less → bare partition, so the deck carries 2 covers, not 3.
    assert.equal((html.match(/lat-split-cover/g) || []).length, 2);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1); // only slide 2 has a note
  });

  test('measured pass over the STATIC output converges without a second cover', () => {
    let html = autoSplitDeck(deck, cap).html;
    // Re-measure and re-split every page as if it still overflowed, five passes — the
    // measured loop's worst case. The envelope must stay singular per run throughout.
    for (let pass = 0; pass < 5; pass++) {
      const slides = splitSections(html).filter((p) => p.type === 'section').length;
      const overflow = Array.from({ length: slides }, (_, i) => ({ slide: i + 1, ratio: 2 }));
      const r = resplitDoc(html, overflow, cap);
      html = r.html;
      assertEnvelope(html, `measured pass ${pass + 1}`);
      if (!r.changed) break;
    }
    assert.equal((html.match(/lat-split-cover/g) || []).length, 2);
    assert.equal((html.match(/lat-split-closing/g) || []).length, 1);
    assert.equal((html.match(/class="below-note"/g) || []).length, 1); // still exactly once
    // Page numbers stay monotonic 1..N with the total matching, however many passes ran.
    const pages = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(pages, pages.map((_, i) => i + 1));
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => Number(m[1]) === pages.length));
  });
});
