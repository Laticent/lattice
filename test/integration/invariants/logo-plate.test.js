/**
 * The deck logo has no plate unless asked for (real render; HARD RULE #23: a cascade fact, asserted on a real page).
 *
 * `logo-finish: brand` used to paint a soft plate behind the mark, so a logo with a transparent background showed a box
 * and the only way out was a `!important` override in the deck's own `style:`. The plate is now its own word on the
 * register (`plate` / `no-plate`, lib/core/resolve-logo-finish.js): off by default, on for the deck or for one slide,
 * and a slide can take the deck's plate back.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

const deck = (words) => `---
marp: true
theme: indaco
logo: sample:logo-acme-mark.svg
${words ? `logo-finish: ${words}\n` : ''}---

## One

Body.

---

<!-- _class: logo-plate -->

## Two: a plate on this slide

Body.

---

<!-- _class: logo-no-plate -->

## Three: no plate on this slide

Body.
`;

describe('the deck logo plate is opt-in (real render)', () => {
  const chrome = resolveChrome();
  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  });
  after(async () => {
    await browser?.close();
  });

  /** Per slide: whether a plate paints behind the mark (a background, a backdrop blur or padding), and whether it is
   *  drawn at full strength: the img's own `opacity` and `filter` act on its background too, so a plate under the
   *  watermark's fade or a tint's flood would be washed out or flooded solid. */
  async function plates(words, key) {
    const html = renderHtml(deck(words), { key });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    const out = await page.evaluate(() =>
      [...document.querySelectorAll('section')].map((s) => {
        const cs = getComputedStyle(s.querySelector(':scope > img.deck-logo'));
        const plate = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backdropFilter !== 'none' || Number.parseFloat(cs.paddingTop) > 0;
        return { plate, solid: cs.opacity === '1' && cs.filter === 'none', radius: cs.borderRadius !== '0px' };
      }),
    );
    await page.close();
    return out;
  }
  const has = async (words, key) => (await plates(words, key)).map((p) => p.plate);

  test('brand keeps the file\'s colors with nothing behind them', async () => {
    assert.deepEqual(await has('brand', 'logo-plate-brand'), [false, true, false], 'only the slide that asks for a plate has one');
  });

  test('the deck line asks for a plate, and one slide takes it back', async () => {
    assert.deepEqual(await has('brand plate', 'logo-plate-deck'), [true, true, false]);
  });

  test('the default mark has no plate', async () => {
    assert.deepEqual(await has('', 'logo-plate-default'), [false, true, false]);
  });

  // The plate is the img's own background, so it must not inherit the mark's filter or fade: on the default watermark,
  // on a tint word and on a dark canvas it is drawn at full strength with the file's own colors.
  for (const words of ['plate', 'accent plate', 'accent-ink plate', 'brand plate']) {
    test(`${words}: the plate is solid, not faded or flooded`, async () => {
      const rows = await plates(words, `logo-plate-solid-${words.replace(/\s+/g, '-')}`);
      for (const r of rows.filter((x) => x.plate)) assert.deepEqual(r, { plate: true, solid: true, radius: true }, `${words}: ${JSON.stringify(r)}`);
      assert.ok(rows.some((x) => x.plate), 'at least one slide carries the plate');
    });
  }

  test('a slide that asks for the plate on a deck with a watermark-colored mark is solid too', async () => {
    const rows = await plates('', 'logo-plate-slide-on-default');
    assert.deepEqual(rows[1], { plate: true, solid: true, radius: true });
    assert.equal(rows[0].solid, false, 'the unplated watermark keeps its fade and grayscale');
  });
});
