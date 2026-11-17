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
  // Parsed, not pattern-matched (CodeQL: a regex for <script> misses <SCRIPT> and friends); scripts are
  // read, never run. Data blocks (JSON) carry the deck itself, so only executable scripts are compared.
  const scripts = (h) =>
    [...new JSDOM(h).window.document.querySelectorAll('script')].filter((el) => !/json/i.test(el.type)).map((el) => el.textContent);
  const ran = scripts(plain);
  assert.ok(ran.length > 0, 'the comparison is not vacuous');
  assert.deepEqual(scripts(prose), ran);
});

// The checker's repro (PR #3259): an author `style` on a META item turned a link into a 9000px fixed
// overlay over the whole player. The export keeps the attribute; the reveal must never draw it.
const HOSTILE = '<li>Q3 <a id="metax" href="https://example.com" style="position:fixed;left:-3000px;top:-3000px;width:9000px;height:9000px;display:block">M</a></li>';
const hostileFunnel = funnel.replace('<li>Q3</li>', HOSTILE);

/** Build a player for `slide1`, run its scripts in JSDOM, and give SVG a box (JSDOM lays nothing out). */
async function boot(slide1) {
  const html = await build(slide1);
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
  // A real browser gives the chart a box; re-run the slide hook the player calls on every turn.
  w.SVGElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60, toJSON() {} });
  d.querySelector('#lp-next')?.click();
  d.querySelector('#lp-prev')?.click();
  await clock.settle();
  const key = (k) => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const card = () => d.querySelector('.cenno.lattice-chart-card');
  /** A card part's text, read through the shadow root it is drawn in. */
  const partText = (name) => {
    const part = card()?.querySelector(`[data-cenno-part=${name}]`);
    const host = part && [...part.querySelectorAll('*')].find((e) => e.shadowRoot);
    // The copied content sits in `.lat-desc` (beside the deck's <style> where a browser cannot adopt a sheet).
    return (host ? (host.shadowRoot.querySelector('.lat-desc')?.textContent ?? '') : (part?.textContent ?? '')).trim();
  };
  return { w, d, errs, key, card, partText, svg: d.querySelector('.lp-frame.lp-active .funnel-svg'), clock };
}

test('the inlined reveal mounts, makes the chart one Tab stop, and a digit opens its card', async () => {
  const { errs, key, card, partText, svg } = await boot(hostileFunnel);
  assert.deepEqual(errs, []);
  assert.equal(svg.getAttribute('tabindex'), '0');
  assert.equal(svg.getAttribute('aria-labelledby'), 't', 'the chart keeps its own name');
  key('2');
  assert.ok(card(), 'the card opened');
  assert.equal(card().querySelector('[data-cenno-part=title]').textContent, 'Signups');
  assert.equal(card().querySelector('[data-cenno-part=value]').textContent, '4,800');
  assert.equal(partText('footer'), 'Q3 M');
  assert.equal(card().getAttribute('role'), 'status');
  key('0');
  assert.equal(card(), null, '0 closes it');
});

test('author content in the card (description AND meta line) is drawn styleless, in a contained shadow root', async () => {
  const { key, card } = await boot(hostileFunnel);
  key('2');
  const c = card();
  // Nothing author-written sits in the card's own light DOM...
  assert.equal(c.querySelector('#metax'), null, 'the meta link is not in the light DOM');
  for (const name of ['body', 'footer']) {
    const part = c.querySelector(`[data-cenno-part=${name}]`);
    const host = [...part.querySelectorAll('*')].find((e) => e.shadowRoot);
    assert.ok(host, `${name}: drawn in a shadow root`);
    assert.equal(host.parentElement.style.contain, 'paint', `${name}: paint-contained`);
    // The author's nodes are what `.lat-desc` holds; the wrappers around them carry only our own styles.
    const authored = host.shadowRoot.querySelector('.lat-desc');
    assert.ok(authored, `${name}: the content is inside the copied slide scope`);
    assert.equal(authored.querySelector('[style]'), null, `${name}: no author style survives`);
  }
  // ...and the link itself is still there, harmless.
  const footerHost = [...c.querySelector('[data-cenno-part=footer]').querySelectorAll('*')].find((e) => e.shadowRoot);
  const link = footerHost.shadowRoot.querySelector('#metax');
  assert.ok(link);
  assert.equal(link.getAttribute('style'), null);
});

