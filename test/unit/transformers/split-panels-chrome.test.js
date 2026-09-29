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
