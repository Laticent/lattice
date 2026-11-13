/**
 * Integration: the phone kernel's box estimate matches the box the browser lays out.
 *
 * On a phone page a chart draws once, on a canvas the shape of its box, and that box is ESTIMATED from the markup
 * around the chart (lib/plugins/chart-family/shared/chart-phone.js `formBoxPx`): the title's lines, a subtitle, lead
 * blocks, headings, captions, the deck's meta line. Its numbers were read off Chromium against today's base CSS. If
 * the estimate runs TALLER than the real body, the page scales the drawing down and its text prints under its role
 * size (11pt and up) while the chart still says `data-chart-form="fit"`. If it runs far SHORTER, the chart is smaller
 * than its room. A type token, a masthead's padding or a block's spacing that moves the real box moves nothing in the
 * estimate, so this renders a fixture deck at the four phone sizes with the real CLI and holds each chart's estimate
 * (`data-form-box`) to its measured `.chart-body` height: never more than 2% taller, and never shorter than the room a
 * second title line takes (the estimate keeps it for every title, on purpose: a title it counts one line short would
 * print the chart under its role size) plus 5%.
 *
 * FALSIFIABLE: before the trio's round on #3131 the `###` heading, the second and third caption, the Japanese title and
 * the emoji title slides each ran 73 to 240px tall at mobile (8 to 15%) and printed at 9.5 to 10.4pt.
 * Deterministic (HARD RULE #32): it waits on `document.fonts.ready`, never on a duration, and asserts sizes.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'lattice.js');
const SIZES = { mobile: 2340, story: 1920, portrait: 1350, square: 1080 };
/** The room the estimate keeps for a second title line on a tall page (92px; 58px at square). */
const TITLE_RESERVE = 92;
const LIST = ['- North America `$4.2M`', '- EMEA `$3.1M`', '- APAC `$1.8M`', '- LATAM `$0.6M`'].join('\n');
const CAPTION = 'A second caption paragraph after the chart, long enough to wrap twice on a phone page.';
/** Each slide: what sits around the chart. One bar chart apiece, so each section has one estimate. */
const SLIDES = [
  ['a one-line title', '## Growth is concentrated.'],
  ['a long title', '## Growth is concentrated in two regions, which together carry most of the year.'],
  ['an eyebrow', '`Board review · Q3`\n\n## Growth is concentrated.'],
  ['a subtitle', '## Growth is concentrated.\n\nTwo regions carry most of the year.'],
  ['a short heading', '## Growth is concentrated.\n\n### A short note'],
  ['a long heading', '## Growth is concentrated.\n\n### A third-level heading that runs long enough to wrap above the chart'],
  ['a caption', '## Growth is concentrated.', 'Source: the finance team.'],
  ['three captions', '## Growth is concentrated.', `Source: the finance team.\n\n${CAPTION}\n\nA third paragraph.`],
  ['a Japanese title', '## 収益は二つの地域に集中しており成長の大半を占めている。四半期ごとの推移を示す。'],
  ['an emoji title', '## Growth 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀'],
];

describe('the phone box estimate matches the laid-out box', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-phone-box-'));
  const rows = {};
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const [size, height] of Object.entries(SIZES)) {
      const md = path.join(dir, `${size}.md`);
      const html = path.join(dir, `${size}.html`);
      const body = SLIDES.map(([, head, tail]) => `<!-- _class: bar -->\n\n${head}\n\n${LIST}\n${tail ? `\n${tail}\n` : ''}`);
      fs.writeFileSync(md, ['---', 'theme: indaco', `size: ${size}`, '---', '', body.join('\n---\n\n'), ''].join('\n'));
      const r = spawnSync(process.execPath, [CLI, md, html, '-q'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
      assert.equal(r.status, 0, `${size}: ${r.stderr}`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height });
      await page.goto(`file://${html}`);
      await page.evaluate(() => document.fonts.ready);
      rows[size] = await page.evaluate(() => [...document.querySelectorAll('section')].map((sec) => {
        const k = 1080 / sec.getBoundingClientRect().width;
        const svg = sec.querySelector('.chart-body svg[data-form-box]');
        if (!svg) return null;
        return { est: Number(svg.getAttribute('data-form-box').split(' ')[1]), real: sec.querySelector('.chart-body').getBoundingClientRect().height * k };
      }));
      await page.close();
    }
  });
  after(async () => { await browser?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  for (const size of Object.keys(SIZES)) {
    test(`${size}: every chart's estimate is at most 2% over its laid-out body, and short by no more than a title line`, () => {
      const got = rows[size];
      assert.equal(got.length, SLIDES.length, 'one section per slide');
      const bad = [];
      got.forEach((r, i) => {
        if (!r) { bad.push(`${SLIDES[i][0]}: no data-form-box`); return; }
        if (r.est > r.real * 1.02 || r.est < r.real - TITLE_RESERVE - r.real * 0.05) bad.push(`${SLIDES[i][0]}: estimate ${r.est} vs laid out ${Math.round(r.real)}`);
      });
      assert.deepEqual(bad, []);
    });
  }
});
