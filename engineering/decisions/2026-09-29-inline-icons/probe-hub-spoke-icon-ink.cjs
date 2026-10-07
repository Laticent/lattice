#!/usr/bin/env node
/**
 * The worst icon-on-disc contrast on a hub-spoke chart, per disc kind and mode
 * (engineering/decisions/2026-09-29-inline-icons.md § 14). It renders examples/hub-spoke-icons.md
 * under every flat-fill palette in light and dark, with no finish, each chart finish and
 * `mode: sketch`, reads every icon's computed stroke and its disc's computed fill in Chromium,
 * and prints the minimum WCAG contrast ratio for each kind (hub, neutral, group, status).
 *
 *   node engineering/decisions/2026-09-29-inline-icons/probe-hub-spoke-icon-ink.cjs [variant…]
 *
 * Variants: plain, pigment, etching, tone, sketch (default: all five). Needs `npm run build`
 * and CHROME_PATH. Writes its renders to a temp directory.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '../../..');
const PALETTES = ['ardesia', 'atelier', 'brina', 'burgundy', 'carbone', 'carta', 'concrete', 'crepuscolo', 'cuoio', 'indaco', 'laguna', 'magnolia', 'mustard', 'onyx'];
const VARIANTS = { plain: '', pigment: 'chart-finish: pigment', etching: 'chart-finish: etching', tone: 'chart-finish: tone', sketch: 'mode: sketch' };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTS);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-icon-ink-'));
  const deck = fs.readFileSync(path.join(ROOT, 'examples/hub-spoke-icons.md'), 'utf8');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  for (const v of wanted) {
    const src = path.join(tmp, `${v}.md`);
    fs.writeFileSync(src, VARIANTS[v] ? deck.replace(/^theme: indaco$/m, `theme: indaco\n${VARIANTS[v]}`) : deck);
    const worst = {};
    for (const pal of PALETTES.flatMap((p) => [p, `${p}-dark`])) {
      const html = path.join(tmp, `${v}-${pal}.html`);
      execFileSync('node', [path.join(ROOT, 'lattice-emulator.js'), '-q', '-p', pal, src, html], { stdio: 'ignore' });
      const page = await browser.newPage();
      await page.goto(`file://${html}`, { waitUntil: 'load' });
      const rows = await page.evaluate(() => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
        const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        return [...document.querySelectorAll('.hub-spoke-icon')].map((g) => {
          const svg = g.closest('svg.hub-spoke-svg');
          const disc = g.hasAttribute('data-hub') ? svg.querySelector('.hub-spoke-hub') : svg.querySelector(`[data-mark="${g.getAttribute('data-mark-for')}"]`);
          const kind = g.hasAttribute('data-hub') ? 'hub' : g.hasAttribute('data-s') ? 'status' : disc.hasAttribute('data-hue') ? 'group' : 'neutral';
          return { kind, r: ratio(rgb(getComputedStyle(g.querySelector('svg')).stroke), rgb(getComputedStyle(disc).fill)) };
        });
      });
      await page.close();
      const mode = pal.endsWith('-dark') ? 'dark' : 'light';
      for (const { kind, r } of rows) {
        const k = `${mode} ${kind}`;
        if (!worst[k] || r < worst[k].r) worst[k] = { r, pal };
      }
    }
    console.log(`== ${v}`);
    for (const [k, { r, pal }] of Object.entries(worst).sort()) console.log(`  ${k.padEnd(14)} ${r.toFixed(2)}:1  (${pal})`);
  }
  await browser.close();
})();
