/**
 * Followup 2687-p7: a zip plugin's FENCE output keeps every style its renderer wrote, and the red
 * team on #2687 showed a `position:fixed; inset:0` box painting over the whole slide. The fence
 * root (`div[data-lattice-plugin]`, code-door-fence.mjs) now has `contain:paint` in
 * lib/base/base.modifiers.css, which makes it the containing block for fixed descendants and clips
 * their paint. Measured in real Chromium against the BUILT stylesheet (dist/lattice.css), because
 * the claim is about layout and paint, which no string test can see.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'lattice.css'), 'utf8');
let browser;
let page;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-plugin-contain-'));
before(async () => {
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
});
after(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a fixed box a plugin fence returns stays inside the plugin root', async () => {
  const file = path.join(tmp, 'slide.html');
  // A <style> element, not inline: the CSS is the shipped bundle, read from disk.
  fs.writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style><style>body{margin:0}section{width:1280px;height:720px}</style>` +
      '<section><h2 id="heading">Heading</h2>' +
      '<div data-lattice-plugin="cover-all" style="height:120px"><p>card</p>' +
      '<div id="overlay" style="position:fixed;inset:0;z-index:2147483647;background:rgb(204,0,0)">FORGED</div></div>' +
      '<p id="after">The words under the card.</p></section>',
  );
  await page.goto(`file://${file}`);
  const r = await page.evaluate(() => {
    const root = document.querySelector('[data-lattice-plugin]').getBoundingClientRect();
    const box = document.getElementById('overlay').getBoundingClientRect();
    const at = (el) => {
      const b = el.getBoundingClientRect();
      return document.elementFromPoint(b.left + 2, b.top + 2)?.id ?? null;
    };
    return {
      contain: getComputedStyle(document.querySelector('[data-lattice-plugin]')).contain,
      root: [root.left, root.top, root.right, root.bottom],
      box: [box.left, box.top, box.right, box.bottom],
      headingHit: at(document.getElementById('heading')),
      afterHit: at(document.getElementById('after')),
    };
  });
  assert.equal(r.contain, 'paint', JSON.stringify(r));
  assert.deepEqual(r.box, r.root, 'the fixed box is laid out against the plugin root, not the viewport');
  assert.equal(r.headingHit, 'heading', 'the slide heading above the fence is not covered');
  assert.equal(r.afterHit, 'after', 'the text below the fence is not covered');
});
