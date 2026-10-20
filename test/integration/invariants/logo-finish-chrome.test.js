/**
 * The deck logo's placement word clears the chrome in its band — on slides that HAVE the mark and
 * nowhere else (real render; HARD RULE #23 — a cascade and layout fact, asserted on a real page).
 *
 * The first cut keyed the stand-down on the placement CLASS, which the deck register stamps on every
 * section, so the header, footer or page number vanished on slides the `title` scope skipped, on
 * `no-logo` slides, on decks with no `logo:` at all, and (for `bottom-right`) stayed visible on the
 * sovereign frames that carry no `form` class. The rule now keys on `:has(> img.deck-logo)`.
 * Found by the independent checker on the branch that introduced `logo-finish:`.
 *
 * Also pins the placement itself under a finish: no real-render test covered a placement word once
 * the old `logo-x` / `logo-y` one was retired.
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

const slides = (...bodies) => bodies.join('\n\n---\n\n');
const deck = (fm, body) => `---\nmarp: true\ntheme: indaco\nheader: "Running header"\nfooter: "Running footer"\npaginate: true\n${fm}\n---\n\n${body}\n`;

// slide 1 carries the mark (title scope); slide 2 does not; slide 3 opts out; slide 4 is a title again
const SCOPED = (placement) => deck(
  `logo: sample:logo-acme-mark.svg\nlogo-finish: ${placement} title\nfinish: atrium`,
  slides(
    '<!-- _class: title -->\n\n# Cover',
    '## Plain slide\n\nBody copy.',
    '<!-- _class: no-logo title -->\n\n# Cover without a mark',
    '<!-- _class: divider -->\n\n## Divider\n\nSubtitle.',
  ),
);

describe('logo-finish placement clears chrome only where the mark is (real render)', () => {
  const chrome = resolveChrome();
  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }
  let browser;
  before(async () => { browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] }); });
  after(async () => { await browser?.close(); });

  async function probe(md, key) {
    const html = renderHtml(md, { key });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    const out = await page.evaluate(() => [...document.querySelectorAll('section')].map((s) => {
      const shown = (sel) => { const e = s.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
      const logo = s.querySelector(':scope > img.deck-logo');
      const sr = s.getBoundingClientRect();
      const lr = logo ? logo.getBoundingClientRect() : null;
      return {
        logo: !!logo,
        header: shown('header'), footer: shown('footer'), page: shown('.lat-pagination') || getComputedStyle(s, '::after').content !== 'none',
        cx: lr ? Math.round(((lr.left + lr.right) / 2 - sr.left) / sr.width * 100) : null,
        cy: lr ? Math.round(((lr.top + lr.bottom) / 2 - sr.top) / sr.height * 100) : null,
      };
    }));
    await page.close();
    return out;
  }

  test('top-left: the header goes where the mark is, and only there', async () => {
    const [cover, plain, noLogo] = await probe(SCOPED('top-left'), 'logo-finish-top-left');
    assert.equal(cover.logo, true);
    assert.equal(cover.header, false, 'the header yields on the slide that carries the mark');
    assert.equal(plain.logo, false);
    assert.equal(plain.header, true, 'a slide the `title` scope skips keeps its header');
    assert.equal(noLogo.header, true, '`no-logo` gives the header back');
  });

  test('bottom-center: the footer yields, seated at the bottom middle, under a finish', async () => {
    const [cover, plain, , divider] = await probe(SCOPED('bottom-center'), 'logo-finish-bottom-center');
    assert.ok(Math.abs(cover.cx - 50) <= 1, `centered across, got ${cover.cx}%`);
    assert.ok(cover.cy > 88, `on the bottom inset, got ${cover.cy}%`);
    assert.equal(plain.footer, true, 'no mark on this slide, so the footer stays');
    assert.equal(divider.logo, false);
  });

  test('bottom-right: the page number yields on the title frame too (it carries no `form` class)', async () => {
    const [cover, plain] = await probe(SCOPED('bottom-right'), 'logo-finish-bottom-right');
    assert.equal(cover.logo, true);
    assert.equal(cover.page, false, 'the page number is hidden under the mark on a sovereign frame');
    assert.equal(plain.page, true, 'and kept on a slide with no mark');
  });

  test('a placement word with no `logo:` hides nothing', async () => {
    const out = await probe(deck('logo-finish: top-left bottom-right', slides('## One\n\nBody.', '## Two\n\nBody.')), 'logo-finish-no-logo');
    assert.ok(out.every((s) => s.header && s.footer && s.page), 'no mark, no stand-down');
  });
});
