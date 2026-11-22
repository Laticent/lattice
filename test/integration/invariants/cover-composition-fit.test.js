/**
 * A `stage` or `poster` cover never meets a chrome band silently — measured in real Chromium on the
 * real export, with the engine's own overflow probe.
 *
 * Both compositions set the heading at `--fs-hero`, about twenty characters a line. Three lines
 * (60 characters) clear every band. Past that, two things keep the slide honest (title.styles.css,
 * the stage-and-poster note):
 *   - `safe center` holds the top of the content box, so a long heading grows DOWN, never up into
 *     the top band and under a top-right logo;
 *   - the footer band's reserve rides the LAST FLOWED CHILD's padding instead of the section's, so a
 *     heading that reaches the band pushes that padding past the slide edge, where
 *     lib/core/overflow-probe.js (which measures children against the section's edge) reports it.
 *     Before this, a 74-character poster closing with a subtitle sat 6px into the footer band and
 *     the probe read it as fitting.
 *
 * Three arms per composition × layout:
 *   FIT       60 characters: the probe reads no overflow and the ink ends above the footer.
 *   UNMOVED   the same slide with the reserve zeroed (`--_cover-foot: 0px`): the heading does not
 *             move, so moving the reserve off the section changed nothing a fitting slide shows.
 *   OVER      74 characters on the poster closing with a subtitle (the measured intruder): the
 *             probe now reads overflow.
 *
 * Needs Chromium + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, probeSectionOverflow } = require('../../../lib/core/overflow-probe');

const SIXTY = 'A sixty character title that should hold on three lines ok';
const SEVENTY_FOUR = 'A seventy-four character cover title, sized for the back of the hall now';
const deck = (cls, level, heading) => `---\nmarp: true\ntheme: indaco\nfooter: "Lattice · cover fit"\nlogo: sample:logo-acme-mark.svg\n---\n\n`
  + `<!-- _class: ${cls} -->\n\n${level} ${heading}\n\n\`Eyebrow\`\n\nA one-line subtitle under it.\n`;

describe('stage and poster covers keep out of the chrome bands, or report overflow', () => {
  const chrome = resolveChrome();
  let browser;
  if (!chrome) {
    test('needs Chromium', { skip: skipWithoutChrome(chrome) }, () => assert.fail('no Chromium on this runner: install it (test/helpers/chrome.js)'));
    return;
  }
  process.env.CHROME_PATH = chrome;
  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => { if (browser) await browser.close(); });

  async function measure(md, key) {
    const html = renderHtml(md, { key, timeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    const probe = () => page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1, IGNORED_CLIP_SELECTOR);
    const geom = () => page.$eval('section', (s) => {
      const top = s.getBoundingClientRect().top;
      const flowed = [...s.querySelectorAll(':scope > :is(h1, h2, p, ul, ol)')];
      // The ink: each flowed child's content box (its reserve padding is not ink).
      const inkBottom = Math.max(...flowed.map((e) => {
        const r = e.getBoundingClientRect();
        return r.bottom - parseFloat(getComputedStyle(e).paddingBottom) - top;
      }));
      const footer = s.querySelector(':scope > footer');
      return {
        heading: s.querySelector('h1, h2').getBoundingClientRect().top - top,
        inkBottom,
        footerTop: footer ? footer.getBoundingClientRect().top - top : null,
      };
    });
    const over = (await probe()).over;
    const shipped = await geom();
    await page.$eval('section', (s) => s.style.setProperty('--_cover-foot', '0px'));
    const zeroed = await geom();
    await page.close();
    return { over, shipped, zeroed };
  }

  const CASES = [
    ['title cover-stage', '#'], ['title cover-poster', '#'],
    ['closing cover-stage', '##'], ['closing cover-poster cover-light', '##'],
  ];
  for (const [cls, level] of CASES) {
    test(`${cls}: 60 characters fit, clear the footer, and sit where they sat before the reserve moved`, async () => {
      const m = await measure(deck(cls, level, SIXTY), `cover-fit-${cls.replace(/\s+/g, '-')}-60`);
      assert.equal(m.over, false, `${cls}: a three-line heading must not read as overflow`);
      assert.ok(m.shipped.footerTop !== null, 'the fixture has a footer');
      assert.ok(m.shipped.inkBottom <= m.shipped.footerTop, `${cls}: ink ends at ${m.shipped.inkBottom.toFixed(1)}px, the footer starts at ${m.shipped.footerTop.toFixed(1)}px`);
      assert.ok(Math.abs(m.shipped.heading - m.zeroed.heading) < 0.5,
        `${cls}: the heading moved ${(m.shipped.heading - m.zeroed.heading).toFixed(2)}px when the reserve moved off the section`);
    });
  }

  test('closing cover-poster cover-light: 74 characters with a subtitle report overflow instead of entering the footer band', async () => {
    const m = await measure(deck('closing cover-poster cover-light', '##', SEVENTY_FOUR), 'cover-fit-closing-poster-74');
    assert.equal(m.over, true, `the heading reaches the footer band (ink to ${m.shipped.inkBottom.toFixed(1)}px, footer at ${m.shipped.footerTop?.toFixed(1)}px), so the probe must say so`);
  });
});
