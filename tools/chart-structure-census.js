#!/usr/bin/env node
/**
 * chart-structure-census — the chart family's SHARED STRUCTURE, measured.
 *
 * The brief this was built for: "colour is dictated by the palette but
 * structure should be consistent." So stroke and border WIDTH, the gap between
 * adjacent marks, and the corner radius belong to the family, not to a member
 * and not to a finish — and they should read the same everywhere. This reports
 * what each member actually renders, so the inconsistencies are a list rather
 * than an impression.
 *
 * THE NUMBER THAT LIES IS `stroke-width`. An SVG stroke-width is in the
 * element's viewBox USER UNITS, and this family's viewBoxes span 4.3x
 * (320 to 1375 wide). Two members that both say `stroke-width: 1` therefore
 * paint two different physical weights, and a census that reports the declared
 * value says they agree. So every width is reported twice: `user` as declared,
 * and `px` after multiplying by that SVG's own render scale — unless the
 * element carries `vector-effect: non-scaling-stroke`, which strips the viewBox
 * scaling and makes the two equal by construction. The physical column is the
 * one to read.
 *
 * `--check` holds the family to its edge contract: every mark that paints an
 * OUTLINE must carry `vector-effect: non-scaling-stroke`, or the width token it
 * was given has no fixed physical meaning. A KNOCKOUT is exempt and is
 * identified by measurement, not by a list — a mark whose stroke resolves to
 * the same colour as the canvas behind it is a separator holding two touching
 * marks apart, and its correct weight follows what it separates. This arm
 * exists because a selector-list typo cannot be caught by reading the CSS: the
 * widths still look right, because each member's own rule keeps the token.
 *
 * Usage:
 *   node tools/chart-structure-census.js [deck.md ...] [--theme <name>] [--json <path>]
 *   node tools/chart-structure-census.js --check
 *
 * Defaults to the chart bucket gallery. Pass several decks to compare a
 * baseline against finish variants.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  CHART_GALLERY, FRAME_CHROME, declaredMarks, renderDeck, requireChrome,
} = require('./lib/chart-render.js');

function parseArgs(argv) {
  const out = { decks: [], theme: null, json: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--theme') out.theme = argv[++i];
    else if (argv[i] === '--json') out.json = argv[++i];
    else if (argv[i] === '--check') out.check = true;
    else out.decks.push(path.resolve(argv[i]));
  }
  if (!out.decks.length) out.decks.push(CHART_GALLERY);
  return out;
}

/** Runs inside the page. Returns one row per (member, mark class) that paints. */
const SCRAPE = (DECL, CHROME_CLASSES) => {
  const CHROME = new Set(CHROME_CLASSES);
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? +n.toFixed(2) : null; };

  // A mark that is present but not painted is not structure. Clipped-away
  // measurement scaffolding and zero-size placeholders would otherwise
  // contribute widths no reader ever sees.
  const hidden = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return true;
    if (/inset\(\s*50%/.test(cs.clipPath || '')) return true;
    const r = el.getBoundingClientRect();
    return r.width <= 1 || r.height <= 1;
  };

  // Resolve a colour to `r,g,b` so two spellings of the same colour compare
  // equal. The canvas is the only thing in the page that can resolve
  // color-mix() and light-dark() to channels.
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const channels = (v) => {
    if (!v || v === 'none' || v === 'transparent') return null;
    try {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#010203';
      const sentinel = cx.fillStyle;
      cx.fillStyle = v;
      if (cx.fillStyle === sentinel && v !== '#010203') return null;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
      return `${r},${g},${b}`;
    } catch { return null; }
  };

  // The canvas colour a knockout strokes in — the nearest ancestor that
  // actually paints a background, which is what shows through the sliver.
  const canvasBehind = (el) => {
    for (let n = el.closest('svg') || el; n; n = n.parentElement) {
      const bg = channels(getComputedStyle(n).backgroundColor);
      if (bg) return bg;
    }
    return null;
  };

  const out = [];
  for (const sec of document.querySelectorAll('section.chart-frame')) {
    const member = [...sec.classList].find(
      (c) => !CHROME.has(c) && !c.startsWith('size-') && !c.startsWith('deck-'),
    );
    const decl = DECL[member];
    if (!decl) continue;
    const canvas = canvasBehind(sec);

    for (const m of decl) {
      if (m.paint === 'none') continue;
      // A CONTAINER carries no stroke of its own. `journey-face` names an
      // <svg> wrapping a <circle> and a <path>; getComputedStyle reports a
      // stroke-width on it that paints nothing, and pinning it would change
      // nothing on the slide. Drop containers so the census reports marks.
      const els = [...sec.querySelectorAll(`.${m.class}`)]
        .filter((e) => !['svg', 'g', 'defs'].includes(e.tagName.toLowerCase()))
        .filter((e) => !hidden(e));
      if (!els.length) continue;
      const isSvg = els[0] instanceof SVGElement;

      const user = new Set();
      const physical = new Set();
      const radii = new Set();
      let nonScaling = null;
      let knockout = null;

      for (const e of els) {
        const cs = getComputedStyle(e);
        if (isSvg) {
          const painted = cs.stroke && cs.stroke !== 'none';
          const sw = painted ? num(cs.strokeWidth) : 0;
          user.add(sw);
          // The physical weight: user units times this element's real
          // user->screen scale, unless non-scaling-stroke already pinned it to
          // CSS pixels.
          //
          // THE SCALE IS `getScreenCTM`, NOT box.width / viewBox.width. Every
          // chart SVG here uses `xMidYMid meet` (the default), where the scale is
          // UNIFORM `min(sx, sy)` and the leftover axis becomes padding. Where
          // the viewport's aspect differs from the viewBox's, the x-ratio is not
          // the scale and it overstates the weight — measured on quadrant-dot,
          // viewBox 420x348 in a 1152x387 box: the x-ratio says 5.49px, the CTM
          // says 2.23px, and a synthetic control (viewBox 100x100 at 400x100,
          // stroke-width 2) renders 2 dark pixel columns, not 8. That wrong
          // formula is where the "13.1x spread" in the first draft of this
          // family's docs came from; the real figure was 6.9x.
          const ctm = typeof e.getScreenCTM === 'function' ? e.getScreenCTM() : null;
          const scale = ctm ? Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) : 1;
          const nss = cs.vectorEffect === 'non-scaling-stroke';
          physical.add(painted ? +((nss ? sw : sw * scale).toFixed(2)) : 0);
          if (painted) {
            nonScaling = nonScaling === null ? nss : nonScaling && nss;
            const stroke = channels(cs.stroke);
            const isKo = stroke !== null && canvas !== null && stroke === canvas;
            knockout = knockout === null ? isKo : knockout && isKo;
          }
          radii.add(num(e.getAttribute('rx')) ?? 0);
        } else {
          const painted = cs.borderTopStyle !== 'none';
          const bw = painted ? num(cs.borderTopWidth) : 0;
          user.add(bw);
          physical.add(bw); // an HTML border is already in CSS pixels
          radii.add(num(cs.borderTopLeftRadius));
        }
      }

      // The visual GAP between adjacent same-class marks, along whichever axis
      // they are laid out on.
      const boxes = els.map((e) => e.getBoundingClientRect()).sort((a, z) => a.left - z.left || a.top - z.top);
      const gaps = [];
      for (let i = 1; i < boxes.length; i++) {
        const a = boxes[i - 1];
        const b = boxes[i];
        const dx = b.left - a.right;
        const dy = b.top - a.bottom;
        if (Math.abs(a.top - b.top) < 2 && dx > -2) gaps.push(+dx.toFixed(1));
        else if (Math.abs(a.left - b.left) < 2 && dy > -2) gaps.push(+dy.toFixed(1));
      }

      out.push({
        member, cls: m.class, n: els.length, svg: isSvg, bears: m.bears,
        user: [...user].sort((a, z) => a - z),
        px: [...physical].sort((a, z) => a - z),
        nonScaling, knockout,
        radii: [...radii].sort((a, z) => a - z),
        gaps: gaps.length ? [Math.min(...gaps), Math.max(...gaps)] : null,
      });
    }
  }
  return out;
};

