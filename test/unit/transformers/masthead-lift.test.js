/**
 * Unit tests for the masthead-lift transform (Phase 1 of the Form model).
 * Covers the HTML-string kernel (lib/forms/cell/masthead/masthead.transform.js —
 * the marp-cli + emulator paths) and the DOM mirror (lib/transformers/
 * masthead-lift.js — the runtime path), and asserts the two agree.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/forms/cell/masthead/masthead.transform');
const adapter = require('../../../lib/transformers/masthead-lift');

function dom(html) {
  return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}

describe('masthead-lift — HTML-string kernel', () => {
  test('lifts eyebrow + h2 into .cell-masthead; generic body goes in .cell-stage', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><ul><li>body</li></ul>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="cell-masthead"><div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><\/div><div class="masthead-bay"><\/div><\/div>/);
    // generic prose (content) → body wrapped into the frame's stage cell (flex cell-tree)
    assert.match(out, /<\/div><div class="cell-stage"><ul><li>body<\/li><\/ul><\/div>$/);
  });

  test('works without an eyebrow (title only); body in the stage cell', () => {
    const out = kernel.transformMastheadSection('<h2>Just a title</h2><p>Body.</p>', 'form');
    assert.match(out, /<div class="masthead-lede"><h2>Just a title<\/h2><\/div>/);
    assert.match(out, /<div class="cell-stage"><p>Body\.<\/p><\/div>$/);
  });

  test('an UN-migrated component body is NOT wrapped (keeps direct-child selectors)', () => {
    const inner = '<h2>T</h2><ul><li>x</li></ul>';
    const out = kernel.transformMastheadSection(inner, 'gantt form'); // not yet migrated (chart-family)
    assert.match(out, /<\/div><ul><li>x<\/li><\/ul>$/); // no .cell-stage
    assert.doesNotMatch(out, /cell-stage/);
  });

  test('a MIGRATED component body IS wrapped into the stage cell', () => {
    const inner = '<h2>T</h2><ul><li>x</li></ul>';
    const out = kernel.transformMastheadSection(inner, 'cards-grid form'); // migrated
    assert.match(out, /<div class="cell-stage"><ul><li>x<\/li><\/ul><\/div>$/);
  });

  test('no-op when the section does not opt in', () => {
    const inner = '<p><code>K</code></p><h2>T</h2>';
    assert.equal(kernel.transformMastheadSection(inner, 'content'), inner);
  });

  test('a titleless generic slide still gets a stage cell (no band)', () => {
    const inner = '<p>Just prose, no heading.</p>';
    const out = kernel.transformMastheadSection(inner, 'form');
    assert.equal(out, '<div class="cell-stage"><p>Just prose, no heading.</p></div>');
  });

  test('a trailing Marp <footer> moves into a real .cell-footer (footer band)', () => {
    const inner = '<h2>T</h2><p>Body.</p><footer>Confidential</footer>';
    const out = kernel.transformMastheadSection(inner, 'form');
    assert.match(out, /<div class="cell-stage"><p>Body\.<\/p><\/div><div class="cell-footer"><footer>Confidential<\/footer><\/div>$/);
  });

  test('pagination becomes a real .lat-pagination span in the footer cell', () => {
    const inner = '<h2>T</h2><p>Body.</p><footer>Confidential</footer>';
    const out = kernel.transformMastheadSection(inner, 'form', '7');
    assert.match(out, /<div class="cell-footer"><footer>Confidential<\/footer><span class="lat-pagination">7<\/span><\/div>$/);
  });

  test('pagination alone (no footer text) still builds the footer cell', () => {
    const inner = '<h2>T</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'form', '3');
    assert.match(out, /<div class="cell-stage"><p>Body\.<\/p><\/div><div class="cell-footer"><span class="lat-pagination">3<\/span><\/div>$/);
  });

  test('no footer text and no pagination ⇒ no footer cell (stage runs to the edge)', () => {
    const inner = '<h2>T</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'form');
    assert.match(out, /<div class="cell-stage"><p>Body\.<\/p><\/div>$/);
    assert.doesNotMatch(out, /cell-footer/);
  });

  test('idempotent — a second pass does not double-wrap', () => {
    const inner = '<p><code>K</code></p><h2>T</h2><p>Body.</p>';
    const once = kernel.transformMastheadSection(inner, 'form');
    const twice = kernel.transformMastheadSection(once, 'form');
    assert.equal(twice, once);
  });

  test('a leading Marp <header> is preserved before the band', () => {
    const inner = '<header>RUNNING</header><p><code>K</code></p><h2>T</h2>';
    const out = kernel.transformMastheadSection(inner, 'form');
    assert.match(out, /^<header>RUNNING<\/header><div class="cell-masthead">/);
  });

  test('applyToRenderedHtml only touches opted-in sections', () => {
    const html =
      '<section class="content"><h2>Plain</h2></section>' +
      '<section class="content form"><p><code>K</code></p><h2>Lifted</h2></section>';
    const out = kernel.applyToRenderedHtml(html);
    assert.match(out, /<section class="content"><h2>Plain<\/h2><\/section>/);
    assert.match(out, /<section class="content form"><div class="cell-masthead">/);
  });

  // Form-migration audit (2026-07-09): a trailing SUBTITLE (a code-only <p>
  // AFTER the h2) was misidentified as a leading EYEBROW — extractEyebrowP had
  // no positional check against the title, so it grabbed the first code-only
  // paragraph anywhere in the body, reordering it before the heading and
  // mis-styling it as the mono-caps kicker instead of the italic subtitle.
  test('a trailing subtitle (code-only <p> AFTER h2) stays after h2 — not misidentified as a leading eyebrow', () => {
    const inner = '<h2>Title</h2><p><code>A subtitle after the heading</code></p><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><p><code>A subtitle after the heading<\/code><\/p><\/div>/);
  });

  test('a leading eyebrow (code-only <p> BEFORE h2) is unaffected by subtitle scoping', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><\/div>/);
  });

  test('both a leading eyebrow AND a trailing subtitle are captured, in order', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><p><code>Subtitle</code></p><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><p><code>Subtitle<\/code><\/p><\/div>/);
    // and the subtitle is NOT left behind in the stage body
    assert.match(out, /<div class="cell-stage"><p>Body\.<\/p><\/div>$/);
  });

  test('a subtitle-shaped paragraph further down the body (not immediately after h2) is real content, left alone', () => {
    const inner = '<h2>Title</h2><p>Intro.</p><p><code>Not a subtitle</code></p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><\/div>/);
    assert.match(out, /<div class="cell-stage"><p>Intro\.<\/p><p><code>Not a subtitle<\/code><\/p><\/div>$/);
  });

  // Form-migration audit adversarial re-review (2026-07-09): extractEyebrowP
  // scoped its SEARCH WINDOW to before the h2, but the regex itself was
  // unanchored/depth-blind — it could match a code-only <p> nested inside a
  // <div> or <li> ANYWHERE in that window, hoisting it out of its container
  // and mis-styling it as the eyebrow. The DOM mirror was always correct here
  // (children.slice(0, h2Index).find(isCodeOnlyP) — direct children only).
  test('a code-only <p> nested inside a <div> before h2 is real content, not hoisted as the eyebrow', () => {
    const inner = '<div class="custom"><p><code>Nested</code></p></div><h2>Title</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><\/div>/);
    assert.doesNotMatch(out, /masthead-lede"><p>/, 'nested <p> must not become the eyebrow');
    assert.match(out, /<div class="cell-stage"><div class="custom"><p><code>Nested<\/code><\/p><\/div><p>Body\.<\/p><\/div>$/);
  });

  test('a code-only <p> nested inside a loose <li> before h2 is real content, not hoisted as the eyebrow', () => {
    const inner = '<ul><li><p><code>Nested</code></p></li></ul><h2>Title</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><\/div>/);
    assert.doesNotMatch(out, /masthead-lede"><p>/, 'nested <p> must not become the eyebrow');
    assert.match(out, /<div class="cell-stage"><ul><li><p><code>Nested<\/code><\/p><\/li><\/ul><p>Body\.<\/p><\/div>$/);
  });

  test('a genuine top-level eyebrow is still found past a preceding non-<p> top-level sibling', () => {
    // Mirrors the DOM mirror's `.find()` semantics: it scans ALL direct
    // children before h2, not just the first — a leading <header> already
    // extracted separately, but any other top-level sibling ahead of the
    // eyebrow must not block detection.
    const inner = '<div class="tag">NEW</div><p><code>Kicker</code></p><h2>Title</h2>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><\/div>/);
    assert.match(out, /<div class="cell-stage"><div class="tag">NEW<\/div><\/div>$/);
  });
});

describe('masthead-lift — DOM mirror agrees with the kernel', () => {
  test('DOM path builds the same band structure', () => {
    const doc = dom('<section class="content form"><p><code>Kicker</code></p><h2>Title</h2><ul><li>body</li></ul></section>');
    adapter.applyToDom(doc);
    const sec = doc.querySelector('section.form');
    const band = sec.querySelector(':scope > .cell-masthead');
    assert.ok(band, 'masthead band present');
    assert.ok(band.querySelector('.masthead-lede > p > code'), 'eyebrow in masthead-lede');
    assert.ok(band.querySelector('.masthead-lede > h2'), 'title in masthead-lede');
    assert.ok(band.querySelector('.masthead-bay'), 'bay reserved');
    // generic body is wrapped into the stage cell, after the band
    assert.ok(sec.querySelector(':scope > .cell-stage > ul > li'), 'list lives in the stage cell');
    assert.equal(sec.children[0], band, 'band is first');
    assert.ok(sec.querySelector(':scope > .cell-masthead') && sec.querySelector(':scope > .cell-stage'), 'masthead + stage cells');
  });

  test('DOM path builds a .cell-footer with footer text + pagination span', () => {
    const doc = dom('<section class="content form" data-lattice-pagination="4"><h2>T</h2><p>Body.</p><footer>Confidential</footer></section>');
    adapter.applyToDom(doc);
    const sec = doc.querySelector('section.form');
    const fc = sec.querySelector(':scope > .cell-footer');
    assert.ok(fc, 'footer cell present');
    assert.ok(fc.querySelector(':scope > footer'), 'footer text in the cell');
    assert.equal(fc.querySelector(':scope > .lat-pagination')?.textContent, '4', 'page number is a real span');
    assert.equal(sec.querySelector(':scope > .cell-stage > footer'), null, 'footer is NOT in the stage');
  });

  test('DOM path is idempotent', () => {
    const doc = dom('<section class="form"><p><code>K</code></p><h2>T</h2></section>');
    adapter.applyToDom(doc);
    adapter.applyToDom(doc);
    assert.equal(doc.querySelectorAll('.cell-masthead').length, 1);
  });

  test('DOM path skips non-opted sections', () => {
    const doc = dom('<section class="content"><h2>T</h2></section>');
    adapter.applyToDom(doc);
    assert.equal(doc.querySelector('.cell-masthead'), null);
  });

  test('DOM path: a trailing subtitle stays after h2 — not misidentified as a leading eyebrow', () => {
    const doc = dom('<section class="content form"><h2>Title</h2><p><code>A subtitle</code></p><p>Body.</p></section>');
    adapter.applyToDom(doc);
    const lede = doc.querySelector('.masthead-lede');
    assert.equal(lede.children[0].tagName, 'H2');
    assert.equal(lede.children[1].tagName, 'P');
    assert.equal(lede.children[1].textContent, 'A subtitle');
  });

  test('DOM path: leading eyebrow + trailing subtitle are both captured, in order', () => {
    const doc = dom(
      '<section class="content form"><p><code>Kicker</code></p><h2>Title</h2><p><code>Subtitle</code></p><p>Body.</p></section>',
    );
    adapter.applyToDom(doc);
    const lede = doc.querySelector('.masthead-lede');
    assert.deepEqual([...lede.children].map((el) => el.tagName + ':' + el.textContent), [
      'P:Kicker',
      'H2:Title',
      'P:Subtitle',
    ]);
    assert.equal(doc.querySelector('.cell-stage').textContent, 'Body.');
  });
});

describe('masthead-lift — stage-wrap eligibility', () => {
  test('generic prose + MIGRATED components wrap; an un-migrated component does not', () => {
    assert.equal(kernel.wrapsStageBody('content form'), true);   // generic
    assert.equal(kernel.wrapsStageBody('form'), true);           // bare
    assert.equal(kernel.wrapsStageBody('form dark'), true);      // bare + modifier
    assert.equal(kernel.wrapsStageBody('cards-grid form'), true); // migrated
    assert.equal(kernel.wrapsStageBody('redline form'), true);  // migrated (#587)
    assert.equal(kernel.wrapsStageBody('gantt form'), false);   // un-migrated (chart-family)
    assert.equal(kernel.wrapsStageBody('split-panel'), false);   // sovereign (own structure)
  });

  test('ALL_LAYOUTS matches the manifests; STAGE_MIGRATED ⊆ ALL_LAYOUTS', () => {
    // ALL_LAYOUTS is browser-bundle-safe; this Node test asserts it can't drift
    // from the manifest source of truth (so a new component is classified, never
    // silently wrapped). STAGE_MIGRATED only grows within that set as components
    // are codemodded — it never contains a name that isn't a real component.
    const { loadAll } = require('../../../lib/components');
    const manifest = new Set(loadAll().map((m) => m.name));
    const all = kernel.ALL_LAYOUTS;
    assert.deepEqual([...manifest].filter((n) => !all.has(n)), [], 'ALL_LAYOUTS missing a manifest layout');
    assert.deepEqual([...all].filter((n) => !manifest.has(n)), [], 'ALL_LAYOUTS has a stale layout');
    assert.deepEqual([...kernel.STAGE_MIGRATED].filter((n) => !all.has(n)), [], 'STAGE_MIGRATED has a non-layout');
    assert.ok(!kernel.STAGE_MIGRATED.has('title'), 'a sovereign frame must never be in STAGE_MIGRATED');
  });

  test('every layout is classified: ALL_LAYOUTS = STAGE_MIGRATED ⊎ STAGE_DEFERRED ⊎ chrome-exempt', () => {
    // The migration taxonomy is a TOTAL partition — every component is in exactly
    // one of three buckets: wrapped into `.cell-stage` (STAGE_MIGRATED), gets the
    // band but keeps a direct-child sized-media body (STAGE_DEFERRED), or is a
    // sovereign frame that gets no band at all (FORM_TOGGLE_SKIP, chrome-exempt).
    // This guard closes the gap that let `diagram` sit un-migrated yet
    // un-enumerated: a brand-new component MUST be placed into one bucket or this
    // fails — it can never default to "unwrapped and undocumented".
    const { FORM_TOGGLE_SKIP } = require('../../../lib/integrations/markdown-it/plugins.js');
    const all = kernel.ALL_LAYOUTS;
    const migrated = kernel.STAGE_MIGRATED;
    const deferred = kernel.STAGE_DEFERRED;
    const exempt = new Set(FORM_TOGGLE_SKIP);

    // disjoint — no layout wears two hats
    assert.deepEqual([...migrated].filter((n) => deferred.has(n)), [], 'a layout is in both STAGE_MIGRATED and STAGE_DEFERRED');
    assert.deepEqual([...migrated].filter((n) => exempt.has(n)), [], 'a migrated layout is also chrome-exempt');
    assert.deepEqual([...deferred].filter((n) => exempt.has(n)), [], 'a deferred layout is also chrome-exempt');

    // every member is a real layout (no stale names in the deferred set)
    assert.deepEqual([...deferred].filter((n) => !all.has(n)), [], 'STAGE_DEFERRED has a non-layout');

    // total — the three buckets cover ALL_LAYOUTS exactly, no gaps
    const classified = new Set([...migrated, ...deferred, ...exempt]);
    assert.deepEqual([...all].filter((n) => !classified.has(n)), [], 'an ALL_LAYOUTS component is unclassified (add it to a bucket)');
    assert.deepEqual([...classified].filter((n) => !all.has(n)), [], 'a bucket names something outside ALL_LAYOUTS');

    // diagram specifically is the deferred sized-media case, not silently dropped
    assert.ok(deferred.has('diagram'), 'diagram must be an enumerated deferred layout');
  });
});
