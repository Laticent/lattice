// The chart detail card's body renderer (lib/runtime/chart-reveal/detail.mjs) in JSDOM: what it keeps
// out of the card, and when it reads the deck's CSS again. The real-browser half (a hostile deck in an
// exported player) is docs/e2e/player-chart-reveal.spec.ts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const load = () => import('../../../lib/runtime/chart-reveal/detail.mjs');

function page() {
  const dom = new JSDOM(
    `<!doctype html><html><head><style id="deck">article.lattice > section .pill{font-weight:700}</style></head><body>
<article class="lattice"><section data-lattice-slide="1" id="s1" class="funnel" style="--accent:red"><p>slide</p></section></article></body></html>`,
    { pretendToBeVisual: true },
  );
  return dom.window;
}

/** The deck CSS a rendered card carries (JSDOM cannot adopt a constructed sheet, so it is a <style>). */
const cssIn = (host) => [...host.querySelector('div').shadowRoot.querySelectorAll('style')].map((s) => s.textContent).join('\n');

test('a copied chain drops id, style and the slide-sizing hook, and author styles never survive', async () => {
  const { renderDeckDetail } = await load();
  const w = page();
  const d = w.document;
  const sec = d.getElementById('s1');
  const frag = d.createRange().createContextualFragment('<a id="x" href="#" style="position:fixed;width:9000px">M</a>');
  const host = d.createElement('div');
  d.body.append(host);
  renderDeckDetail(host, frag, sec, { drop: ['data-lp-view'] });
  const root = host.querySelector('div').shadowRoot;
  const wrap = root.querySelector('.lat-desc');
  assert.ok(wrap, 'the content sits in a copy of the slide');
  assert.equal(wrap.getAttribute('id'), null);
  assert.equal(wrap.getAttribute('data-lattice-slide'), null, 'never sized like a slide');
  assert.equal(wrap.closest('article')?.classList.contains('lattice'), true, 'the deck scope is rebuilt');
  assert.equal(root.querySelector('#x').getAttribute('style'), null, 'the author style is gone');
  assert.equal(host.style.contain, 'paint');
});

test('the deck CSS is read once, and read again only when a stylesheet changes', async () => {
  const { renderDeckDetail } = await load();
  const w = page();
  const d = w.document;
  const sec = d.getElementById('s1');
  const render = () => {
    const host = d.createElement('div');
    d.body.append(host);
    renderDeckDetail(host, d.createDocumentFragment(), sec);
    return host;
  };
  // Count how often the deck's sheets are read.
  let reads = 0;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(d), 'styleSheets') || Object.getOwnPropertyDescriptor(w.Document.prototype, 'styleSheets');
  Object.defineProperty(d, 'styleSheets', {
    configurable: true,
    get() {
      reads++;
      return desc.get.call(this);
    },
  });
  // ...and how often every <style>'s TEXT is gathered: the old cache key did that on every card, which
  // in a large exported player was a 2.3 MB join per hover (the checker, PR #3259).
  let textScans = 0;
  const qsa = d.querySelectorAll.bind(d);
  d.querySelectorAll = (sel) => {
    if (/^style, link/.test(sel)) textScans++;
    return qsa(sel);
  };
  const first = render();
  assert.match(cssIn(first), /font-weight: ?700/);
  render();
  render();
  // Cards added to the page are not stylesheets, so they do not invalidate it either.
  await new Promise((r) => w.setTimeout(r, 0));
  render();
  assert.equal(reads, 1, 'three more cards, no stylesheet change: the CSS is not read again');
  assert.equal(textScans, 0, 'and no card gathers the style text to compare it');
  // A restyle and a card in the SAME task: the observer has not delivered yet, and the card must still be current.
  d.getElementById('deck').textContent = 'article.lattice > section .pill{font-weight:500}';
  assert.match(cssIn(render()), /font-weight: ?500/, 'a card drawn in the same task as the restyle');
  await new Promise((r) => w.setTimeout(r, 0));
  reads = 1;
  // A theme or mode flip rewrites a <style> in place: the next card must carry the new rules.
  d.getElementById('deck').textContent = 'article.lattice > section .pill{font-weight:400}';
  await new Promise((r) => w.setTimeout(r, 0)); // MutationObserver delivers on a microtask
  const after = render();
  assert.equal(reads, 2, 'the change was seen');
  assert.match(cssIn(after), /font-weight: ?400/);
  assert.doesNotMatch(cssIn(after), /font-weight: ?700/);
});
