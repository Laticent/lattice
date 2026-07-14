/**
 * Integration (Form-ON regression): the decision / compare-prose flush-corner
 * badge must stay ABSOLUTELY positioned once the Form default wraps the card
 * body in `.cell-stage`.
 *
 * The badge treatment (compare-prose.styles.css) styles the leading `<strong>`
 * of each card as an absolute-positioned filled corner tag. Under the Form
 * default (on since 2026-06-26), masthead-lift wraps a migrated component's body
 * one level deeper — `section.decision > .cell-stage > ol > li > strong`. A rule
 * left addressing the PRE-migration bare `section.decision > ol` child silently
 * stops matching the wrapped card, and the badge degrades to plain inline text
 * (no fill, no corner placement) with NO error. See the 2026-07-14 cell-stage
 * selector-alignment cleanup.
 *
 * This renders with Form ON (the shipped default) — the component-invariant
 * layer-3 harness pins `form: off` for component isolation, so it structurally
 * cannot see this Form-composed property. We drive the REAL emulator + real
 * Chromium computed styles (HARD RULE #23), not a selector-string check.
 *
 * Slow tier: the emulator runs its Chromium PDF stage, then we re-open the HTML
 * sidecar to read computed styles.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors component-invariants.test.js. */
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

describe('decision corner tag survives the .cell-stage wrap (Form on)', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'decision-corner-tag.md');
  let browser;

  before(async () => {
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--font-render-hinting=none'],
    });
  });
  after(async () => { if (browser) await browser.close(); });

  test('each card badge is absolutely positioned with an accent fill', { timeout: 90000 }, async () => {
    const pdf = runEmulator(FIXTURE, { timeout: 60000 });
    const html = pdf.replace(/\.pdf$/, '.html');
    assert.ok(fs.existsSync(html), `emulator HTML sidecar missing: ${html}`);

    const page = await browser.newPage();
    try {
      await page.goto('file://' + html, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts?.ready);

      // Sanity: the body really is wrapped in .cell-stage (Form on).
      const wrapped = await page.$$eval(
        'section[data-lattice-slide="1"] > .cell-stage > :is(ul, ol) > li > strong:first-child',
        (els) => els.length,
      );
      assert.ok(wrapped >= 2, `expected ≥2 badges under .cell-stage, got ${wrapped} (Form wrap missing?)`);

      const tags = await page.$$eval(
        'section[data-lattice-slide="1"] :is(ul, ol) > li > strong:first-child',
        (els) => els.map((el) => {
          const cs = getComputedStyle(el);
          return { position: cs.position, bg: cs.backgroundColor };
        }),
      );
      assert.equal(tags.length, 2, `expected 2 decision corner tags, got ${tags.length}`);
      for (const t of tags) {
        assert.equal(t.position, 'absolute',
          `corner tag not absolutely positioned — the badge rule missed the .cell-stage-wrapped card (got position:${t.position})`);
        assert.ok(t.bg && t.bg !== 'rgba(0, 0, 0, 0)' && t.bg !== 'transparent',
          `corner tag has no accent fill (got background:${t.bg}) — badge treatment did not apply`);
      }
    } finally {
      await page.close();
    }
  });
});
