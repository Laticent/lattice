#!/usr/bin/env node
/**
 * measure-code-columns — how many columns of code a slide shows before it cuts a line off, measured
 * in the browser that does the cutting, for every way a slide can change that width. Writes the
 * table `code-line-clipped` and `capacity-scale` judge lines against (lib/authoring/code-pane-columns.js).
 *
 * WHY A TABLE, AND WHY THIS ONE. A code panel never wraps unless its record says `wrap`, so a line
 * past its edge is cut mid-token, with no ellipsis and no scrollbar. How wide that edge is depends on
 * four things, and none of them is a formula a lint can do in its head:
 *   - the GROUP: a plain slide or a `code` slide (the same pane, measured identical), a `compare-code`
 *     pane (half as wide; it clips only at wide, the other boxes stack and wrap), and a slide whose
 *     `align-center` / `stats` or `align-left` / `align-right` class shrink-wraps the panel, which
 *     then grows with the line until the SLIDE cuts it (on the left, for centered and right-aligned);
 *   - the STAGE: `claim-hero` and `claim-bleed` (measured identical), `claim-quiet` and `compact`
 *     resize the stage the pane sits on;
 *   - the VENUE (`venue-*`, which a front-matter `venue:` stamps) and a spot `scale-*`: a scale
 *     enlarges the type, a venue adds the code lift (`--venue-compact-lift`), and a spot scale beside
 *     a venue REPLACES the venue's size in either direction, so `venue-conference scale-l` fits 77
 *     columns where the venue alone fits 68. Dividing 102 by the nominal factors gets two venues one
 *     column wrong (88 for 89 at huddle, 59 for 60 at hall); the table is what Chromium lays out;
 *   - the CANVAS: every registered `size:` is measured on its own, so a deck is judged by its own box
 *     rather than its family's narrowest (a 16:9 compare-code pane fits 48 columns, a 4K one 47).
 * Every combination is measured: 4 stages × 4 venues × 4 spot scales × 4 groups × 7 canvases, 1,792 cells.
 *
 * HOW. One deck per canvas, one slide per combination, each a fence holding a 240-column ruler,
 * rendered by lattice.js to HTML (`--no-split`) and opened in Chromium. A slide's number is the
 * columns of the ruler the reader can see: the code box cut by the panel when the panel clips, and
 * by the slide's own edge always, divided by the real advance of the real font.
 *
 * Usage:
 *   node tools/measure-code-columns.js            print the table it measures
 *   node tools/measure-code-columns.js --write    write lib/authoring/code-pane-columns.js
 *   node tools/measure-code-columns.js --check    exit 1 when the committed table differs
 * It needs Chromium (CHROME_PATH; the SessionStart hook exports it) and a built dist/lattice.js.
 * test/unit/components/code-line-width.test.js re-measures a sample of the table on every
 * `npm test` that has a browser; `--check` is the whole table.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'lib', 'authoring', 'code-pane-columns.js');

/** The registered canvases, in the table's column order. `size` is the deck's front matter. */
const CANVASES = Object.freeze([
  { size: null, key: '1280x720', family: 'wide' },
  { size: '4K', key: '3840x2160', family: 'wide' },
  { size: 'standard', key: '960x720', family: 'wide' },
  { size: 'square', key: '1080x1080', family: 'square' },
  { size: 'portrait', key: '1080x1350', family: 'tall' },
  { size: 'reel', key: '1080x1920', family: 'tall' },
  { size: 'mobile', key: '1080x2340', family: 'strip' },
]);
const GROUPS = Object.freeze(['pane', 'compare', 'centered', 'sided']);
/** The class a group's slide carries (a plain slide carries none). */
const GROUP_CLASS = Object.freeze({ pane: '', compare: 'compare-code', centered: 'align-center', sided: 'align-left' });
const STAGES = Object.freeze(['', 'claim-hero', 'claim-quiet', 'compact']);
const VENUES = Object.freeze(['', 'venue-huddle', 'venue-conference', 'venue-hall']);
const SPOTS = Object.freeze(['', 'scale-l', 'scale-xl', 'scale-2xl']);
const RULER = Array.from({ length: 240 }, (_, i) => String((i + 1) % 10)).join('');

/** Every combination's key, `stage|venue|spot`. */
function allCombos() {
  const out = [];
  for (const st of STAGES) for (const ve of VENUES) for (const sp of SPOTS) out.push(`${st}|${ve}|${sp}`);
  return out;
}

function slideFor(group, combo) {
  const classes = [GROUP_CLASS[group], ...combo.split('|')].filter(Boolean).join(' ');
  const head = `${classes ? `<!-- _class: ${classes} -->\n\n` : ''}# ${group}|${combo}\n\n`;
  return group === 'compare'
    ? `${head}\`L\`\n\n\`\`\`js\n${RULER}\n\`\`\`\n\n\`R\`\n\n\`\`\`js\n${RULER}\n\`\`\`\n`
    : `${head}\`\`\`js\n${RULER}\n\`\`\`\n`;
}

/**
 * Measure `groups` × `combos` on `canvases`. Resolves `{ [group]: { [combo]: { [canvasKey]: n | null } } }`,
 * null where the panel wraps (it cannot cut a line). `browser` is a puppeteer Browser.
 */
