#!/usr/bin/env node
/**
 * census-pagination-marks — which NODE actually paints the page number, over the WHOLE shipped deck population.
 *
 * Exports every deck under `examples/` that sets `paginate: true` through
 * `dist/lattice-emulator.js`, opens each in Chromium, and counts — per paginated
 * slide — whether the mark that paints is the real `<span class="lat-pagination">`
 * element, the `section::after` PSEUDO, or neither.
 *
 * WHY IT IS COMMITTED, and why it takes the POPULATION rather than a sample. This
 * measurement is load-bearing in `engineering/jank.md`, and two earlier passes at it
 * — a 12-deck stride sample and an independent 27-deck one — reported 5.5% and 17.8%
 * for the same 12.3% population figure. Two samples disagreeing THREEFOLD is the width
 * of the instrument, not a fault in either: a dozen decks cannot resolve a share of
 * that size to a decimal place. What made that irreproducible was not the sampling
 * alone, though — it was that neither pass named its decks or its command, so no
 * reader could re-derive either number. This script is that command.
 *
 * THE COUNTING RULE, stated here because a share is only as good as its predicate,
 * and BOTH ENDS of this chain cost a measurement (engineering/jank.md § the counting
 * rule):
 *
 *   · a slide counts when its section carries `data-lattice-pagination`;
 *   · the PSEUDO counts as painted when it DRAWS A NUMERAL — `getComputedStyle(sec,
 *     '::after').content` is a non-empty string — and the pseudo is not itself hidden.
 *     "Non-empty" is load-bearing, not pedantry: the retirement rule empties the pseudo
 *     (`content: ''`) rather than deleting its box, so that one treatment which co-opts
 *     that box for a decorative mask keeps it (`mark-asterisks`, base.treatments.css). A
 *     retired pseudo therefore computes `""`, and a predicate testing only for `none`
 *     reports every paginated slide in the corpus as drawing two marks;
 *   · the ELEMENT counts as shown when a `.lat-pagination` exists and nothing FROM THE
 *     SPAN UP TO THE SECTION, THE SPAN INCLUDED, hides it (`display: none` or
 *     `visibility: hidden`).
 *
 *   The TOP end is load-bearing: asking for a client rect instead files five
 *   `player: true` slides under "neither" — their span is present, displayed and
 *   carrying the right numeral, but `div.lp-frame`, an ancestor OUTSIDE the slide, is
 *   `display: none` while that slide is not the current one. A player frame must not
 *   decide whether a slide's own mark is shown.
 *   The BOTTOM end is load-bearing the other way: "nothing BETWEEN it and the section"
 *   reads as excluding the span's own style, and nine slides in this corpus carry
 *   `display: none` on the span itself. The span is INCLUDED.
 *
 * WHAT IT WAS BUILT TO SETTLE (#2206). The page number used to be TWO marks chosen by
 * the frame's `kind` — the element in a chrome-hosting frame's footer Cell, the pseudo
 * on the nine sovereign frames — with different box models, different styling surfaces,
 * and nothing telling an author which a slide had. The pagination Tile
 * (lib/forms/tile/pagination) now mints the element everywhere and the pseudo retires
 * wherever it exists, so this census should report ZERO pseudo slides. It is kept
 * because that is a claim about a cascade across 167 decks, and the cheap way to be
 * wrong about it is to stop measuring.
 *
 * USAGE
 *   node tools/census-pagination-marks.mjs [--dir examples] [--json] [--limit N]
 *
 * `--no-render` reuses the HTML already under `.scratch/pagination-census/` and re-runs only
 * the Chromium probe — for iterating on the predicate, not for a figure taken against a tree
 * the exports no longer match.
 *
 * `--limit` is for a smoke run of the SCRIPT, never for a quoted figure: see above.
 * A number this prints is only quotable with its base commit, because the population
 * moves with the tree — 164 decks when jank.md's table was written, 167 today.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const JSON_OUT = argv.includes('--json');
const DIR = path.join(ROOT, arg('--dir', 'examples'));
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const NO_RENDER = argv.includes('--no-render');
const OUT = path.join(ROOT, '.scratch', 'pagination-census');

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/** The decks in scope: every `.md` whose front matter sets `paginate: true`. */
function population() {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /^paginate:\s*true\s*$/m.test(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .sort()
    .slice(0, LIMIT);
}

const EMULATOR = path.join(ROOT, 'dist', 'lattice-emulator.js');
fs.mkdirSync(OUT, { recursive: true });

const decks = population();
if (!fs.existsSync(EMULATOR)) {
  console.error('census: dist/lattice-emulator.js is missing — run `npm run build` first.');
  process.exit(2);
}

const rendered = [];
for (const [i, deck] of decks.entries()) {
  const html = path.join(OUT, deck.replace(/\.md$/, '.html'));
  if (NO_RENDER) { rendered.push({ deck, html: fs.existsSync(html) ? html : null }); continue; }
  if (!JSON_OUT) process.stderr.write(`\r  rendering ${i + 1}/${decks.length}  ${deck.padEnd(48).slice(0, 48)}`);
  try {
    execFileSync(process.execPath, [EMULATOR, path.join(DIR, deck), html], { stdio: 'ignore', timeout: 300000 });
    rendered.push({ deck, html });
  } catch {
    // A deck that cannot be exported is reported, never silently dropped — an
    // unexplained absence is how a population figure becomes a sample figure.
    rendered.push({ deck, html: null });
  }
}
if (!JSON_OUT) process.stderr.write('\n');

const browser = await puppeteer.launch({
  executablePath: resolveChrome(), headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

const perDeck = [];
for (const [i, r] of rendered.entries()) {
  if (!r.html) { perDeck.push({ deck: r.deck, failed: true }); continue; }
  if (!JSON_OUT) process.stderr.write(`\r  probing   ${i + 1}/${rendered.length}  ${r.deck.padEnd(48).slice(0, 48)}`);
  await page.goto(`file://${r.html}`, { waitUntil: 'load', timeout: 120000 });
  const counts = await page.evaluate(() => {
    const out = { slides: 0, element: 0, pseudo: 0, both: 0, neither: 0, pseudoSlides: [], neitherSlides: [] };
    for (const sec of document.querySelectorAll('section[data-lattice-pagination]')) {
      out.slides += 1;
      const af = getComputedStyle(sec, '::after');
      const c = af.content;
      const drawsText = Boolean(c) && c !== 'none' && c !== 'normal' && c !== '""' && c !== "''";
      const pseudo = drawsText && af.display !== 'none';
      const element = [...sec.querySelectorAll('.lat-pagination')].some((el) => {
        for (let n = el; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          if (n === sec) break;
        }
        return true;
      });
      if (pseudo && element) { out.both += 1; out.pseudoSlides.push(sec.className); }
      else if (pseudo) { out.pseudo += 1; out.pseudoSlides.push(sec.className); }
      else if (element) { out.element += 1; }
      else { out.neither += 1; out.neitherSlides.push(sec.className); }
    }
    return out;
  });
  perDeck.push({ deck: r.deck, ...counts });
}
if (!JSON_OUT) process.stderr.write('\n');
await browser.close();

const sum = (k) => perDeck.reduce((a, d) => a + (d[k] || 0), 0);
const total = sum('slides');
const totals = {
  base: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(),
  decks: decks.length,
  failed: perDeck.filter((d) => d.failed).map((d) => d.deck),
  slides: total,
  element: sum('element'),
  pseudo: sum('pseudo'),
  both: sum('both'),
  neither: sum('neither'),
};

if (JSON_OUT) { console.log(JSON.stringify({ totals, perDeck }, null, 2)); process.exit(0); }

const pct = (n) => total ? `${(n * 100 / total).toFixed(1)}%` : '—';
console.log(`\n  pagination mark census · ${totals.decks} decks · ${total} paginated slides · base ${totals.base}\n`);
console.log('  mark                              count     share');
console.log(`  the real span.lat-pagination   ${String(totals.element).padStart(7)}   ${pct(totals.element).padStart(7)}`);
console.log(`  the ::after pseudo             ${String(totals.pseudo).padStart(7)}   ${pct(totals.pseudo).padStart(7)}`);
console.log(`  BOTH (overprinted)             ${String(totals.both).padStart(7)}   ${pct(totals.both).padStart(7)}`);
console.log(`  neither mark is used           ${String(totals.neither).padStart(7)}   ${pct(totals.neither).padStart(7)}`);
if (totals.failed.length) console.log(`\n  ${totals.failed.length} deck(s) failed to export: ${totals.failed.join(', ')}`);
// THE "NEITHER" SET IS REPORTED, NEVER JUST COUNTED. A paginated slide with no mark is
// either a deliberate suppression (`silent`, `no-paginate`, `image statement`, an
// edge-media `claim-bleed`) or a page number that went missing — and the two are
// indistinguishable from a count. Breaking it down by class is what lets a reader tell a
// 9% that is all suppression from a 9% hiding a regression.
const neither = new Map();
for (const d of perDeck) for (const cls of d.neitherSlides || []) {
  const key = ['silent', 'no-paginate'].find((t) => cls.split(/\s+/).includes(t)) || cls;
  neither.set(key, (neither.get(key) || 0) + 1);
}
if (neither.size) {
  console.log('\n  the "neither" set, by what suppresses it:');
  for (const [k, v] of [...neither].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);
}
const offenders = perDeck.filter((d) => (d.pseudo || 0) + (d.both || 0) > 0);
if (offenders.length) {
  console.log('\n  decks still drawing the pseudo:');
  for (const d of offenders) console.log(`    ${d.deck}  ${d.pseudo} pseudo · ${d.both} both  [${[...new Set(d.pseudoSlides)].join(' | ')}]`);
}
process.exit(totals.both > 0 ? 1 : 0);
