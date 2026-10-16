/**
 * The exported player's collage lightbox, in a REAL browser against the real export of
 * `examples/collage.md` (#2641 P2). The JSDOM suite beside the player (`player-collage-keys`)
 * cannot run `:focus-visible` or real hit-testing, and the photo-as-button markup had never had
 * an axe run. This drives the shipped file the way a recipient does:
 *
 *   - axe over a collage slide (photos stamped as `role="button"`, the `<ul>` list kept) and over
 *     the open lightbox: no violation of any WCAG A/AA or best-practice rule, which is where the
 *     `list`, `listitem`, `aria-allowed-role` and `nested-interactive` rules live;
 *   - a mouse click opens a photo, Escape and a click on the backdrop close it, and once it is
 *     closed Space reopens nothing and advances the deck (a pointer open must not leave the photo
 *     keyboard-focused).
 *
 * `page-has-heading-one` is off: the player shows one slide at a time, and on slide 2 the title
 * slide's `<h1>` is hidden, so the rule fires for every deck rather than for the collage markup.
 * `color-contrast` is off for the reason `invariants/axe-a11y.test.js` gives.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const puppeteer = require('puppeteer');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  rules: { 'color-contrast': { enabled: false }, 'page-has-heading-one': { enabled: false } },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('collage lightbox in the exported player, real Chromium', () => {
  let browser;
  let dir;
  let html;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-collage-player-'));
    html = path.join(dir, 'collage.html');
    const res = spawnSync('node', [path.join(ROOT, 'lattice.js'), path.join(ROOT, 'examples', 'collage.md'), html, '--player'], {
      cwd: ROOT, encoding: 'utf8', timeout: 600000,
    });
    assert.equal(res.status, 0, `render failed:\n${res.stderr}`);
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
  });
  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function openPlayer(hasTouch = false) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, hasTouch });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await sleep(1200);
    await page.keyboard.press('ArrowRight'); // slide 2 is the first collage
    await sleep(800);
    await page.evaluate(AXE_SRC);
    return page;
  }
  const index = (page) => page.evaluate(() => [...document.querySelectorAll('.lp-frame')].findIndex((f) => f.classList.contains('lp-active')));
  const axe = (page) =>
    page.evaluate(async (opts) => {
      const res = await window.axe.run(document, { ...opts, resultTypes: ['violations', 'incomplete'] });
      const shape = (v) => `${v.id} (${v.impact}, ${v.nodes.length} node): ${(v.nodes[0]?.html || '').slice(0, 120)}`;
      return { violations: res.violations.map(shape), incomplete: res.incomplete.map((v) => v.id) };
    }, AXE_OPTIONS);

  test('a collage slide and its photo buttons have no accessibility violations', async () => {
    const page = await openPlayer();
    const seen = await page.evaluate(() => ({
      lists: document.querySelectorAll('.lp-active ul[data-collage]').length,
      buttons: document.querySelectorAll('.lp-active .collage-tile > img[role="button"][tabindex="0"]').length,
    }));
    assert.ok(seen.lists === 1 && seen.buttons >= 4, `precondition: a collage list with stamped photo buttons, saw ${JSON.stringify(seen)}`);
    const { violations } = await axe(page);
    assert.deepEqual(violations, []);
    await page.close();
  });

  test('the open lightbox has no accessibility violations', async () => {
    const page = await openPlayer();
    const pt = await page.evaluate(() => {
      const r = document.querySelectorAll('.lp-active .collage-tile > img')[1].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(pt.x, pt.y);
    await sleep(700);
    assert.ok(await page.evaluate(() => !!document.querySelector('dialog.collage-lightbox[open]')), 'precondition: the lightbox is open');
    const { violations } = await axe(page);
    assert.deepEqual(violations, []);
    await page.close();
  });

  test('Escape and a click on the backdrop close it, and Space then advances the deck', async () => {
    const page = await openPlayer();
    const before = await index(page);
    const pt = await page.evaluate(() => {
      const r = document.querySelectorAll('.lp-active .collage-tile > img')[1].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const isOpen = () => page.evaluate(() => !!document.querySelector('.collage-lightbox'));
    await page.mouse.click(pt.x, pt.y);
    await sleep(700);
    assert.equal(await isOpen(), true, 'a click opens the photo');
    await page.keyboard.press('Escape');
    await sleep(600);
    assert.equal(await isOpen(), false, 'Escape closes it');
    await page.mouse.click(pt.x, pt.y);
    await sleep(700);
    assert.equal(await isOpen(), true, 'a second click opens it again');
    await page.mouse.click(5, 5); // the backdrop, away from the photo and the close button
    await sleep(700);
    assert.equal(await isOpen(), false, 'a click on the backdrop closes it');
    await page.keyboard.press('Space');
    await sleep(500);
    assert.equal(await isOpen(), false, 'Space does not reopen the photo');
    assert.equal(await index(page), before + 1, 'Space advances the deck');
    await page.close();
  });

  // ── stepping (#2641 P5): the same keys, buttons and swipe as every other host ──────────────
  const capOf = (page) => page.evaluate(() => document.querySelector('.collage-lightbox p')?.textContent);
  const countOf = (page) => page.evaluate(() => document.querySelectorAll('.collage-lightbox p')[1]?.textContent);

  async function openFirst(page) {
    const pt = await page.evaluate(() => {
      const r = document.querySelectorAll('.lp-active .collage-tile > img')[0].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(pt.x, pt.y);
    await sleep(700);
    assert.ok(await page.evaluate(() => !!document.querySelector('dialog.collage-lightbox[open]')), 'precondition: the lightbox is open');
  }

  test('the open photo steps with the arrow keys and the buttons, and the deck behind does not move', async () => {
    const page = await openPlayer();
    const before = await index(page);
    await openFirst(page);
    const n = await page.evaluate(() => document.querySelectorAll('.lp-active .collage-tile').length);
    assert.ok(n >= 4);
    assert.equal(await countOf(page), `1 / ${n}`);
    const first = await capOf(page);
    await page.keyboard.press('ArrowRight');
    await sleep(200);
    assert.equal(await countOf(page), `2 / ${n}`);
    assert.notEqual(await capOf(page), first, 'the caption follows the photo');
    await page.click('[aria-label="Next photo"]');
    await sleep(200);
    assert.equal(await countOf(page), `3 / ${n}`);
    await page.keyboard.press('End');
    assert.equal(await countOf(page), `${n} / ${n}`);
    await page.keyboard.press('ArrowRight');
    assert.equal(await countOf(page), `1 / ${n}`, 'next from the last wraps');
    await page.keyboard.press('ArrowLeft');
    await page.click('[aria-label="Previous photo"]');
    assert.equal(await countOf(page), `${n - 1} / ${n}`);
    assert.equal(await index(page), before, 'no step key reached the deck');
    await page.close();
  });

  test('a one-finger swipe on the open photo steps; a vertical move and a pinch do not', async () => {
    const page = await openPlayer(true);
    await openFirst(page);
    const n = await page.evaluate(() => document.querySelectorAll('.lp-active .collage-tile').length);
    const cdp = await page.createCDPSession();
    const pt = (x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 1 });
    const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const drag = async (x0, y0, x1, y1) => {
      await touch('touchStart', [pt(x0, y0)]);
      for (let i = 1; i <= 6; i++) await touch('touchMove', [pt(x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6)]);
      await touch('touchEnd', []);
      await sleep(150);
    };
    await drag(800, 360, 400, 366); // left: next
    assert.equal(await countOf(page), `2 / ${n}`);
    await drag(400, 360, 800, 354); // right: back
    assert.equal(await countOf(page), `1 / ${n}`);
    await drag(640, 500, 644, 200); // vertical: nothing
    assert.equal(await countOf(page), `1 / ${n}`);
    // a pinch out: two fingers apart by 300 px is a pinch, never a swipe
    await touch('touchStart', [pt(540, 360), pt(740, 360)]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [pt(540 - 25 * i, 360), pt(740 + 25 * i, 360)]);
    await touch('touchEnd', []);
    await sleep(150);
    assert.equal(await countOf(page), `1 / ${n}`, 'a pinch does not step');
    await cdp.detach();
    await page.close();
  });

  // ── wheel stepping (#2641 P2): a plain flick steps the PHOTO and leaves the deck where it is ──
  test('a plain wheel flick steps the photo once per flick and does not turn the slide behind it', async () => {
    const page = await openPlayer(true);
    await openFirst(page);
    const slide = () => index(page);
    const count = () => page.evaluate(() => document.querySelectorAll('.collage-lightbox p')[1].textContent);
    const before = await slide();
    assert.match(await count(), /^1 \/ /);
    await page.mouse.move(400, 300);
    await page.mouse.wheel({ deltaY: 120 });
    await page.mouse.wheel({ deltaY: 120 });
    await sleep(150);
    assert.match(await count(), /^2 \/ /, 'a burst is one step');
    assert.equal(await slide(), before, 'the deck behind did not turn');
    await page.keyboard.press('3');
    assert.match(await count(), /^3 \/ /, 'a digit jumps');
    assert.equal(await slide(), before, 'and the deck did not hear it');
    await page.close();
  });

  // ── zoom (#2641 P6): the shared kernel's pinch, wheel and keys, in the real export ─────────
  const scaleOf = (page) =>
    page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.collage-lightbox img')).transform).a);

  test('a pinch, ctrl + wheel and the + - 0 keys zoom the open photo; a pinch does not step; the pill resets', async () => {
    const page = await openPlayer(true);
    await openFirst(page);
    const n = await page.evaluate(() => document.querySelectorAll('.lp-active .collage-tile').length);
    assert.equal(await scaleOf(page), 1);
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    assert.ok((await scaleOf(page)) > 1.4, 'the + key zooms');
    await page.keyboard.press('0');
    assert.equal(await scaleOf(page), 1, '0 returns to fit');
    // a trackpad pinch arrives as ctrl + wheel
    const box = await page.evaluate(() => {
      const r = document.querySelector('.collage-lightbox img').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel({ deltaY: -400 });
    await page.keyboard.up('Control');
    await sleep(150);
    assert.ok((await scaleOf(page)) > 1.5, 'ctrl + wheel zooms');
    await page.click('[aria-label^="Reset zoom to fit"]');
    assert.equal(await scaleOf(page), 1, 'the pill resets');
    // two fingers apart: a pinch, not a swipe
    const cdp = await page.createCDPSession();
    const pt = (x, y) => ({ x, y, radiusX: 8, radiusY: 8, force: 1 });
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [pt(box.x - 30, box.y), pt(box.x + 30, box.y)]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [pt(box.x - 30 - 25 * i, box.y), pt(box.x + 30 + 25 * i, box.y)]);
    await touch('touchEnd', []);
    await sleep(200);
    assert.ok((await scaleOf(page)) > 1.5, 'a pinch zooms');
    assert.equal(await countOf(page), `1 / ${n}`, 'a pinch does not step');
    // one finger while zoomed pans and does not swipe
    await touch('touchStart', [pt(box.x, box.y)]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [pt(box.x - 40 * i, box.y)]);
    await touch('touchEnd', []);
    await sleep(150);
    assert.equal(await countOf(page), `1 / ${n}`, 'a pan is not a swipe');
    await page.keyboard.press('ArrowRight');
    assert.equal(await scaleOf(page), 1, 'a new photo opens at fit');
    await cdp.detach();
    await page.close();
  });
});
