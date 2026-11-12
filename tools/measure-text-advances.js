#!/usr/bin/env node
/**
 * Measure the chart text table (lib/plugins/chart-family/shared/text-advance.generated.js): every glyph's advance, in
 * thousandths of an em, for each face and weight a chart label prints in, read off the shipped woff2s in real Chromium
 * with lining tabular figures (the `font-variant-numeric` every chart label carries), and the sha256 of every copy of
 * each face, which `checkTextAdvancePin` (tools/check-ownership.js, via build:check) holds the table to.
 *
 * WHY A TABLE. The chart form kernel lays a chart out around its text, so a width estimate that is off by a third moves
 * every piece by a third. The owner's bake-off (engineering/decisions/2026-11-10-chart-form.md § 8, § 10) chose this
 * table over a flat estimate (-49% to +55% off the painted width) and over measuring in the browser at layout time
 * (exact, but only in the CLI and at three times the render cost).
 *
 * WHEN TO RUN IT. On demand, never in `npm run build`: a build that launched Chromium would let a browser update redden
 * the gate with nothing wrong in the tree (tools/measure-glyph-advances.js says why at length). Run it when the font pin
 * reports drift, or when a face or weight joins the chart labels, then commit the file it writes.
 *
 *   node tools/measure-text-advances.js            write the table
 *   node tools/measure-text-advances.js --check    exit 1 if a fresh measurement differs from the committed table
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'lib/plugins/chart-family/shared/text-advance.generated.js');
// The pins live apart from the table so the shipped bundle carries only the advances; the build gate reads both.
const PINS = path.join(ROOT, 'tools/text-advance.pins.json');

// Each face the table holds: its row key, the CSS family and weight, and every hand-maintained copy of its woff2 (the
// engine's in assets/fonts, the Studio's in docs/src/playground/fonts). The table is measured from the first.
// ONLY THE ROWS A CALLER READS: chart labels are set at 500 to 700, and a weight between rows bills at the heavier one
// (text-measure.js `faceRow`), so 500 reads the 600 row and the hand face, which has no 600, reads 700. Each row costs
// about 0.4 KB gzipped in the Studio's chart kernel chunk, which has a ceiling (`npm run check:route-budget`).
const FACES = [
  ['clean-600', 'Outfit', 600, ['assets/fonts/outfit-600.woff2', 'docs/src/playground/fonts/outfit-600.woff2']],
  ['clean-700', 'Outfit', 700, ['assets/fonts/outfit-700.woff2', 'docs/src/playground/fonts/outfit-700.woff2']],
  ['hand-700', 'Shantell Sans', 700, ['assets/fonts/shantell-700.woff2', 'docs/src/playground/fonts/shantell-sans-700.woff2']],
  // The ledger, poster and festival type sets paint chart text in Inter (lib/core/resolve-typography.js), about 10%
  // wider than Outfit on a label and up to 4x on a glyph, so no factor on the Outfit rows bills it safely.
  ['inter-600', 'Inter', 600, ['assets/fonts/inter-600.woff2', 'docs/src/playground/fonts/inter-600.woff2']],
  ['inter-700', 'Inter', 700, ['assets/fonts/inter-700.woff2', 'docs/src/playground/fonts/inter-700.woff2']],
];
// A row is a string, one character per glyph: the advance in hundredths of an em, rounded UP (a label is never billed
// narrower than it paints), plus CODE0. A code that would land on DEL or a C1 control (127 to 160) steps past them by
// CODE_SKIP, so every character is printable; text-measure.js steps back.
const CODE0 = 48;
const CODE_SKIP = 34;

// The characters measured: printable ASCII, Latin-1 and Latin Extended-A, and the punctuation chart text uses. Anything
// else bills at the face's widest glyph (or a full em for CJK) in text-measure.js.
const RANGES = [[0x20, 0x7e], [0xa0, 0x17f]];
const EXTRA = '–—‘’“”…•€£¥₹×−→←↑↓·′″';
function charset() {
  const out = [];
  for (const [a, b] of RANGES) for (let c = a; c <= b; c++) out.push(String.fromCodePoint(c));
  for (const s of EXTRA) out.push(s);
  return out;
}

async function measure() {
  const puppeteer = require('puppeteer');
  const css = FACES.map(([, fam, w, files]) => {
    const b64 = fs.readFileSync(path.join(ROOT, files[0])).toString('base64');
    return `@font-face{font-family:'${fam}';font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><style>${css}</style><body></body>`);
    return await page.evaluate(async (faces, chars) => {
      const res = {};
      for (const [key, fam, w] of faces) {
        await document.fonts.load(`${w} 100px '${fam}'`);
        if (!document.fonts.check(`${w} 100px '${fam}'`)) throw new Error(`${fam} ${w} did not load: measuring it would read the fallback`);
        const sp = document.createElement('span');
        sp.style.cssText = `position:absolute;white-space:pre;font:${w} 1000px '${fam}';font-variant-numeric:lining-nums tabular-nums;`;
        document.body.appendChild(sp);
        res[key] = chars.map((ch) => { sp.textContent = ch; return Math.round(sp.getBoundingClientRect().width); });
        sp.remove();
      }
      return res;
    }, FACES, charset());
  } finally {
    await browser.close();
  }
}

function render(rows) {
  const code = (thousandths) => {
    let c = CODE0 + Math.ceil(thousandths / 10);
    if (c >= 127) c += CODE_SKIP;
    if (c > 255) throw new Error(`advance ${thousandths} does not code as one Latin-1 character`);
    return String.fromCharCode(c);
  };
  const lines = [
    '// GENERATED by tools/measure-text-advances.js from the shipped woff2s; do not edit by hand.',
    '// Per-glyph advances, measured in Chromium with lining tabular figures (the chart labels\' font-variant-numeric).',
    '// CHARS lists the code points in order. Each face row is a string with one character per code point: its char code',
    '// (less CODE_SKIP when it is 161 or more) less CODE0 is the advance in hundredths of an em, rounded up. The bytes',
    '// each row was measured from are pinned in tools/text-advance.pins.json (checkTextAdvancePin in',
    '// tools/check-ownership.js, via build:check).',
    // The list is built from its ranges at load: spelled out it was 0.5 KB gzipped in the Studio's chart kernel chunk.
    `const RANGES = ${JSON.stringify(RANGES)};`,
    `let CHARS = '';`,
    'for (const [a, b] of RANGES) for (let c = a; c <= b; c++) CHARS += String.fromCodePoint(c);',
    `CHARS += ${JSON.stringify(EXTRA)};`,
    `const CODE0 = ${CODE0};`,
    `const CODE_SKIP = ${CODE_SKIP};`,
    'const FACES = {',
    ...FACES.map(([key]) => `  '${key}': ${JSON.stringify(rows[key].map(code).join(''))},`),
    '};',
    'module.exports = { CHARS, CODE0, CODE_SKIP, FACES };',
  ];
  return `${lines.join('\n')}\n`;
}

function renderPins() {
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
  const pins = Object.fromEntries(FACES.map(([key, family, , files]) => [key, { family, sources: files.map((file) => ({ file, sha256: sha(file) })) }]));
  return `${JSON.stringify(pins, null, 2)}\n`;
}

async function main() {
  const text = render(await measure());
  const pins = renderPins();
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text && fs.existsSync(PINS) && fs.readFileSync(PINS, 'utf8') === pins;
    console.log(same ? 'text-advance table: matches a fresh measurement' : 'text-advance table: DIFFERS from a fresh measurement; run node tools/measure-text-advances.js');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(OUT, text);
  fs.writeFileSync(PINS, pins);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${FACES.length} faces) and ${path.relative(ROOT, PINS)}`);
}

main().catch((e) => { console.error(e); process.exit(2); });