test('only the slide on stage carries Tab stops, and leaving Present clears them', async () => {
  const { d, svg, clock } = await boot(funnel);
  assert.equal(svg.getAttribute('tabindex'), '0');
  d.querySelector('#lp-next').click();
  await clock.settle();
  assert.equal(svg.getAttribute('tabindex'), null, 'off stage: not a Tab stop');
  assert.equal(svg.getAttribute('aria-keyshortcuts'), null);
  d.querySelector('#lp-prev').click();
  await clock.settle();
  assert.equal(svg.getAttribute('tabindex'), '0', 'back on stage');
  d.querySelector('[data-lp-btn="read-slides"]').click();
  await clock.settle();
  assert.equal(svg.getAttribute('tabindex'), null, 'Read · Slides: no chart promises keys it will not answer');
});

test('a re-render of the slide on stage never takes the tabindex off its charts (a browser drops focus with it)', async () => {
  const { w, d, svg, clock } = await boot(funnel);
  svg.focus();
  // JSDOM keeps focus on an element that loses its tabindex; a browser does not. So record whether the
  // attribute is ever REMOVED, rather than read focus afterwards.
  const changes = [];
  const mo = new w.MutationObserver((list) => {
    for (const m of list) changes.push(svg.getAttribute(m.attributeName));
  });
  mo.observe(svg, { attributes: true, attributeFilter: ['tabindex'] });
  d.querySelector('[data-lp-btn="present"]').click(); // setView('present') re-renders the same slide
  await clock.settle();
  mo.disconnect();
  assert.deepEqual(changes, [], 'the stage chart keeps its tabindex through the re-render');
  assert.equal(svg.getAttribute('tabindex'), '0');
});

test('the lightbox fallback (a role="dialog" aria-modal div, where <dialog> is missing) owns the keys too', async () => {
  const { d, key, card } = await boot(funnel);
  const div = d.createElement('div');
  div.setAttribute('role', 'dialog');
  div.setAttribute('aria-modal', 'true');
  d.body.append(div);
  key('2');
  assert.equal(card(), null);
  div.remove();
  key('2');
  assert.ok(card());
});

test('an open modal (the collage lightbox is one) owns the keys: a digit opens no card under it', async () => {
  const { w, d, key, card } = await boot(funnel);
  const dialog = d.createElement('dialog');
  d.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  key('2');
  assert.equal(card(), null, 'no card while the modal is open');
  dialog.close?.();
  dialog.removeAttribute('open');
  key('2');
  assert.ok(card(), 'the card opens once the modal is gone');
  void w;
});

/** A touch pointer event the way a browser sends one: JSDOM has no PointerEvent, so a MouseEvent carries the fields. */
function touch(w, type, x, y, id = 7) {
  const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: id }, isPrimary: { value: true } });
  return e;
}

test('a tap opens its card even when the pointerup reports (0, 0), as Mobile Safari did; a swipe still opens none', async () => {
  const { w, card, svg } = await boot(funnel);
  const band = svg.querySelector('[data-mark="1"]');
  // Mobile Safari (iOS 26.5, platform suite run 44013499171): pointerdown at the band, pointerup at (0, 0).
  band.dispatchEvent(touch(w, 'pointerdown', 50, 30));
  const idx = () => [...w.document.querySelectorAll('.lp-frame')].findIndex((f) => f.classList.contains('lp-active'));
  const before = idx();
  band.dispatchEvent(touch(w, 'pointerup', 0, 0));
  assert.equal(idx(), before, 'the tap did not turn the slide');
  assert.ok(card(), 'the tap pinned a card');
  assert.equal(card().querySelector('[data-cenno-part=title]').textContent, 'Signups');
  // The same tap again closes it.
  band.dispatchEvent(touch(w, 'pointerdown', 50, 30, 8));
  band.dispatchEvent(touch(w, 'pointerup', 0, 0, 8));
  assert.equal(card(), null, 'a second tap on the band closes it');
  // A SWIPE that starts on the band moves first, so it still reads as a swipe and opens nothing.
  band.dispatchEvent(touch(w, 'pointerdown', 50, 30, 9));
  band.dispatchEvent(touch(w, 'pointermove', 90, 30, 9));
  band.dispatchEvent(touch(w, 'pointerup', 0, 0, 9));
  assert.equal(card(), null, 'a swipe opens no card');
});
