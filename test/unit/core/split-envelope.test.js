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
const { splitEnvelope, balancedPerPage, readCover, readMasthead, splitRegions, topLevelElements, chromeOf } = require('../../../lib/core/split-envelope');
const { evenGroups } = require('../../../lib/core/collections');
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

describe('core: splitEnvelope — the NOTE rides the last body page (owner review)', () => {
  test('a trailing below-note lands ONCE, on the LAST body page — never its own page', () => {
    const parts = build(formInner({ n: 9, note: 'Source: the launch board.' }), 4);
    assert.equal(parts.length, 4); // cover + 3 bodies — NO extra page for the note
    const withNote = parts.filter((p) => /\bbelow-note\b/.test(p));
    assert.equal(withNote.length, 1, 'the below-note must appear on exactly one page');
    assert.equal(withNote[0], parts.at(-1), 'it must be the LAST body page');
    // It still rides a native body page — the run's own layout class, still a
    // continuation (it holds real collection members, not just the note).
    assert.match(classOf(parts.at(-1)), /\bchecklist\b/);
    assert.match(classOf(parts.at(-1)), /\blat-split-native\b/);
    assert.match(parts.at(-1), /<li>item 9<\/li>/); // the last real member, not just the note
    // Marked directly on the below-note's OWN element (not wrapped) so the CSS sizes it
    // down without breaking a component's direct-child selectors (base.modifiers.css
    // § Shared split NOTE).
    assert.match(parts.at(-1), /<div class="below-note lat-split-note">/);
  });

  test('the note is injected INSIDE the content cell, after the last member', () => {
    const parts = build(formInner({ n: 9, note: 'Trailing note.' }), 4);
    const last = parts.at(-1);
    const stageClose = last.indexOf('</div><div class="cell-footer">');
    const noteAt = last.indexOf('lat-split-note');
    assert.ok(noteAt > 0 && noteAt < stageClose, 'the note must sit inside .cell-stage, before the footer cell');
  });

  test('a raw trailing <p> on a below-note-EXCLUDED layout also rides the last page', () => {
    // stats/content/etc. never get the `.below-note` wrap (lib/core/below-note.js
    // EXCLUDED) — but placement is orthogonal to that styling decision: the raw <p>
    // still moves to the last body page, at the same reduced size, per owner review.
    const raw = `${band()}<div class="cell-stage">${items(9)}<p>Raw trailing note.</p></div>`;
    const parts = build(raw, 4);
    const withP = parts.filter((p) => /Raw trailing note\./.test(p));
    assert.equal(withP.length, 1);
    assert.equal(withP[0], parts.at(-1));
    // Marked directly on the <p> itself — not wrapped — so a component's OWN
    // `> .cell-stage > p` styling (e.g. stats' centered caption treatment) still matches.
    assert.match(parts.at(-1), /<p class="lat-split-note">Raw trailing note\.<\/p>/);
  });

  test('no trailing note → no extra page, no lat-split-note wrapper anywhere', () => {
    const parts = build(formInner({ n: 9 }), 4);
    assert.equal(parts.length, 4);
    assert.ok(!parts.some((p) => /lat-split-note/.test(p)));
  });

  test('the lede is hoisted to the cover, so it appears exactly once too', () => {
    const parts = build(formInner({ n: 9, lede: 'All true before we ship.' }), 4);
    const hits = parts.filter((p) => p.includes('All true before we ship.'));
    assert.equal(hits.length, 1);
    assert.equal(hits[0], parts[0]);
  });
});

