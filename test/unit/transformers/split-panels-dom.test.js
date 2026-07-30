/**
 * Unit tests for the split-panels transformer's applyToDom (DOM-walk path),
 * the runtime render path. Two layouts: split-panel (with the metric/quote/
 * steps/watermark variants) and split-compare. Mirrors the HTML-string kernel
 * in lib/core/split-panels.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const splitPanels = require('../../../lib/transformers/split-panels');
const kernel = require('../../../lib/core/split-panels');

function dom(html) {
  return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}

describe('split-panels.applyToDom — split-panel', () => {
  test('default: eyebrow span + h2 + lede go to panel-left; list to panel-right', () => {
    const doc = dom(`
      <section class="split-panel">
        <p><code>Eyebrow</code></p>
        <h2>Headline</h2>
        <p>Lede paragraph.</p>
        <ul><li>Point<ul><li>body</li></ul></li></ul>
      </section>`);
    splitPanels.applyToDom(doc);
    const sec = doc.querySelector('section.split-panel');
    const left = sec.querySelector('.panel-left');
    const right = sec.querySelector('.panel-right');
    assert.ok(left && right, 'panel-left + panel-right present');
    assert.ok(left.querySelector('.panel-eyebrow'), 'eyebrow lifted to span');
    assert.ok(left.querySelector('h2'), 'h2 in left');
    assert.ok(right.querySelector('ul > li'), 'list in right');
  });

  test('metric/steps: same panel-left/panel-right shape (variant is CSS-only)', () => {
    for (const variant of ['metric', 'steps']) {
      const doc = dom(`
        <section class="split-panel ${variant}">
          <p><code>Label</code></p>
          <h2>114</h2>
          <p>Context.</p>
          <ol><li>Item<ul><li>body</li></ul></li></ol>
        </section>`);
      splitPanels.applyToDom(doc);
      const sec = doc.querySelector('section.split-panel');
      assert.ok(sec.querySelector('.panel-left .panel-eyebrow'), `${variant}: eyebrow span`);
      assert.ok(sec.querySelector('.panel-right ol > li'), `${variant}: list in right`);
    }
  });

  test('quote: blockquote + cite go to panel-left', () => {
    const doc = dom(`
      <section class="split-panel pullquote">
        <blockquote><p>The quote.</p></blockquote>
        <p><code>Speaker</code></p>
        <ul><li>Implication<ul><li>body</li></ul></li></ul>
      </section>`);
    splitPanels.applyToDom(doc);
    const left = doc.querySelector('section.split-panel .panel-left');
    assert.ok(left.querySelector('blockquote'), 'blockquote in left');
    assert.ok(left.querySelector('cite'), 'cite in left');
    assert.ok(doc.querySelector('.panel-right ul > li'), 'implications in right');
  });

  test('watermark: watermark glyph + h2 in panel-left', () => {
    const doc = dom(`
      <section class="split-panel watermark">
        <h2>Scorecard</h2>
        <h5>Rubric</h5>
        <ul><li>Point<ul><li>body</li></ul></li></ul>
      </section>`);
    splitPanels.applyToDom(doc);
    const left = doc.querySelector('section.split-panel .panel-left');
    assert.ok(left.querySelector('.watermark'), 'watermark glyph present');
    assert.equal(left.querySelector('.watermark').textContent, 'S', 'first letter of h2');
    assert.ok(left.querySelector('h5') && left.querySelector('h2'), 'h5 + h2 in left');
  });
});

describe('split-panels.applyToDom — split-compare', () => {
  test('ul items become .option divs (second .preferred), blockquote → .verdict', () => {
    const doc = dom(`
      <section class="split-compare">
        <p><code>Decision</code></p>
        <h2>Choice</h2>
        <p>Context.</p>
        <ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>
        <blockquote><p>Recommend B.</p></blockquote>
      </section>`);
    splitPanels.applyToDom(doc);
    const sec = doc.querySelector('section.split-compare');
    assert.ok(sec.querySelector('.compare-left .frame-label'), 'frame label');
    const opts = sec.querySelectorAll('.compare-right .option');
    assert.equal(opts.length, 2, 'two option divs');
    assert.ok(opts[1].classList.contains('preferred'), 'second is preferred');
    assert.ok(sec.querySelector('.compare-right .verdict'), 'verdict card');
  });
});

describe('split-panels.applyToDom — guards', () => {
  test('idempotent: a second pass is a no-op', () => {
    const doc = dom(`
      <section class="split-panel">
        <h2>H</h2>
        <ul><li>P<ul><li>b</li></ul></li></ul>
      </section>`);
    splitPanels.applyToDom(doc);
    const once = doc.querySelector('section.split-panel').innerHTML;
    splitPanels.applyToDom(doc);
    assert.equal(doc.querySelector('section.split-panel').innerHTML, once, 'second pass no-op');
  });

  test('safely returns on null / non-DOM root', () => {
    assert.doesNotThrow(() => splitPanels.applyToDom(null));
    assert.doesNotThrow(() => splitPanels.applyToDom({}));
  });

  test('non-split sections are left untouched', () => {
    const doc = dom(`<section class="cards-grid"><ul><li>x</li></ul></section>`);
    splitPanels.applyToDom(doc);
    assert.ok(!doc.querySelector('.panel-left'), 'no panel wrappers added');
  });
});

// ── proof sequencing on the DOM path ───────────────────────────────────────────
//
// `cat-N` on a `split-panel proof` slide is assigned from the slide's ORDER among
// the deck's proof slides. The DOM walk had NO coverage at all until #1268: the
// kernel comment, this file's own header, and split-panel-proof-sequence.test.js
// all claimed a "parity test" held the two implementations together, and none
// existed — deleting the entire sequencing loop broke no test. The DOM walk now
// calls the kernel's `proofTokensFor`, and these lock both that it behaves and
// that it AGREES with the kernel's string path, which is what was always claimed.
describe('split-panels.applyToDom — proof sequencing', () => {
  const catOf = (sec) => ([...sec.classList].find((c) => /^cat-[1-8]$/.test(c)) ?? '');
  const run = (html) => {
    const doc = dom(html);
    splitPanels.applyToDom(doc);
    return [...doc.querySelectorAll('section')];
  };

  test('each proof slide in a run takes the next categorical slot, in document order', () => {
    const secs = run(
      ['a', 'b', 'c'].map((k) => `<section class="split-panel proof"><h2>${k}</h2></section>`).join(''),
    );
    assert.deepEqual(secs.map(catOf), ['cat-1', 'cat-2', 'cat-3']);
  });

  test('capstone implies proof and consumes a slot', () => {
    const secs = run(
      '<section class="split-panel proof"><h2>a</h2></section>' +
      '<section class="split-panel capstone"><h2>b</h2></section>',
    );
    assert.ok(secs[1].classList.contains('proof'), 'capstone gains proof');
    assert.deepEqual(secs.map(catOf), ['cat-1', 'cat-2']);
  });

  test('an authored cat-N wins AND still consumes its slot, so later slides do not shift', () => {
    // The load-bearing half: if a pinned slide did not advance the counter, every
    // slide after it would slide back one hue. This is also the path the Studio's
    // single-slide pin rides (#1268), so it has to hold on the DOM walk too.
    const secs = run(
      '<section class="split-panel proof"><h2>a</h2></section>' +
      '<section class="split-panel proof cat-7"><h2>b</h2></section>' +
      '<section class="split-panel proof"><h2>c</h2></section>',
    );
    assert.deepEqual(secs.map(catOf), ['cat-1', 'cat-7', 'cat-3']);
  });

  test('a split-panel that is neither proof nor capstone is untouched and consumes nothing', () => {
    const secs = run(
      '<section class="split-panel"><h2>plain</h2></section>' +
      '<section class="split-panel proof"><h2>first proof</h2></section>',
    );
    assert.equal(catOf(secs[0]), '');
    assert.equal(catOf(secs[1]), 'cat-1');
  });

  test('the run wraps back to cat-1 after eight slides', () => {
    const secs = run(
      Array.from({ length: 9 }, (_, i) => `<section class="split-panel proof"><h2>${i}</h2></section>`).join(''),
    );
    assert.deepEqual(secs.map(catOf).slice(-2), ['cat-8', 'cat-1']);
  });

  test('running the transform twice adds nothing further (idempotent)', () => {
    const doc = dom(['a', 'b'].map((k) => `<section class="split-panel proof"><h2>${k}</h2></section>`).join(''));
    splitPanels.applyToDom(doc);
    const once = [...doc.querySelectorAll('section')].map((s) => s.className);
    splitPanels.applyToDom(doc);
    assert.deepEqual([...doc.querySelectorAll('section')].map((s) => s.className), once);
  });

  test('the DOM walk and the kernel HTML pass agree slide-for-slide (real parity)', () => {
    // THE test the comments claimed existed. The kernel's streaming HTML pass is the
    // other consumer of the rule; for one deck, both must land on the same slots.
    const deck = [
      'split-panel proof', 'split-panel', 'split-panel capstone',
      'split-panel proof cat-5', 'split-panel proof', 'title',
      'split-panel proof', 'split-panel proof', 'split-panel proof',
      'split-panel proof', 'split-panel proof', 'split-panel proof',
    ];
    const html = deck.map((c) => `<section class="${c}"><h2>x</h2></section>`).join('');
    const fromHtml = [...kernel.applyToRenderedHtml(html).matchAll(/<section class="([^"]*)"/g)]
      .map((m) => (m[1].match(/cat-[1-8]/) ?? [''])[0]);
    const secs = run(html);
    deck.forEach((cls, i) => {
      assert.equal(catOf(secs[i]), fromHtml[i], `slide ${i} (${cls}) diverged from the HTML pass`);
    });
  });
});
