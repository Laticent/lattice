#!/usr/bin/env node
/**
 * chart-language-census — measure what each chart-family member ACTUALLY paints.
 *
 * The chart family shares tokens, kernels and a frame, and still reads as five
 * authors. Prose cannot settle that argument and neither can a still: the
 * question is whether two charts that mean the same thing ("this is a value
 * printed next to a mark", "this is a tick in the gutter") paint it the same
 * way, and that is a property of RESOLVED STYLE, not of the source.
 *
 * So this opens the rendered deck in a real browser and reads
 * getComputedStyle on every text node and every data mark inside each chart
 * section — after the cascade, after light-dark(), after color-mix(). What it
 * reports per member:
 *
 *   type      the (family, size, weight, transform) tuples actually used, and
 *             which SEMANTIC ROLE each carries — a value, a tick, a category,
 *             a series name, an axis title
 *   fill      how a data mark is filled: flat, linear wash, radial dome,
 *             translucent overlay — read off the paint server, not the class
 *   grid      which axis furniture is drawn (gridlines, axis lines, plot box,
 *             baseline, tick marks)
 *   key       how categories are named: a legend rail, direct end-labels,
 *             in-figure titles, or nothing
 *   marks     how many marks carry data-mark (popover) and data-anima-role
 *             (motion), the two interaction handles
 *
 * A census, not a gate. It fails on nothing and asserts nothing about what the
 * right answer is — it exists so a design argument starts from the same numbers
 * for everyone, and so the same command re-run after the work shows what moved.
 *
 * Usage:
 *   node tools/chart-language-census.js [deck.md] [--theme <name>] [--json <path>]
 *
 * Defaults to the chart bucket gallery, which is the one deck that carries every
 * member exactly once.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DECK = path.join(REPO, 'lib/components/chart/chart.gallery.md');

function parseArgs(argv) {
  const out = { deck: DEFAULT_DECK, theme: null, json: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--theme') out.theme = argv[++i];
    else if (argv[i] === '--json') out.json = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest[0]) out.deck = path.resolve(rest[0]);
  return out;
}

/**
 * The semantic roles a chart prints text in. Keyed by the class the kernels
 * emit; the point of the census is to show that the same role is painted
 * differently across members, so the role has to be named independently of
 * whatever the member happened to call it.
 */
