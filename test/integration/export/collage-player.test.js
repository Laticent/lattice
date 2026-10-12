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

  async function openPlayer() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
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
});