function reportCensus(label, rows) {
  console.log(`\n===== ${label} =====`);

  const byPx = {};
  for (const r of rows) for (const w of r.px) if (w) (byPx[w] ||= []).push(`${r.member}/${r.cls}`);
  const weights = Object.keys(byPx).map(Number).sort((a, z) => a - z);
  console.log('PHYSICAL edge weights in use (the number a reader sees):');
  for (const w of weights) {
    const who = byPx[w];
    console.log(`   ${String(w).padStart(6)}px  ${String(who.length).padStart(2)} mark classes   ${who.slice(0, 5).join(' ')}${who.length > 5 ? ' …' : ''}`);
  }
  if (weights.length) {
    console.log(`   -> ${weights.length} distinct, spread ${(weights[weights.length - 1] / weights[0]).toFixed(1)}x`);
  }

  const lying = rows.filter((r) => r.svg && r.px.some((w) => w) && String(r.user) !== String(r.px));
  if (lying.length) {
    console.log('declared width != rendered width (viewBox scaling):');
    for (const r of lying.sort((a, z) => z.px[0] - a.px[0]).slice(0, 10)) {
      console.log(`   ${`${r.member}/${r.cls}`.padEnd(34)} user ${String(r.user)}  ->  ${String(r.px)}px`);
    }
  }

  const gapped = rows.filter((r) => r.gaps);
  console.log('gaps between adjacent same-class marks:');
  for (const r of gapped.sort((a, z) => a.gaps[0] - z.gaps[0]).slice(0, 14)) {
    console.log(`   ${`${r.member}/${r.cls}`.padEnd(34)} ${String(r.gaps[0]).padStart(6)} .. ${String(r.gaps[1]).padStart(6)} px  (n=${r.n})`);
  }

  const radii = {};
  for (const r of rows) for (const x of r.radii) radii[x] = (radii[x] || 0) + 1;
  console.log(`corner radii in use: ${Object.keys(radii).sort((a, z) => a - z).map((k) => `${k}px x${radii[k]}`).join('  ')}`);
}