const TEXT_ROLES = [
  ['value', ['cart-value', 'funnel-value', 'wc-word', 'bullet-value', 'gantt-value', 'progress-readout', 'sbar-value', 'waterfall-value', 'slope-value']],
  ['tick', ['cart-tick', 'radar-tick', 'quadrant-tick', 'axis-tick', 'map-tick']],
  ['category', ['cart-cat', 'funnel-label', 'radar-axis', 'quadrant-label', 'map-label', 'scatter-label', 'kanban-title', 'gantt-lane']],
  ['series', ['cart-series', 'slope-name', 'line-label']],
  ['axis-title', ['cart-axis-title', 'quadrant-axis', 'radar-axis-title']],
  ['legend', ['chart-key-label', 'chart-key-value', 'chart-key']],
  ['zone', ['quadrant-zone-label', 'quadrant-title']],
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    console.error('chart-language-census: CHROME_PATH is unset — this measures RESOLVED style,');
    console.error('which needs a real browser. Re-export it (see engineering/development.md).');
    process.exit(2);
  }
  if (!fs.existsSync(args.deck)) {
    console.error(`chart-language-census: no such deck — ${args.deck}`);
    process.exit(2);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-census-'));
  const html = path.join(tmp, 'deck.html');
  const emulator = path.join(REPO, 'dist/lattice-emulator.js');
  const emuArgs = [emulator, args.deck, html];
  if (args.theme) emuArgs.push(args.theme);
  execFileSync(process.execPath, emuArgs, { stdio: ['ignore', 'ignore', 'inherit'] });

  const puppeteer = require('puppeteer');
  let browser;
  let report;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });

    report = await page.evaluate((TEXT_ROLES_SERIAL) => {
      const TEXT_ROLES = TEXT_ROLES_SERIAL;
      const roleOf = (classList) => {
        for (const [role, classes] of TEXT_ROLES) {
          for (const c of classes) if (classList.includes(c)) return role;
        }
        return null;
      };

      // A chart section is one the chart frame claims. The class that is not
      // structural chrome is the member's own name.
      const CHROME = new Set([
        'chart-frame', 'viz-frame', 'standard', 'print', 'dark', 'light',
        'lr', 'td', 'silent', 'title', 'has-notes', 'split', 'auto-split',
      ]);

      const members = [];
      for (const sec of document.querySelectorAll('section.chart-frame')) {
        const name = [...sec.classList].find((c) => !CHROME.has(c) && !c.startsWith('size-') && !c.startsWith('deck-'));
        if (!name) continue;

        // ── type: the (role → resolved face) map, deduped ──────────────────
        const type = {};
        for (const el of sec.querySelectorAll('text, tspan, .chart-key-label, .chart-key-value, [class*="label"], [class*="value"], [class*="tick"], [class*="name"], [class*="title"]')) {
          const txt = (el.textContent || '').trim();
          if (!txt) continue;
          const cs = getComputedStyle(el);
          // A tspan inherits its face from the <text>; only record where the
          // element itself carries the paint, so one label is not counted twice.
          const cls = el.getAttribute('class') || '';
          const role = roleOf(cls) || (el.parentElement && roleOf(el.parentElement.getAttribute('class') || ''));
          if (!role) continue;
          const face = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
          const key = `${face} ${Math.round(parseFloat(cs.fontSize) * 10) / 10}px ${cs.fontWeight}${cs.textTransform !== 'none' ? ' ' + cs.textTransform : ''}`;
          (type[role] ||= new Set()).add(key);
        }

        // ── fill: read the paint server off the actual mark ────────────────
        // A mark is anything carrying a categorical or status slot. What we
        // want is the SHAPE of the paint (flat / linear / radial / alpha),
        // which is a property of the referenced <defs> node, not of the class.
        const fills = new Set();
        const markSel = [
          '[data-cat]', '[data-s]', '[data-series]', '[data-cell]',
          '.wedge', '.funnel-band', '.radar-poly', '.bar-mark', '.waterfall-bar',
          '.sbar-seg', '.quadrant-tint', '.quadrant-dot', '.map-region', '.scatter-dot',
          '.scatter-bubble', '.kanban-card', '.gantt-bar', '.progress-fill', '.state-node',
          '.cell-state', '.cell-filled', '.cell-outlined', '.journey-face', '.wc-word',
          '.timeline-marker', '.bullet-measure', '.slope-bar', '.line-band', '.line-area',
        ].join(', ');
        for (const el of sec.querySelectorAll(markSel)) {
          const cs = getComputedStyle(el);
          const svgFill = el.getAttribute('fill') || cs.fill;
          const bg = cs.backgroundImage;
          let shape = null;
          if (svgFill && /^url\(/.test(svgFill)) {
            const id = svgFill.replace(/^url\(["']?#?/, '').replace(/["']?\)$/, '');
            const def = sec.querySelector(`#${CSS.escape(id)}`);
            if (def) {
              const tag = def.tagName.toLowerCase();
              shape = tag === 'lineargradient' ? 'linear-gradient'
                : tag === 'radialgradient' ? 'radial-gradient'
                : tag === 'pattern' ? 'pattern' : tag;
            } else shape = 'url(unresolved)';
          } else if (bg && bg !== 'none') {
            shape = /radial/.test(bg) ? 'radial-gradient' : /linear/.test(bg) ? 'linear-gradient' : 'image';
          } else {
            const paint = svgFill && svgFill !== 'none' ? svgFill : cs.backgroundColor;
            // Alpha is the FOURTH component of rgba() / the slash operand of the
            // modern syntax — never "the last number in the string", which reads
            // the BLUE channel out of a 3-component rgb() and calls an opaque
            // fill translucent.
            let a = 1;
            const parts = /^rgba?\(([^)]*)\)/.exec(paint || '');
            if (parts) {
              const comps = parts[1].split(/[,/]/).map((t) => t.trim()).filter(Boolean);
              if (comps.length === 4) a = parseFloat(comps[3]);
            }
            shape = !paint || paint === 'none' || a === 0 ? 'none'
              : a < 0.95 ? `translucent(${a.toFixed(2)})` : 'flat';
          }
          if (shape) fills.add(shape);
        }

        // ── grid: which axis furniture is actually drawn ───────────────────
        const grid = [];
        const has = (sel) => sec.querySelector(sel) !== null;
        if (has('.cart-grid, .grid-line, [class*="gridline"], [class*="grid-"]')) grid.push('gridlines');
        if (has('.cart-axis, .axis-line, [class*="axis-line"]')) grid.push('axis-line');
        if (has('.cart-baseline, [class*="baseline"]')) grid.push('baseline');
        if (has('.cart-tickmark, [class*="tick-mark"], [class*="tickmark"]')) grid.push('tick-marks');
        if (has('.cart-plotbox, [class*="plot-box"], [class*="plotbox"], [class*="frame-box"]')) grid.push('plot-box');
        if (has('.radar-web, .radar-ring, .radar-spoke')) grid.push('polar-web');

        // ── key: how categories are named ──────────────────────────────────
        const key = [];
        if (has('[class*="chart-key"], .chart-legend, [class*="legend"]')) key.push('legend-rail');
        if (has('.cart-series, .slope-name, [class*="direct-label"]')) key.push('direct-labels');
        if (has('.quadrant-zone-label, .quadrant-title')) key.push('zone-titles');

        // ── interaction handles ────────────────────────────────────────────
        const marks = sec.querySelectorAll('[data-mark]').length;
        const anima = sec.querySelectorAll('[data-anima-role]').length;
        const details = sec.querySelectorAll('template.chart-detail').length;
        const svgs = sec.querySelectorAll('svg').length;

        members.push({
          name,
          type: Object.fromEntries(Object.entries(type).map(([k, v]) => [k, [...v].sort()])),
          fills: [...fills].sort(),
          grid,
          key,
          marks,
          anima,
          details,
          svgs,
        });
      }
      return members;
    }, TEXT_ROLES);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const label = args.theme ? `${path.basename(args.deck)} · ${args.theme}` : path.basename(args.deck);
  console.log(`\nchart-language census — ${label}  (${report.length} members)\n`);

  // 1. Type register per semantic role. The headline: one role, many faces.
  const roles = [...new Set(report.flatMap((m) => Object.keys(m.type)))].sort();
  console.log('── TYPE — how each member paints each semantic role ' + '─'.repeat(20));
  for (const role of roles) {
    const byFace = new Map();
    for (const m of report) {
      for (const face of m.type[role] || []) {
        const fam = face.split(' ')[0];
        (byFace.get(fam) || byFace.set(fam, []).get(fam)).push(m.name);
      }
    }
    const fams = [...byFace.keys()];
    const flag = fams.length > 1 ? '  ⟵ SPLIT' : '';
    console.log(`\n  ${role.padEnd(11)} ${fams.length} face(s)${flag}`);
    for (const [fam, who] of byFace) {
      console.log(`    ${fam.padEnd(18)} ${[...new Set(who)].sort().join(', ')}`);
    }
  }

  // 2. Fill finish.
  console.log('\n\n── FILL — how a data mark is painted ' + '─'.repeat(34));
  const byFill = new Map();
  for (const m of report) {
    for (const f of m.fills) (byFill.get(f) || byFill.set(f, []).get(f)).push(m.name);
  }
  for (const [f, who] of [...byFill].sort()) {
    console.log(`  ${f.padEnd(24)} ${who.sort().join(', ')}`);
  }

  // 3. Axis furniture + key, per member.
  console.log('\n\n── FURNITURE + KEY + HANDLES, per member ' + '─'.repeat(30));
  console.log(`  ${'member'.padEnd(14)} ${'grid'.padEnd(30)} ${'key'.padEnd(26)} mark/anima/detail`);
  for (const m of [...report].sort((a, b) => a.name.localeCompare(b.name))) {
    const handles = `${m.marks}/${m.anima}/${m.details}${m.svgs ? '' : '  (no svg → no motion)'}`;
    console.log(`  ${m.name.padEnd(14)} ${(m.grid.join(' ') || '—').padEnd(30)} ${(m.key.join(' ') || '—').padEnd(26)} ${handles}`);
  }

  console.log('');
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ deck: args.deck, theme: args.theme, members: report }, null, 2));
    console.log(`json → ${args.json}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
