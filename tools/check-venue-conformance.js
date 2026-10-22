#!/usr/bin/env node
/**
 * check-venue-conformance — does every component's sample SURVIVE each venue?
 *
 * `venue:` scales the type step 1.0 / 1.15 / 1.3 / 1.5x (typography.md §7). A component that
 * is not built for the scale loses content at conference and hall, and nothing else notices:
 * `contact` set a hero name at 129pt inside a fixed-padding card, so at hall the QR code, the
 * email, the phone number and the URL were all pushed past the frame and clipped. Its manifest
 * said `venueCapacity: none` ("a fixed card, nothing to count"), which exempted it from the one
 * check that would have caught it. This tool closes that hole: it does not trust a count budget,
 * it renders the thing and looks.
 *
 * For every component it renders the manifest `sample`, bare and once per declared variant, at
 * each venue and canvas family (the rig `audit-reading-size` uses), and in Chromium checks three
 * invariants. A component that declares `venueProbe` (the longest realistic content it promises
 * to hold) is rendered with that too, because a short sample can pass where a real card clips:
 *
 *   V1 NO CLIP      the engine did not mark the slide `.overflow` / `.clip-marked`.
 *   V2 IN FRAME     every visible text node and every image/SVG lies fully inside the slide
 *                   AND inside every clipping ancestor. This is the one that finds a card
 *                   whose own `overflow:hidden` hides its excess without the slide overflowing.
 *   V3 SCAN TARGET  a QR code (`svg[aria-label~="QR"]`) is at least SCAN_MIN[venue] of the
 *                   slide width. Phone cameras read a code from about ten times its width,
 *                   and the back row of a hall is several slide-widths away.
 *
 * `KNOWN` names findings that are open on purpose, each with its reason, and the tool fails on a
 * STALE entry (one that no longer fails), so the list cannot rot.
 *
 * Usage: node tools/check-venue-conformance.js [--only=a,b] [--jobs=N] [--families=wide,square,tall,strip] [--all-families] [--venues=hall] [--json] [--strict]
 * A report by default (exit 0). `--strict` exits 1 on an unnamed failure, a stale KNOWN entry or a
 * component that could not be measured. It is NOT wired into CI: that is the owner's call (see the
 * decision note). Skips loudly with no Chromium.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveChrome } = require('./lib/resolve-chrome');
const { loadAll, manifestBucket } = require('../lib/components');
const { splitSample, render, VENUE_CLASS } = require('./audit-reading-size');
const { SIZE_ALIAS } = require('./lib/calibrate-core');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const only = opt('only').split(',').filter(Boolean);
const VENUES = (opt('venues') || 'laptop,huddle,conference,hall').split(',');
const jobs = Math.max(1, Number(opt('jobs')) || Math.min(4, os.cpus().length));
const JSON_OUT = args.includes('--json');
const FAMILY_LIST = (opt('families') || 'wide').split(',').filter(Boolean);
const ALL_FAMILIES = args.includes('--all-families'); // also hold count-budgeted components to every canvas
const STRICT = args.includes('--strict');

/**
 * Minimum QR width as a share of slide width, per venue. PROPOSED, not ruled: derived from
 * "scans from ~10x its width" and the room table in typography.md §7 (back row at ≤3 / ~4.5 /
 * 5–7 / 7–10 screen-heights). A phone is held up, so the table asks for less than the geometry
 * strictly needs; the owner sets the numbers (see the decision note).
 */
const SCAN_MIN = Object.freeze({ laptop: 0.1, huddle: 0.12, conference: 0.16, hall: 0.22 });

/**
 * Open findings, as RULES: a row matches when its component (and variant, canvas, venues, check when
 * given) agree. Each names why it is open; `--strict` fails on a row no rule covers and on a rule no
 * row matches any more, so the list can neither grow quietly nor rot.
 */
