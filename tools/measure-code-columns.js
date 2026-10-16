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
 *     rather than its family's narrowest (a 16:9 compact side-aligned pane at scale-l fits 97 columns, a 4K one 96).
 * Every combination is measured: 4 stages × 4 venues × 4 spot scales × 4 groups × 7 canvases, 1,792 cells.
 *
 * HOW. One deck per canvas, one slide per combination, each a fence holding a 240-column ruler,
 * rendered by lattice.js to HTML (`--no-split`) and opened in Chromium. A slide's number is the
 * columns of the ruler the reader can see: the code box cut by the panel when the panel clips, and
 * by the slide's own edge always, divided by the real advance of the real font.
 *
 * THE BAR, measured the same way. A block's `title=` and a copy block's buttons sit in a bar above the
 * code, which takes height the line-capacity rules count in code lines. Per canvas, panel group
 * (pane, compare) and room size (the designed size, each venue, each spot scale), it records what the
 * bar costs in hundredths of a code line: an empty copy bar, a one-row title without and with the
 * buttons, each further title row, and how many title characters fit a row without and with them.
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

/** The room sizes the bar is measured at: the designed size, each venue, each spot scale. */
const RUNGS = Object.freeze(['', 'venue-huddle', 'venue-conference', 'venue-hall', 'scale-l', 'scale-xl', 'scale-2xl']);
/** The layout a bar group's slide carries. */
const BAR_LAYOUT = Object.freeze({ pane: 'code', compare: 'compare-code' });
const LONG_TITLE = 'abcdefghij'.repeat(30);
const BAR_VARIANTS = Object.freeze({
  plain: '', copy: 'copy', title: 'title=a.ts', titleCopy: 'copy, title=a.ts',
  long: `title="${LONG_TITLE}"`, longCopy: `copy, title="${LONG_TITLE}"`,
});
/** The order of a bar cell's numbers. */
const BAR_FIELDS = Object.freeze(['copy', 'title', 'titleCopy', 'row', 'rowCopy', 'cols', 'colsCopy']);

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
        // A twentieth of a column of slack (half a pixel at 16:9, the same share of a glyph on every
        // canvas): a column that overshoots the edge by less draws whole, and the panel clips at its
        // padding edge, further out. A layout scaled up (4K is the 16:9 slide at 3x) carries float
        // error; without the slack a 4K compare-code pane measured 47.9998 columns and was called 47
        // where it draws 48, as 16:9 does (examples/gallery-jargon.md slide 45 renders its 48 whole).
        return { name, n: Math.floor((right - left) / advance + 0.05) };
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

/**
 * Measure what the bar costs. Resolves `{ [group]: { [rung]: { [canvasKey]: number[] } } }`, each cell
 * in BAR_FIELDS order: costs in hundredths of a code line, counts in characters.
 */
