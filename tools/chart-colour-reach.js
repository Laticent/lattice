#!/usr/bin/env node
/**
 * chart-colour-reach — how far does colour actually travel into a chart?
 *
 * The census answers what each member paints. The separation audit answers
 * whether two categories can be told apart. Neither answers the question a
 * designer asks first, and the one behind "our charts have gone grey": of all
 * the ink on this chart, how much of it is CHROMATIC, and where does the colour
 * stop?
 *
 * It stops somewhere specific in most charts. A fill is coloured, its edge is
 * coloured, and then the label naming that fill is grey, the tick beside it is
 * grey, the axis title above it is grey. That is not restraint — the reader is
 * given a colour and then made to re-find which thing it belonged to. The
 * engine already ships the token that fixes it: `--chart-cat-N-ink` is the
 * category's hue AS TEXT, solved to AA on both canvases, and three members use
 * it correctly while the rest ignore it.
 *
 * So this measures, per member, over every painted element:
 *
 *   KEYED    text whose colour matches one of the categorical inks — it NAMES a
 *            category by colour, so a reader knows what it belongs to
 *   GENERIC  text in a theme ink (heading / body / muted), whatever chroma that
 *            token happens to carry
 *
 * The distinction matters more than "is it coloured", and an earlier version of
 * this tool got it wrong by asking the easier question. Indaco's --text-body is
 * #1E3A5F, a navy: it clears any reasonable chroma floor, so measuring chroma
 * alone reported that 97% of the family's text was "coloured" while a label
 * beside a green line was still navy and still told the reader nothing about
 * which series it named. Chroma is not reach. MATCHING the mark is reach.
 *
 * HOW MUCH TO TRUST IT. `near()` is a perceptual match, not a string compare —
 * a label may be the ink where its mark is the hue, and they are meant to read
 * as one colour. That tolerance can over-count on a theme whose body ink sits
 * near a categorical slot. Measured across indaco (blue-led), onyx (achromatic)
 * and cuoio (warm) the family scores 68 / 66 / 66 percent, and that stability
 * across three palettes that could not all share the same false match is the
 * reason to believe the number at all. Treat it as a direction, not a gauge.
 *
 * A DIAGNOSTIC, not a gate. There is no correct reach — a chart whose colour
 * carries nothing SHOULD be mostly neutral. What it is for is finding members
 * whose colour stops early for no reason, and giving a finish something
 * measurable to differ on: two finishes that produce the same reach on the same
 * chart are two names for one finish.
 *
 * Usage:
 *   node tools/chart-colour-reach.js [deck.md] [--theme <name>]
 *        [--chroma-floor <n>] [--json <path>]
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hexToOklch, rgbToHex } = require('../lib/theme/color');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DECK = path.join(REPO, 'lib/components/chart/chart.gallery.md');
const DEFAULT_FLOOR = 0.03;

function parseArgs(argv) {
  const out = { deck: DEFAULT_DECK, theme: null, floor: DEFAULT_FLOOR, json: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--theme') out.theme = argv[++i];
    else if (argv[i] === '--chroma-floor') out.floor = parseFloat(argv[++i]);
    else if (argv[i] === '--json') out.json = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest[0]) out.deck = path.resolve(rest[0]);
  return out;
}

function cssToHex(css) {
  const m = /^rgba?\(([^)]*)\)/.exec((css || '').trim());
  if (!m) return null;
  const c = m[1].split(/[,/]/).map((t) => parseFloat(t.trim()));
  if (c.length < 3 || c.slice(0, 3).some(Number.isNaN)) return null;
  return rgbToHex([c[0], c[1], c[2]]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    console.error('chart-colour-reach: CHROME_PATH is unset — this reads RESOLVED paint.');
    process.exit(2);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
  const html = path.join(tmp, 'd.html');
  const emu = [path.join(REPO, 'dist/lattice-emulator.js'), args.deck, html];
  if (args.theme) emu.push(args.theme);
  execFileSync(process.execPath, emu, { stdio: ['ignore', 'ignore', 'inherit'] });

  const puppeteer = require('puppeteer');
  let browser;
  let raw;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    raw = await page.evaluate(() => {
      const px = document.createElement('canvas');
      px.width = px.height = 1;
      const cx = px.getContext('2d', { willReadFrequently: true });
      const toRgb = (c) => {
        if (!c || c === 'none') return null;
        cx.clearRect(0, 0, 1, 1);
        cx.fillStyle = '#000';
        cx.fillStyle = c;
        cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        return d[3] === 0 ? null : `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      };
      const CHROME_CLS = new Set(['chart-frame', 'viz-frame', 'standard', 'dark', 'light', 'lr', 'row', 'td']);
      const out = [];
      for (const sec of document.querySelectorAll('section.chart-frame')) {
        const name = [...sec.classList].find(
          (c) => !CHROME_CLS.has(c) && !c.startsWith('size-') && !c.startsWith('deck-'),
        );
        if (!name) continue;
        const row = { name, marks: [], ink: [], rules: [] };

        // The categorical inks this theme resolves to, so text can be matched
        // against them rather than merely scored for chroma.
        const probe = document.createElement('span');
        sec.appendChild(probe);
        const catInks = [];
        for (let n = 1; n <= 8; n++) {
          probe.style.color = `var(--chart-cat-${n}-ink)`;
          const v = toRgb(getComputedStyle(probe).color);
          if (v) catInks.push(v);
        }
        probe.remove();
        row.catInks = catInks;

        // TEXT — recorded with its colour, classified in node against catInks.
        for (const t of sec.querySelectorAll('text, .chart-key-label, [class*="label"], [class*="name"], [class*="title"], [class*="value"]')) {
          if (!(t.textContent || '').trim()) continue;
          const tag = t.tagName.toLowerCase();
          if (tag === 'g' || tag === 'svg' || tag === 'defs') continue;
          const cs = getComputedStyle(t);
          const isSvg = t.namespaceURI === 'http://www.w3.org/2000/svg';
          const c = toRgb(isSvg ? cs.fill : cs.color);
          if (c) row.ink.push(c);
        }
        // MARKS — a data mark's own paint.
        const MARK = '[data-cat],[data-cell],[data-series],.wedge,.funnel-band,.radar-poly,.bar-mark,.waterfall-bar,.sbar-seg,.quadrant-tint,.quadrant-dot,.map-region,.scatter-dot,.gantt-bar,.cell-filled,.kanban-card,.wc-word';
        for (const m of sec.querySelectorAll(MARK)) {
          const cs = getComputedStyle(m);
          const isSvg = m.namespaceURI === 'http://www.w3.org/2000/svg';
          let c = null;
          if (isSvg) {
            const f = cs.fill;
            if (f && !/^url\(/.test(f) && f !== 'none') c = toRgb(f);
            if (!c) c = toRgb(cs.stroke);
          } else {
            c = toRgb(cs.backgroundColor);
          }
          if (c) row.marks.push(c);
        }
        // RULES — axis, grid, web, bounds.
        for (const r of sec.querySelectorAll('.cart-grid,.cart-axis,.cart-zero,.radar-web,.radar-ring,.radar-spoke,.quadrant-bounds,.quadrant-split,.chart-leader')) {
          const cs = getComputedStyle(r);
          const c = toRgb(cs.stroke) || toRgb(cs.fill);
          if (c) row.rules.push(c);
        }
        out.push(row);
      }
      return out;
    });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const oklch = (css) => { const h = cssToHex(css); if (!h) return null; try { return hexToOklch(h); } catch { return null; } };
  // Two colours "match" when they are the same ink to a reader — a small OKLab
  // distance, not an exact string compare, because a label may be the ink and a
  // mark the hue and they are meant to read as one colour.
  const near = (a, b) => {
    if (!a || !b) return false;
    const A = oklch(a); const B = oklch(b);
    if (!A || !B) return false;
    const dh = Math.min(Math.abs(A.h - B.h), 360 - Math.abs(A.h - B.h));
    return Math.abs(A.L - B.L) < 0.18 && Math.abs(A.C - B.C) < 0.09 && (A.C < 0.03 ? true : dh < 22);
  };

  const rows = raw.map((r) => {
    const inks = r.catInks || [];
    // KEYED text: its colour is one of the categorical inks, so it names a
    // category by colour. GENERIC text: a theme ink, whatever chroma it carries.
    const keyed = r.ink.filter((c) => inks.some((k) => near(c, k))).length;
    const markChroma = r.marks.map(oklch).filter(Boolean);
    const markChromatic = markChroma.filter((c) => c.C >= args.floor).length;
    const ruleChroma = r.rules.map(oklch).filter(Boolean);
    const ruleChromatic = ruleChroma.filter((c) => c.C >= args.floor).length;
    return {
      name: r.name,
      ink: { n: r.ink.length, keyed },
      marks: { n: markChroma.length, chromatic: markChromatic },
      rules: { n: ruleChroma.length, chromatic: ruleChromatic },
    };
  });

  const label = args.theme ? `${path.basename(args.deck)} · ${args.theme}` : path.basename(args.deck);
  console.log(`\ncolour reach — ${label}   (does a label wear the colour of what it names?)\n`);
  console.log(`  ${'member'.padEnd(14)} ${'marks chromatic'.padEnd(17)} ${'TEXT keyed to a category'.padEnd(26)} rules`);
  const pc = (a, b) => (b === 0 ? '—' : `${a}/${b} (${Math.round((a / b) * 100)}%)`);
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const flag = r.ink.n > 0 && r.ink.keyed === 0 ? '   ← no text names its mark by colour' : '';
    console.log(`  ${r.name.padEnd(14)} ${pc(r.marks.chromatic, r.marks.n).padEnd(17)} ${pc(r.ink.keyed, r.ink.n).padEnd(26)} ${pc(r.rules.chromatic, r.rules.n)}${flag}`);
  }
  const totalInk = rows.reduce((a, r) => a + r.ink.n, 0);
  const keyedInk = rows.reduce((a, r) => a + r.ink.keyed, 0);
  const none = rows.filter((r) => r.ink.n > 0 && r.ink.keyed === 0);
  console.log(`\n  ${keyedInk} of ${totalInk} text elements (${Math.round((keyedInk / totalInk) * 100)}%) wear the colour of the thing they name.`);
  console.log(`  ${none.length} of ${rows.length} members have NO text keyed to a category:`);
  console.log(`    ${none.map((r) => r.name).join(', ') || '—'}`);
  console.log('\n  --chart-cat-N-ink is the token for this, solved to AA on both canvases.\n');

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ ...args, rows }, null, 2));
    console.log(`json → ${args.json}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
