/**
 * Unit tests for the masthead-lift transform (Phase 1 of the Form model).
 * Covers the HTML-string kernel (lib/forms/cell/masthead/masthead.transform.js —
 * lib/engine, serving the CLI/PDF path and the browser playground) and the
 * DOM mirror (lib/transformers/masthead-lift.js — the runtime path), and
 * asserts the two agree.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/forms/cell/masthead/masthead.transform');
const adapter = require('../../../lib/transformers/masthead-lift');
const chartFamily = require('../../../lib/transformers/chart-family');

function dom(html) {
  return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}

// Serialize a section's outerHTML through a fresh DOM parse so the HTML-string
// (engine) and the DOM-walk (runtime) outputs are compared on the SAME canonical
// footing — attribute quoting/order and whitespace are normalized identically.
function sectionOuterHtml(sectionMarkup) {
  return new JSDOM(`<!DOCTYPE html><body>${sectionMarkup}</body>`)
    .window.document.querySelector('section').outerHTML;
}

describe('masthead-lift — HTML-string kernel', () => {
  test('lifts eyebrow + h2 into .cell-masthead; generic body goes in .cell-stage', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><ul><li>body</li></ul>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="cell-masthead"><div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><hr class="masthead-rule"><\/div><div class="masthead-bay"><\/div><\/div>/);
    // generic prose (content) → body wrapped into the frame's stage cell (flex cell-tree)
    assert.match(out, /<\/div><div class="cell-stage"><ul><li>body<\/li><\/ul><\/div>$/);
  });

  test('works without an eyebrow (title only); body in the stage cell', () => {
    const out = kernel.transformMastheadSection('<h2>Just a title</h2><p>Body.</p>', 'form');
    assert.match(out, /<div class="masthead-lede"><h2>Just a title<\/h2><hr class="masthead-rule"><\/div>/);
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

  // The depth-aware h2 lift covers TWO families: a WRAPPED component (strict/flow)
  // and a `chart-frame` canvas. A chart's title nests in `.chart-header` (built by
  // the chart-family transform, which runs BEFORE mastheadLift), so it is NOT
  // lifted — the eyebrow + title + subtitle stay together in `.chart-header`, and
  // NO masthead band is built. This converges the engine with the web/runtime DOM
  // mirror (`:scope > h2`, which never lifted the nested h2), closing the
  // engine↔web parity gap and reviving the claim-hero/claim-bleed bottom-shelf
  // treatment built on `.chart-header h2` (model-driven-frame-render doc §6). A
  // WRAPPED strict component (wifi) likewise leaves its own in-card h2 unlifted.
  test('.viz-frame: a chart-frame section hoists its top-level chrome into the masthead band + wraps its body; a WRAPPED strict component does not lift its in-card h2', () => {
    // .viz-frame merge: the chart-family transform now emits eyebrow + h2 + subtitle as
    // TOP-LEVEL chrome (no `.chart-header`), and `chart-frame` is a wrapping Form, so the
    // masthead transform hoists the chrome into `.masthead-lede` and wraps the figure +
    // caption into `.cell-stage` — the same Frame/Cell structure diagram uses.
    const chart = kernel.transformMastheadSection(
      '<p class="chart-eyebrow"><code>Kicker</code></p><h2>Chart title</h2><p class="chart-subtitle">Sub</p><div class="chart-body"></div>',
      'progress form chart-frame',
    );
    assert.match(chart, /cell-masthead/, 'a chart now builds a masthead band');
    assert.match(
      chart,
      /<div class="masthead-lede"><p class="chart-eyebrow"><code>Kicker<\/code><\/p><h2>Chart title<\/h2><p class="chart-subtitle">Sub<\/p><hr class="masthead-rule"><\/div>/,
      'eyebrow + title + subtitle hoist together into masthead-lede, in order',
    );
    assert.match(chart, /<div class="cell-stage"><div class="chart-body"><\/div><\/div>/, 'the chart body wraps into the stage cell');

    const wifi = kernel.transformMastheadSection(
      '<div class="qr-card"><div class="qr-head"><h2>In-card title</h2></div></div>',
      'wifi form', // strict → wrapped → depth-aware
    );
    assert.doesNotMatch(wifi, /cell-masthead/, 'a strict component leaves its in-card h2 unlifted');
    assert.match(wifi, /<div class="qr-head"><h2>In-card title<\/h2>/, 'the in-card h2 stays put');
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
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><p><code>A subtitle after the heading<\/code><\/p><hr class="masthead-rule"><\/div>/);
  });

  // issue #1199: citation-card/redline/regulatory-update own their trailing
  // code-only paragraph as dedicated citation/scope-label chrome — it must
  // NOT be captured as the generic masthead subtitle, or their own
  // `.cell-stage > p:has(> code:only-child)` CSS never sees it.
  test('OWN_TRAILING_LABEL components: the trailing code-only <p> is NOT lifted into the masthead — it stays in .cell-stage', () => {
    for (const name of ['citation-card', 'redline', 'regulatory-update']) {
      const inner = '<h2>Title</h2><p><code>Citation ref</code></p><blockquote><p>Quote.</p></blockquote>';
      const out = kernel.transformMastheadSection(inner, `${name} form`);
      assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><hr class="masthead-rule"><\/div>/, `${name}: h2 still lifts alone`);
      assert.match(
        out,
        /<div class="cell-stage"><p><code>Citation ref<\/code><\/p><blockquote><p>Quote\.<\/p><\/blockquote><\/div>$/,
        `${name}: the citation paragraph stays as the first child of .cell-stage, not the masthead`,
      );
    }
  });

  test('a leading eyebrow on an OWN_TRAILING_LABEL component is still lifted normally — only the trailing label is exempt', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><p><code>Citation ref</code></p>';
    const out = kernel.transformMastheadSection(inner, 'citation-card form');
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><hr class="masthead-rule"><\/div>/);
    assert.match(out, /<div class="cell-stage"><p><code>Citation ref<\/code><\/p><\/div>$/);
  });

  test('the OWN_TRAILING_LABEL exemption does not affect unrelated components', () => {
    const inner = '<h2>Title</h2><p><code>Subtitle</code></p><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'kpi form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><p><code>Subtitle<\/code><\/p><hr class="masthead-rule"><\/div>/);
  });

  test('a leading eyebrow (code-only <p> BEFORE h2) is unaffected by subtitle scoping', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><hr class="masthead-rule"><\/div>/);
  });

  test('both a leading eyebrow AND a trailing subtitle are captured, in order', () => {
    const inner = '<p><code>Kicker</code></p><h2>Title</h2><p><code>Subtitle</code></p><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><p><code>Subtitle<\/code><\/p><hr class="masthead-rule"><\/div>/);
    // and the subtitle is NOT left behind in the stage body
    assert.match(out, /<div class="cell-stage"><p>Body\.<\/p><\/div>$/);
  });

  test('a subtitle-shaped paragraph further down the body (not immediately after h2) is real content, left alone', () => {
    const inner = '<h2>Title</h2><p>Intro.</p><p><code>Not a subtitle</code></p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><hr class="masthead-rule"><\/div>/);
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
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><hr class="masthead-rule"><\/div>/);
    assert.doesNotMatch(out, /masthead-lede"><p>/, 'nested <p> must not become the eyebrow');
    assert.match(out, /<div class="cell-stage"><div class="custom"><p><code>Nested<\/code><\/p><\/div><p>Body\.<\/p><\/div>$/);
  });

  test('a code-only <p> nested inside a loose <li> before h2 is real content, not hoisted as the eyebrow', () => {
    const inner = '<ul><li><p><code>Nested</code></p></li></ul><h2>Title</h2><p>Body.</p>';
    const out = kernel.transformMastheadSection(inner, 'content form');
    assert.match(out, /<div class="masthead-lede"><h2>Title<\/h2><hr class="masthead-rule"><\/div>/);
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
    assert.match(out, /<div class="masthead-lede"><p><code>Kicker<\/code><\/p><h2>Title<\/h2><hr class="masthead-rule"><\/div>/);
    assert.match(out, /<div class="cell-stage"><div class="tag">NEW<\/div><\/div>$/);
  });
});

describe('masthead-lift — the title lift is DEPTH-AWARE (only a top-level h2)', () => {
  // The masthead kernel must lift ONLY a section-level (direct-child) <h2> — the
  // slide's masthead title — never one NESTED inside a component's own card/div.
  // A canvas component that rebuilds its section before mastheadLift runs (e.g.
  // the QR-card connect components wifi/contact) emits its own title as an
  // in-card `.qr-head > h2`; a depth-blind first-`<h2>` regex would yank that
  // nested title into a masthead band (the AE 80,641 wifi regression this fix
  // closes). See lib/forms/cell/masthead/masthead.transform.js `findTopLevelH2`,
  // mirroring the existing depth-aware `findTopLevelEyebrow`.

  test('extractH2 lifts a TOP-LEVEL <h2>', () => {
    const { el, html } = kernel.extractH2('<h2>Title</h2><p>Body.</p>');
    assert.equal(el, '<h2>Title</h2>');
    assert.equal(html, '<p>Body.</p>');
  });

  test('extractH2 does NOT lift an <h2> nested inside a <div>', () => {
    const input = '<div class="qr-card"><div class="qr-head"><h2>In-card title</h2></div></div>';
    const { el, html } = kernel.extractH2(input);
    assert.equal(el, '', 'a nested in-card <h2> must not be extracted as the masthead title');
    assert.equal(html, input, 'the input is returned untouched when no top-level h2 exists');
  });

  test('extractH2 lifts the top-level <h2> and SKIPS a nested one that precedes it', () => {
    // A nested h2 appearing (in source order) before a genuine top-level h2 must
    // not shadow it — the depth scan skips the nested one and lifts the real title.
    const input = '<div><h2>Nested</h2></div><h2>Real title</h2><p>Body.</p>';
    const { el, html } = kernel.extractH2(input);
    assert.equal(el, '<h2>Real title</h2>');
    assert.equal(html, '<div><h2>Nested</h2></div><p>Body.</p>');
  });

  test('a rebuilt QR-card section (nested title) gets NO masthead band, and its card wraps into the stage', () => {
    // Shape mirrors wifi.transform.js renderCard output: title lives in
    // `.qr-head > h2`, no top-level h2. As a conformance:strict canvas, the card
    // wraps into `.cell-stage`; the nested title stays put (no band).
    const inner = '<div class="qr-card wifi-card"><div class="qr-head"><h2>Join the room.</h2></div><div class="qr-body">fields</div></div>';
    const out = kernel.transformMastheadSection(inner, 'wifi form');
    assert.doesNotMatch(out, /cell-masthead/, 'no masthead band — the nested title is not a top-level h2');
    assert.match(out, /^<div class="cell-stage"><div class="qr-card wifi-card">/, 'the card wraps into the stage cell');
    assert.match(out, /<div class="qr-head"><h2>Join the room\.<\/h2><\/div>/, 'the title stays in-card, untouched');
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

  // diagram (conformance:strict VIZ canvas) — UNLIKE the QR cards, its title is a
  // SECTION-LEVEL <h2> that DOES lift into masthead-lede, while its body (the
  // Mermaid SVG + Key Insight blockquote) wraps into .cell-stage. Both render
  // paths must agree: engine (transformMastheadSection) and web (applyToDom).
  test('diagram (strict canvas): title lifts into masthead-lede, body wraps into .cell-stage — engine == web', () => {
    const inner =
      '<h2>How a signal moves.</h2>' +
      '<div class="mermaid-svg"><svg></svg></div>' +
      '<blockquote><p>Key insight.</p></blockquote>';
    // engine (HTML-string) path
    const engineOut = kernel.transformMastheadSection(inner, 'diagram form');
    assert.match(engineOut, /<div class="cell-masthead"><div class="masthead-lede"><h2>How a signal moves\.<\/h2>/, 'title lifts into masthead-lede');
    assert.match(engineOut, /<div class="cell-stage"><div class="mermaid-svg"><svg><\/svg><\/div><blockquote>/, 'SVG + Key Insight wrap into the stage cell');
    // web (DOM) path
    const doc = dom(`<section class="diagram form">${inner}</section>`);
    adapter.applyToDom(doc);
    const sec = doc.querySelector('section.diagram');
    assert.ok(sec.querySelector(':scope > .cell-masthead .masthead-lede > h2'), 'DOM: title in masthead-lede');
    assert.ok(sec.querySelector(':scope > .cell-stage > .mermaid-svg'), 'DOM: SVG in the stage cell');
    assert.ok(sec.querySelector(':scope > .cell-stage > blockquote'), 'DOM: Key Insight in the stage cell');
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

  test('DOM path: OWN_TRAILING_LABEL components keep the trailing code-only <p> in .cell-stage, not the masthead', () => {
    for (const name of ['citation-card', 'redline', 'regulatory-update']) {
      const doc = dom(`<section class="${name} form"><h2>Title</h2><p><code>Citation ref</code></p><p>Body.</p></section>`);
      adapter.applyToDom(doc);
      const lede = doc.querySelector('.masthead-lede');
      assert.equal(lede.children.length, 2, `${name}: lede has only h2 + hr`);
      assert.equal(lede.children[0].tagName, 'H2');
      assert.equal(lede.children[1].tagName, 'HR');
      const stage = doc.querySelector('.cell-stage');
      assert.equal(stage.children[0].tagName, 'P');
      assert.equal(stage.children[0].textContent, 'Citation ref');
    }
  });

  test('DOM path and HTML-string kernel agree on the OWN_TRAILING_LABEL exemption', () => {
    const section = '<section class="redline form"><h2>Title</h2><p><code>Citation ref</code></p><p>Body.</p></section>';
    const engineOut = sectionOuterHtml(adapter.applyToHtml(section));
    const domDoc = dom(section);
    adapter.applyToDom(domDoc);
    assert.equal(engineOut, domDoc.querySelector('section').outerHTML,
      'the engine (HTML-string) and runtime (DOM-walk) paths must converge on identical DOM');
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
      'HR:', // the heading-rule <hr>, always the last lede child
    ]);
    assert.equal(doc.querySelector('.cell-stage').textContent, 'Body.');
  });

  // Form-migration audit (2026-07-09): the DOM path's `section.form` selector
  // had no depth guard (unlike form-default.js's `section:not(section
  // section)`), so a literal nested `<section class="form">` an author
  // writes inside slide content (lib/core/section-walk.js's own documented
  // scenario) was lifted independently on the runtime path — a divergence
  // from the HTML-string kernel, which only ever touches top-level sections.
  test('DOM path leaves a literal nested <section class="form"> untouched, matching the HTML kernel', () => {
    const inner = '<h2>Outer title</h2><p>Outer body.</p><section class="form"><h2>Inner literal</h2><p>inner body</p></section>';
    const htmlResult = kernel.applyToRenderedHtml(`<section class="form">${inner}</section>`);

    const doc = dom(`<section class="form">${inner}</section>`);
    adapter.applyToDom(doc);
    const domResult = doc.body.innerHTML;

    // The inner literal section keeps its bare, unlifted shape on BOTH paths.
    assert.match(domResult, /<section class="form"><h2>Inner literal<\/h2><p>inner body<\/p><\/section>/);
    assert.match(htmlResult, /<section class="form"><h2>Inner literal<\/h2><p>inner body<\/p><\/section>/);
    // Only the OUTER section gets a masthead band (once, not twice).
    assert.equal(doc.querySelectorAll('.cell-masthead').length, 1);
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

describe('chart .viz-frame hoist — engine↔web parity (HARD RULE #1)', () => {
  // .viz-frame merge (engineering/decisions/2026-07-15-viz-frame-merge.md): the
  // chart-family transform emits eyebrow + h2 + subtitle as TOP-LEVEL chrome, and
  // `chart-frame` is a wrapping Form, so the masthead lift hoists the chrome into a
  // `.cell-masthead > .masthead-lede` band and wraps the figure into `.cell-stage` —
  // the same Frame/Cell structure diagram uses. Both render paths — the HTML-string
  // engine (chart-family.applyToHtml → masthead-lift.applyToHtml) AND the runtime DOM
  // walk (chart-family.applyToDom → masthead-lift.applyToDom) — must agree byte-for-byte
  // on the resulting cell DOM (the depth-aware lift + `:scope > h2` DOM mirror converge).

  // Form-ON chart carrying an eyebrow + title + PLAIN-TEXT subtitle — hoisted into the
  // band. The subtitle is deliberately plain text (not code-wrapped): chart-family wraps
  // it as a plain `.chart-subtitle`, the common authoring case, which the DOM mirror only
  // hoists via the .viz-frame `.chart-subtitle` branch — so this case gates the engine↔web
  // parity of that branch (a code-wrapped subtitle would pass via the pre-existing
  // code-only path and leave the plain-text branch untested).
  const CHART_INNER =
    '<p><code>H1 2026</code></p><h2>Chart title</h2><p>A subtitle</p>' +
    '<ul><li>Alpha <code>92</code> <code>on-track</code></li>' +
    '<li>Beta <code>40</code> <code>at-risk</code></li></ul>';
  const SECTION = `<section id="1" class="progress form" data-lattice-slide="1">${CHART_INNER}</section>`;

  function engineOut() {
    let html = chartFamily.applyToHtml(SECTION);
    html = adapter.applyToHtml(html);
    return sectionOuterHtml(html);
  }

  function runtimeOut() {
    const doc = dom(SECTION);
    chartFamily.applyToDom(doc);
    adapter.applyToDom(doc);
    return doc.querySelector('section').outerHTML;
  }

  test('both paths produce byte-identical section DOM', () => {
    assert.equal(engineOut(), runtimeOut(),
      'the engine (HTML-string) and runtime (DOM-walk) paths must converge on identical chart DOM');
  });

  test('both paths hoist chrome into masthead-lede + wrap the body in cell-stage, in order', () => {
    for (const [label, out] of [['engine', engineOut()], ['runtime', runtimeOut()]]) {
      const sec = dom(out).querySelector('section');
      const lede = sec.querySelector('.cell-masthead .masthead-lede');
      assert.ok(lede, `${label}: a masthead band is built for a chart`);
      const kinds = [...lede.children].map((el) => el.tagName + '.' + el.className);
      assert.deepEqual(kinds, ['P.chart-eyebrow', 'H2.', 'P.chart-subtitle', 'HR.masthead-rule'],
        `${label}: eyebrow → title → subtitle → rule, hoisted together into masthead-lede`);
      assert.equal(sec.querySelector('.chart-header'), null, `${label}: no leftover .chart-header wrapper`);
      const stage = sec.querySelector(':scope > .cell-stage');
      assert.ok(stage, `${label}: the body is wrapped in a stage cell`);
      assert.ok(stage.querySelector('.chart-body'), `${label}: .chart-body lives inside the stage cell`);
      assert.ok(sec.classList.contains('chart-frame'), `${label}: chart-frame class applied`);
    }
  });
});

/**
 * THE STAGE'S TAG — `<div>` normally, `<figure>` when the cell holds a captioned
 * graphic (semantic-HTML ADR §18.3). Two paths compute it: the string kernel's
 * `stageTag` and the DOM mirror's direct-child scan. They must agree on every input,
 * or the same deck gets a different element on the engine and the web preview — a
 * HARD RULE #1 split that renders identically and so hides from every pixel gate.
 */
