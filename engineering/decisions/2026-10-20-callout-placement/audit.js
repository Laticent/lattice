// Callout + key space audit: every chart gallery slide, four slide shapes, measured in Chromium.
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { execFileSync } = require('node:child_process');
const REPO = path.resolve(__dirname, '../../..');
const { resolveChrome } = require(path.join(REPO, 'tools/lib/resolve-chrome.js'));
const SIZES = (process.env.SIZES || 'hd,standard,square,portrait').split(',');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const out = process.argv[2] || path.join(__dirname, 'audit.json');

const SCRAPE = (CHARTS) => {
  const r = (b) => [b.left, b.top, b.right, b.bottom];
  const union = (rs) => rs.length ? [Math.min(...rs.map(x => x[0])), Math.min(...rs.map(x => x[1])), Math.max(...rs.map(x => x[2])), Math.max(...rs.map(x => x[3]))] : null;
  const LEAF = 'text, rect, path, circle, ellipse, polygon, polyline, line, image, use';
  const vis = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity !== 0; };
  const rows = [];
  for (const sec of document.querySelectorAll('section[data-class]')) {
    const comp = sec.dataset.class.trim().split(/\s+/)[0];
    const stage = sec.querySelector('.cell-stage');
    if (!stage || !CHARTS.includes(comp)) continue;
    const S = sec.getBoundingClientRect(); const st = stage.getBoundingClientRect();
    const isKey = (e) => { let n = e; while (n && n !== stage) { const c = (n.getAttribute?.('class')) || ''; if (/legend--anchored/.test(c)) return false; if (/(^|[\s_-])(key|legend)([\s_-]|$)|chart-key|-key\b|-legend\b|legend-/.test(c)) return true; n = n.parentElement; } return false; };
    const leaves = [];
    for (const e of stage.querySelectorAll(LEAF + ', div, span, li, p, td, th')) {
      if (!vis(e)) continue;
      if (/^(div|span|li|p|td|th)$/i.test(e.tagName)) {
        // HTML: only boxes that paint (text of their own or a background)
        const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        const cs = getComputedStyle(e); const bg = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0;
        if (!own && !bg) continue;
      }
      if (e.closest('defs, clipPath, mask, marker, symbol, title, desc, .chart-sr-only, [class*="sr-only"], .visually-hidden')) continue;
      const b = e.getBoundingClientRect(); if (b.width * b.height < 0.5 && !(b.width > 0 || b.height > 0)) continue;
      // background rect that fills the whole svg/panel: skip
      leaves.push({ b: r(b), key: isKey(e), mark: !!e.closest('[data-mark]') });
    }
    const all = union(leaves.map(l => l.b));
    const key = union(leaves.filter(l => l.key).map(l => l.b));
    const fig = union(leaves.filter(l => !l.key).map(l => l.b));
    const marks = union(leaves.filter(l => l.mark).map(l => l.b));
    const f = (b) => b?.map((v, i) => +(((i % 2 ? v - st.top : v - st.left)) / (i % 2 ? st.height : st.width)).toFixed(4));
    const keySide = key && fig ? (key[0] >= fig[2] - 2 ? 'right' : key[1] >= fig[3] - 2 ? 'below' : key[3] <= fig[1] + 2 ? 'above' : key[2] <= fig[0] + 2 ? 'left' : 'inside') : 'none';
    const svgs = [...stage.querySelectorAll('svg')].filter(s => s.viewBox?.baseVal && s.viewBox.baseVal.width > 50);
    rows.push({ slide: +sec.id || rows.length + 1, comp, slide_wh: [Math.round(S.width), Math.round(S.height)], stage_frac: [+(st.width / S.width).toFixed(3), +(st.height / S.height).toFixed(3)], stage_ar: +(st.width / st.height).toFixed(3),
      medium: svgs.length ? 'svg' : 'html', vb: svgs[0] ? [svgs[0].viewBox.baseVal.width, svgs[0].viewBox.baseVal.height] : null,
      all: f(all), fig: f(fig), marks: f(marks), key: f(key), keySide,
      heading: sec.querySelector('h1,h2')?.textContent?.slice(0, 60) || '' });
  }
  return rows;
};

(async () => {
  const chrome = resolveChrome(); const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legend-audit-'));
  const res = [];
  const galleries = fs.readdirSync(path.join(REPO, 'lib/components/chart')).filter(d => !d.startsWith('_') && fs.existsSync(path.join(REPO, 'lib/components/chart', d, `${d}.gallery.md`))).filter(d => !ONLY || ONLY.includes(d));
  for (const g of galleries) {
    const src = fs.readFileSync(path.join(REPO, 'lib/components/chart', g, `${g}.gallery.md`), 'utf8');
    for (const size of SIZES) {
      const md = src.replace(/^---\n/, `---\nsize: ${size}\n`).replace(/^size: .*\n(?=[\s\S]*?^size:)/m, (m) => m);
      const deckDir = path.join(tmp, g); fs.mkdirSync(deckDir, { recursive: true });
      // keep relative assets working: write beside the original
      const deck = path.join(REPO, 'lib/components/chart', g, `.audit-${size}.md`);
      fs.writeFileSync(deck, md);
      const html = path.join(deckDir, `${size}.html`);
      try { execFileSync(process.execPath, [path.join(REPO, 'dist/lattice.js'), deck, html], { stdio: 'ignore' }); }
      catch (_e) { console.error('render failed', g, size); fs.unlinkSync(deck); continue; }
      fs.unlinkSync(deck);
      await page.setViewport({ width: 1600, height: 1600 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      const rows = await page.evaluate(SCRAPE, galleries);
      for (const row of rows) res.push({ gallery: g, size, ...row });
      process.stderr.write(`${g} ${size}: ${rows.length}\n`);
    }
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`${res.length} rows → ${out}`);
})().catch((e) => { console.error(e); process.exit(2); });
