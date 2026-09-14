/*
 * CONTRAST SOLVER — every text and every mark against WHAT IS ACTUALLY BEHIND IT.
 *
 * The earlier audit only judged declared chart marks, so it could not see a
 * heading on a card, a footer on a tinted panel, or a label on a mark it had not
 * declared. The brief is "inspect for contrast against everything on the slide",
 * so this walks EVERY painted element, not a declared list.
 *
 * Method, and every line of it exists because a simpler version was wrong:
 *  - PAINT STACK. Collect every element that paints (background-color,
 *    background-image gradient, or SVG fill), in document order = paint order,
 *    with its geometry and alpha. The backdrop of anything is the composite of
 *    every stack entry that contains it, applied in order — not the nearest one,
 *    and never the section background alone.
 *  - COMPUTED PAINT, never a presentation attribute: `fill="url(#g)"` still reads
 *    url() after CSS has overridden it.
 *  - SVG text paints with `fill`; HTML text with `color`. Reading `color` first
 *    scored SVG labels with an ink they are not drawn in.
 *  - GRADIENTS resolve through `getComputedStyle(stop).stopColor` — the attribute
 *    still carries var(), which a canvas cannot resolve.
 *  - GEOMETRY: `isPointInFill` for SVG, because a bounding box lies on a wedge or
 *    a polygon. The CENTRE of the glyph box decides, not the corners — a corner
 *    sample reads a swatch a numeral merely overlaps by a pixel of line box.
 *  - sr-only text (clip-path inset(50%)) is not on the slide.
 *
 * TEXT IS NOT MODELLED, IT IS SAMPLED — and that is the difference between this
 * revision and the one before it. Compositing a backdrop from computed styles
 * has to guess at things the renderer already knows, and it guessed wrong twice
 * in ways that both hid failures:
 *
 *   · a gradient backdrop has two ends and the text sits on ONE point of the
 *     ramp. The old code could not say which, so it scored against the more
 *     FLATTERING end — white text over a black-to-white ramp measured as a pass
 *     at the black end while rendering at 1.00:1 at the white end.
 *   · `z-index` and `position` reorder paint. Document order does not see it,
 *     and this family has both (`marker-rail` at z-index 90, an absolute
 *     `cell-footer` at 30).
 *
 * So the backdrop under every glyph is now READ FROM THE RENDER: neutralize the
 * ink on every text-bearing element (never hide the element — its own background
 * is part of the backdrop), screenshot the slide, and sample the pixel the glyph
 * centre sits on. Gradients, stacking order, opacity, blend modes and filters
 * all arrive already resolved, because the renderer resolved them.
 *
 * MARKS ARE STILL PART-MODELLED, and the report says so. A mark's own rendered
 * colour is sampled the same way; what is BEHIND it is composited from computed
 * style, because reading that would mean hiding one mark and re-shooting per
 * mark. Where a mark sits on a gradient the WORSE extreme is taken — for a mark
 * the question is whether it can disappear, and an encoding that vanishes at one
 * end of a ramp has already failed.
 *
 * Reports three things:
 *   TEXT  — ratio vs the sampled backdrop, against 4.5 (or 3 for large/bold).
 *   MARK  — ratio vs its backdrop AND vs every mark it touches, against 3.
 *   Both name their subject: member, class, the text, the size.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const MEASURE = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  // A COLOUR CARRIES ITS OWN ALPHA, and dropping it is not a rounding error.
  // The family tints with forms like `color(srgb 0 0.4 0.6 / 0.1)`; reading only
  // r,g,b turns a 10% wash into a saturated fill, and the gantt's eyebrow chip —
  // dark blue type on a 10% blue tint, plainly readable — scored 1.03:1 because
  // the tint was resolved as the full accent. rgba() keeps the fourth channel;
  // it is multiplied into the layer's opacity wherever a layer is composited.
  const rgba = (v) => { try { cx.clearRect(0,0,1,1); cx.fillStyle = '#010203'; const s = cx.fillStyle;
    cx.fillStyle = v; if (cx.fillStyle === s && String(v).trim().toLowerCase() !== s) return null;
    cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data;
    const a = d[3] / 255;
    // getImageData premultiplies against the cleared (transparent) canvas, so
    // recover the source colour before returning it with its alpha.
    // CLAMP. Un-premultiplying a low-alpha sample amplifies the rounding in each
    // channel, and an out-of-gamut result (seen: 128,232,281) feeds a luminance
    // term that is quietly wrong. Channels are 0-255 by definition.
    const u = (v) => Math.max(0, Math.min(255, Math.round(v / a)));
    return a > 0 ? [u(d[0]), u(d[1]), u(d[2]), a] : [0,0,0,0];
  } catch { return null; } };
  const rgb = (v) => { const c = rgba(v); return c ? [c[0],c[1],c[2]] : null; };
  const lum = (c) => { const f=(x)=>{x/=255; return x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4;};
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
  const ratio = (a,z) => { const [x,y]=[lum(a),lum(z)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
  const comp = (fg,a,bg) => fg.map((c,i)=>Math.round(c*a+bg[i]*(1-a)));
  const srOnly = (el) => /inset\(\s*50%/.test(getComputedStyle(el).clipPath || '');
  const visible = (el) => { const cs = getComputedStyle(el);
    if (cs.visibility==='hidden' || cs.display==='none' || parseFloat(cs.opacity)===0) return false;
    if (srOnly(el)) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

  const stopsOf = (expr) => {
    const ref = /url\(["']?#([^"')]+)/.exec(expr || '');
    if (ref) { const def = document.getElementById(ref[1]); if (!def) return null;
      // A STOP CARRIES ITS OWN OPACITY. radar's area stops sit at stop-opacity
      // 0.1; reading only stop-color composites them as opaque and reports a
      // saturated fill where the render shows a wash.
      const st = [...def.querySelectorAll('stop')].map((x) => {
        const c = rgb(getComputedStyle(x).stopColor) || rgb(x.getAttribute('stop-color'));
        if (!c) return null;
        const so = parseFloat(getComputedStyle(x).stopOpacity);
        return Number.isFinite(so) && so < 1 ? [...c, so] : c;
      }).filter(Boolean);
      return st.length ? st : null; }
    const cols = String(expr||'').match(/(oklab|oklch|rgba?|hsla?|color-mix)\([^()]*(\([^()]*\))?[^()]*\)/g);
    if (!cols) return null; const st = cols.map(rgb).filter(Boolean); return st.length ? st : null;
  };
  // ONLY A SHAPE PAINTS. An SVG <text> or <tspan>'s `fill` is its TYPE colour,
  // and a <g>/<svg>/<defs>'s `fill` is an inherited value it never draws with —
  // counting either as a painted surface makes every label its own backdrop and
  // scores it at exactly 1:1. That artifact reported 258 of 428 text elements as
  // failures. HTML paints through background-color, so it needs no such list.
  const SVG_SHAPES = new Set(['rect','circle','ellipse','path','polygon','polyline','line','use']);
  const paintOf = (el) => {
    const svg = el instanceof SVGElement, cs = getComputedStyle(el);
    if (svg && !SVG_SHAPES.has(el.tagName.toLowerCase())) return null;
    const raw = svg ? cs.fill : cs.backgroundColor;
    let cols = null, ca = 1;
    if (raw && !/url\(|gradient/.test(raw) && raw !== 'rgba(0, 0, 0, 0)') {
      const c = rgba(raw); if (c && c[3] > 0) { cols = [[c[0],c[1],c[2]]]; ca = c[3]; } }
    if (!cols) cols = stopsOf(svg ? raw : cs.backgroundImage);
    if (!cols) return null;
    const a = parseFloat(svg ? cs.fillOpacity : cs.opacity);
    return { cols, alpha: (Number.isFinite(a) ? a : 1) * ca };
  };
  const at = (el, x, y) => {
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    if (!(el instanceof SVGGraphicsElement) || typeof el.isPointInFill !== 'function') return true;
    const m = el.getScreenCTM(); if (!m) return true;
    const pt = el.ownerSVGElement.createSVGPoint(); pt.x = x; pt.y = y;
    try { return el.isPointInFill(pt.matrixTransform(m.inverse())); } catch { return true; }
  };
  const inRect = (pr, x, y) => x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
  // THE CENTRE DECIDES. Sampling the corners as well was added for a label
  // tucked into a rounded box's corner — but that label's centre is inside the
  // fill too, so the corners bought nothing and cost five false positives:
  // journey's Pain->Delight numerals sit BELOW their swatches and overlap them
  // by about a pixel of line-box, which a corner sample reads as "on the
  // swatch". A backdrop is what the glyphs sit on, and the centre is the test.
  const covers = (m, r) => {
    const x = r.left + r.width/2, y = r.top + r.height/2;
    return inRect(m.box, x, y) && at(m.el, x, y);
  };

  const CHROME = new Set(['chart-frame','viz-frame','standard','print','dark','light','lr','td','silent','title','has-notes','split','auto-split']);
  const out = { text: [], marks: [], sections: [], counts: { sections: 0, painted: 0, text: 0 } };

  for (const sec of document.querySelectorAll('section')) {
    const member = [...sec.classList].find(c => !CHROME.has(c)) || '(slide)';
    const canvas = rgb(getComputedStyle(sec).backgroundColor) || [255,255,255];
    const secBox = sec.getBoundingClientRect();
    out.counts.sections++;
    const sectionIndex = out.sections.length;
    out.sections.push({ member,
      left: Math.round(secBox.left + scrollX), top: Math.round(secBox.top + scrollY),
      width: Math.round(secBox.width), height: Math.round(secBox.height) });

    // EVERY painted element in this slide, in paint order.
    const painted = [];
    for (const el of sec.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const p = paintOf(el); if (!p) continue;
      // A GRADIENT USED AS A RULE PAINTS A SLIVER, NOT THE BOX. The family draws
      // several 1px rules as `background-image: linear-gradient(...)` with
      // `background-size: 100% 1px; no-repeat`. The ELEMENT's box is the whole
      // row, so treating the gradient as a full backdrop put every table heading
      // "on" a saturated blue it never touches — 8 of 14 reported failures were
      // that one artifact. Narrow the painted rect to what the background
      // actually covers.
      const bcs = getComputedStyle(el);
      let pr = el.getBoundingClientRect();
      if (!(el instanceof SVGElement) && bcs.backgroundColor === 'rgba(0, 0, 0, 0)'
          && /no-repeat/.test(bcs.backgroundRepeat)) {
        const [bw, bh] = (bcs.backgroundSize || 'auto').split(' ');
        const px = (v, full) => v?.endsWith('px') ? parseFloat(v)
          : v?.endsWith('%') ? full * parseFloat(v) / 100 : full;
        const w = px(bw, pr.width), h = px(bh || bw, pr.height);
        const [bx, by] = (bcs.backgroundPosition || '0% 0%').split(' ');
        const off = (v, full, size) => v?.endsWith('px') ? parseFloat(v)
          : v?.endsWith('%') ? (full - size) * parseFloat(v) / 100 : 0;
        pr = { left: pr.left + off(bx, pr.width, w), top: pr.top + off(by, pr.height, h),
               width: w, height: h, right: pr.left + off(bx, pr.width, w) + w,
               bottom: pr.top + off(by, pr.height, h) + h };
      }
      painted.push({ el, p, r: pr, box: pr,
        cls: (el.getAttribute('class') || el.tagName.toLowerCase()).split(' ').filter(Boolean)[0] || el.tagName.toLowerCase() });
    }
    out.counts.painted += painted.length;

    // BACKDROP = the composite of what paints BEHIND this box.
    //
    // Two rules, both learned by getting 258 of 428 text elements reported as
    // failures on a deck that plainly does not have 258 unreadable labels:
    //
    // 1. ONLY WHAT PAINTS BEFORE IT. An element later in document order paints
    //    ON TOP; it is not a backdrop. An ancestor always is. Without this, a
    //    label was judged against marks drawn over it.
    // 2. A GRADIENT'S TWO EXTREMES ARE TWO CANDIDATE BACKDROPS, NOT A WORST
    //    CASE TO ASSUME. The text sits on one point of the ramp, and which one
    //    is not cheaply knowable — so carry both composites and fail only if
    //    the text fails against BOTH. Taking the worse of the two flagged every
    //    label over every gradient in the family.
    const before = (a, b) => a === b ? false
      : !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) || a.contains(b);
    const backdrop = (r, skip, includeSelf) => {
      let lo = canvas, hi = canvas;
      for (const m of painted) {
        // AN ELEMENT THAT PAINTS AND HOLDS ITS OWN TEXT IS ITS OWN BACKDROP.
        // journey's actor dot is a <span> with a maroon background and a white
        // initial inside it; skipping "itself" left the initial judged against
        // the pale chip behind the dot and scored 1:1 on a pair that renders at
        // 8.3:1. Only a LATER sibling is excluded — that paints on top.
        if (m.el === skip && !includeSelf) continue;
        if (m.el === skip) { const dk = m.p.cols.reduce((a,c)=>lum(c)<lum(a)?c:a, m.p.cols[0]);
          const lt = m.p.cols.reduce((a,c)=>lum(c)>lum(a)?c:a, m.p.cols[0]);
          lo = comp(dk, m.p.alpha, lo); hi = comp(lt, m.p.alpha, hi); continue; }
        if (skip && !before(m.el, skip)) continue;
        if (!covers(m, r)) continue;
        const dark = m.p.cols.reduce((a,c)=>lum(c)<lum(a)?c:a, m.p.cols[0]);
        const light = m.p.cols.reduce((a,c)=>lum(c)>lum(a)?c:a, m.p.cols[0]);
        lo = comp(dark, m.p.alpha * (dark[3] ?? 1), lo);
        hi = comp(light, m.p.alpha * (light[3] ?? 1), hi);
      }
      return [lo, hi];
    };

    // ---- TEXT
    for (const t of sec.querySelectorAll('*')) {
      if (!t.childNodes.length) continue;
      if (![...t.childNodes].some(n => n.nodeType===3 && n.textContent.trim())) continue;
      if (!visible(t) && !(t instanceof SVGElement)) continue;
      if (srOnly(t)) continue;
      const cs = getComputedStyle(t);
      // THE INK CARRIES ITS OWN ALPHA TOO. Backdrops honoured the fourth channel
      // and the ink did not: `color: color(srgb 0 0 0 / 0.18)` on white renders
      // at 1.53:1 and scored as pure black. Two elements in the shipped render
      // carry `color: color(srgb 1 1 1 / 0.76)`, so this form is live.
      const inkRaw = t instanceof SVGElement ? (rgba(cs.fill) || rgba(cs.color)) : (rgba(cs.color) || rgba(cs.fill));
      if (!inkRaw) continue;
      const inkA = (inkRaw[3] ?? 1) * (parseFloat(t instanceof SVGElement ? cs.fillOpacity : '1') || 1);
      const ink = [inkRaw[0], inkRaw[1], inkRaw[2]];
      // GLYPH EXTENT, NOT THE ELEMENT BOX. A <th>'s box spans the whole row
      // including the 2px rule at its bottom edge, so sampling the box corners
      // put every table heading "on" that rule's saturated blue — 9 of 14
      // reported failures. A Range over the element's own text nodes gives the
      // line box the glyphs actually occupy.
      let r = t.getBoundingClientRect();
      try {
        const rg = document.createRange(); let first = null, last = null;
        for (const n of t.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { first ||= n; last = n; }
        if (first) { rg.setStart(first, 0); rg.setEnd(last, last.textContent.length);
          const rr = rg.getBoundingClientRect(); if (rr.width > 0 && rr.height > 0) r = rr; }
      } catch {}
      if (!r.width || !r.height) continue;
      const px = parseFloat(cs.fontSize) || 16;
      const bold = (parseInt(cs.fontWeight,10) || 400) >= 700;
      // The modeled backdrop is kept as a FALLBACK for a glyph the sampler
      // cannot reach (off-screen, or a section the screenshot clipped away).
      // Where it is used the row says so, so a fallback number is never read as
      // a measured one.
      const [lo, hi] = backdrop(r, t, true);   // text sits ON its own element's paint
      out.counts.text++;
      out.text.push({
        member, cls: (t.getAttribute('class') || t.tagName).split(' ')[0],
        text: t.textContent.trim().slice(0, 26),
        px: +px.toFixed(1), bold, floor: (px >= 24 || (bold && px >= 18.66)) ? 3 : 4.5,
        ink, inkA: +inkA.toFixed(3),
        // the glyph box, in SECTION-relative CSS pixels — what the screenshot crops to
        gx0: r.left - secBox.left, gy0: r.top - secBox.top,
        gx1: r.right - secBox.left, gy1: r.bottom - secBox.top,
        modelLo: lo, modelHi: hi, sec: sectionIndex,
      });
    }

    // ---- MARKS: vs backdrop, and vs every mark they touch
    for (const m of painted) {
      if (m.r.width < 2 || m.r.height < 2) continue;
      const cs = getComputedStyle(m.el);
      const svg = m.el instanceof SVGElement;
      // BOTH EXTREMES, AND THE WORSE ONE COUNTS. For text the question is "can a
      // reader read it, where it sits"; for a mark it is "can this mark
      // disappear" — an encoding that vanishes at one end of a ramp has already
      // failed, so a mark is scored at its weakest point, not its average.
      const [lo, hi] = backdrop(m.r, m.el, false); // a mark is NOT its own backdrop
      const dark = m.p.cols.reduce((a,c)=>lum(c)<lum(a)?c:a, m.p.cols[0]);
      const light = m.p.cols.reduce((a,c)=>lum(c)>lum(a)?c:a, m.p.cols[0]);
      let bodyR = Infinity;
      let body = null;
      for (const col of [dark, light]) {
        for (const back of [lo, hi]) {
          const painted1 = comp(col, m.p.alpha * (col[3] ?? 1), back);
          const rr = ratio(painted1, back);
          if (rr < bodyR) { bodyR = rr; body = painted1; }
        }
      }
      const ecRaw = rgba(svg ? cs.stroke : cs.borderTopColor);
      const ew = parseFloat(svg ? cs.strokeWidth : cs.borderTopWidth) || 0;
      let edgeR = null;
      if (ecRaw && ew > 0) {
        const ea = (ecRaw[3] ?? 1) * (parseFloat(svg ? cs.strokeOpacity : '1') || 1);
        const ec = [ecRaw[0], ecRaw[1], ecRaw[2]];
        edgeR = Math.min(ratio(comp(ec, ea, lo), lo), ratio(comp(ec, ea, hi), hi));
      }
      out.marks.push({ member, cls: m.cls, body: +bodyR.toFixed(2),
        edge: edgeR === null ? null : +edgeR.toFixed(2),
        bodyColor: body, backdrop: lo,
        fail: bodyR < 3 && (edgeR === null || edgeR < 3) });
    }
  }
  return out;
};

/**
 * Make every glyph invisible WITHOUT removing anything that paints. The element
 * stays in the layout and keeps its own background — an element can be both a
 * text holder and part of its own backdrop (journey's actor dot is a <span>
 * with a maroon background and a white initial inside it). `paint-order: stroke`
 * halos and text-shadows paint too, so both go.
 */