describe('masthead-lift — the stage tag (figure vs div), engine == web', () => {
  const CAPTIONED =
    '<h2>Rollout</h2>' +
    '<div class="chart-body"><svg role="img"></svg></div>' +
    '<figcaption class="chart-caption">Source: Linear.</figcaption>';
  const UNCAPTIONED = '<h2>Rollout</h2><div class="chart-body"><svg role="img"></svg></div>';

  test('a captioned graphic makes the stage a <figure> on BOTH paths', () => {
    assert.match(kernel.transformMastheadSection(CAPTIONED, 'roadmap chart-frame form'),
      /<figure class="cell-stage">/, 'engine path');
    const doc = dom(`<section class="roadmap chart-frame form">${CAPTIONED}</section>`);
    adapter.applyToDom(doc);
    assert.ok(doc.querySelector('section > figure.cell-stage'), 'web path');
  });

  test('an UNcaptioned graphic keeps a <div> stage on BOTH paths', () => {
    // Restraint is the point: a <figure> with nothing to associate is an announced
    // boundary carrying no information (ADR §4A).
    assert.match(kernel.transformMastheadSection(UNCAPTIONED, 'roadmap chart-frame form'),
      /<div class="cell-stage">/, 'engine path');
    const doc = dom(`<section class="roadmap chart-frame form">${UNCAPTIONED}</section>`);
    adapter.applyToDom(doc);
    assert.ok(doc.querySelector('section > div.cell-stage'), 'web path');
    assert.equal(doc.querySelector('section > figure.cell-stage'), null, 'no figure');
  });

  test('a <figcaption> NESTED in content does not promote the stage — both paths', () => {
    // The DOM mirror only ever looks at direct children; the string kernel is
    // depth-aware for exactly this reason. A bare substring test would disagree here.
    const nested =
      '<h2>Rollout</h2>' +
      '<div class="chart-body"><figure><figcaption class="chart-caption">inner</figcaption></figure></div>';
    assert.match(kernel.transformMastheadSection(nested, 'roadmap chart-frame form'),
      /<div class="cell-stage">/, 'engine path');
    const doc = dom(`<section class="roadmap chart-frame form">${nested}</section>`);
    adapter.applyToDom(doc);
    assert.ok(doc.querySelector('section > div.cell-stage'), 'web path');
  });

  test('the stage retag survives a trailing running <footer>', () => {
    // The footer is peeled into `.cell-footer` BEFORE the tag is chosen; a footer in
    // the scanned body would sit at depth 0 and must not disturb the decision.
    const out = kernel.transformMastheadSection(
      `${CAPTIONED}<footer>src</footer>`, 'roadmap chart-frame form',
    );
    assert.match(out, /<figure class="cell-stage">/);
    assert.match(out, /<\/figure><div class="cell-footer"><footer>src<\/footer>/);
  });
});