const PORTRAIT_HALL = 'Display text on a portrait canvas at a hall: the type scales twice (the canvas, then the venue) and a portrait slide is read on a phone, not from the back of a room. The venue contract is a landscape one; recorded, not designed for.';
const KNOWN = Object.freeze([
  { component: 'closing', variant: 'index', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'closing', variant: 'qr', families: ['tall'], venues: ['conference', 'hall'], why: PORTRAIT_HALL },
  { component: 'divider', variant: 'qr', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'content', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'piechart', variant: 'donut', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'quote', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'scene', families: ['tall'], venues: ['conference', 'hall'], why: PORTRAIT_HALL },
  { component: 'state-chart', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'title', families: ['tall'], venues: ['hall'], why: PORTRAIT_HALL },
  { component: 'topic', variant: 'fact', families: ['tall'], venues: ['conference', 'hall'], why: PORTRAIT_HALL },
  { component: 'video', families: ['square', 'tall'], venues: ['conference', 'hall'], why: PORTRAIT_HALL },
  { component: 'pricing', families: ['wide'], venues: ['laptop'], why: 'The sample\'s footnote ("Checks accumulate up the ladder") is clipped by its list item at the designed size; it predates venues. Found by the harness on 2026-10-22, not on the path of the venue work.' },
  { component: 'video', variant: 'qr', why: 'The `qr` register sizes its code from a fixed `8rem`, so it sits under the venue floor from huddle up (10% of the slide at every venue) and its caption is clipped under the poster. Moving it onto the shared QR sizing made it clip at laptop, so the edit was backed out; it needs its own layout (code beside the poster at wide). Found 2026-10-22.' },
]);
const covers = (k, r) => k.component === r.component
  && (k.variant === undefined || k.variant === r.variant)
  && (!k.families || k.families.includes(r.family))
  && (!k.venues || k.venues.includes(r.venue));

// Runs in the page. Returns one record per slide: engine marks, escaped leaves, QR widths.
function inspectInPage() {
  const out = {};
  const sections = [...document.querySelectorAll('section')];
  sections.forEach((s, i) => {
    const sr = s.getBoundingClientRect();
    const TOL = 1.5;
    const escaped = [];
    // An ancestor clips an axis only if ITS overflow on that axis is hidden/clip (or scrolls). A box that
    // clips sideways but not vertically (`overflow-x: hidden`) does not hide what sits below it.
    const clips = (v) => /(hidden|clip|auto|scroll)/.test(v);
    const clipAncestors = (el) => {
      const list = [];
      // An out-of-flow box (absolute, fixed) is clipped only by an `overflow` box that is its
      // containing block or above it: one nested between the box and its containing block does not
      // clip it. Collection therefore starts at the containing block.
      const pos = getComputedStyle(el).position;
      const outOfFlow = pos === 'absolute' || pos === 'fixed';
      const cb = outOfFlow ? el.offsetParent : null;
      let counting = !outOfFlow;
      for (let p = el.parentElement; p && p !== s.parentElement; p = p.parentElement) {
        if (!counting && (p === cb || (pos === 'fixed' && !cb))) counting = true;
        if (!counting) continue;
        const cs = getComputedStyle(p);
        if (clips(cs.overflowX) || clips(cs.overflowY)) list.push({ el: p, x: clips(cs.overflowX), y: clips(cs.overflowY) });
      }
      return list;
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    };
    // Visually hidden BY DESIGN (screen-reader text, KaTeX's MathML twin): a 1px clip box, a
    // `clip` rect, an inset clip-path, or parked a whole slide-width off to the side. Not content.
    const hiddenByDesign = (el) => {
      for (let p = el; p && p !== s.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        if ((cs.clip && cs.clip !== 'auto') || (cs.clipPath && /inset\(\s*50%/.test(cs.clipPath))) return true;
        if (r.width <= 2 && r.height <= 2 && cs.overflow !== 'visible') return true;
        if (r.right < sr.left - sr.width || r.left > sr.right + sr.width) return true;
      }
      return false;
    };
    const outside = (r, box) => r.left < box.left - TOL || r.right > box.right + TOL || r.top < box.top - TOL || r.bottom > box.bottom + TOL;
    const check = (el, rect, label) => {
      if (rect.width < 1 || rect.height < 1 || !visible(el) || hiddenByDesign(el)) return;
      if (el.closest('.sr-only, [aria-hidden="true"], header, footer, .fit-berth, .fit-tab')) return;
      if (outside(rect, sr)) { escaped.push({ label, why: 'outside the slide' }); return; }
      for (const a of clipAncestors(el)) {
        const ar = a.el.getBoundingClientRect();
        const outX = a.x && (rect.left < ar.left - TOL || rect.right > ar.right + TOL);
        const outY = a.y && (rect.top < ar.top - TOL || rect.bottom > ar.bottom + TOL);
        if (outX || outY) { escaped.push({ label, why: `clipped by ${a.el.className || a.el.tagName.toLowerCase()}` }); return; }
      }
    };
    // Text runs sideways: a vertical writing mode, or an ancestor turned a quarter. Its line runs along Y.
    const isRotated = (el) => {
      for (let p = el; p && p !== s.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.writingMode && cs.writingMode !== 'horizontal-tb') return true;
        const m = /^matrix\(([^)]+)\)$/.exec(cs.transform || '');
        if (m) { const [a, b] = m[1].split(',').map(Number); if (Math.abs(b) > Math.abs(a)) return true; }
      }
      return false;
    };
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!t) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      // A text run's rect is the font's content area, which overshoots its line box by a few pixels
      // beside the ink; test the middle 60% ACROSS the line (the thin axis), so a label that sits on a
      // clip edge is not reported for glyph padding. Along the line nothing is trimmed: a run cut at its
      // ends is cut, and a rotated label (a chart's axis title) is long where horizontal text is wide.
      const tr = range.getBoundingClientRect();
      const thinY = !isRotated(n.parentElement);
      const across = (thinY ? tr.height : tr.width) * 0.2;
      check(n.parentElement, {
        left: tr.left + (thinY ? 0 : across), right: tr.right - (thinY ? 0 : across), width: tr.width, height: tr.height,
        top: tr.top + (thinY ? across : 0), bottom: tr.bottom - (thinY ? across : 0),
      }, t.slice(0, 40));
    }
    for (const el of s.querySelectorAll('svg, img, canvas')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      check(el, el.getBoundingClientRect(), el.getAttribute('aria-label') || el.tagName.toLowerCase());
    }
    const qrs = [...s.querySelectorAll('svg')].filter((v) => /\bQR\b/i.test(v.getAttribute('aria-label') || ''))
      .map((v) => v.getBoundingClientRect().width / sr.width);
    out[String(i + 1)] = {
      overflow: s.classList.contains('overflow'),
      clipMarked: s.classList.contains('clip-marked'),
      escaped: escaped.slice(0, 6),
      escapedCount: escaped.length,
      qr: qrs,
    };
  });
  return out;
}