/** Returns the list of contract violations — empty means green. */
function edgeViolations(rows) {
  const bad = [];
  for (const r of rows) {
    if (!r.svg || !r.px.some((w) => w)) continue;
    if (r.knockout) continue; // a separator's weight follows what it separates
    if (r.nonScaling === false) {
      bad.push(`${r.member}/${r.cls} — outlines at ${r.px.join('/')}px with no vector-effect: non-scaling-stroke, so its width has no fixed physical meaning`);
    }
  }
  return bad;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = requireChrome('chart-structure-census');
  const DECL = declaredMarks();

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const all = {};
  try {
    const page = await browser.newPage();
    for (const deck of args.decks) {
      const html = renderDeck(deck, { theme: args.theme, label: 'chart-structure' });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      all[path.basename(deck, '.md')] = await page.evaluate(SCRAPE, DECL, FRAME_CHROME);
    }
  } finally {
    await browser.close();
  }

  if (args.json) fs.writeFileSync(args.json, JSON.stringify(all, null, 2));

  if (args.check) {
    let failed = 0;
    for (const [label, rows] of Object.entries(all)) {
      const bad = edgeViolations(rows);
      const outlines = rows.filter((r) => r.svg && r.px.some((w) => w) && !r.knockout).length;
      const knockouts = rows.filter((r) => r.knockout).length;
      if (bad.length) {
        failed += bad.length;
        console.error(`${label}: ${bad.length} of ${outlines} outline marks are unpinned`);
        for (const b of bad) console.error(`   ${b}`);
      } else {
        console.log(`${label}: all ${outlines} outline marks pinned; ${knockouts} knockouts exempt by measurement`);
      }
    }
    process.exit(failed ? 1 : 0);
  }

  for (const [label, rows] of Object.entries(all)) reportCensus(label, rows);
}

main().catch((e) => { console.error(e); process.exit(2); });