const NEUTRALIZE = () => {
  const st = document.createElement('style');
  // THE HALO STAYS. `paint-order: stroke fill` paints a glyph's own outline in
  // the canvas colour UNDER its fill — the family's idiom for a label that
  // crosses a mark (stacked-bar's total, waterfall's value, radar's ticks). That
  // halo IS the backdrop those glyphs sit on, so stripping the stroke here
  // samples the polygon underneath instead and reports a failure the render does
  // not have. Only the FILL goes; `text-shadow` goes too, because a shadow sits
  // beside the glyph rather than under it.
  st.textContent = `*, *::before, *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
    text-decoration-color: transparent !important;
    caret-color: transparent !important;
  }
  text, tspan, textPath { fill: transparent !important; }`;
  document.head.appendChild(st);
  return true;
};

/** Read one RGB pixel out of a decoded PNG, or null if it is out of bounds. */
function pixelAt(png, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= png.width || py >= png.height) return null;
  const i = (png.width * py + px) << 2;
  const a = png.data[i + 3] / 255;
  if (a === 0) return null;
  // The screenshot is captured with omitBackground off, so alpha is 1 on any
  // painted slide; the composite against white is for the degenerate case.
  return [
    Math.round(png.data[i] * a + 255 * (1 - a)),
    Math.round(png.data[i + 1] * a + 255 * (1 - a)),
    Math.round(png.data[i + 2] * a + 255 * (1 - a)),
  ];
}