/**
 * The probe deck: the content under test, bare and under each declared register, at every venue (a
 * per-slide `venue-*` class). A register is rendered with ITS OWN sample (`variantDocs[v].sample`)
 * when the manifest has one, because a register such as `pricing four` or `list-steps vertical` needs
 * different content from the bare slide; one without a sample of its own takes the bare content.
 */
function buildDeck(m, probe) {
  const bare = probe === 'venueProbe' ? m.venueProbe : m.sample;
  if (!bare) return { src: '', roster: [] };
  const rows = [{ variant: null, sample: bare }];
  for (const v of m.variants || []) {
    const own = probe === 'sample' ? m.variantDocs?.[v]?.sample : null;
    rows.push({ variant: v, sample: own || bare });
  }
  const roster = [];
  const slides = [];
  for (const row of rows) {
    const sp = splitSample(row.sample, m.name);
    for (const venue of VENUES) {
      const cls = [m.name, ...sp.tokens, ...(row.variant && !sp.tokens.includes(row.variant) ? row.variant.split(/\s+/) : []), VENUE_CLASS[venue]].filter(Boolean).join(' ');
      slides.push(`<!-- _class: ${cls} -->\n\n${sp.body}\n`);
      roster.push({ variant: row.variant, venue });
    }
  }
  return { src: `---\ntheme: indaco\n---\n\n${slides.join('\n---\n\n')}`, roster };
}

