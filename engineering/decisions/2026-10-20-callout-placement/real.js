// The real engine's plot area for a placement, at the slide shapes. Renders a deck at each shape
// with the CLI, opens each in Chromium and measures the union of the heatmap cells, in px.
//   node real.js <deck.md> <out.json>     (run once on main and once on the branch, then compare)
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { execFileSync } = require('node:child_process');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer-core'));
const { resolveChrome } = require(path.join(REPO, 'tools/lib/resolve-chrome.js'));
const SIZES = ['hd', 'standard', 'square', 'portrait', 'story'];
const [deck, out] = process.argv.slice(2);
(async () => {
  const browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  const res = {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'real-'));
  for (const size of SIZES) {
    const html = path.join(tmp, `${size}.html`);
    execFileSync('node', [path.join(REPO, 'lattice.js'), deck, html, '--size', size, '-q'], { cwd: REPO, stdio: 'ignore' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(`file://${html}`);
    await new Promise((r) => setTimeout(r, 800));
    res[size] = await page.evaluate(() => [...document.querySelectorAll('section')].map((sec) => {
      const cells = [...sec.querySelectorAll('svg.heatmap-svg rect.heatmap-cell')].filter((r) => !r.classList.contains('chart-key-swatch'));
      if (!cells.length) return null;
      const b = cells.map((c) => c.getBoundingClientRect());
      const w = Math.max(...b.map((r) => r.right)) - Math.min(...b.map((r) => r.left));
      const h = Math.max(...b.map((r) => r.bottom)) - Math.min(...b.map((r) => r.top));
      const S = sec.getBoundingClientRect();
      return { area: Math.round(w * h), slide: Math.round(S.width * S.height) };
    }));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(res));
})();
