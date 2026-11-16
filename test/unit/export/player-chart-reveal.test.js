// The exported player's chart reveal, at the assembly seam (lib/export/player-core.mjs): it ships only
// when the deck carries a chart detail, and a deck that only NAMES the tag in prose ships nothing, so
// every other player stays byte-identical. Then the inlined script runs for real in JSDOM: it mounts,
// marks the slide's chart as a Tab stop, and a digit opens the mark's card. Real layout, hover, tap
// and the engines are in docs/e2e/player-chart-reveal.spec.ts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
const { virtualClock } = require('../../helpers/runtime-boot');

const funnel = `<figure class="funnel-chart"><svg class="funnel-svg" role="img" aria-labelledby="t" viewBox="0 0 100 60"><title id="t">Pipeline</title>
<polygon data-mark="0" data-label="Visitors" data-value="12,000" points="0,0 100,0 80,20 20,20"></polygon>
<polygon data-mark="1" data-label="Signups" data-value="4,800" points="20,20 80,20 70,40 30,40"></polygon></svg></figure>
<div class="chart-details" hidden><template class="chart-detail" data-mark="1"><li>Most come from the <strong>free trial</strong>.</li><li>Q3</li></template></div>`;
const page = (slide1) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>D</title></head><body>
<section data-lattice-slide="1" id="1" class="funnel">${slide1}</section>
<section data-lattice-slide="2" id="2"><h2>B</h2></section></body></html>`;
const build = async (slide1) => (await buildPlayerHtml({ docHtml: page(slide1), source: '---\ntheme: indaco\n---\n\n# A\n', now: 0 })).html;

test('a deck with a chart detail ships the reveal: its script, its card skin and its mount', async () => {
  const html = await build(funnel);
  assert.ok(html.includes('__latticeReveal'), 'the reveal bundle');
  assert.ok(html.includes('id="lp-reveal-css"'), 'the card skin');
  assert.ok(html.includes('lpReveal.onSlide()'), 'the slide-change hook');
});

test('a deck that only NAMES the tag in prose, or has no chart detail, ships none of it', async () => {
  const prose = await build('<p>Write a <code>&lt;template class="chart-detail"&gt;</code> under each mark.</p>');
  const plain = await build('<h1>A</h1>');
  for (const html of [prose, plain]) {
    assert.equal(html.includes('__latticeReveal'), false);
    assert.equal(html.includes('lp-reveal-css'), false);
    assert.equal(html.includes('lpReveal'), false);
  }
  // The PLAYER is byte-identical: the two decks differ in their slides (and the Read view's copy of
  // them), never in a script the player runs. The full-file golden is test/unit/export/html-player.test.js.
  const scripts = (h) => [...h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((t) => !t.startsWith('{'));
  assert.deepEqual(scripts(prose), scripts(plain));
});

test('the inlined reveal mounts, makes the chart one Tab stop, and a digit opens its card', async () => {
  const html = await build(funnel);
  const errs = [];
  let clock;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/',
    beforeParse(w) {
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
      w.onerror = (m) => errs.push(m);
      clock = virtualClock(w);
    },
  });
  await clock.settle();
  const { window: w } = dom;
  const d = w.document;
  assert.deepEqual(errs, []);
  const svg = d.querySelector('.lp-frame.lp-active .funnel-svg');
  // JSDOM lays nothing out, so the reveal sees a zero-width chart and leaves it alone; a real
  // browser gives it a box. Give it one and re-run the slide hook the player calls on every turn.
  w.SVGElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60, toJSON() {} };
  };
  d.querySelector('#lp-next')?.click();
  d.querySelector('#lp-prev')?.click();
  await clock.settle();
  assert.equal(svg.getAttribute('tabindex'), '0');
  assert.equal(svg.getAttribute('aria-labelledby'), 't', 'the chart keeps its own name');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
  const card = d.querySelector('.cenno.lattice-chart-card');
  assert.ok(card, 'the card opened');
  assert.equal(card.querySelector('[data-cenno-part=title]').textContent, 'Signups');
  assert.equal(card.querySelector('[data-cenno-part=value]').textContent, '4,800');
  assert.equal(card.querySelector('[data-cenno-part=footer]').textContent, 'Q3');
  assert.equal(card.getAttribute('role'), 'status');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }));
  assert.equal(d.querySelector('.cenno.lattice-chart-card'), null, '0 closes it');
});
