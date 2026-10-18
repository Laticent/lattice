/**
 * Print the style-bytes baseline for a rendered deck, on Chromium and WebKit.
 *
 * The question it answers: how much CSS does a deck carry, and how much of it does the deck use?
 * It is the E0 baseline of engineering/decisions/2026-10-17-on-demand-styles-brief.md — the table
 * every later number (the module split, the scanner, the loader) is measured against, so a claim
 * like "the page carries 2.5 MB of style" can be re-derived instead of believed.
 *
 * What it prints, per engine:
 *   - the page's <style> bytes, split into @font-face and rules (and the face / family counts)
 *   - how many rules a slide matches (median / min / max across slides) and the deck-wide union,
 *     using a loose matcher: a rule counts when its selector matches the section, a descendant of
 *     it, or an ancestor of it, with pseudo-elements and interaction states stripped first
 *   - what the matcher cost, and what one poster-style capture of the whole sheet costs (the
 *     sheet inlined in an SVG <foreignObject>, decoded, drawn to a 320x180 canvas)
 *
 * With `--modules` it adds the module view: for each style module in dist/styles/manifest.json
 * (written by tools/build-css.js), whether the deck uses it, and the bytes a module-level loader
 * would fetch against the bytes the deck actually matches. "Uses" is the same loose matcher, taken
 * per rule, so a module is needed when any one of its rules matches.
 *
 * Numbers vary run to run (the capture and matcher timings most); `--runs N` repeats the timed
 * parts and prints the median and range. Sizes are exact. Linux engines only: real iOS is not
 * measured here (HARD RULE #23).
 *
 * Usage:  node tools/style-baseline.mjs <deck.md|deck.html> [--engine chromium|webkit|both]
 *                                       [--runs 3] [--modules] [--json]
 *         WebKit needs `npx playwright install webkit` once (and `install-deps webkit` on a bare box).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, webkit } = await import(path.join(ROOT, 'docs/node_modules/@playwright/test/index.mjs'));

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const input = argv.find((a) => !a.startsWith('--') && a !== opt('--engine') && a !== opt('--runs'));
if (!input) {
  console.error('usage: node tools/style-baseline.mjs <deck.md|deck.html> [--engine chromium|webkit|both] [--runs 3] [--modules] [--json]');
  process.exit(2);
}
const runs = Math.max(1, Number(opt('--runs', '3')) || 3);
const engines = { chromium: [['chromium', chromium]], webkit: [['webkit', webkit]], both: [['chromium', chromium], ['webkit', webkit]] }[opt('--engine', 'both')];
if (!engines) {
  console.error('--engine must be chromium, webkit or both');
  process.exit(2);
}

let htmlPath = path.resolve(input);
let tmpDir = null;
if (input.endsWith('.md')) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'style-baseline-'));
  htmlPath = path.join(tmpDir, 'deck.html');
  execFileSync('node', [path.join(ROOT, 'lattice.js'), path.resolve(input), htmlPath, '-q'], { stdio: ['ignore', 'ignore', 'inherit'] });
}

let modules = null;
if (flag('--modules')) {
  const manifest = path.join(ROOT, 'dist/styles/manifest.json');
  if (!fs.existsSync(manifest)) {
    console.error('--modules needs dist/styles/manifest.json; run `npm run css:build` first');
    process.exit(2);
  }
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  modules = m.modules.map((mod) => ({ id: mod.id, bytes: mod.bytes, text: fs.readFileSync(path.join(ROOT, 'dist/styles', mod.file), 'utf8') }));
}

// Runs in the page. Plain function so Playwright serializes it; no closure over Node state.
function measure({ modules, runs }) {
  const strip = (s) =>
    s
      .replace(/::?(before|after|marker|placeholder|first-line|first-letter|selection|backdrop|-webkit-[a-z-]+|-moz-[a-z-]+)/g, '')
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited|target)\b/g, '');
  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const r = {};
  const styles = [...document.querySelectorAll('style')];
  r.styleBlocks = styles.length;
  r.styleBytes = styles.reduce((a, s) => a + s.textContent.length, 0);
  let fontBytes = 0;
  let ruleBytes = 0;
  let faces = 0;
  const families = new Set();
  const all = [];
  const walk = (list) => {
    for (const rule of list) {
      if (rule.type === 5) {
        faces++;
        fontBytes += rule.cssText.length;
        families.add(rule.style.getPropertyValue('font-family'));
      } else if (rule.type === 1) {
        ruleBytes += rule.cssText.length;
        all.push(rule);
      } else if (rule.cssRules) walk(rule.cssRules);
      else ruleBytes += rule.cssText.length;
    }
  };
  for (const sh of document.styleSheets) {
    try {
      walk(sh.cssRules);
    } catch {
      /* cross-origin sheet: not ours */
    }
  }
  r.fontBytes = fontBytes;
  r.faces = faces;
  r.families = families.size;
  r.styleRules = all.length;
  r.ruleBytes = ruleBytes;

  const secs = [...document.querySelectorAll('section')];
  r.sections = secs.length;
  r.htmlBytes = secs.reduce((a, s) => a + s.outerHTML.length, 0);
  const loose = (sel, s) => {
    sel = strip(sel);
    try {
      return s.matches(sel) || !!s.querySelector(sel) || !!s.parentElement?.closest(sel);
    } catch {
      return false;
    }
  };
  const matchMs = [];
  let per = [];
  let union = new Set();
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now();
    per = [];
    union = new Set();
    for (const s of secs) {
      let b = 0;
      all.forEach((rule, i) => {
        if (loose(rule.selectorText, s)) {
          b += rule.cssText.length;
          union.add(i);
        }
      });
      per.push(b);
    }
    matchMs.push(performance.now() - t0);
  }
  per.sort((a, b) => a - b);
  r.slideMatchedBytes = { median: per[per.length >> 1], min: per[0], max: per[per.length - 1] };
  r.deckMatchedBytes = [...union].reduce((a, i) => a + all[i].cssText.length, 0);
  r.matchMs = { median: Math.round(median(matchMs)), min: Math.round(Math.min(...matchMs)), max: Math.round(Math.max(...matchMs)) };

  if (modules) {
    const hit = (sel) => {
      sel = strip(sel);
      try {
        return !!document.querySelector(sel);
      } catch {
        return false;
      }
    };
    let used = 0;
    let usedBytes = 0;
    let matched = 0;
    const usedList = [];
    for (const m of modules) {
      const sh = new CSSStyleSheet();
      try {
        sh.replaceSync(m.text.replace(/@import[^;]+;/g, ''));
      } catch {
        used++;
        usedBytes += m.bytes;
        usedList.push([m.id, m.bytes, 'unparsed']);
        continue;
      }
      let any = false;
      const w = (list) => {
        for (const rule of list) {
          if (rule.type === 1) {
            if (hit(rule.selectorText)) {
              any = true;
              matched += rule.cssText.length;
            }
          } else if (rule.cssRules) w(rule.cssRules);
        }
      };
      w(sh.cssRules);
      if (any) {
        used++;
        usedBytes += m.bytes;
        usedList.push([m.id, m.bytes]);
      }
    }
    usedList.sort((a, b) => b[1] - a[1]);
    r.modules = { total: modules.length, used, usedBytes, matchedRuleBytes: matched, largestUsed: usedList.slice(0, 8) };
  }

  // One poster-style capture of the whole sheet: the sheet rides inside an SVG image because an
  // SVG image cannot see the page's stylesheet. Native size, drawn to a 320x180 tile.
  if (secs.length === 0) throw new Error('no <section> in the page: not a rendered deck');
  const sec = secs[Math.min(3, secs.length - 1)];
  const box = sec.getBoundingClientRect();
  const css = styles.map((s) => s.textContent).join('\n');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}"><foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${css}]]></style>${new XMLSerializer().serializeToString(sec)}</div></foreignObject></svg>`;
  r.captureSvgBytes = svg.length;
  r.captureMs = [];
  return (async () => {
    for (let k = 0; k < runs; k++) {
      const t = performance.now();
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.src = url;
      try {
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        c.getContext('2d').drawImage(img, 0, 0, 320, 180);
        r.captureMs.push(Math.round(performance.now() - t));
      } catch (e) {
        r.captureError = String(e);
      }
      URL.revokeObjectURL(url);
    }
    return r;
  })();
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const pct = (a, b) => `${((100 * a) / b).toFixed(0)}%`;
const results = {};
for (const [name, type] of engines) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(1200);
  results[name] = await page.evaluate(measure, { modules, runs });
  await browser.close();
}

