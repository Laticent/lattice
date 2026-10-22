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

  /** Per slide: whether a plate paints behind the mark (a background, a backdrop blur or padding). */
  async function plates(words, key) {
    const html = renderHtml(deck(words), { key });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    const out = await page.evaluate(() =>
      [...document.querySelectorAll('section')].map((s) => {
        const cs = getComputedStyle(s.querySelector(':scope > img.deck-logo'));
        return { bg: cs.backgroundColor !== 'rgba(0, 0, 0, 0)', blur: cs.backdropFilter !== 'none', pad: Number.parseFloat(cs.paddingTop) > 0 };
      }),
    );
    await page.close();
    return out.map((p) => p.bg || p.blur || p.pad);
  }

  test('brand keeps the file\'s colors with nothing behind them', async () => {
    assert.deepEqual(await plates('brand', 'logo-plate-brand'), [false, true, false], 'only the slide that asks for a plate has one');
  });

  test('the deck line asks for a plate, and one slide takes it back', async () => {
    assert.deepEqual(await plates('brand plate', 'logo-plate-deck'), [true, true, false]);
  });

  test('the default mark has no plate', async () => {
    assert.deepEqual(await plates('', 'logo-plate-default'), [false, true, false]);
  });
});