async function checkComponent(browser, m, family, probe) {
  // `probe` names the content under test: the manifest `sample`, or `venueProbe`, the longest
  // realistic content the component declares it holds.
  const { src, roster } = buildDeck(m, probe);
  if (!roster.length) return [];
  const { html, dir } = await render(src, m.name, path.join(ROOT, 'lib/components', manifestBucket(m), m.name), SIZE_ALIAS[family]);
  const page = await browser.newPage();
  try {
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 180000 });
    const slides = await page.evaluate(inspectInPage);
    // The engine paginates a component whose content it can split (a pane host on a portrait canvas), so
    // the page count no longer matches the roster; those pages are not one slide each, and not judged here.
    if (Object.keys(slides).length !== roster.length) { paginated.add(`${m.name} ${family}`); return []; }
    const rows = [];
    roster.forEach((r, i) => {
      // A component with a count budget (`venueCapacity.byWords`) is judged above laptop on content
      // sized to that budget (`venueProbe`); its laptop-sized sample is over budget at hall by
      // design, and `lint:deck` already says so.
      // The same holds for a component that declares a `venueProbe` (a host of panes, a card): the probe
      // is its promise at every venue, and the sample is the laptop demo.
      const budgeted = m.venueCapacity?.byWords || m.venueCapacity?.prose || m.venueCapacity?.lines || m.venueProbe;
      if (probe === 'sample' && budgeted && r.venue !== 'laptop') return;
      // Nor is the bare sample the content of a register that declares its own words (`prose.variants`).
      if (probe === 'sample' && m.venueCapacity?.prose && r.variant) return;
      // A one-block prose component declares each register's own words (`prose.variants`), so the probe,
      // sized to the bare register's hall budget, is judged on the bare register only.
      if (probe === 'venueProbe' && m.venueCapacity?.prose && r.variant) return;
      const s = slides[String(i + 1)];
      const base = { component: m.name, variant: r.variant, venue: r.venue, family, probe };
      if (s.overflow || s.clipMarked) rows.push({ ...base, check: 'V1', detail: 'the engine marked the slide clipped' });
      if (s.escapedCount) rows.push({ ...base, check: 'V2', detail: `${s.escapedCount} item(s) out of frame: ${s.escaped.map((e) => `"${e.label}" (${e.why})`).join('; ')}` });
      const min = SCAN_MIN[r.venue];
      // 2% slack: the engine's slide-width unit stops a hair short of the slide's gutters.
      for (const w of s.qr) if (w < min * 0.98) rows.push({ ...base, check: 'V3', detail: `QR is ${(w * 100).toFixed(1)}% of slide width; ${r.venue} needs ${(min * 100).toFixed(0)}%` });
    });
    return rows;
  } finally {
    await page.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const paginated = new Set(); // `<component> <family>` pairs the engine splits into more pages than the roster
const keyOf = (r) => `${r.component}${r.variant ? ` ${r.variant}` : ''}${r.probe === 'venueProbe' ? ' (venueProbe)' : ''} ${r.family}/${r.venue} ${r.check}`;

async function main() {
  let chrome;
  try { chrome = resolveChrome(); } catch { chrome = null; }
  if (!chrome) { console.error('check-venue-conformance: SKIPPED — no Chromium (set CHROME_PATH).'); process.exit(0); }
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const manifests = loadAll().filter((m) => !only.length || only.includes(m.name));
  const failures = [];
  const errors = [];
  const queue = [...manifests];
  try {
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (queue.length) {
        const m = queue.shift();
        // A count budget (`venueCapacity`) is measured at the wide canvas only, so that is the contract
        // for a component that has one; a component with none is held to every canvas asked for.
        const fams = (m.venueCapacity?.byWords || m.venueCapacity?.prose || m.venueCapacity?.lines) && !ALL_FAMILIES ? FAMILY_LIST.filter((f) => f === 'wide') : FAMILY_LIST;
        for (const fam of fams) {
          for (const probe of m.venueProbe ? ['sample', 'venueProbe'] : ['sample']) {
            try { failures.push(...await checkComponent(browser, m, fam, probe)); } catch (e) { errors.push({ component: m.name, family: fam, error: String(e.message || e).split('\n')[0] }); }
          }
        }
      }
    }));
  } finally {
    await browser.close();
  }
  failures.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  const known = (r) => KNOWN.find((k) => covers(k, r));
  const unnamed = failures.filter((f) => !known(f));
  const stale = only.length ? [] : KNOWN.filter((k) => !failures.some((r) => covers(k, r))).map((k) => `${k.component}${k.variant ? ` ${k.variant}` : ''}`);

  if (JSON_OUT) { process.stdout.write(`${JSON.stringify({ failures, errors, stale }, null, 2)}\n`); } else {
    const byComp = new Map();
    for (const f of failures) {
      const k = `${f.component}${f.variant ? ` ${f.variant}` : ''}${f.probe === 'venueProbe' ? ' (venueProbe)' : ''}`;
      if (!byComp.has(k)) byComp.set(k, []);
      byComp.get(k).push(f);
    }
    console.log(`venue conformance: ${manifests.length} components, ${failures.length} failing row(s) in ${byComp.size} component/variant(s)\n`);
    for (const [k, rows] of byComp) {
      console.log(k);
      for (const r of rows) console.log(`  ${r.family.padEnd(7)}${r.venue.padEnd(11)}${r.check}${known(r) ? ' (known)' : ''}  ${r.detail}`);
    }
    if (paginated.size) console.log(`\nPAGINATES, not judged (the engine splits it across pages on that canvas): ${[...paginated].sort().join(', ')}`);
    for (const e of errors) console.log(`NOT MEASURED  ${e.component}: ${e.error}`);
    for (const k of stale) console.log(`STALE KNOWN entry (no longer fails — delete it): ${k}`);
  }
  if (STRICT && (unnamed.length || stale.length || errors.length)) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });

module.exports = { SCAN_MIN, inspectInPage };