if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });

if (flag('--json')) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}
console.log(`deck: ${input}  (${runs} timed run${runs > 1 ? 's' : ''}; sizes are exact, timings are medians)`);
for (const [name, r] of Object.entries(results)) {
  console.log(`\n${name}`);
  console.log(`  <style> blocks      ${r.styleBlocks}, ${kb(r.styleBytes)}`);
  console.log(`    @font-face        ${kb(r.fontBytes)} (${pct(r.fontBytes, r.styleBytes)}), ${r.faces} faces, ${r.families} families`);
  console.log(`    rules             ${kb(r.ruleBytes)} (${pct(r.ruleBytes, r.styleBytes)}), ${r.styleRules} rules`);
  console.log(`  slides              ${r.sections}, ${kb(r.htmlBytes)} of HTML`);
  console.log(`  rules one slide matches   median ${kb(r.slideMatchedBytes.median)} (${pct(r.slideMatchedBytes.median, r.ruleBytes)}), range ${kb(r.slideMatchedBytes.min)} to ${kb(r.slideMatchedBytes.max)}`);
  console.log(`  rules the deck matches    ${kb(r.deckMatchedBytes)} (${pct(r.deckMatchedBytes, r.ruleBytes)})`);
  console.log(`  matcher cost        ${r.matchMs.median} ms for ${r.sections} slides (range ${r.matchMs.min} to ${r.matchMs.max})`);
  console.log(`  poster capture      ${kb(r.captureSvgBytes)} SVG, ${r.captureMs.length ? r.captureMs.join(' / ') + ' ms' : r.captureError}`);
  if (r.modules) {
    console.log(`  modules used        ${r.modules.used} of ${r.modules.total}, ${kb(r.modules.usedBytes)} to fetch vs ${kb(r.modules.matchedRuleBytes)} of rules matched`);
    console.log(`    largest used      ${r.modules.largestUsed.map(([id, b]) => `${id} ${kb(b)}`).join(', ')}`);
  }
}
