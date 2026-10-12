// The collage lightbox core: DOM only, so JSDOM exercises the parts that do not need layout —
// the source allowlist, caption safety, the close paths, scroll lock and focus return. The glide
// math needs real rects and is driven in a real browser (see the PR's evidence section).
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let open;
test.before(async () => {
  ({ openCollageLightbox: open } = await import('../../../lib/core/collage-lightbox.mjs'));
});

function page() {
  const dom = new JSDOM('<!doctype html><body><button id="t">tile</button></body>', { pretendToBeVisual: true });
  const doc = dom.window.document;
  return { dom, doc, win: dom.window };
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('refuses a source outside the allowlist', () => {
  const { doc } = page();
  for (const src of ['javascript:alert(1)', 'data:text/html,<b>', 'file:///etc/passwd', '//evil.test/a.png', '', 'vbscript:x']) {
    assert.equal(open(doc, { src, reducedMotion: true }), null, src);
  }
  assert.equal(doc.querySelector('.collage-lightbox'), null);
});

test('accepts http, https, blob and data:image sources', () => {
  for (const src of ['http://a.test/x.jpg', 'https://a.test/x.jpg', 'blob:https://a.test/1', PNG]) {
    const { doc } = page();
    const h = open(doc, { src, reducedMotion: true });
    assert.ok(h, src);
    assert.equal(doc.querySelector('.collage-lightbox img').getAttribute('src'), src);
  }
});

test('the caption is text, never markup', () => {
  const { doc } = page();
  const hostile = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';
  open(doc, { src: PNG, alt: hostile, reducedMotion: true });
  const p = doc.querySelector('.collage-lightbox p');
  assert.equal(p.textContent, hostile);
  assert.equal(p.children.length, 0);
  assert.equal(doc.querySelectorAll('.collage-lightbox img').length, 1, 'only the photo itself');
  assert.equal(doc.querySelectorAll('script').length, 0);
});

test('Escape closes it, returns focus and restores scroll', async () => {
  const { doc, win } = page();
  doc.getElementById('t').focus();
  doc.documentElement.style.overflow = 'auto';
  let closed = 0;
  open(doc, { src: PNG, alt: 'x', reducedMotion: true, onClose: () => closed++ });
  assert.equal(doc.documentElement.style.overflow, 'hidden');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.querySelector('.collage-lightbox'), null);
  assert.equal(doc.documentElement.style.overflow, 'auto');
  assert.equal(doc.activeElement.id, 't');
  assert.equal(closed, 1, 'onClose fires once');
});

test('the close button closes it; a click on the photo does not', async () => {
  const { doc, win } = page();
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  doc.querySelector('.collage-lightbox img').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelector('.collage-lightbox'), 'photo click leaves it open');
  doc.querySelector('.collage-lightbox button').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.querySelector('.collage-lightbox'), null);
});

test('a backdrop click inside the first 400 ms is the opening gesture\'s ghost click and is ignored', () => {
  const { doc, win } = page();
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  doc.querySelector('.collage-lightbox').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelector('.collage-lightbox'));
});

test('while open it consumes Space and arrows so the deck behind does not advance', () => {
  const { doc, win } = page();
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  for (const key of [' ', 'ArrowRight', 'ArrowLeft', 'PageDown']) {
    const e = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    doc.dispatchEvent(e);
    assert.equal(e.defaultPrevented, true, key);
  }
});

test('while open NO key reaches the deck behind it (Home, End, n, digits)', () => {
  const { doc, win } = page();
  const seen = [];
  win.addEventListener('keydown', (e) => seen.push(e.key));
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  for (const key of ['Home', 'End', 'n', 'N', '3', 'f', ' ', 'ArrowRight']) {
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  assert.deepEqual(seen, [], 'a window-level listener (the deck transport) saw nothing');
});

test('closeNow tears down at once and restores scroll, so a second open cannot stack locks', () => {
  const { doc } = page();
  doc.documentElement.style.overflow = 'auto';
  const a = open(doc, { src: PNG, alt: 'a', reducedMotion: true });
  a.closeNow();
  assert.equal(doc.querySelector('.collage-lightbox'), null);
  assert.equal(doc.documentElement.style.overflow, 'auto');
  const b = open(doc, { src: PNG, alt: 'b', reducedMotion: true });
  b.closeNow();
  assert.equal(doc.documentElement.style.overflow, 'auto', 'the page is scrollable again');
});

test('closing twice is safe and onClose still fires once', async () => {
  const { doc } = page();
  let closed = 0;
  const h = open(doc, { src: PNG, reducedMotion: true, onClose: () => closed++ });
  h.close();
  h.close();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(closed, 1);
  assert.equal(doc.querySelector('.collage-lightbox'), null);
});

test('the core closes over nothing at module scope, so .toString() inlining holds', async () => {
  const src = open.toString();
  // Re-create the function from its own source in a bare scope: any module-level reference throws.
  const rebuilt = new Function(`return (${src})`)();
  const { doc } = page();
  assert.ok(rebuilt(doc, { src: PNG, reducedMotion: true }));
});
