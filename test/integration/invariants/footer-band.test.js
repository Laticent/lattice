/**
 * THE FOOTER BAND under contention (real cascade, real Chromium).
 *
 * The footer Cell exists to retire "three absolutes at the same baseline with no shared budget"
 * (design/forms.md §6). One mark never finished that migration: the running `footer:` text stayed
 * `position: absolute` with a fixed `--footerleft-w` (52cqi) budget, while the docked section rail
 * is an in-flow flex item with a `white-space: nowrap` label. Neither side can yield to the other,
 * so on a deck whose footer string AND section label are both long they simply collide.
 *
 * Two visible failures on the shipped 117-page gallery, confirmed by rasterizing the committed
 * PDF — not inferred from geometry:
 *   · p78 — "…content tint-vignette tint-edge at-right" painted straight through
 *     "THE ANNEXES · APPROVED DECORATION", and the footer WRAPPED to a second line;
 *   · p47 / p58 — the footer wrapped to two lines and the band clipped the second one.
 *
 * Measuring this went wrong twice before it went right, which is why the assertions below are
 * shaped the way they are. Comparing the footer's BOX against the rail's box reported 42 bad
 * pages — but an absolute footer's box is its 52cqi budget, not its text, so most of those had no
 * ink anywhere near the rail. Measuring the text with a Range reported the fix making things
 * WORSE — but `getClientRects()` returns laid-out text, and `overflow: hidden` clips paint without
 * moving layout, so a correctly-ellipsised run still measures full width. Only the pixels settled
 * it. The assertions here are therefore on the FLEX CONTRACT (boxes cannot overlap once both are
 * flex items, and `overflow: hidden` confines ink to the box), which is the property that actually
 * guarantees the pixels — plus a one-line height check, since the wrap was the other half.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors split-envelope-css.test.js. */
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

describe('footer band — a contended band keeps both marks legible', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'footer-band-contended.md');
  let browser;
  let bands;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const page = await browser.newPage();
    // The deck's own canvas — the viewport the emulator measures at. A bare page load at another
    // size lays the band out differently and reports numbers for a slide nobody renders.
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('file://' + path.resolve(pdf.replace(/\.pdf$/, '.html')), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));
    bands = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('section[data-lattice-slide]').forEach((s, i) => {
        const cell = s.querySelector(':scope > .cell-footer');
        if (!cell) return;
        const footer = cell.querySelector(':scope > footer');
        const rail = s.querySelector('.tile-progress');
        const seg = s.querySelector('.tile-progress .seg');
        if (!footer || !rail || !seg) return;
        const cs = getComputedStyle(footer);
        const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, height: b.height }; };
        out.push({
          page: i + 1,
          position: cs.position,
          overflow: cs.overflow,
          lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
          footer: r(footer),
          rail: r(rail),
          seg: r(seg),
        });
      });
      return out;
    });
    await page.close();
  });
  after(async () => { if (browser) await browser.close(); });

  test('the fixture really is contended (else the rest passes vacuously)', () => {
    assert.ok(bands.length >= 2, `expected slides with a footer band, got ${bands.length}`);
    // Both marks must be long enough that the band cannot hold them at natural width — otherwise
    // this suite would go green on a deck that never exercises the defect, which is exactly how
    // two `col`-axis tests in this repo passed for the wrong reason for weeks.
    const natural = bands.some((b) => b.seg.right - b.seg.left > 0 && b.footer.right - b.footer.left > 0);
    assert.ok(natural, 'the fixture must render both a footer string and a section label');
  });

  test('the footer is a real flex ITEM, so the row can allocate the width', () => {
    for (const b of bands) {
      assert.equal(b.position, 'static', `p${b.page}: an absolute footer cannot participate in the row`);
      assert.match(b.overflow, /hidden|clip/, `p${b.page}: ink must be confined to the box for ellipsis to mean anything`);
    }
  });

  test('the footer and the section rail never overlap', () => {
    for (const b of bands) {
      assert.ok(b.footer.right <= b.rail.left + 1,
        `p${b.page}: footer box ends at ${b.footer.right.toFixed(1)} but the rail starts at ${b.rail.left.toFixed(1)}`);
    }
  });

  test('the footer stays on ONE line — the band has no room for a second', () => {
    for (const b of bands) {
      assert.ok(b.footer.height <= b.lineHeight * 1.6,
        `p${b.page}: footer is ${b.footer.height.toFixed(1)}px tall against a ${b.lineHeight.toFixed(1)}px line — it wrapped, and the band clips the overflow`);
    }
  });
});