describe('core: splitEnvelope — the INSIGHT page (§0a, rule 9; owner review 2026-07-26)', () => {
  test('a trailing key-insight blockquote gets its OWN dedicated page, last', () => {
    const parts = build(formInner({ n: 9, insight: 'The board is the source of truth.' }), 4);
    assert.equal(parts.length, 5); // cover + 3 bodies + the insight page
    const withInsight = parts.filter((p) => /<blockquote>/.test(p));
    assert.equal(withInsight.length, 1);
    assert.equal(withInsight[0], parts.at(-1));
    assert.match(classOf(parts.at(-1)), /\blat-split-insight\b/);
    // Keeps the layout class + content cell, so the KEY INSIGHT panel CSS still applies.
    assert.match(classOf(parts.at(-1)), /\bchecklist\b/);
    assert.match(parts.at(-1), /<div class="cell-stage">/);
    assert.doesNotMatch(parts.at(-1), /<li>/); // no collection member on this page
  });

  test('the insight page carries NO "(cont.)" — it is the takeaway, not a continuation', () => {
    const parts = build(formInner({ n: 9, insight: 'Insight.' }), 4);
    assert.doesNotMatch(parts.at(-1), /lat-cont/);
  });

  test('insight and note NEVER share a page — insight is last, note rides the body before it', () => {
    const parts = build(formInner({ n: 9, insight: 'The board is the source of truth.', note: 'Reviewed weekly.' }), 4);
    assert.equal(parts.length, 5); // cover + 3 bodies (last carries the note) + insight
    const insightPage = parts.at(-1);
    const notePage = parts.at(-2);
    assert.match(classOf(insightPage), /\blat-split-insight\b/);
    assert.doesNotMatch(insightPage, /below-note/);
    assert.match(notePage, /\bbelow-note\b/);
    assert.doesNotMatch(notePage, /<blockquote>/);
  });

  test('no key insight → no insight page', () => {
    const parts = build(formInner({ n: 9, note: 'Note only.' }), 4);
    assert.ok(!parts.some((p) => /lat-split-insight/.test(p)));
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
    assert.match(parts.at(-1), /lat-split-note/);
    // …and identically with no footer at all, so the shape can't depend on deck chrome.
    const noFooter = bare.replace('<footer>F</footer>', '');
    assert.equal(splitRegions(noFooter, 'item').note.length, 1);
  });

  test('topLevelElements: depth-aware, void tags open no level, stops at the parent close', () => {
    const els = topLevelElements('<p>a</p><div><p>nested</p></div><hr class="x"><blockquote>q</blockquote></div><p>outside</p>');
    assert.deepEqual(els.map((e) => e.name), ['p', 'div', 'hr', 'blockquote']);
  });
});