const LUM = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const RATIO = (a, z) => { const [x, y] = [LUM(a), LUM(z)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const COMP = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));

(async () => {
  const [file, media] = [process.argv[2], process.argv[3] || 'screen'];
  const chrome = process.env.CHROME_PATH || require('./lib/resolve-chrome.js').resolveChrome();
  const b = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.emulateMediaType(media);
  await p.goto(`file://${path.resolve(file)}`, { waitUntil: 'networkidle0' });
  const r = await p.evaluate(MEASURE);

  // ── measure each glyph against what it is actually drawn on ───────────────
  //
  // TWO SHOTS OF THE SAME SLIDE, and the difference between them IS the text.
  // Shot A is the slide as rendered. Shot B is the same slide with only the
  // glyph FILL removed — layout, backgrounds, marks and the family's canvas-
  // coloured halos all still painted. A pixel that differs between the two is a
  // pixel a glyph covered: shot A holds the ink as the reader sees it (its own
  // alpha already composited) and shot B holds what sits immediately under it.
  // The WCAG ratio is those two numbers, with nothing modeled in between.
  //
  // Why not one shot and the glyph's centre: a haloed tick has canvas colour
  // around each glyph STROKE and the series polygon showing through the gaps
  // between them, and the box centre usually lands in a gap. Sampling there
  // reported radar's ticks failing on all twelve themes AFTER the halo that
  // fixed them. Scoring the most fully covered pixels answers the question WCAG
  // actually asks — the glyph against its immediate surround.
  const { PNG } = require('pngjs');
  const bySection = new Map();
  for (const t of r.text) (bySection.get(t.sec) || bySection.set(t.sec, []).get(t.sec)).push(t);

  const shoot = async (box) => {
    const buf = await p.screenshot({ clip: { x: box.left, y: box.top, width: box.width, height: box.height } });
    return PNG.sync.read(Buffer.from(buf));
  };
  const shots = new Map();
  for (const idx of bySection.keys()) {
    const box = r.sections[idx];
    if (!box || box.width < 1 || box.height < 1) continue;
    try { shots.set(idx, { a: await shoot(box) }); } catch { /* off-screen */ }
  }
  await p.evaluate(NEUTRALIZE);
  for (const [idx, pair] of shots) {
    try { pair.b = await shoot(r.sections[idx]); } catch { shots.delete(idx); }
  }

  let sampled = 0;
  let modeled = 0;
  for (const [idx, rows] of bySection) {
    const pair = shots.get(idx);
    if (!pair?.b) continue;
    const { a: A, b: B } = pair;
    for (const row of rows) {
      const t_ink = row.ink;
      const t_inkA = row.inkA;
      // the glyph box, section-relative, clipped to the shot
      const x0 = Math.max(0, Math.floor(row.gx0));
      const y0 = Math.max(0, Math.floor(row.gy0));
      const x1 = Math.min(A.width - 1, Math.ceil(row.gx1));
      const y1 = Math.min(A.height - 1, Math.ceil(row.gy1));
      let maxCover = 0;
      const covered = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const pa = pixelAt(A, x, y);
          const pb = pixelAt(B, x, y);
          if (!pa || !pb) continue;
          const cover = Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2]));
          if (cover < 8) continue; // antialiasing floor: not a glyph pixel
          if (cover > maxCover) maxCover = cover;
          covered.push({ pb, cover });
        }
      }
      // WHICH PIXELS: the ones the glyph most fully covers. WHAT IS READ FROM
      // THEM: only shot B — the surround. Shot A's pixel is NOT the ink, and
      // that is worth stating because it is the obvious thing to reach for and
      // it is wrong: Chromium antialiases a 16px stem across two or three
      // pixels with subpixel RGB fringing, so no pixel on a body-size glyph
      // ever holds the pure colour. Measured on a #111-on-white control, the
      // darkest pixel scored 4.02:1 against a true 18.1:1, and a #bbb control
      // came back orange. So the INK comes from computed style — which is
      // exact, alpha included — and only the BACKDROP is sampled, which is the
      // half that could not be computed.
      //
      // The WORST qualifying pixel wins: a glyph that straddles its halo and
      // the mark beyond it is only as readable as the part sitting on the mark.
      // HOW MUCH OF THE GLYPH IS AT THE WORST NUMBER, not just what the worst
      // number is. A connector crossing one corner of a label puts 49 of its
      // 3,400 pixels on a darker surface: strict is the right default for an
      // audit, but "1% of the glyph" and "the whole glyph" are two different
      // defects with two different fixes, and a report that cannot tell them
      // apart sends a colour change after a geometry bug. `share` is the
      // fraction of covered pixels at or below the reported ratio.
      let best = null;
      const qualifying = covered.filter((c) => c.cover >= maxCover * 0.5);
      for (const c of qualifying) {
        const shown = COMP(t_ink, t_inkA, c.pb);
        const rr = RATIO(shown, c.pb);
        if (!best || rr < best.ratio) best = { ratio: rr, ink: shown, under: c.pb };
      }
      if (best) {
        const atWorst = qualifying.filter(
          (c) => RATIO(COMP(t_ink, t_inkA, c.pb), c.pb) <= best.ratio * 1.02,
        ).length;
        best.share = +(atWorst / qualifying.length).toFixed(3);
        row.measured = best;
        row.how = 'sampled';
        sampled++;
      }
    }
  }
  await b.close();

  const textFails = [];
  for (const t of r.text) {
    let got;
    let ink;
    let under;
    if (t.measured) {
      ({ ratio: got, ink, under } = t.measured);
      t.share = t.measured.share;
    } else {
      // Nothing differed between the two shots — the glyph painted no distinct
      // pixel at all (clipped, or its ink already equals its surround). Fall
      // back to the modeled composite at its WORSE extreme; an unsampled glyph
      // is not a reason to report the flattering number.
      const lo = t.modelLo;
      const hi = t.modelHi;
      under = RATIO(COMP(t.ink, t.inkA, lo), lo) <= RATIO(COMP(t.ink, t.inkA, hi), hi) ? lo : hi;
      ink = COMP(t.ink, t.inkA, under);
      got = RATIO(ink, under);
      t.how = 'modeled';
      modeled++;
    }
    if (got < t.floor) {
      textFails.push({ member: t.member, cls: t.cls, text: t.text, px: t.px, bold: t.bold,
        floor: t.floor, ratio: +got.toFixed(2), how: t.how,
        share: t.share ?? 1,
        ink: ink.join(','), under: under.join(',') });
    }
  }

  const seen = new Set();
  const markFails = r.marks.filter((m) => m.fail).filter((m) => {
    const k = `${m.member}/${m.cls}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(JSON.stringify({
    file, media,
    counts: { ...r.counts, textSampled: sampled, textModeled: modeled },
    textFails, markFails,
  }, null, 1));
})();