async function measureCodeBars(browser, { groups = Object.keys(BAR_LAYOUT), rungs = RUNGS, canvases = CANVASES } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-bars-'));
  const out = {};
  try {
    for (const canvas of canvases) {
      const slides = [];
      for (const g of groups) for (const r of rungs) for (const [v, rec] of Object.entries(BAR_VARIANTS)) {
        const block = `${rec ? `\`@code{${rec}}\`\n` : ''}\`\`\`js\nconst a = 1;\nconst b = 2;\n\`\`\`\n`;
        const body = g === 'compare' ? `\`L\`\n\n${block}\n\`R\`\n\n\`\`\`js\nx\n\`\`\`\n` : block;
        slides.push(`<!-- _class: ${[BAR_LAYOUT[g], r].filter(Boolean).join(' ')} -->\n\n# ${g}|${r}|${v}\n\n${body}`);
      }
      const src = path.join(dir, `${canvas.key}.md`);
      const html = path.join(dir, `${canvas.key}.html`);
      fs.writeFileSync(src, `---\nmarp: true\ntheme: indaco\n${canvas.size ? `size: ${canvas.size}\n` : ''}---\n\n${slides.join('\n---\n\n')}`);
      execFileSync(process.execPath, [path.join(ROOT, 'dist/lattice.js'), src, html, 'indaco', '-q', '--no-split'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 1800000 });
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1000 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 600000 });
      const rows = await page.evaluate(() => [...document.querySelectorAll('section')].map((sec) => {
        const pre = sec.querySelector('pre');
        const code = pre.querySelector('code');
        const title = pre.querySelector(':scope > .lat-code-title');
        // Two lines of code: half the box is one line's pitch.
        const pitch = code.getBoundingClientRect().height / 2;
        // How far the code starts below the panel's own padding: the bar, its rule and its spacing.
        const above = code.getBoundingClientRect().top - pre.getBoundingClientRect().top - parseFloat(getComputedStyle(pre).paddingTop);
        let rowsOf = 0;
        let perRow = 0;
        const text = title?.firstChild?.nodeType === 3 ? title.firstChild : null;
        if (text) {
          const range = document.createRange();
          const tops = [];
          for (let i = 0; i < text.length; i += 1) {
            range.setStart(text, i);
            range.setEnd(text, i + 1);
            const q = range.getClientRects()[0];
            if (q) tops.push(Math.round(q.top));
          }
          rowsOf = new Set(tops).size;
          perRow = tops.filter((t) => t === tops[0]).length;
        }
        return { name: sec.querySelector('h1').textContent, pitch, above, rows: rowsOf, perRow };
      }));
      await page.close();
      const by = Object.fromEntries(rows.map((r) => [r.name, r]));
      for (const g of groups) {
        for (const r of rungs) {
          const at = (v) => by[`${g}|${r}|${v}`];
          const base = at('plain');
          const cost = (v) => Math.round((100 * (at(v).above - base.above)) / base.pitch);
          const perRowCost = (v, one) => Math.round((100 * (at(v).above - at(one).above)) / base.pitch / Math.max(1, at(v).rows - 1));
          ((out[g] ??= {})[r] ??= {})[canvas.key] = [
            cost('copy'), cost('title'), cost('titleCopy'),
            perRowCost('long', 'title'), perRowCost('longCopy', 'titleCopy'),
            at('long').perRow, at('longCopy').perRow,
          ];
        }
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

/** The data module's source, from a full measurement. */
function moduleSource(table, bars) {
  const row = (group, combo) => {
    const cells = CANVASES.map((c) => table[group][combo][c.key]);
    return `[${cells.map((v) => (v == null ? 'null' : v)).join(', ')}]`;
  };
  const barLines = [];
  for (const g of Object.keys(BAR_LAYOUT)) {
    barLines.push(`  ${g}: Object.freeze({`);
    for (const r of RUNGS) barLines.push(`    '${r}': [${CANVASES.map((c) => `[${bars[g][r][c.key].join(', ')}]`).join(', ')}],`);
    barLines.push('  }),');
  }
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

/**
 * What a code block's bar (its \`title=\`, or a copy block's empty bar) costs, measured the same way.
 * group → room size ('' designed, a \`venue-*\`, a \`scale-*\`) → one cell per canvas, in CANVASES order:
 * [${BAR_FIELDS.join(', ')}]. Costs are hundredths of a code line (an empty copy bar; a one-row title
 * without and with the buttons; each further title row, without and with them); cols are the title
 * characters a row holds, without and with the buttons.
 */
const BAR_FIELDS = Object.freeze(${JSON.stringify(BAR_FIELDS)});
const BAR = Object.freeze({
${barLines.join('\n')}
});

module.exports = { CANVASES, FAMILY, COLUMNS, BAR_FIELDS, BAR };
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
  let bars;
  try {
    table = await measureCodeColumns(browser);
    bars = await measureCodeBars(browser);
  } finally {
    await browser.close();
  }
  const src = moduleSource(table, bars);
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

module.exports = { CANVASES, GROUPS, STAGES, VENUES, SPOTS, RUNGS, BAR_FIELDS, allCombos, measureCodeColumns, measureCodeBars };