describe('core: the envelope through both auto-split passes (HARD RULE #1)', () => {
  const cap = { checklist: { axis: 'item', hard: 5, sweet: 4 } };
  const doc = (inner) => `<section data-lattice-slide="1" data-lattice-pagination="1" data-lattice-pagination-total="1" class="checklist form">${inner}</section>`;

  test('STATIC pass: cover → bodies, note on the last body page, only once', () => {
    const { html, splits } = autoSplitDeck(doc(formInner({ n: 9, note: 'Note.' })), cap);
    assert.equal(splits, 1);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-insight/g) || []).length, 0); // no key insight here
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1);
  });

  test('STATIC pass: an insight gets its own page, separate from the note', () => {
    const { html, splits } = autoSplitDeck(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    assert.equal(splits, 1);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-insight/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1);
    assert.equal((html.match(/<blockquote>/g) || []).length, 1);
  });

  test('MEASURED pass: the same shape from the same builder', () => {
    const { html, changed } = resplitDoc(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), [{ slide: 1, ratio: 3 }], cap);
    assert.equal(changed, 1);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-split-insight/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1);
  });

  test('both passes re-stamp the page number — attribute AND the real .lat-pagination span', () => {
    const { html } = autoSplitDeck(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    const attrs = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    const spans = [...html.matchAll(/class="lat-pagination">(\d+)</g)].map((m) => Number(m[1]));
    assert.deepEqual(attrs, [1, 2, 3, 4, 5]); // cover + 3 bodies + the insight page
    // Every page — the COVER included. The cover used to emit its footer text, section rail and
    // page number as BARE section children, so it had no `.cell-footer` and fell back to the
    // `section.form::after` pagination pseudo. Those four marks are each absolutely positioned
    // from their own edge, which on a portrait cover made them overlap (the k-of-N rail struck
    // through the footer text, the section label truncated). The cover now builds the same footer
    // CELL an ordinary slide has, so the band is one flex row with a shared width budget — and
    // the number is a real element `repaginate` re-stamps, exactly like the body pages'.
    assert.deepEqual(spans, [1, 2, 3, 4, 5]);
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '5'));
  });

  // The engine's contract: absolute position, whole-deck total, hidden slides counted
  // (lib/engine/slides.js §3). The envelope must not shift a slide the split never saw.
  test('a hidden (paginate:false) slide keeps its position — the envelope numbers absolutely', () => {
    const hidden = '<section data-lattice-slide="1" class="title"><h1>cover</h1></section>';
    const trailing = '<section data-lattice-slide="3" data-lattice-pagination="3" data-lattice-pagination-total="3" class="content form"><p>after</p></section>';
    const { html } = autoSplitDeck(hidden + doc(formInner({ n: 9, insight: 'Insight.' })).replace('data-lattice-pagination="1"', 'data-lattice-pagination="2"') + trailing, cap);
    const attrs = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(attrs, [2, 3, 4, 5, 6, 7]); // hidden holds 1; cover 2, bodies 3-5, insight 6, trailing 7
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '7'));
  });

  test('a body page that STILL overflows paginates further — it never grows a second cover', () => {
    const { html } = autoSplitDeck(doc(formInner({ n: 9, insight: 'Insight.', note: 'Note.' })), cap);
    // Re-measure: pretend body page 2 overflows. `lat-split-native` must keep it native.
    const tagged = html.replace(/data-lattice-slide="\d+"/g, (() => { let n = 0; return () => `data-lattice-slide="${(n += 1)}"`; })());
    const { html: out } = resplitDoc(tagged, [{ slide: 3, ratio: 2 }], cap);
    assert.equal((out.match(/lat-split-cover/g) || []).length, 1); // still exactly one
  });

  test('a NON-splitting deck is byte-identical through both passes', () => {
    const html = doc(formInner({ n: 3, insight: 'Insight.', note: 'Note.' }));
    assert.equal(autoSplitDeck(html, cap).html, html);
    assert.equal(resplitDoc(html, [], cap).html, html);
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
        roles.every((r) => r && ['cover', 'body', 'insight'].includes(r)),
        `${label} run ${rid}: un-stamped or unknown split role(s): ${JSON.stringify(roles)}`,
      );
      const covers = roles.filter((r) => r === 'cover');
      const insights = roles.filter((r) => r === 'insight');
      assert.ok(covers.length <= 1, `${label} run ${rid}: ${covers.length} covers`);
      assert.ok(insights.length <= 1, `${label} run ${rid}: ${insights.length} insight pages`);
      if (covers.length) assert.equal(roles[0], 'cover', `${label} run ${rid}: cover is not first`);
      if (insights.length) assert.equal(roles.at(-1), 'insight', `${label} run ${rid}: insight page is not last`);
      // Body pages are contiguous between them — no body after the insight beat.
      const lastBody = roles.lastIndexOf('body');
      if (insights.length) assert.ok(lastBody < roles.indexOf('insight'), `${label} run ${rid}: body page after the insight`);
      const titled = pages.some((p) => /\bchecklist\b|\bcards\b/.test(p.cls));
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
    assert.equal((html.match(/lat-split-insight/g) || []).length, 1); // only slide 2 has a key insight
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1); // only slide 2 has a note
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
    assert.equal((html.match(/lat-split-insight/g) || []).length, 1);
    assert.equal((html.match(/\bbelow-note\b/g) || []).length, 1); // still exactly once
    // Page numbers stay monotonic 1..N with the total matching, however many passes ran.
    const pages = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(pages, pages.map((_, i) => i + 1));
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => Number(m[1]) === pages.length));
  });
});
