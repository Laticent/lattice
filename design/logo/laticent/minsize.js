#!/usr/bin/env node
/**
 * Per-asset minimum size, measured. Run: node design/logo/laticent/minsize.js
 * Needs a Chromium (CHROME_PATH) and this repo's node_modules.
 *
 * The numbers in README.md "Minimum size" come from here. They used to come
 * from a script that was never committed, which is how a floor nobody could
 * re-derive ended up shipping as a brand rule.
 *
 * FOUR ARMS, because no single one covers both a bare letter and a full-bleed
 * tile:
 *
 *   COMPONENTS  4-connected components of the ink mask. A RISE means a stroke
 *               split in two; a FALL means two merged. Either is a failure.
 *               This is the arm that catches a wordmark going to pieces, and
 *               the one a solid-ink/mean-alpha ratio is blind to.
 *
 *   EROSION     share of ink with no room to survive a one-pixel erosion --
 *               a proxy for "the thinnest stroke is about to vanish".
 *
 *   GROOVE Δ    raw luminance gap between the groove core and the letter body.
 *               Cheap, but it is a DIFFERENCE, not a ratio, so it cannot be
 *               compared against a contrast floor.
 *
 *   GROOVE CR   the same two samples as a WCAG contrast ratio, against the
 *               nominal the design specifies. This arm exists because an
 *               earlier revision of README.md carried a *contrast* reading
 *               ("1.26:1 in light mode at 48px") and a later one replaced it
 *               with a luminance SPREAD, and the two were quietly treated as
 *               the same measurement. They are not, and the floors below are
 *               set on the ratio, which is the quantity the design states.
 *
 * A tile is a full-bleed rounded rect, so its ALPHA mask is the rect and the
 * first two arms go blind to the letter inside it. For a tile the mask is
 * re-keyed on COLOR, nearest-of-three. The third center is load-bearing:
 * keyed on two (cream letter, slate ground) the brass groove #C67A12 lands on
 * the SLATE side -- 25074 vs 64469 in squared RGB -- so the incision punches a
 * channel through the letter and the component count reads 2 at every size.
 * That is the measurement splitting the letter, not the renderer.
 */
const fs = require('fs'), path = require('path');
const pp = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'puppeteer'));
const SVG = __dirname;

// [label, file, ladder axis, sizes, groove nominal contrast (null = no groove)]
const ASSETS = [
  ['mark',        'laticent-mark.svg',                  'h', [64,56,48,44,40,38,36,34,32], 1.41],
  ['mark-min',    'laticent-mark-min.svg',              'h', [48,40,36,32,28,26,24,20,16], null],
  ['tile',        'laticent-tile.svg',                  'h', [96,72,64,56,52,48,44,40],    3.06],
  ['tile-min',    'laticent-tile-min.svg',              'h', [48,40,36,32,24,20,18,16],    null],
  // No groove arm on the lockups, and no color key either. Both would be
  // wrong here and both were, in the first run of this file:
  //   - the color key classifies the near-black WORDMARK as ground (it is
  //     nearer #526D7D than #F6F3EC), so the lockup reads as one component at
  //     every size and the split this arm exists to catch becomes invisible;
  //   - the groove sample then spans wordmark-against-mark rather than
  //     groove-against-letter, and reports 1.01:1 for a groove that is fine.
  // A lockup on a transparent ground has alpha ink for both halves, so the
  // plain mask is the correct one and the component count is the whole point.
  ['lockup',      'laticent-lockup-on-light.svg',       'w', [420,340,300,280,270,260,255,250,240], null],
  ['lockup-bare', 'laticent-lockup-bare-on-light.svg',  'w', [420,340,300,280,260,250,240,230],     null],
];

const measure = async (page, svg, w, h, keyed) => page.evaluate(async (sv, w, h, KEY) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sv);
  await new Promise(r => { img.onload = r; });
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;

  const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const relLum = i => 0.2126 * chan(d[i*4]) + 0.7152 * chan(d[i*4+1]) + 0.0722 * chan(d[i*4+2]);

  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = d[i*4+3] >= 128 ? 1 : 0;
  if (KEY) {
    const C = [[0xF6,0xF3,0xEC,1],[0xC6,0x7A,0x12,1],[0x52,0x6D,0x7D,0]];
    for (let i = 0; i < w * h; i++) {
      if (d[i*4+3] < 128) { ink[i] = 0; continue; }
      let best = 0, bd = Infinity;
      for (const [r,g2,b2,isInk] of C) {
        const dd = (d[i*4]-r)**2 + (d[i*4+1]-g2)**2 + (d[i*4+2]-b2)**2;
        if (dd < bd) { bd = dd; best = isInk; }
      }
      ink[i] = best;
    }
  }

  const seen = new Uint8Array(w * h); let comps = 0;
  for (let i = 0; i < w * h; i++) {
    if (!ink[i] || seen[i]) continue;
    comps++; const st = [i]; seen[i] = 1;
    while (st.length) {
      const q = st.pop(), x = q % w, y = (q / w) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (ink[n] && !seen[n]) { seen[n] = 1; st.push(n); }
      }
    }
  }

  let area = 0, kept = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!ink[i]) continue; area++;
    if (x && y && x < w-1 && y < h-1 && ink[i-1] && ink[i+1] && ink[i-w] && ink[i+w]) kept++;
  }

  // Groove vs letter, on fully-opaque ink only so an edge pixel cannot pose as
  // the groove. p02 is the groove core, p60 the letter body.
  const L = [], V = [];
  for (let i = 0; i < w * h; i++) if (ink[i] && d[i*4+3] >= 250) { L.push(relLum(i)); V.push(0.2126*d[i*4] + 0.7152*d[i*4+1] + 0.0722*d[i*4+2]); }
  L.sort((a,b)=>a-b); V.sort((a,b)=>a-b);
  const q = (arr, f) => arr.length ? arr[Math.min(arr.length-1, Math.floor(f*arr.length))] : 0;
  const lo = q(L, 0.02), hi = q(L, 0.60);
  return { comps, lost: area ? 1 - kept/area : 1,
           delta: q(V, 0.60) - q(V, 0.02),
           cr: (Math.max(lo,hi) + 0.05) / (Math.min(lo,hi) + 0.05) };
}, svg, w, h, keyed);

(async () => {
  const b = await pp.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  for (const [label, file, axis, sizes, nominal] of ASSETS) {
    const svg = fs.readFileSync(path.join(SVG, file), 'utf8');
    const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const VW = +m[1], VH = +m[2], keyed = label.startsWith('tile');
    console.log(`\n  ${label}  (${file}, ladder by ${axis === 'w' ? 'width' : 'height'}` +
                `${nominal ? `, groove nominal ${nominal.toFixed(2)}:1` : ''})`);
    console.log('    size   px box       comps  eroded   groove Δ   groove CR');
    let base = null;
    for (const s of sizes) {
      const w = axis === 'w' ? s : Math.round(s * VW / VH);
      const h = axis === 'w' ? Math.round(s * VH / VW) : s;
      const r = await measure(p, svg, w, h, keyed);
      if (base === null) base = r.comps;
      const flag = r.comps === base ? ' ' : '!';
      const gr = nominal ? `${r.delta.toFixed(0).padStart(7)}    ${r.cr.toFixed(2).padStart(6)}:1` : '        -           -';
      console.log(`    ${String(s).padStart(4)}  ${String(w+'x'+h).padEnd(11)}${String(r.comps).padStart(4)}${flag}` +
                  `${(r.lost*100).toFixed(0).padStart(7)}%${gr}`);
    }
  }
  await b.close();
})();
