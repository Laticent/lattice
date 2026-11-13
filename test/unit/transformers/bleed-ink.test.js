/**
 * The runtime half of a `bleed` slide's automatic ink (lib/transformers/bleed-ink.js): where it finds the photo on each host,
 * and which slides it leaves alone. jsdom draws no pixels, so the decision itself is held in test/unit/core/bleed-ink.test.js and
 * the browser end is checked on a real render.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const bleedInk = require('../../../lib/transformers/bleed-ink');

const doc = (body) => new JSDOM(`<body>${body}</body>`).window.document;

describe('bleed-ink finds the slide\'s photo on every host', () => {
  test('the image plugin\'s panel inside the slide (the engine, the Studio, the Playground)', () => {
    const d = doc(`<section class="content bleed"><div class="cell-stage"><div class="lattice-bg lattice-bg-full" data-lattice-media="image" style="background-image:url('a.jpg')"></div></div></section>`);
    assert.equal(bleedInk.photoUrl(d.querySelector('section')), 'a.jpg');
  });

  test('a panel inside a plugin\'s drawing is not the slide\'s photo', () => {
    const d = doc(`<section class="content bleed"><div data-lattice-plugin="x"><div class="lattice-bg" data-lattice-media="image" style="background-image:url('a.jpg')"></div></div></section>`);
    assert.equal(bleedInk.photoUrl(d.querySelector('section')), null);
  });

  test('Marp\'s background layer, across the slide\'s sibling sections (a Marp bundle)', () => {
    const d = doc(`<svg><foreignObject><section class="content bleed" data-marpit-advanced-background="background"><div><figure style="background-image:url(&quot;assets/p.jpg&quot;);"></figure></div></section></foreignObject><foreignObject><section class="content bleed" data-marpit-advanced-background="content"><h2>T</h2></section></foreignObject></svg>`);
    const content = d.querySelector('[data-marpit-advanced-background="content"]');
    assert.equal(bleedInk.slideLayers(content).length, 2);
    assert.equal(bleedInk.photoUrl(content), 'assets/p.jpg');
  });
});

describe('bleed-ink leaves the author\'s choice alone', () => {
  test('a slide whose own class names dark is never sampled; one that names no mode is', () => {
    const d = doc([
      `<section class="content bleed dark" data-class="content dark bleed"><div class="lattice-bg" data-lattice-media="image" style="background-image:url('own.jpg')"></div></section>`,
      `<section class="content bleed" data-class="content bleed"><div class="lattice-bg" data-lattice-media="image" style="background-image:url('auto.jpg')"></div></section>`,
    ].join(''));
    bleedInk.applyToDom(d);
    const [own, auto] = d.querySelectorAll('section');
    assert.equal(own.hasAttribute('data-bleed-ink-pending'), false);
    assert.equal(own.className, 'content bleed dark');
    assert.equal(auto.hasAttribute('data-bleed-ink-pending'), true, 'its photo is being read');
  });
});
