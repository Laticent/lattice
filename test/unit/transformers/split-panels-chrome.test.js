/**
 * The running header and footer stay DIRECT children of a split section, on both render
 * paths. Nested inside `.panel-right`, the footer escaped `section.no-footer > footer`
 * (base.variants.css) and the chrome budget in split-panel.styles.css; split-compare's
 * string kernel, which only re-emits the parts it recognizes, dropped the footer outright.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const splitPanels = require('../../../lib/transformers/split-panels');
const kernel = require('../../../lib/core/split-panels');
const { extractSlideNotes } = require('../../../lib/authoring/notes-core');
const { replaceClosedComments } = require('../../../lib/core/closed-comments');

const BODY = {
  'split-panel': '<p><code>Eyebrow</code></p><h2>Headline</h2><p>Lede.</p><ul><li><strong>Point</strong><ul><li>body</li></ul></li></ul>',
  'split-compare': '<p><code>Frame</code></p><h2>Choice</h2><p>Context.</p><ul><li><strong>A</strong><ul><li>a</li></ul></li><li><strong>B</strong><ul><li>b</li></ul></li></ul><blockquote><p>Pick B.</p></blockquote>',
};

function chromeShape(section) {
  const kids = [...section.children].map(el => el.tagName === 'DIV' ? `div.${el.className}` : el.tagName.toLowerCase());
  return kids;
}

for (const layout of Object.keys(BODY)) {
  const html = `<section class="${layout}"><header>Head</header>${BODY[layout]}<footer>Foot</footer></section>`;
  const left = layout === 'split-panel' ? 'div.panel-left' : 'div.compare-left';
  const right = layout === 'split-panel' ? 'div.panel-right' : 'div.compare-right';

  describe(`${layout} — header and footer stay section children`, () => {
    test('string kernel: header first, footer after both panels, footer kept', () => {
      const out = kernel.applyToRenderedHtml(html);
      const sec = new JSDOM(out).window.document.querySelector('section');
      assert.deepEqual(chromeShape(sec), ['header', left, right, 'footer']);
      assert.equal(sec.querySelector('footer').textContent, 'Foot');
      assert.equal(sec.querySelectorAll('footer').length, 1);
    });

    test('DOM path: the same order', () => {
      const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
      splitPanels.applyToDom(doc);
      assert.deepEqual(chromeShape(doc.querySelector('section')), ['header', left, right, 'footer']);
    });

    test('no footer authored: nothing invented', () => {
      const bare = html.replace('<footer>Foot</footer>', '');
      const sec = new JSDOM(kernel.applyToRenderedHtml(bare)).window.document.querySelector('section');
      assert.equal(sec.querySelectorAll('footer').length, 0);
    });
  });
}

describe('an author <footer> inside a quote is content, not chrome', () => {
  const quote = '<blockquote><p>We shipped it.</p><footer>— Ada, CTO</footer></blockquote>';
  for (const [layout, body] of [
    ['split-panel', `<h2>H</h2>${quote}<ul><li><strong>P</strong></li></ul>`],
    ['split-panel pullquote', `${quote}<ul><li>P</li></ul>`],
    ['split-compare', `<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>${quote}`],
  ]) {
    test(`${layout}: the attribution stays in its quote; the running footer is hoisted`, () => {
      const html = `<section class="${layout}"><header>Head</header>${body}<footer>Run</footer></section>`;
      const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      assert.equal(sec.querySelector(':scope > footer').textContent, 'Run');
      assert.equal(sec.querySelector('blockquote > footer').textContent, '— Ada, CTO');
      assert.equal(sec.querySelectorAll('footer').length, 2);
    });
  }

  test('no running footer: a quote attribution that ends the slide is not taken for one', () => {
    const html = `<section class="split-panel pullquote">${quote}</section>`;
    const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    assert.equal(sec.querySelector(':scope > footer'), null);
    assert.equal(sec.querySelector('blockquote > footer').textContent, '— Ada, CTO');
  });
});

// String kernel and DOM path must agree (HARD RULE #1). Structural signature: tag + classes +
// text, depth-first, so attribute order and whitespace do not count.
function signature(node) {
  if (node.nodeType === 3) { const t = node.textContent.trim(); return t ? `#${t}` : ''; }
  if (node.nodeType !== 1) return '';
  const cls = node.className ? `.${[...node.classList].sort().join('.')}` : '';
  return `${node.tagName}${cls}(${[...node.childNodes].map(signature).filter(Boolean).join(',')})`;
}

describe('the two render paths agree on which <footer> is the running one', () => {
  const cases = {
    'author footer mid-body + running footer': ['split-panel', '<h2>H</h2><ul><li><strong>P</strong></li></ul><footer>Source: Gartner 2026</footer><footer>Run</footer>'],
    'author footer as a quote attribution': ['split-panel', '<h2>H</h2><blockquote><p>q</p><footer>— Ada</footer></blockquote><ul><li><strong>P</strong></li></ul><footer>Run</footer>'],
    'split-compare with a running footer': ['split-compare', '<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote><footer>Run</footer>'],
    'no running footer': ['split-panel', '<h2>H</h2><ul><li><strong>P</strong></li></ul>'],
  };
  for (const [name, [cls, body]] of Object.entries(cases)) {
    test(name, () => {
      const html = `<section class="${cls}"><header>Head</header>${body}</section>`;
      const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
      splitPanels.applyToDom(doc);
      assert.equal(signature(doc.querySelector('section')), signature(str));
    });
  }

  test('DOM path: engine chrome after the footer does not stop it being the running one', () => {
    const doc = new JSDOM('<!DOCTYPE html><body><section class="split-panel"><h2>H</h2><ul><li>P</li></ul><footer>Run</footer><span class="lat-pagination">3</span><div class="marker-rail" data-lattice-berth></div></section></body>').window.document;
    splitPanels.applyToDom(doc);
    const sec = doc.querySelector('section');
    assert.equal(sec.querySelector(':scope > footer')?.textContent, 'Run');
    assert.equal(sec.querySelector('.panel-right footer'), null);
  });
});


describe('split-compare: an author block the layout does not claim', () => {
  // The frame label, heading, lede, option list and verdict each have a slot. Anything else
  // (a second paragraph, a note under the options) used to vanish on the string path and sit
  // IN FRONT of the panels on the DOM path. Both now carry it in the options zone, after the
  // options and before the verdict, in source order, which is where split-panel's own
  // unclaimed blocks go (its supporting zone).
  const cases = {
    'a second paragraph before the options': '<h2>H</h2><p>C.</p><p>Stray one.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote>',
    'a note after the options': '<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><p>Stray one.</p><blockquote><p>V.</p></blockquote>',
    'a table and a second list after the verdict': '<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote><table><tr><td>Stray one.</td></tr></table><ol><li>Stray two.</li></ol>',
    'no verdict': '<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><p>Stray one.</p>',
    'a heading above the context paragraph': '<h2>H</h2><h6>Stray one.</h6><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote>',
    'a blockquote inside an option': '<h2>H</h2><p>C.</p><ul><li><strong>A</strong><blockquote><p>Nested.</p></blockquote></li><li><strong>B</strong></li></ul><p>Stray one.</p><blockquote><p>V.</p></blockquote>',
    'a verdict with its own bullets above the options': '<h2>H</h2><p>C.</p><blockquote><p>Pick B, because:</p><ul><li>cost</li><li>latency</li></ul></blockquote><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><p>Stray one.</p>',
    'a second blockquote after the verdict': '<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote><blockquote><p>Stray one.</p></blockquote>',
    // The option list is the first TOP-LEVEL list, as the DOM path reads it (`:scope > ul`). A list
    // inside raw HTML above the options used to become the option cards on the string path.
    'a list inside a raw div above the options': '<h2>H</h2><p>C.</p><div><p>Stray one.</p><ul><li>x</li><li>y</li></ul></div><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote>',
    'a list inside a table cell above the options': '<h2>H</h2><p>C.</p><table><tr><td>Stray one.<ul><li>x</li><li>y</li></ul></td></tr></table><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote>',
  };
  for (const [name, body] of Object.entries(cases)) {
    const html = `<section class="split-compare"><header>Head</header>${body}<footer>Run</footer></section>`;
    test(`${name}: both paths agree`, () => {
      const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
      splitPanels.applyToDom(doc);
      assert.equal(signature(doc.querySelector('section')), signature(str));
    });
    test(`${name}: kept, inside the options zone, before the verdict`, () => {
      const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      assert.deepEqual(chromeShape(sec), ['header', 'div.compare-left', 'div.compare-right', 'footer']);
      const right = sec.querySelector('.compare-right');
      assert.match(right.textContent, /Stray one\./);
      const kids = [...right.children].map(el => el.className || el.tagName.toLowerCase());
      assert.equal(kids[0], 'options');
      if (right.querySelector('.verdict')) assert.equal(kids[kids.length - 1], 'verdict');
    });
  }

  test('the verdict is the top-level blockquote, and the context paragraph stays in the panel', () => {
    const html = `<section class="split-compare">${cases['a blockquote inside an option']}</section>`;
    const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    assert.equal(sec.querySelector('.verdict').textContent.trim(), 'V.');
    assert.match(sec.querySelector('.option').textContent, /Nested\./);
    const eyebrowed = new JSDOM(kernel.applyToRenderedHtml(`<section class="split-compare">${cases['a heading above the context paragraph']}</section>`)).window.document;
    assert.equal(eyebrowed.querySelector('.compare-left p')?.textContent, 'C.');
  });

  // A speaker note is still a raw comment when the split kernel runs. The kernel rebuilds the section
  // from its slots, and it used to drop every comment on the way: notes on this one layout never
  // reached an export (found by the checker on #2457).
  test('string path: a speaker note survives the rebuild and notes-core reads it', () => {
    const html = '<section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><!-- say this --><blockquote><p>V.</p></blockquote></section>';
    const out = kernel.applyToRenderedHtml(html);
    assert.deepEqual(extractSlideNotes([out]), ['say this']);
    // Lifted ahead of both panels, where the DOM path leaves the comment node; the slots are unchanged.
    const sec = new JSDOM(out).window.document.querySelector('section');
    assert.equal(sec.firstChild.nodeType, 8);
    assert.deepEqual(chromeShape(sec), ['div.compare-left', 'div.compare-right']);
    assert.equal(sec.querySelector('.verdict').textContent.trim(), 'V.');
  });

  test('string path: the `<!-- stress-slide -->` specimen marker survives the rebuild', () => {
    const html = '<section class="split-compare"><!-- stress-slide --><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul></section>';
    assert.match(kernel.applyToRenderedHtml(html), /<!-- stress-slide -->/);
  });

  test('string path: a section with no comment keeps its bytes', () => {
    const html = '<section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul></section>';
    assert.equal(kernel.applyToRenderedHtml(html), '<section class="split-compare"><div class="compare-left"><h2>H</h2><p>C.</p></div><div class="compare-right"><div class="options"><div class="option"><strong>A</strong></div><div class="option preferred"><strong>B</strong></div></div></div></section>');
  });

  // The context paragraph is the first TOP-LEVEL `<p>`. The mask that hides nested blocks from that
  // search matched non-greedily, so it stopped at an option's inner `</ul>` and left the rest of the
  // item open to it: a loose option with a nested list and a trailing paragraph lost that paragraph
  // to the dark panel on the string path when the slide had no context paragraph of its own. The
  // input is the engine's shape after slotLabelLift (a real render of that markdown).
  test('a loose option with a nested list and a trailing paragraph: both paths agree', () => {
    const html = '<section class="split-compare"><h2>H</h2><ul><li><strong>A</strong><ul><li>x</li></ul><p>A tail.</p></li><li><p><strong>B</strong></p></li></ul><blockquote><p>V.</p></blockquote></section>';
    const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
    splitPanels.applyToDom(doc);
    assert.equal(signature(doc.querySelector('section')), signature(str));
    assert.equal(str.querySelector('.compare-left p'), null, 'no context paragraph was authored');
    assert.match(str.querySelector('.option').textContent, /A tail\./);
  });

  // split-panel reads its lede with the speaker notes still in the section. A note that names a
  // block tag is not markup: it must not hide the lede from the top-level read (the DOM path never
  // sees inside a comment). Found by the checker on #2478.
  test('split-panel: a speaker note that names a block tag leaves the lede in the panel, on both paths', () => {
    for (const note of ['<!-- wrap this in a <div> later -->', '<!-- a </div> and a <ul> -->', '<!-- <p>not the lede</p> -->']) {
      const html = `<section class="split-panel"><h2>H</h2>${note}<p>Lede.</p><ul><li>one</li><li>two</li></ul></section>`;
      const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      assert.equal(str.querySelector('.panel-left p')?.textContent, 'Lede.', note);
      const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
      splitPanels.applyToDom(doc);
      assert.equal(signature(doc.querySelector('section')), signature(str), note);
    }
  });

  test('a verdict written above the options keeps its bullets; the options stay the options', () => {
    const html = `<section class="split-compare">${cases['a verdict with its own bullets above the options']}</section>`;
    const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    assert.deepEqual([...sec.querySelectorAll('.option > strong')].map(e => e.textContent), ['A', 'B']);
    assert.equal(sec.querySelectorAll('.verdict li').length, 2);
  });

  test('string path: an empty comment (`<!-->`, `<!--->`) does not swallow what follows', () => {
    for (const c of ['<!-->', '<!--->']) {
      const html = `<section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>${c}<p>KEEP ME</p></section>`;
      assert.match(kernel.applyToRenderedHtml(html), /KEEP ME/);
    }
  });

  test('string path: a speaker note that mentions markup is not read as markup', () => {
    const html = '<section class="split-compare"><h2>H</h2><!-- say the quote is a <blockquote> and the list a <ul> --><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>Go with B.</p></blockquote></section>';
    const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    assert.deepEqual([...sec.querySelectorAll('.option > strong')].map(e => e.textContent), ['A', 'B']);
    assert.equal(sec.querySelector('.compare-left p')?.textContent, 'C.');
    assert.equal(sec.querySelector('.verdict').textContent.trim(), 'Go with B.');
    assert.ok(!sec.textContent.includes('-->'), 'no comment tail leaks into the visible text');
  });

  test('string path: a comment ahead of the header does not move or drop the header', () => {
    const html = '<section class="split-compare">\n<!-- n -->\n<header>H</header><h2>T</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote><footer>F</footer></section>';
    const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    assert.deepEqual(chromeShape(sec), ['header', 'div.compare-left', 'div.compare-right', 'footer']);
  });

  test('string path: `--!>` closes a comment, as in HTML', () => {
    const html = '<section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><!-- n --!><p>KEEP ME</p></section>';
    assert.match(kernel.applyToRenderedHtml(html), /KEEP ME/);
  });

  // Only CLOSED comments are carried. An unclosed opener re-emitted ahead of the panels would comment
  // out the whole slide, and a stitched one (`<!<!-- x -->--`) must not come back as a new opener.
  test('string path: no unclosed comment opener survives, stitched or unterminated', () => {
    for (const tail of ['<p>A</p><!<!-- x -->-- y -->', '<p>A</p><!-- never closed <p>B</p>']) {
      const html = `<section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>${tail}</section>`;
      const out = kernel.applyToRenderedHtml(html);
      assert.doesNotMatch(replaceClosedComments(out, () => ''), /<!--/);
      const sec = new JSDOM(out).window.document.querySelector('section');
      assert.equal(sec.querySelector('.compare-right > p')?.textContent, 'A');
      assert.ok(!sec.textContent.includes('--'), 'no comment fragment leaks into the visible text');
    }
  });

  test('DOM path: engine chrome after the footer is not treated as an author block', () => {
    const doc = new JSDOM('<!DOCTYPE html><body><section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><footer>Run</footer><span class="lat-pagination">3</span><div class="marker-rail" data-lattice-berth></div></section></body>').window.document;
    splitPanels.applyToDom(doc);
    const sec = doc.querySelector('section');
    assert.equal(sec.querySelector('.compare-right .lat-pagination'), null);
    assert.equal(sec.querySelector('.compare-right [data-lattice-berth]'), null);
  });
});

// The verdict (split-compare) and the pull quote (split-panel `pullquote`) are the first TOP-LEVEL
// `<blockquote>`, as the DOM path reads them (`:scope > blockquote`). The string path used to take
// the first one anywhere and stop at the first `</blockquote>`, so a quote in raw HTML above the
// slot became the slot, and a quote nested in the slot cut it short.
describe('the quote slot is the first top-level blockquote, whole', () => {
  const OPTIONS = '<ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>';
  const NESTED = '<blockquote><p>Q.</p><blockquote><p>Inner.</p></blockquote><p>Tail.</p></blockquote>';
  const cases = {
    'split-compare: a quote inside a raw div above the verdict': ['split-compare', `<h2>H</h2><p>C.</p><div><blockquote><p>Stray.</p></blockquote></div>${OPTIONS}<blockquote><p>Q.</p></blockquote>`, 'verdict'],
    'split-compare: a quote in a table cell after the options': ['split-compare', `<h2>H</h2><p>C.</p>${OPTIONS}<table><tr><td><blockquote><p>Stray.</p></blockquote></td></tr></table><blockquote><p>Q.</p></blockquote>`, 'verdict'],
    'split-compare: a quote nested in the verdict': ['split-compare', `<h2>H</h2><p>C.</p>${OPTIONS}${NESTED}`, 'verdict'],
    'split-compare: a speaker note that names a blockquote': ['split-compare', `<h2>H</h2><p>C.</p>${OPTIONS}<!-- <blockquote> soon --><blockquote><p>Q.</p></blockquote>`, 'verdict'],
    'split-panel pullquote: a quote inside a raw div above the pull quote': ['split-panel pullquote', '<div><blockquote><p>Stray.</p></blockquote></div><blockquote><p>Q.</p></blockquote><ul><li>one</li></ul>', 'panel-left'],
    'split-panel pullquote: a quote inside a list item above the pull quote': ['split-panel pullquote', '<ul><li>one<blockquote><p>Stray.</p></blockquote></li></ul><blockquote><p>Q.</p></blockquote>', 'panel-left'],
    'split-panel pullquote: a quote nested in the pull quote': ['split-panel pullquote', `${NESTED}<p><code>Ada</code></p><ul><li>one</li></ul>`, 'panel-left'],
    // An unclosed block inside the quote: markdown-it's output for `> <details>` with no close. The
    // browser closes the block at `</blockquote>`; masking it to the end hid the quote's own close.
    'split-compare: an unclosed details inside the verdict': ['split-compare', `<h2>H</h2><p>C.</p>${OPTIONS}<blockquote><p>Q.</p><details><summary>More</summary>hidden</blockquote><p>After.</p>`, 'verdict'],
    'split-panel pullquote: an unclosed details inside the pull quote': ['split-panel pullquote', '<blockquote><p>Q.</p><details><summary>More</summary>hidden</blockquote><p>After.</p><ul><li>one</li></ul>', 'panel-left'],
    'split-panel pullquote: an unclosed div inside the pull quote': ['split-panel pullquote', '<blockquote><p>Q.</p><div>x</blockquote><p>After.</p><ul><li>one</li></ul>', 'panel-left'],
    'split-panel pullquote: a speaker note that names a blockquote': ['split-panel pullquote', '<!-- a <blockquote> here? --><blockquote><p>Q.</p></blockquote><ul><li>one</li></ul>', 'panel-left'],
  };
  for (const [name, [cls, body, slot]] of Object.entries(cases)) {
    const html = `<section class="${cls}"><header>Head</header>${body}<footer>Run</footer></section>`;
    test(`${name}: both paths agree`, () => {
      const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
      splitPanels.applyToDom(doc);
      assert.equal(signature(doc.querySelector('section')), signature(str));
    });
    test(`${name}: the slot holds the top-level quote, whole`, () => {
      const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      const quote = sec.querySelector(`.${slot} > blockquote`);
      assert.ok(quote, 'the slot has its quote');
      assert.match(quote.textContent, /^\s*Q\./);
      assert.doesNotMatch(quote.textContent, /Stray/);
      if (body.includes('Inner.')) assert.match(quote.textContent, /Inner\.\s*Tail\./);
      if (body.includes('Stray.')) assert.match(sec.textContent, /Stray\./, 'the stray quote is kept, not dropped');
      if (body.includes('After.')) assert.doesNotMatch(quote.textContent, /After\./, 'the quote stops at its own close');
    });
  }
});

// A slot inside any container the browser nests it in is not the slot. The string path used to mask
// a named list of blocks (`div`, `table`, …) and missed the rest, and read raw-text bodies and
// attribute values as markup; it now reads every slot through the shared tokenizer
// (lib/core/top-level-h2.mjs `topLevelElements`). Each arm renders both paths and compares them
// (followups.d/2478-p4-split-slot-mask-coverage.md).
describe('a slot inside a browser container or a raw-text element is not the slot, on both paths', () => {
  const Q = '<blockquote><p>Q.</p></blockquote>';
  const L = '<ul><li><strong>X</strong></li><li><strong>Y</strong></li></ul>';
  const P = '<p>Inner.</p>';
  const containers = {
    span: (x) => `<span>${x}</span>`,
    main: (x) => `<main>${x}</main>`,
    'a stray dd': (x) => `<dd>${x}</dd>`,
    'a stray li': (x) => `<li>${x}</li>`,
    template: (x) => `<template>${x}</template>`,
    'svg foreignObject': (x) => `<svg><foreignObject>${x}</foreignObject></svg>`,
    pre: (x) => `<pre>${x}</pre>`,
    script: (x) => `<script>var s = '${x}';</script>`,
    style: (x) => `<style>/* ${x} */</style>`,
    textarea: (x) => `<textarea>${x}</textarea>`,
    'an attribute value': (x) => `<figure data-x='${x}'></figure>`,
  };
  const both = (html) => {
    const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
    splitPanels.applyToDom(doc);
    return { str, dom: doc.querySelector('section') };
  };
  for (const [name, wrap] of Object.entries(containers)) {
    test(`${name}: the verdict, the options and the context paragraph`, () => {
      const html = `<section class="split-compare"><h2>H</h2>${wrap(P)}<p>C.</p>${wrap(L)}<ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>${wrap(Q)}</section>`;
      const { str, dom } = both(html);
      assert.equal(signature(str), signature(dom));
      assert.deepEqual([...str.querySelectorAll('.option > strong')].map(e => e.textContent), ['A', 'B'], 'the options are the top-level list');
      assert.equal(str.querySelector('.verdict'), null, 'no top-level quote, so no verdict');
      assert.equal(str.querySelector('.compare-left p')?.textContent, 'C.', 'the context paragraph is the top-level one');
    });
    test(`${name}: the pull quote`, () => {
      const html = `<section class="split-panel pullquote">${wrap(Q)}<blockquote><p>Real.</p></blockquote><ul><li>P</li></ul></section>`;
      const { str, dom } = both(html);
      assert.equal(signature(str), signature(dom));
      assert.equal(str.querySelector('.panel-left > blockquote')?.textContent, 'Real.');
    });
  }
  // The reverse of the containers above: HTML written inside an `<svg>` (outside a foreignObject)
  // BREAKS OUT of it in a parser, so this quote and this paragraph ARE top-level (the checker,
  // 2026-10-05; the old mask agreed by accident, the first cut of the tokenizer read did not).
  test('HTML inside an <svg> breaks out: the verdict and the lede are top-level, on both paths', () => {
    for (const html of [
      '<section class="split-compare"><h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><svg><blockquote><p>V.</p></blockquote></svg></section>',
      '<section class="split-compare"><h2>H</h2><svg><p>Breaks out.</p></svg><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul></section>',
      '<section class="split-panel"><h2>H</h2><svg><p>Breaks out.</p></svg><p>C.</p><ul><li>one</li></ul></section>',
    ]) {
      const { str, dom } = both(html);
      assert.equal(signature(str), signature(dom), html);
    }
  });

  test('an unclosed paragraph ends where the next block starts: the quote after it is top-level', () => {
    const html = '<section class="split-compare"><h2>H</h2><p>C.<ul><li><strong>A</strong></li><li><strong>B</strong></li></ul><blockquote><p>V.</p></blockquote></section>';
    const { str, dom } = both(html);
    assert.equal(signature(str), signature(dom));
    assert.equal(str.querySelector('.verdict')?.textContent, 'V.');
  });
});

// Five raw-HTML shapes where the two paths read different slots, each a parser rule the
// tokenizer did not model (followups.d/2478-p5-split-slot-parser-model-gaps.md, closed by this
// suite). markdown-it emits none of them; an author's raw HTML can. Each arm compares the whole
// rebuilt section on both paths, and pins the slot the parser puts the content in.
describe('parser shapes: both paths read the slot the parser builds', () => {
  const OPTS = '<ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>';
  const both = (html) => {
    const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
    splitPanels.applyToDom(doc);
    return { str, dom: doc.querySelector('section') };
  };
  const arm = (html, check) => {
    const { str, dom } = both(html);
    assert.equal(signature(str), signature(dom), html);
    check(str);
  };

  test('a stray </p> is an empty paragraph, and it is the lede', () => {
    for (const cls of ['split-panel', 'split-compare']) {
      arm(`<section class="${cls}"><h2>H</h2></p><p>C.</p>${OPTS}</section>`, (s) => {
        const left = s.querySelector('.panel-left, .compare-left');
        assert.equal(left.querySelector('p')?.textContent, '', `${cls}: the empty paragraph is the lede`);
        assert.equal(s.querySelector('.panel-right > p, .compare-right > p')?.textContent, 'C.');
      });
    }
  });

  test('foster parenting: a paragraph inside a table, before its rows, is a top-level paragraph', () => {
    for (const cls of ['split-panel', 'split-compare']) {
      arm(`<section class="${cls}"><h2>H</h2><table><p>C.</p><tr><td>t</td></tr></table>${OPTS}</section>`, (s) => {
        assert.equal(s.querySelector('.panel-left > p, .compare-left > p')?.textContent, 'C.', cls);
      });
    }
    // A table row ends what was fostered out of its table: the paragraph closes at `<tr>`.
    arm(`<section class="split-panel"><h2>H</h2><table><p>C.<tr><td>t</td></tr></table><ul><li>one</li></ul></section>`, (s) => {
      assert.equal(s.querySelector('.panel-left > p')?.textContent, 'C.');
      assert.equal(s.querySelector('.panel-right td')?.textContent, 't');
    });
    // Fostered TEXT is carried into the panel on both paths, not stranded beside them.
    arm(`<section class="split-panel"><h2>H</h2><p>C.<table>X<tr><td>t</td></tr></table><ul><li>one</li></ul></section>`, (s) => {
      assert.equal(s.querySelector('.panel-left > p')?.textContent, 'C.');
      assert.match(s.querySelector('.panel-right').textContent, /X/);
    });
  });

  test('the adoption agency: `<a><ul>…</a></ul>` leaves the list, and the paragraph after it, top-level', () => {
    arm('<section class="split-panel"><h2>H</h2><a><ul><li>x</li></a></ul><p>C.</p></section>', (s) => {
      assert.equal(s.querySelector('.panel-left > p')?.textContent, 'C.');
    });
    arm(`<section class="split-compare"><h2>H</h2><a><div>x</a></div><p>C.</p>${OPTS}</section>`, (s) => {
      assert.equal(s.querySelector('.compare-left > p')?.textContent, 'C.');
    });
    // NOT modelled, and not claimed: the clone of `<a>` the parser wraps the adopted block's
    // children in. When the adopted block IS a slot (`<a><ul><li>A</li></a></ul>` as the option
    // list), the DOM path finds `<a>` children where the kernel finds `<li>`s. Recorded in the
    // tokenizer's header (lib/core/top-level-h2.mjs), with active-formatting reconstruction.
  });

  test('the lede stops at the first top-level h3-h6 on split-panel, and not on split-compare', () => {
    arm('<section class="split-panel"><h2>H</h2><h3>sig</h3><p>C.</p><ul><li>one</li></ul></section>', (s) => {
      assert.equal(s.querySelector('.panel-left > p'), null, 'a paragraph after the label is the right zone');
      assert.equal(s.querySelector('.panel-right > p')?.textContent, 'C.');
    });
    arm('<section class="split-panel"><h2>H</h2><blockquote><h3>nested</h3></blockquote><p>C.</p><ul><li>one</li></ul></section>', (s) => {
      assert.equal(s.querySelector('.panel-left > p')?.textContent, 'C.', 'a nested heading bounds nothing');
    });
    arm(`<section class="split-compare"><h2>H</h2><h6>eyebrow</h6><p>C.</p>${OPTS}</section>`, (s) => {
      assert.equal(s.querySelector('.compare-left > p')?.textContent, 'C.');
    });
  });

  test('an unclosed <li> ends at the next one, and an unclosed list at the end', () => {
    for (const list of ['<ul><li><strong>A</strong><li><strong>B</strong></ul>', '<ul><li><strong>A</strong><li><strong>B</strong>']) {
      arm(`<section class="split-compare"><h2>H</h2><p>C.</p>${list}</section>`, (s) => {
        assert.deepEqual([...s.querySelectorAll('.option > strong')].map((e) => e.textContent), ['A', 'B'], list);
      });
      arm(`<section class="split-panel"><h2>H</h2><p>C.</p>${list}</section>`, (s) => {
        assert.deepEqual([...s.querySelectorAll('.panel-right li')].map((e) => e.textContent), ['A', 'B'], list);
      });
    }
  });

  test('top-level text from raw HTML rides in the panel on both paths', () => {
    for (const cls of ['split-panel', 'split-compare']) {
      arm(`<section class="${cls}"><h2>H</h2><p>C.</p>stray${OPTS}</section>`, (s) => {
        assert.match(s.querySelector('.panel-right, .compare-right').textContent, /stray/, cls);
      });
    }
  });
});

// The checker's pass on the walk above (2026-10-05): three shapes the first cut got wrong.
describe('parser shapes: the walk does not over-reach', () => {
  const both = (html) => {
    const str = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
    splitPanels.applyToDom(doc);
    return { str, dom: doc.querySelector('section') };
  };
  test('a formatting end tag with a table open above it is ignored: nothing leaves the table', () => {
    const html = '<section class="split-compare"><h2>H</h2><p>C.</p><em><ul><table><tr><td>Keep me</td></tr></em></table></ul>Tail</section>';
    const { str, dom } = both(html);
    assert.equal(signature(str), signature(dom));
    assert.match(str.textContent, /Keep me/);
    const panel = '<section class="split-panel"><b><table></b><h2>X</h2><p>Lede</p></table><ul><li>one</li></ul></section>';
    const p = both(panel);
    assert.equal(signature(p.str), signature(p.dom));
  });
  test('a fostered paragraph closed by its table\'s </table> leaves the table its end tag', () => {
    const html = '<section class="split-panel"><h2>H</h2><table><p>C.</table><ul><li>one</li></ul><p>after</p></section>';
    const { str, dom } = both(html);
    assert.equal(signature(str), signature(dom));
    assert.equal(str.querySelector('.panel-left > p')?.textContent, 'C.');
  });
  test('text between two list items stays between them', () => {
    const html = '<section class="split-panel"><h2>H</h2><p>C.</p><ul><li>A</li>stray<li>B</li></ul></section>';
    const { str, dom } = both(html);
    assert.equal(signature(str), signature(dom));
  });
});
