// How much of a page has NOTHING TO READ on it.
//
// The obvious measure — pixels differing from the page background — cannot see
// the emptiness that matters here, because a split body page fills its canvas
// with a stretched card and the void is INSIDE the card. So measure per ROW
// instead: a row's RANGE (max - min across its width) is ~0 when the row is
// flat, whether that flat is white page or a tinted card fill, and large the
// moment any mark crosses it. Flat rows are rows with nothing to read.
//
// Reported over the content band (top 88% — the footer/rail band sits below it):
//   flatPct      share of rows with nothing to read
//   biggestBand  longest unbroken run of such rows
//
// One `convert` per page hands back RAW gray bytes and the row scan is a pass in
// JS. (`-statistic Maximum` computes the same thing as a neighborhood op —
// measured at 1.3s a page, about half an hour over this corpus.)
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RANGE_FLOOR = 12; // 0-255; below this a row carries no mark

function flatness(png) {
  const dim = spawnSync('identify', ['-format', '%w %h', png], { encoding: 'utf8' });
  const [W, H] = String(dim.stdout).trim().split(/\s+/).map(Number);
  if (!W || !H) return null;
  const band = Math.round(H * 0.88);
  const r = spawnSync('convert', [png, '-crop', `${W}x${band}+0+0`, '+repage',
    '-colorspace', 'gray', '-depth', '8', 'gray:-'], { maxBuffer: 64 * 1024 * 1024 });
  const buf = r.stdout;
  if (!buf || buf.length < W * band) return null;
  // Scan the row's INTERIOR only. A row crossing an empty card's left and right
  // rules has a large range from those two rules alone, so the whole-width scan
  // scored a bordered empty card as "has something to read" — the exact case
  // this instrument exists to catch. Trimming 14% off each side drops the card
  // chrome and leaves the space the content would occupy.
  const x0 = Math.round(W * 0.14); const x1 = W - x0;
  let flat = 0; let run = 0; let best = 0;
  for (let y = 0; y < band; y++) {
    let lo = 255; let hi = 0;
    const off = y * W;
    for (let x = x0; x < x1; x++) { const v = buf[off + x]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < RANGE_FLOOR) { flat++; run++; if (run > best) best = run; } else run = 0;
  }
  return { flatPct: +((flat / band) * 100).toFixed(1), biggestBand: +((best / band) * 100).toFixed(1) };
}

function repoRoot(d) { while (!fs.existsSync(path.join(d, 'package.json'))) d = path.dirname(d); return d; }
const ROOT = repoRoot(__dirname);
const WORK = process.env.ASAUDIT_WORK || path.join(ROOT, '.scratch', 'asaudit');
const oracle = require(path.join(ROOT, 'test/oracle/split-oracle.json')).components;
// Rasters at 48dpi, one directory per deck — written by the audit's own render
// step (`pdftoppm -png -r 48 <deck>.pdf <dir>/p`).
const PNG = path.join(WORK, 'png48');
function roles(deck) {
  const h = fs.readFileSync(path.join(WORK, 'pdf', `${deck}.html`), 'utf8');
  return [...h.matchAll(/<section\b([^>]*data-lattice-slide="[^"]*"[^>]*)>/g)]
    .map((m) => (m[1].match(/data-split-role="([^"]*)"/) || [])[1] || 'none');
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.floor(s.length / 2)].toFixed(1) : null; };
const out = [];
for (const name of Object.keys(oracle)) {
  for (const size of ['portrait', 'square', 'hd']) {
    const deck = `${name}.${size}`;
    const dir = path.join(PNG, deck);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    const r = roles(deck);
    const body = []; const plain = [];
    files.forEach((f, i) => {
      const m = flatness(path.join(dir, f));
      if (!m) return;
      if (r[i] === 'body') body.push(m); else if (r[i] === 'none') plain.push(m);
    });
    out.push({ name, size, enrolled: oracle[name].enrolled,
      bodyN: body.length, bodyFlat: med(body.map((x) => x.flatPct)), bodyBand: med(body.map((x) => x.biggestBand)),
      plainN: plain.length, plainFlat: med(plain.map((x) => x.flatPct)), plainBand: med(plain.map((x) => x.biggestBand)) });
  }
}
fs.writeFileSync(path.join(WORK, 'flatness.json'), JSON.stringify(out, null, 1));
console.log('deck-sizes measured', out.length);