async function measureCodeColumns(browser, { groups = GROUPS, combos = allCombos(), canvases = CANVASES } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-columns-'));
  const out = {};
  try {
    for (const canvas of canvases) {
      const slides = [];
      for (const g of groups) for (const c of combos) slides.push(slideFor(g, c));
      const src = path.join(dir, `${canvas.key}.md`);
      const html = path.join(dir, `${canvas.key}.html`);
      fs.writeFileSync(src, `---\nmarp: true\ntheme: indaco\n${canvas.size ? `size: ${canvas.size}\n` : ''}---\n\n${slides.join('\n---\n\n')}`);
      execFileSync(process.execPath, [path.join(ROOT, 'dist/lattice.js'), src, html, 'indaco', '-q', '--no-split'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 1800000 });
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1000 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 600000 });
      const rows = await page.evaluate((rulerLength) => [...document.querySelectorAll('section')].map((sec) => {
        const name = sec.querySelector('h1')?.textContent || '';
        const pre = sec.querySelector('pre');
        if (!pre) return { name, n: null };
        const code = pre.querySelector('code') || pre;
        const ps = getComputedStyle(pre);
        const cs = getComputedStyle(code);
        if (cs.whiteSpace !== 'pre') return { name, n: null };
        // The real advance of the real font, measured by laying out real glyphs.
        const probe = document.createElement('span');
        probe.style.font = cs.font;
        probe.style.whiteSpace = 'pre';
        probe.style.position = 'absolute';
        probe.textContent = 'M'.repeat(100);
        code.appendChild(probe);
        const advance = probe.getBoundingClientRect().width / 100;
        probe.remove();
        const sr = sec.getBoundingClientRect();
        const pr = pre.getBoundingClientRect();
        const cr = code.getBoundingClientRect();
        const clips = /hidden|clip/.test(ps.overflowX);
        const left = Math.max(cr.left, clips ? pr.left + parseFloat(ps.paddingLeft) : -Infinity, sr.left);
        const right = Math.min(cr.left + rulerLength * advance, clips ? pr.right - parseFloat(ps.paddingRight) : Infinity, sr.right);
        return { name, n: Math.floor((right - left) / advance + 1e-6) };
      }), RULER.length);
      await page.close();
      for (const { name, n } of rows) {
        const [group, ...rest] = name.split('|');
        ((out[group] ??= {})[rest.join('|')] ??= {})[canvas.key] = n;
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

/** The data module's source, from a full measurement. */
function moduleSource(table) {
  const row = (group, combo) => {
    const cells = CANVASES.map((c) => table[group][combo][c.key]);
    return `[${cells.map((v) => (v == null ? 'null' : v)).join(', ')}]`;
  };
  const lines = [];
  for (const g of GROUPS) {
    lines.push(`  ${g}: Object.freeze({`);
    for (const combo of allCombos()) lines.push(`    '${combo}': ${row(g, combo)},`);
    lines.push('  }),');
  }
  return `/**
 * lib/authoring/code-pane-columns.js — MEASURED by tools/measure-code-columns.js --write; do not edit.
 * How many columns of code a slide shows before it cuts a line off, as Chromium lays it out.
 *
 * group → 'stage|venue|spot' → one count per canvas, in CANVASES order; null where the panel wraps.
 * Groups: pane (a plain slide, a \`code\` slide), compare (a \`compare-code\` pane), centered
 * (\`align-center\`, \`stats\`), sided (\`align-left\`, \`align-right\`). \`claim-bleed\` is read as
 * \`claim-hero\` (measured identical). The tool's header says how each number is taken.
 * Pure data: lint-core reads it (lib/authoring/lint-core.js \`codePaneColumns\`), in Node and the browser.
 */
const CANVASES = Object.freeze(${JSON.stringify(CANVASES.map((c) => c.key))});
const FAMILY = Object.freeze(${JSON.stringify(Object.fromEntries(CANVASES.map((c) => [c.key, c.family])))});
const COLUMNS = Object.freeze({
${lines.join('\n')}
});

module.exports = { CANVASES, FAMILY, COLUMNS };
`;
}

async function main(argv) {
  const { resolveChrome } = require('./lib/resolve-chrome');
  const exe = resolveChrome();
  if (!exe) {
    console.error('measure-code-columns: no Chromium (set CHROME_PATH).');
    return 2;
  }
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let table;
  try {
    table = await measureCodeColumns(browser);
  } finally {
    await browser.close();
  }
  const src = moduleSource(table);
  if (argv.includes('--write')) {
    fs.writeFileSync(OUT, src);
    console.log(`measure-code-columns: wrote ${path.relative(ROOT, OUT)}`);
    return 0;
  }
  if (argv.includes('--check')) {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === src;
    console.log(same ? 'measure-code-columns: the committed table is what Chromium measures.'
      : 'measure-code-columns: the committed table differs from what Chromium measures; re-run with --write and review the diff.');
    return same ? 0 : 1;
  }
  process.stdout.write(src);
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });

module.exports = { CANVASES, GROUPS, STAGES, VENUES, SPOTS, allCombos, measureCodeColumns };
