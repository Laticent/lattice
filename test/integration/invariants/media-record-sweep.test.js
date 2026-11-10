/**
 * THE MEDIA RECORD SWEEP (engineering/decisions/2026-10-16-media-plugins.md §4.11, "every combination is swept for movement"):
 * every size × frame × `show=` of an `@image{…}` record in a flow host, rendered by the real CLI and measured in Chromium. It
 * asks what the fit gates cannot: do the sizes stay in order (sm ≤ md ≤ lg, frame included), does any figure leave the slide,
 * does the heading above hold still, and does the paragraph below ever overlap the figure? The picture's header is read by
 * the CLI, so the box is known before the bytes (`--lat-media-ar`); the sweep also checks the box does not move when the
 * picture is taken away.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.resolve(__dirname, '../../..');
const SIZES = ['sm', 'md', 'lg'];
const FRAMES = ['', 'mat', 'keyline', 'float', 'device', 'corners'];
const SHOWS = ['none', 'title', 'all'];

test('every size, frame and show= stays in order, on the slide, under a still heading, clear of the text below', { timeout: 300000, skip: skipWithoutChrome(resolveChrome()) }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-sweep-'));
  fs.copyFileSync(path.join(ROOT, 'examples/media/canoe.jpg'), path.join(dir, 'canoe.jpg'));
  const combos = [];
  for (const frame of FRAMES) for (const show of SHOWS) for (const size of SIZES) combos.push({ frame, show, size });
  const slides = combos.map(({ frame, show, size }) =>
    `<!-- _class: content -->\n\n## The same heading on every slide\n\n\`@image{canoe.jpg, title="Lake", description="Dawn", ${size}${frame ? `, frame=${frame}` : ''}, show=${show}}\`\n\nOne paragraph of text below the picture.`);
  const deck = path.join(dir, 'sweep.md');
  fs.writeFileSync(deck, `---\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`);
  const html = path.join(dir, 'sweep.html');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'dist/lattice.js'), deck, html, '-q'], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: { ...process.env, CHROME_PATH: resolveChrome() } });
  assert.equal(r.status, 0, r.stderr);

  // Puppeteer, as the other integration tests drive Chromium (Playwright is not a root dependency in CI).
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: 'new', executablePath: resolveChrome(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const measure = () => page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide], section[id]')].filter((s) => s.querySelector('figure.lat-media')).map((s) => {
      const sec = s.getBoundingClientRect();
      const fig = s.querySelector('figure.lat-media');
      const frame = fig.querySelector('.lat-media-frame').getBoundingClientRect();
      const box = fig.getBoundingClientRect();
      const h2 = s.querySelector('h2').getBoundingClientRect();
      const p = [...s.querySelectorAll('p')].find((el) => el.textContent.includes('One paragraph'));
      const pr = p ? p.getBoundingClientRect() : null;
      return { frameW: frame.width, top: h2.top - sec.top, inside: box.left >= sec.left - 1 && box.right <= sec.right + 1 && box.bottom <= sec.bottom + 1, clear: !pr || pr.top >= box.bottom - 1, figH: box.height };
    }));
    const warm = await measure();
    assert.equal(warm.length, combos.length, 'every slide drew its figure');
    const at = (frame, show, size) => warm[combos.findIndex((c) => c.frame === frame && c.show === show && c.size === size)];
    for (const frame of FRAMES) for (const show of SHOWS) {
      const [sm, md, lg] = SIZES.map((size) => at(frame, show, size));
      assert.ok(sm.frameW <= md.frameW + 0.5 && md.frameW <= lg.frameW + 0.5, `sizes out of order: frame=${frame || 'none'} show=${show} (${sm.frameW}, ${md.frameW}, ${lg.frameW})`);
    }
    warm.forEach((m, i) => {
      const c = combos[i];
      const name = `size=${c.size} frame=${c.frame || 'none'} show=${c.show}`;
      assert.ok(m.inside, `${name}: the figure leaves the slide`);
      assert.ok(m.clear, `${name}: the paragraph below overlaps the figure`);
      assert.ok(Math.abs(m.top - warm[0].top) <= 1, `${name}: the heading moved (${m.top} vs ${warm[0].top})`);
    });
    // The box before the bytes: take every picture away and measure again.
    await page.evaluate(() => { for (const img of document.querySelectorAll('figure.lat-media img')) img.removeAttribute('src'); });
    const cold = await measure();
    cold.forEach((m, i) => {
      assert.ok(Math.abs(m.figH - warm[i].figH) <= 1, `${combos[i].size}/${combos[i].frame || 'none'}/${combos[i].show}: the box moved when the picture was taken away (${warm[i].figH} → ${m.figH})`);
    });
  } finally {
    await browser.close();
  }
});
