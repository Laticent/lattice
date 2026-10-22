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
 * each venue (the rig `audit-reading-size` uses), and in Chromium checks three invariants:
 *
 *   V1 NO CLIP      the engine did not mark the slide `.overflow` / `.clip-marked`.
 *   V2 IN FRAME     every visible text node and every image/SVG lies fully inside the slide
 *                   AND inside every clipping ancestor. This is the one that finds a card
 *                   whose own `overflow:hidden` hides its excess without the slide overflowing.
 *   V3 SCAN TARGET  a QR code (`svg[aria-label~="QR"]`) is at least SCAN_MIN[venue] of the
 *                   slide width. Phone cameras read a code from about ten times its width,
 *                   and the back row of a hall is several slide-widths away.
 *
 * `KNOWN` names findings that are open on purpose; each carries the issue or note that owns
 * it, and the tool fails on a STALE entry (one that no longer fails), so the list cannot rot.
 *
 * Usage: node tools/check-venue-conformance.js [--only=a,b] [--jobs=N] [--venues=hall] [--json] [--strict]
 * A report by default (exit 0). `--strict` exits 1 on an unnamed failure, a stale KNOWN entry or a
 * component that could not be measured. It is NOT wired into CI: that is the owner's call (see the
 * decision note). Skips loudly with no Chromium.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveChrome } = require('./lib/resolve-chrome');
const { loadAll, manifestBucket } = require('../lib/components');
const { probeDeck, render } = require('./audit-reading-size');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const only = opt('only').split(',').filter(Boolean);
const jobs = Math.max(1, Number(opt('jobs')) || Math.min(4, os.cpus().length));
const JSON_OUT = args.includes('--json');
const STRICT = args.includes('--strict');

/**
 * Minimum QR width as a share of slide width, per venue. PROPOSED, not ruled: derived from
 * "scans from ~10x its width" and the room table in typography.md §7 (back row at ≤3 / ~4.5 /
 * 5–7 / 7–10 screen-heights). A phone is held up, so the table asks for less than the geometry
 * strictly needs; the owner sets the numbers (see the decision note).
 */
const SCAN_MIN = Object.freeze({ laptop: 0.1, huddle: 0.12, conference: 0.16, hall: 0.22 });

/** Open findings, by `component variant venue check`. Each names what owns it. */
const KNOWN = Object.freeze({
  // (none yet — filled from the first report and ruled on in the decision note)
});

// Runs in the page. Returns one record per slide: engine marks, escaped leaves, QR widths.
function inspectInPage() {
  const out = {};
  const sections = [...document.querySelectorAll('section')];
  sections.forEach((s, i) => {
    const sr = s.getBoundingClientRect();
    const TOL = 1.5;
    const escaped = [];
    const clipAncestors = (el) => {
      const list = [];
      for (let p = el.parentElement; p && p !== s.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflowY)) list.push(p);
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
        const ar = a.getBoundingClientRect();
        if (outside(rect, ar)) { escaped.push({ label, why: `clipped by ${a.className || a.tagName.toLowerCase()}` }); return; }
      }
    };
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!t) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      check(n.parentElement, range.getBoundingClientRect(), t.slice(0, 40));
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

async function checkComponent(browser, m) {
  const { src, roster } = probeDeck(m);
  if (!roster.length) return [];
  const { html, dir } = await render(src, m.name, path.join(ROOT, 'lib/components', manifestBucket(m), m.name));
  const page = await browser.newPage();
  try {
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 180000 });
    const slides = await page.evaluate(inspectInPage);
    if (Object.keys(slides).length !== roster.length) throw new Error(`${m.name}: rendered ${Object.keys(slides).length} slides for a roster of ${roster.length}`);
    const rows = [];
    roster.forEach((r, i) => {
      const s = slides[String(i + 1)];
      const base = { component: m.name, variant: r.variant, venue: r.venue };
      if (s.overflow || s.clipMarked) rows.push({ ...base, check: 'V1', detail: 'the engine marked the slide clipped' });
      if (s.escapedCount) rows.push({ ...base, check: 'V2', detail: `${s.escapedCount} item(s) out of frame: ${s.escaped.map((e) => `"${e.label}" (${e.why})`).join('; ')}` });
      const min = SCAN_MIN[r.venue];
      for (const w of s.qr) if (w < min) rows.push({ ...base, check: 'V3', detail: `QR is ${(w * 100).toFixed(1)}% of slide width; ${r.venue} needs ${(min * 100).toFixed(0)}%` });
    });
    return rows;
  } finally {
    await page.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const keyOf = (r) => `${r.component}${r.variant ? ` ${r.variant}` : ''} ${r.venue} ${r.check}`;

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
        try { failures.push(...await checkComponent(browser, m)); } catch (e) { errors.push({ component: m.name, error: String(e.message || e).split('\n')[0] }); }
      }
    }));
  } finally {
    await browser.close();
  }
  failures.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  const unnamed = failures.filter((f) => !KNOWN[keyOf(f)]);
  const seen = new Set(failures.map(keyOf));
  const stale = only.length ? [] : Object.keys(KNOWN).filter((k) => !seen.has(k));

  if (JSON_OUT) { process.stdout.write(`${JSON.stringify({ failures, errors, stale }, null, 2)}\n`); } else {
    const byComp = new Map();
    for (const f of failures) {
      const k = `${f.component}${f.variant ? ` ${f.variant}` : ''}`;
      if (!byComp.has(k)) byComp.set(k, []);
      byComp.get(k).push(f);
    }
    console.log(`venue conformance: ${manifests.length} components, ${failures.length} failing row(s) in ${byComp.size} component/variant(s)\n`);
    for (const [k, rows] of byComp) {
      console.log(k);
      for (const r of rows) console.log(`  ${r.venue.padEnd(11)}${r.check}${KNOWN[keyOf(r)] ? ' (known)' : ''}  ${r.detail}`);
    }
    for (const e of errors) console.log(`NOT MEASURED  ${e.component}: ${e.error}`);
    for (const k of stale) console.log(`STALE KNOWN entry (no longer fails — delete it): ${k}`);
  }
  if (STRICT && (unnamed.length || stale.length || errors.length)) process.exit(1);
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
