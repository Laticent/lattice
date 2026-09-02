/**
 * Unit: lib/core/auto-split.js — the build-time slide auto-splitter.
 *
 * ONE pass, and its trigger is STRUCTURE (owner ruling, 2026-09-01). Every enrolled slide
 * whose primary collection holds more than one member is re-emitted as
 * COVER → BODY(one element each) → CLOSING; everything else passes through byte-identical,
 * so a slide with nothing to divide exports unchanged.
 *
 * What these tests pin, and why each one is here rather than being obvious:
 *
 *   · the CUT is one member per page — not a packed chunk, at any count, for any component;
 *   · the ENVELOPE is cover → bodies → closing, and the closing page carries the trailing
 *     material (note AND key insight) that used to be split between a body page and a page
 *     of its own;
 *   · the TRIGGER reads no measurement. There is no verdict argument to hand in any more,
 *     which is the point: `splitDoc(html, capacity)` is a pure function of the markup, so
 *     the same deck cuts the same way on every machine.
 *
 * The previous contract — a MEASURED trigger, cutting by a rendered overflow ratio and pacing
 * by `capacity.perPage ?? sweet ?? soft ?? hard` — is gone. Tests written against it are not
 * ported case by case: a ratio argument has no meaning here, and "splits into SWEET-sized
 * chunks" pinned exactly the packing the single-element rule forbids.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { splitDoc, capacityForClass, applyRails, applyRelationshipSignals } = require('../../../lib/core/auto-split');

const sec = (cls, inner) => `<section class="${cls}">${inner}</section>`;
const docSec = (n, cls, inner) => `<section data-lattice-slide="${n}" class="${cls}">${inner}</section>`;
const list = (n) => `<ul>${Array.from({ length: n }, (_, i) => `<li>item ${i + 1}</li>`).join('')}</ul>`;
const cap = { cards: { axis: 'item', hard: 4 }, redline: { axis: 'col', hard: 2 } };
// The fixtures are authored without a slide number; the walker keys on `data-lattice-slide`.
const docify = (html) => html.replace(/^<section /, '<section data-lattice-slide="1" ');
const split = (html, capacity = cap) => {
  const r = splitDoc(html, capacity);
  return { html: r.html, splits: r.changed };
};
const sections = (html) => (html.match(/<section/g) || []).length;
const rolesOf = (html) => [...html.matchAll(/data-split-role="([^"]*)"/g)].map((m) => m[1]);

describe('core: the cut is ONE structural element per page', () => {
  test('an item collection becomes cover + one body page per member', () => {
    const { html: out, splits } = split(docify(sec('cards', `<h2>T</h2>${list(9)}`)));
    assert.equal(splits, 1);
    assert.equal(sections(out), 10);                                  // cover + 9 bodies
    assert.equal((out.match(/lat-split-cover/g) || []).length, 1);    // exactly ONE cover
    assert.match(out, /split-feat-h">T</);                            // the title hoists onto it
    assert.equal((out.match(/<li>/g) || []).length, 9);               // nothing lost
    // …and every body page holds exactly one member. This is the whole rule, so assert it
    // per page rather than trusting the page COUNT, which a 2+7 cut would also satisfy.
    for (const page of out.split(/(?=<section\b)/).filter((p) => /lat-split-native/.test(p))) {
      assert.equal((page.match(/<li>/g) || []).length, 1);
    }
  });

  test('the count does not change the pacing — 3 members and 30 members both atomize', () => {
    // The retired policy packed by `sweet ?? soft ?? hard`, so the cut moved with the
    // component's authoring budget. It no longer reads those numbers at all.
    assert.equal(sections(split(docify(sec('cards', `<h2>T</h2>${list(3)}`))).html), 4);
    assert.equal(sections(split(docify(sec('cards', `<h2>T</h2>${list(30)}`))).html), 31);
  });

  test('a capacity budget bigger than the collection does NOT suppress the split', () => {
    // 3 items against `hard: 4` — comfortably inside the authoring budget. Under the count
    // trigger this never split; under the measured trigger it split only if a render said so.
    // Structurally it is three elements, so it is three pages.
    const { splits, html: out } = split(docify(sec('cards', `<h2>T</h2>${list(3)}`)));
    assert.equal(splits, 1);
    assert.equal(sections(out), 4);
  });

  test('a single-member collection has no seam and is left whole', () => {
    const html = docify(sec('cards', `<h2>T</h2>${list(1)}`));
    const r = splitDoc(html, cap);
    assert.equal(r.changed, 0);
    assert.equal(r.html, html, 'a slide with nothing to divide must export byte-identical');
  });

  test('a TITLE-LESS slide has no masthead to cover with → bare partition, no cover', () => {
    const { html: out, splits } = split(docify(sec('cards', list(9))));
    assert.equal(splits, 1);
    assert.equal(sections(out), 9);                                   // no cover slide
    assert.equal((out.match(/lat-split-cover/g) || []).length, 0);
  });

  test('a non-splittable axis (col read-across) is left for the ring, never split', () => {
    const rows = '<tr><td>a</td><td>b</td></tr>'.repeat(4);
    const doc = docSec(1, 'redline', `<table><tbody>${rows}</tbody></table>`);
    assert.equal(splitDoc(doc, cap).changed, 0);
  });

  test('a slide with no capacity entry passes through', () => {
    assert.equal(split(docify(sec('quote', '<blockquote>x</blockquote>'))).splits, 0);
  });

  test('a specimen slide (<!-- stress-slide -->) opts out — it exists to show the overflow', () => {
    const html = docify(sec('cards', `<!-- stress-slide --><h2>T</h2>${list(9)}`));
    assert.equal(splitDoc(html, cap).changed, 0);
  });

  test('capacityForClass: first capacity-bearing token wins; modifiers carry none', () => {
    assert.deepEqual(capacityForClass('cards compact', cap), { axis: 'item', hard: 4 });
    assert.equal(capacityForClass('quote big', cap), null);
    assert.equal(capacityForClass('', cap), null);
  });
});

describe('core: the envelope — cover → bodies → closing', () => {
  const withTrailing = (n, trailing) => docify(sec('cards', `<h2>T</h2>${list(n)}${trailing}`));
  const NOTE = '<p class="below-note">Source: internal, May.</p>';
  const INSIGHT = '<blockquote><p>The market moved first.</p></blockquote>';

  test('a trailing NOTE lands on a CLOSING page of its own, not on the last body page', () => {
    // This is the 2026-07-26 treatment reversed. The note used to ride the last body page one
    // size down (`lat-split-note`), which put a footnote on a page already carrying content.
    const out = split(withTrailing(4, NOTE)).html;
    assert.deepEqual(rolesOf(out), ['cover', 'body', 'body', 'body', 'body', 'closing']);
    const pages = out.split(/(?=<section\b)/).filter((p) => p.startsWith('<section'));
    assert.match(pages.at(-1), /below-note/);
    for (const body of pages.filter((p) => /lat-split-native/.test(p))) {
      assert.doesNotMatch(body, /below-note/, 'no body page may carry the trailing note');
    }
    assert.doesNotMatch(out, /lat-split-note/, 'the note is at full size on its own page');
  });

  test('a note AND a key insight close the run TOGETHER, on one page', () => {
    const out = split(withTrailing(4, `${INSIGHT}${NOTE}`)).html;
    const pages = out.split(/(?=<section\b)/).filter((p) => p.startsWith('<section'));
    assert.equal(rolesOf(out).filter((r) => r === 'closing').length, 1, 'exactly ONE closing page');
    const closing = pages.at(-1);
    assert.match(closing, /below-note/);
    assert.match(closing, /<blockquote/);
    assert.doesNotMatch(closing, /<li>/, 'the closing page carries no collection members');
  });

  test('an <!-- annotation: --> rides the closing page too', () => {
    const out = split(withTrailing(3, '<p class="below-note"><em>WIP — May numbers.</em></p>')).html;
    assert.match(out.split(/(?=<section\b)/).at(-1), /WIP — May numbers/);
  });

  test('a run with NO trailing material ends on its last body page, not an empty closing', () => {
    const out = split(withTrailing(4, '')).html;
    assert.deepEqual(rolesOf(out), ['cover', 'body', 'body', 'body', 'body']);
  });

  test('content is conserved — every member and the trailing material all survive', () => {
    const out = split(withTrailing(10, `${INSIGHT}${NOTE}`)).html;
    assert.equal((out.match(/<li>/g) || []).length, 10);
    assert.equal((out.match(/below-note/g) || []).length, 1, 'the note lands ONCE');
    assert.equal((out.match(/<blockquote/g) || []).length, 1, 'the insight lands ONCE');
  });
});

describe('core: the carousel points at what is next — on EVERY run', () => {
  const card = (t, b) => `<li><strong>${t}</strong> ${b}</li>`;
  const steps = `<ul>${card('Draft the policy.', 'Legal owns it.')}${card('Circulate.', 'Two weeks.')}${card('Sign off.', 'The chair signs.')}</ul>`;
  const sigsOf = (html) => [...html.matchAll(/<div class="lat-split-rel"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);

  test('a component declaring NO relationship still gets a forward pointer', () => {
    // The signal used to require `capacity.relationship`, which four of sixty-one components
    // declare — so the ordinary bulleted slide split into pages with nothing joining them.
    const out = applyRelationshipSignals(split(docify(sec('cards', `<h2>T</h2>${steps}`))).html, cap);
    assert.deepEqual(sigsOf(out), ['next: Circulate', 'next: Sign off']);
  });

  test('a declared relationship still chooses the PHRASING', () => {
    const cycleCap = { cards: { axis: 'item', hard: 4, relationship: 'cycle' } };
    const out = applyRelationshipSignals(split(docify(sec('cards', `<h2>T</h2>${steps}`)), cycleCap).html, cycleCap);
    assert.match(sigsOf(out).at(-1), /back to Draft the policy/);
    assert.match(out, /data-mark="loop"/, 'the loop shape is DRAWN, never a typed glyph');
  });

  test('the LAST body page points at the closing page, naming what it carries', () => {
    const inner = `<h2>T</h2>${steps}<blockquote><p>Ship it.</p></blockquote>`;
    const out = applyRelationshipSignals(split(docify(sec('cards', inner))).html, cap);
    assert.equal(sigsOf(out).at(-1), 'next: the key insight');
  });

  test('no signal on the cover or the closing page — neither is a member', () => {
    const inner = `<h2>T</h2>${steps}<p class="below-note">n</p>`;
    const out = applyRelationshipSignals(split(docify(sec('cards', inner))).html, cap);
    const pages = out.split(/(?=<section\b)/).filter((p) => p.startsWith('<section'));
    assert.doesNotMatch(pages[0], /lat-split-rel/);
    assert.doesNotMatch(pages.at(-1), /lat-split-rel/);
  });

  test('idempotent — re-applying strips the prior signals and re-derives the same result', () => {
    const once = applyRelationshipSignals(split(docify(sec('cards', `<h2>T</h2>${steps}`))).html, cap);
    assert.equal(applyRelationshipSignals(once, cap), once);
  });
});

describe('core: document-level bookkeeping across a split', () => {
  test('preserves gaps and the section openTag/attributes across copies', () => {
    const html = `\n<section data-lattice-slide="1" class="cards" data-x="1">${list(3)}</section>\n`;
    const { html: out } = split(html);
    const tags = out.match(/<section[^>]*>/g) || [];
    assert.equal(tags.length, 3);
    for (const t of tags) {
      // The layout class TOKEN, not the whole attribute: a title-less slide now routes through
      // the envelope rather than the bare partition, so its pages also carry `lat-split-native`.
      assert.match(t, /\sclass="[^"]*\bcards\b/);
      assert.match(t, /\sdata-x="1"/);
      assert.match(t, /\sdata-split-role="body"/);
    }
    assert.match(out, /^\n/); // leading gap preserved
    assert.match(out, /\n$/); // trailing gap preserved
  });

  test('continuation copies drop the engine id — the split never duplicates ids', () => {
    const { html: out } = split(docify(`<section class="cards" id="2">${list(3)}</section>`));
    const tags = out.match(/<section[^>]*>/g) || [];
    assert.equal(tags.length, 3);
    assert.equal((out.match(/id="2"/g) || []).length, 1);
    for (const t of tags) {
      assert.match(t, /\sdata-split-run="2"/);
      assert.match(t, /\sdata-split-role="body"/);
    }
    assert.match(tags[0], /\sid="2"/);
    assert.doesNotMatch(tags[1], /\sid="/);
  });

  // ── HIERARCHICAL numbering (2026-09-01) ────────────────────────────────────────────────
  // A split run numbers itself — 2 · 2.2 · 2.3 — and nothing else in the deck moves. The old
  // pass counted every emitted page and re-stamped the whole deck's numbers AND totals, which
  // reported the artifact's page count when what a reader needs is where they are in the
  // argument the author wrote.
  test('a split run numbers ITSELF: 2 becomes 2 · 2.2 · 2.3', () => {
    const doc = docSec(1, 'quote', '<p>a</p>') + docSec(2, 'cards', `<h2>T</h2>${list(3)}`) + docSec(3, 'quote', '<p>b</p>');
    const { html } = splitDoc(doc, cap);
    assert.deepEqual(
      [...html.matchAll(/data-lattice-slide="([^"]*)"/g)].map((m) => m[1]),
      ['1', '2', '2.2', '2.3', '2.4', '3'],
    );
  });

  test('slides the split never touched come out BYTE-IDENTICAL', () => {
    // The whole point of the change: one split at slide 2 must cost nothing at slides 3..N,
    // so nothing downstream needs re-rendering. Asserted on the bytes, not on the numbers —
    // a re-stamped attribute would pass a number check and still dirty the section.
    const head = docSec(2, 'cards', `<h2>T</h2>${list(3)}`);
    const tail = docSec(3, 'quote', '<p>b</p>') + docSec(4, 'quote', '<p>c</p>');
    const { html } = splitDoc(head + tail, cap);
    assert.ok(html.endsWith(tail), 'every section after the split must be untouched');
  });

  test('the TOTAL is never rewritten — the authored deck still has as many slides', () => {
    const pg = (n, cls, inner) => `<section data-lattice-slide="${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="2" class="${cls}">${inner}</section>`;
    const { html } = splitDoc(pg(1, 'quote', '<p>a</p>') + pg(2, 'cards', list(3)), cap);
    assert.ok([...html.matchAll(/data-lattice-pagination-total="([^"]*)"/g)].every((m) => m[1] === '2'),
      'a split does not change how many slides the author wrote');
    assert.deepEqual(
      [...html.matchAll(/data-lattice-pagination="([^"]*)"/g)].map((m) => m[1]),
      ['1', '2', '2.2', '2.3'],
    );
  });

  test('the VISIBLE span tracks the attribute — including on the cover', () => {
    // The cover used to mint a literal `0` and rely on the sequential pass to overwrite it.
    // Nothing re-stamps a run's first page any more, so it seeds from its own openTag.
    const pg = (n, cls, inner) => `<section data-lattice-slide="${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="1" class="${cls}"><span class="lat-pagination">${n}</span>${inner}</section>`;
    const { html } = splitDoc(pg(2, 'cards', `<h2>T</h2>${list(3)}`), cap);
    assert.deepEqual(
      [...html.matchAll(/<span class="lat-pagination">([^<]*)</g)].map((m) => m[1]),
      ['2', '2.2', '2.3', '2.4'],
    );
    assert.doesNotMatch(html, /lat-pagination">0</, 'no page may render a literal 0');
  });

  // The engine numbers a slide by its ABSOLUTE position and a `paginate: false` slide still
  // holds one (lib/engine/slides.js §3). Hierarchical numbering does not disturb that: it only
  // ever appends a decimal WITHIN a run, so a hidden slide's position is untouched by
  // construction rather than by a counter that has to remember it.
  test('a paginate:false slide is unaffected — the split never counts across it', () => {
    const doc =
      '<section data-lattice-slide="1" class="title"><h1>cover</h1></section>' +
      `<section data-lattice-slide="2" data-lattice-pagination="2" data-lattice-pagination-total="2" class="cards">${list(3)}</section>`;
    const { html } = splitDoc(doc, cap);
    assert.match(html, /<section data-lattice-slide="1" class="title"><h1>cover<\/h1><\/section>/,
      'the hidden slide is byte-identical');
    assert.deepEqual(
      [...html.matchAll(/data-lattice-pagination="([^"]*)"/g)].map((m) => m[1]),
      ['2', '2.2', '2.3'],
    );
  });

  test('a body page the splitter already emitted does not grow a SECOND cover', () => {
    const already = '<h2>T <span class="lat-cont">(cont.)</span></h2>' + list(3);
    const { html } = splitDoc(docSec(1, 'cards lat-split-native', already), cap);
    assert.equal((html.match(/lat-split-cover/g) || []).length, 0);
    for (const heading of html.match(/<h2>[\s\S]*?<\/h2>/g) || []) {
      assert.equal((heading.match(/class="lat-cont"/g) || []).length, 1,
        `expected exactly one (cont.) marker per heading, got: ${heading}`);
    }
  });
});

describe('core: applyRails', () => {
  const railOf = (sectionHtml) => {
    const m = sectionHtml.match(/<div class="lat-split-rail"[\s\S]*?<\/div>/);
    if (!m) return null;
    return { total: (m[0].match(/<span/g) || []).length, on: (m[0].match(/seg on/g) || []).length };
  };
  const run = (id, n, cls = 'x') => Array.from({ length: n }, () => `<section data-lattice-slide="0" data-split-run="${id}" class="${cls}"><p>p</p></section>`).join('');

  test('stamps a k-of-N rail across each run, lit through the current page', () => {
    const out = applyRails(run('a', 3) + run('b', 2));
    assert.deepEqual((out.match(/<section[\s\S]*?<\/section>/g)).map(railOf), [
      { total: 3, on: 1 }, { total: 3, on: 2 }, { total: 3, on: 3 },
      { total: 2, on: 1 }, { total: 2, on: 2 },
    ]);
  });

  test('a lone section (run of one) and an untagged section get no rail', () => {
    const html = run('solo', 1) + '<section data-lattice-slide="0" class="plain"><p>p</p></section>';
    assert.equal((applyRails(html).match(/lat-split-rail/g) || []).length, 0);
  });

  test('idempotent — re-applying strips the prior rails and re-stamps the same result', () => {
    const once = applyRails(run('a', 4));
    assert.equal(applyRails(once), once);
  });

  test('whitespace gaps between members do not break a run', () => {
    const html = run('a', 2).replace('</section><section', '</section>\n  <section');
    assert.deepEqual((applyRails(html).match(/<section[\s\S]*?<\/section>/g)).map(railOf), [{ total: 2, on: 1 }, { total: 2, on: 2 }]);
  });

  test('ignores literal <section> text in a leading head prefix (CSS/comments)', () => {
    const head = '<style>section.state{color:red}</style>';
    const out = applyRails(head + run('a', 2));
    assert.ok(out.startsWith(head));
    assert.equal((out.match(/lat-split-rail/g) || []).length, 2);
  });

  test('sets --lat-split-offset on cover-paginate body pages so a counter can continue', () => {
    const cover = '<section data-lattice-slide="0" data-split-run="r" class="lat-split-cover" style="--x:1;"><p>c</p></section>';
    const body = (n) => `<section data-lattice-slide="0" data-split-run="r" class="q-and-a lat-split-native" style="--x:1;"><ul>${'<li>q</li>'.repeat(n)}</ul></section>`;
    const out = applyRails(cover + body(2) + body(1) + body(3));
    assert.deepEqual([...out.matchAll(/--lat-split-offset:(\d+)/g)].map((m) => Number(m[1])), [2, 3]);
    assert.ok(!/--lat-split-offset/.test(out.match(/<section[^>]*lat-split-cover[^>]*>/)[0]));
  });
});

describe('the marker berths survive a split, one set per page', () => {
  // `lib/core/fit-berth.js` emits three empty marker tabs as the LAST children of every slide,
  // and the split re-emits one slide as a cover plus N body pages. Two ways to be wrong, both
  // silent: the berths get counted by the partitioner as items to paginate (moving the cut), or
  // a page comes out with no berth and an overflowing page has nowhere to draw its ring.
  //
  // The SPLIT is not what berths a page — the export re-berths after it (`fitBerth.applyToDocHtml`),
  // which is what covers the freshly-built cover. So the contract pinned here is the pair.
  const { applyToDocHtml, BERTH_HTML } = require('../../../lib/core/fit-berth');
  const BERTHS = ['overflow-tab', 'illegible-tab', 'fixme-tab'];
  const berthed = (inner) => inner + BERTH_HTML;
  const pagesOf = (html) => html.split(/(?=<section\b)/).filter((p) => p.startsWith('<section'));

  test('after the split and the berth pass, every page carries exactly one of each', () => {
    const { html: out, splits } = split(docify(sec('cards', berthed(`<h2>T</h2>${list(9)}`))));
    assert.equal(splits, 1, 'the fixture must actually split, or this asserts nothing');
    const pages = pagesOf(applyToDocHtml(out));
    assert.ok(pages.length > 1, `expected a multi-page split, got ${pages.length}`);
    for (const [i, page] of pages.entries()) {
      for (const c of BERTHS) {
        assert.equal((page.match(new RegExp(`class="${c}"`, 'g')) || []).length, 1,
          `page ${i + 1} must carry exactly one ${c}`);
      }
    }
  });

  test('the berths are not counted as items to paginate', () => {
    const bare = split(docify(sec('cards', `<h2>T</h2>${list(9)}`)));
    const withBerths = split(docify(sec('cards', berthed(`<h2>T</h2>${list(9)}`))));
    assert.equal(
      pagesOf(withBerths.html).length,
      pagesOf(bare.html).length,
      'the same content must split into the same number of pages with or without berths',
    );
  });
});

// ── a page that NAMES its member beats the first-list heuristic ───────────────
//
// `membersIn` resolves a page's members as the first `<ul>`/`<ol>` on it and that list's `<li>`
// children. It is a proxy for "the collection this page carries", and it is right whenever the
// page's body IS that collection — every axis-driven run, and the plain envelope.
//
// It is wrong on a NATIVE SLICE, where the page carries ONE member that has lists of its own.
// Measured on `examples/portrait-roadmap.md`: the first list on a phase page is `ul.horizon-rows`
// INSIDE the card, so the pointer named a workstream row rather than the phase — "next: Signal
// Intake Scoring v2" on a page titled "Q2". `kanban` builds its lanes from `<div>`s, so nothing
// resolved and its runs carried no pointer at all.
//
// `nativeSliceSplit` stamps `data-split-label` because it is the only thing that knows which
// element it cut. These pin the PREFERENCE — that the stamp wins, that its absence changes
// nothing, and that a stamp is read as text rather than as markup.
describe('auto-split: data-split-label names the page, over the first-list heuristic', () => {
  const sigsOf = (html) => [...html.matchAll(/<div class="lat-split-rel"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  const cap = { cards: { axis: 'item', hard: 4 } };
  // A run of three body pages, each holding a titled card whose OWN list would otherwise be read
  // as the page's members — the roadmap shape, reduced.
  const page = (n, label) => '<section data-lattice-slide="1" data-split-run="r1" '
    + `data-split-role="body"${label ? ` data-split-label="${label}"` : ''} class="cards">`
    + `<h2>Plan</h2><div class="card"><span class="card-title">${n}</span>`
    + '<ul><li>Workstream row one</li><li>Workstream row two</li></ul></div></section>';
  const doc = (...labels) => `<main>${labels.map((l, i) => page(`Card ${i + 1}`, l)).join('')}</main>`;

  test('the stamp names the next page; the row inside the card is not the member', () => {
    const out = applyRelationshipSignals(doc('Q1', 'Q2', 'Q3'), cap);
    assert.deepEqual(sigsOf(out), ['next: Q2', 'next: Q3'],
      'the pointer must name the stamped member, not the first list nested inside it');
  });

  test('with no stamp the heuristic still runs — the old behavior is intact', () => {
    const out = applyRelationshipSignals(doc(null, null, null), cap);
    assert.deepEqual(sigsOf(out), ['next: Workstream row one', 'next: Workstream row one'],
      'an unstamped page must fall through to membersIn exactly as before');
  });

  test('a stamp is TEXT — an escaped quote comes back as a quote, not as markup', () => {
    // The label under test is on page TWO, because page one's pointer names page two.
    const out = applyRelationshipSignals(doc('First', 'The &quot;big&quot; lane', 'Third'), cap);
    assert.equal(sigsOf(out)[0], 'next: The "big" lane');
  });
});
