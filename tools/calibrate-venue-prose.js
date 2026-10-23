#!/usr/bin/env node
/**
 * calibrate-venue-prose — how many words does a one-block prose component's slot hold at each venue,
 * on each canvas family?
 *
 * `venueCapacity.prose` states that budget for the wide canvas. This finds the same number for
 * `square`, `tall` and `strip` (the manifest's `venueCapacity.prose.families`), the way the wide row was
 * measured: write N words into the slot of the component's real slide (`venueProbe`), at each venue, and
 * take the largest N before the page clips (the same V1/V2 test `check-venue-conformance` applies). A
 * register that holds more or less than the bare component (`venueCapacity.prose.variants`) gets its own row.
 *
 * Usage: node tools/calibrate-venue-prose.js [component,...] [--families=square,tall,strip] [--max=160] [--write] [--json]
 * Default: every component with a `venueCapacity.prose`, a report. `--write` puts the rows in the manifests.
 */
const fs = require('node:fs');
const path = require('node:path');
const { resolveChrome } = require('./lib/resolve-chrome');
const { loadAll, manifestBucket } = require('../lib/components');
const { splitSample, render, VENUE_CLASS } = require('./audit-reading-size');
const { SIZE_ALIAS } = require('./lib/calibrate-core');
const { fillSlot } = require('./lib/venue-prose-fill');
const { inspectInPage } = require('./check-venue-conformance');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const names = args.filter((a) => !a.startsWith('--')).join(',').split(',').filter(Boolean);
const FAMILIES = opt('families', 'square,tall,strip').split(',');
const MAX = Number(opt('max', 160));
const VENUES = ['laptop', 'huddle', 'conference', 'hall'];
// Step 1 to 30 words, 2 to 80, 4 beyond: finer where the budgets are small and a word is a large share.
const LADDER = [];
for (let n = 1; n <= MAX; n += n < 30 ? 1 : n < 80 ? 2 : 4) LADDER.push(n);

/** Largest N in the ladder before the first clip at each venue: `[row, atLeast]` for one register. */
async function measure(browser, m, family, register) {
  const sp = splitSample(m.venueProbe, m.name);
  const slides = [];
  const keys = [];
  for (const venue of VENUES) {
    for (const n of LADDER) {
      const body = fillSlot(m.name, sp.body, n);
      const cls = [m.name, ...sp.tokens, ...(register ? [register] : []), VENUE_CLASS[venue]].join(' ');
      slides.push(`<!-- _class: ${cls} -->\n\n${body}\n`);
      keys.push([venue, n]);
    }
  }
  const { html, dir } = await render(`---\ntheme: indaco\n---\n\n${slides.join('\n---\n\n')}`, `${m.name}-${family}`, path.join(ROOT, 'lib/components', manifestBucket(m), m.name), SIZE_ALIAS[family]);
  const page = await browser.newPage();
  try {
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 300000 });
    const out = await page.evaluate(inspectInPage);
    if (Object.keys(out).length !== keys.length) throw new Error(`${Object.keys(out).length} pages for ${keys.length} slides (the engine paginated)`);
    const row = [];
    const atLeast = [];
    VENUES.forEach((venue) => {
      let held = 0;
      let clipped = false;
      for (const n of LADDER) {
        const s = out[String(keys.findIndex(([v, k]) => v === venue && k === n) + 1)];
        if (s.overflow || s.clipMarked || s.escapedCount) { clipped = true; break; }
        held = n;
      }
      row.push(held);
      if (!clipped) atLeast.push(venue);
    });
    return { row, atLeast };
  } finally {
    await page.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const chrome = resolveChrome();
  const browser = await require('puppeteer').launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const manifests = loadAll().filter((m) => m.venueCapacity?.prose && m.venueProbe && (!names.length || names.includes(m.name)));
  const result = {};
  try {
    for (const m of manifests) {
      const registers = [null, ...Object.keys(m.venueCapacity.prose.variants || {})];
      for (const family of FAMILIES) {
        const f = (result[m.name] ??= {})[family] = { variants: {} };
        for (const reg of registers) {
          const r = await measure(browser, m, family, reg);
          if (reg) f.variants[reg] = r.row; else { f.row = r.row; if (r.atLeast.length) f.atLeast = r.atLeast; }
          console.error(`${m.name}${reg ? ` ${reg}` : ''} ${family}: ${r.row.join('/')}${r.atLeast.length ? ` (at least: ${r.atLeast.join(',')})` : ''}`);
        }
        if (!Object.keys(f.variants).length) delete f.variants;
      }
    }
  } finally {
    await browser.close();
  }
  if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (args.includes('--write')) {
    for (const m of manifests) {
      const file = path.join(ROOT, 'lib/components', manifestBucket(m), m.name, `${m.name}.manifest.json`);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      j.venueCapacity.prose.families = { ...j.venueCapacity.prose.families, ...Object.fromEntries(Object.entries(result[m.name]).map(([fam, f]) => [fam, {
        row: Object.fromEntries(VENUES.map((v, i) => [v, f.row[i]])),
        ...(f.atLeast ? { atLeast: f.atLeast } : {}),
        ...(f.variants ? { variants: Object.fromEntries(Object.entries(f.variants).map(([t, r]) => [t, Object.fromEntries(VENUES.map((v, i) => [v, r[i]]))])) } : {}),
      }])) };
      fs.writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`);
    }
  }
}

if (require.main === module) main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
