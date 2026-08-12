#!/usr/bin/env node
/**
 * check-slide-contrast — WCAG AA audit of the ACTUALLY RENDERED slide, not the
 * token table.
 *
 * Complements tools/contrast-audit.js rather than duplicating it (HARD RULE #15).
 * That tool checks each theme's own token matrix — the pairs a palette DECLARES.
 * It structurally cannot see a pairing a COMPONENT invents: `--text-secondary`
 * set on a `--cat-N-fill` panel, `--cat-N-mark` used as a card label, an ink
 * chosen against `--bg-alt` instead of `--bg`. Those only exist once a slide
 * renders. This walks the real DOM of a rendered deck, resolves every text run's
 * effective background by climbing ancestors through transparent paints, and
 * scores WCAG 2.x AA (4.5:1 normal, 3:1 for >=24px or >=18.66px bold). It reads
 * pseudo-element text too, since this engine puts real content there (axis
 * labels, step badges, checkpoint labels).
 *
 * Born from #1207: the token audit was green at 704 pairs while the rendered
 * deck carried 44 sub-AA text runs, several as low as 2.54:1.
 *
 * KNOWN LIMITATION — OCCLUDED RUNS. It scores every run that is in the DOM and not
 * `display:none` / `visibility:hidden`, including one painted UNDER an opaque
 * sibling and therefore not on screen at all. Such a run is neither a pass nor a
 * failure and there is no threshold that describes it; treat a reported failure on
 * text you cannot find in the render as a layering bug to chase, not a contrast one.
 * Live example: the running header is fully occluded by the left rail on every
 * `split-*` layout (measured — a flat one-color strip where the glyphs should be,
 * against 17 colors on a layout that paints it), so its row here describes ink that
 * never reaches the page. Detecting occlusion needs per-glyph hit-testing this
 * deliberately does not do.
 *
 * Usage:  node tools/check-slide-contrast.js <rendered-deck.html> [more.html ...]
 * Exits non-zero if any run falls below its AA threshold. On-demand, not a
 * blocking gate: the "muted chrome" tier (footer, pagination) is WCAG-exempt by
 * palette contract and will always report.
 */
const puppeteer = require('puppeteer');

const PROBE = () => {
  const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  // Reads BOTH computed-color serializations Chromium emits. The `color(srgb …)`
  // arm is not a nicety: `color-mix(in srgb, white N%, transparent)` — the whole
  // --on-dark-* / --on-accent-* ink ramp — computes to `color(srgb 1 1 1 / 0.68)`,
  // never to rgba(). An rgb()-only parser returns null for every one of those, and
  // the caller treats null as "not text" and DROPS the run: silent, not an error.
  // Measured on a 9-slide bookend/split probe, that hid 18 of 69 text runs (26%) —
  // and they were exactly the runs that matter, because the translucent ramp is the
  // only ink on a dark panel that isn't already white. Among them: a 2.49:1 closing
  // eyebrow and a 3.50:1 accent-rail eyebrow, both sub-AA in every palette, both
  // invisible to this tool for as long as it has existed (#1207 onward).
  // Channels in `color(srgb …)` are 0–1, so they scale to 0–255 here.
  //
  // AND THEN A GENERAL FALLBACK, because enumerating serializations is a losing
  // game: `color-mix(in oklab, …)` computes to `oklab(0.199 … / 0.62)`, and this
  // engine ships three text-bearing rules in that form (chart-family.css,
  // matrix-grid, kanban — a kanban column header drops 2 real runs). `display-p3`
  // is a fourth shape. Each new one would silently drop runs exactly as `color(srgb
  // …)` did, so the last resort hands the string to a 1x1 canvas and reads the
  // pixel: that resolves ANY color the UA can parse, including spaces this file has
  // never heard of, and gamut-maps wide-gamut values to the sRGB the WCAG formula is
  // defined on. Kept as a FALLBACK rather than the only path because the two exact
  // parsers above are lossless, while the canvas round-trips through premultiplied
  // storage and costs ~1/255 per channel at low alpha.
  // See engineering/decisions/2026-08-11-on-dark-ink-tiers.md.
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  const viaCanvas = (s) => {
    // Reset first: an unparseable fillStyle is IGNORED by the setter, which would
    // otherwise silently reuse the previous color and report a confident wrong answer.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    if (ctx.fillStyle === '#000000' && !/^(#000000|black|rgb\(0,\s*0,\s*0\))$/i.test(s.trim())) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    if (a <= 0) return { rgb: [0, 0, 0], a: 0 };
    return { rgb: [d[0], d[1], d[2]], a };
  };
  const parse = (s) => {
    s = String(s);
    if (!s || s === 'none' || s === 'transparent') return s === 'transparent' ? { rgb: [0, 0, 0], a: 0 } : null;
    const csrgb = s.match(/^color\(srgb\s+([^)]+)\)$/);
    if (csrgb) {
      const p = csrgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && !p.some(Number.isNaN)) {
        return { rgb: [p[0] * 255, p[1] * 255, p[2] * 255], a: p.length > 3 ? p[3] : 1 };
      }
      return viaCanvas(s); // e.g. `none` channels
    }
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && !p.some(Number.isNaN)) {
        return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
      }
    }
    return viaCanvas(s);
  };
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

  // Climb ancestors, compositing every translucent paint, until an opaque one.
  // `from` seeds the stack with paints that are NOT ancestors — see the two
  // callers below; without it this function has two blind spots that both report
  // as failures, which is worse than silence because it teaches the reader to
  // ignore the output.
  const effectiveBg = (el, from = []) => {
    let acc = null;
    // Accumulated coverage must COMPOUND — `a + c.a * (1 - a)` — not snap to 1 on the
    // second layer. Stamping `a: 1` there truncates the stack at two paints and never
    // reaches the opaque base, so two stacked 20%-black washes on white resolved to a
    // near-white backdrop and a 2.52:1 run was scored as a pass. Reproduced against
    // real Chromium: the painted pixel is rgb(163,163,163). The bug predates the
    // sibling-underlay seeding above, which is what made it reachable — `underlays()`
    // deliberately returns MULTIPLE translucent layers.
    const absorb = (c) => {
      if (!c || c.a <= 0) return false;
      acc = acc === null
        ? { rgb: c.rgb.slice(), a: c.a }
        : { rgb: over(acc.rgb, c.rgb, acc.a), a: acc.a + c.a * (1 - acc.a) };
      return acc.a >= 0.999;
    };
    for (const c of from) if (absorb(c)) return acc.rgb;
    let node = el;
    while (node && node !== document.documentElement) {
      if (absorb(parse(getComputedStyle(node).backgroundColor))) return acc.rgb;
      node = node.parentElement;
    }
    return acc ? acc.rgb : [255, 255, 255];
  };

  // BLIND SPOT 2: a paint that is a SIBLING, not an ancestor. This engine
  // absolutely positions the running header/footer at the slide's inset, where a
  // split layout's dark rail is a separate element underneath them — and it paints
  // pagination over stacked fills the same way. An ancestor-only climb sees the
  // section canvas instead of the panel actually behind the glyphs, which scored the
  // `split-panel.watermark` footer as white-on-white (1.00:1) where it renders as
  // white on the accent rail — a reported failure that was not real.
  //
  // Done by GEOMETRY, deliberately not by `document.elementsFromPoint`: that hit-
  // tests in VIEWPORT coordinates, and a rendered deck is one tall document with
  // every slide stacked, so it returns [] for every run below the fold (slide 6's
  // footer sits at y=4281 in a 720px viewport — measured, which is how the first cut
  // of this silently found nothing). It also skips `pointer-events:none`, which this
  // engine sets on several decorative fills. Rects are viewport-relative too, but
  // all of them share that origin, so containment comparisons hold at any scroll.
  //
  // Paint order is approximated by DOM order: a sibling that PRECEDES the run paints
  // under it, and the last such sibling is the topmost underlay. A positive-z-index
  // element earlier in the DOM would fool it; none exists on these surfaces, and the
  // failure mode is a backdrop that is still closer to the truth than the section
  // canvas. Ancestors are excluded — the climb above already owns them.
  // `rect` defaults to the element box, but a caller with a tighter one should pass
  // it: the running header/footer are FULL-SLIDE-WIDTH boxes holding short
  // left-aligned text, so their box center lands on the far side of a split layout
  // from the glyphs. Sampling the box center scored slide 6's footer against the
  // white right half while its text sits on the accent rail — right arithmetic,
  // wrong place. The text loop passes the text node's own Range rect.
  const underlays = (el, rect) => {
    const r = rect?.width ? rect : el.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const sec = el.closest('section[data-lattice-slide]');
    if (!sec) return [];
    const found = [];
    for (const node of sec.querySelectorAll('*')) {
      if (node === el || node.contains(el) || el.contains(node)) continue;
      if (!(node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const c = parse(getComputedStyle(node).backgroundColor);
      if (!c || c.a <= 0) continue;
      const b = node.getBoundingClientRect();
      if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) continue;
      found.push(c);
    }
    // Latest in DOM order is topmost; composite downward until opaque.
    found.reverse();
    const out = [];
    for (const c of found) { out.push(c); if (c.a >= 1) break; }
    return out;
  };

  const out = [];
  // THE DOCUMENTED-EXEMPT DECORATIVE TIER. The palette contract makes `--text-muted`
  // WCAG-exempt by design — it inks the running header/footer, pagination and faint
  // decorative glyphs, and this file's own header says that tier "will always
  // report". Reporting it as a FAILURE anyway is not harmless: it padded the count by
  // roughly half, and a reader who learns to skim past known-bogus rows is exactly
  // the reader who skims past a real one. So exempt runs are resolved per section,
  // scored, and reported in their own bucket instead of inflating the verdict.
  // `--border` joins it for the same reason: `split-panel.steps`' oversized step
  // numeral is painted with it deliberately (z-index 0, pointer-events none).
  // Resolved via a probe element, NOT `getPropertyValue('--text-muted')` — that
  // returns the raw token text (`light-dark(#6B7F9A, …)`), which no color parser
  // can read. Assigning it to `color` makes the browser resolve light-dark(),
  // var() chains and the section's own color-scheme for us.
  const exemptInks = new Set();
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    sec.appendChild(probe);
    for (const tok of ['--text-muted', '--border']) {
      probe.style.color = `var(${tok})`;
      const v = parse(getComputedStyle(probe).color);
      if (v && v.a > 0) exemptInks.add(v.rgb.map(Math.round).join(','));
    }
    probe.remove();
  }
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const page = sec.getAttribute('data-lattice-slide');
    const cls = sec.getAttribute('data-class') || '';
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const fs = parseFloat(cs.fontSize);
      if (!fs) continue;
      // SVG TEXT IS PAINTED BY `fill`, NOT `color`. Reading `color` on an SVG
      // <text> returns whatever it inherited from the section, so every chart
      // label in this engine was being scored against a foreground that is not
      // the one on screen — confidently, with a plausible number. Measured on one
      // word-cloud word: `color` reported 11.96:1 while its actual `fill` gave
      // 1.20:1. That blind spot is why a regression which drove word fills to
      // 1.11:1 on 12 palettes passed this tool, and why any "N sub-AA runs" figure
      // quoted over a chart deck was meaningless.
      //
      // `fill` also applies to HTML elements as an inherited SVG property, so it is
      // only authoritative INSIDE an <svg>; elsewhere it is usually the initial
      // `rgb(0, 0, 0)` and must be ignored in favor of `color`. `stroke` is the
      // paint for text drawn as an outline (none in-tree today, but it is the same
      // trap and costs one line).
      // SVG carries NON-RENDERING text elements: <desc>, <title> and <metadata> are
      // accessibility/metadata payloads the renderer never paints. They inherit the
      // initial `fill: rgb(0,0,0)`, so reading fill without excluding them invents
      // failures — a <desc> on a dark canvas scored 1.22:1 for ink that does not
      // exist. (This is the false-positive class the `fill` fix itself introduced.)
      const SVG_NON_RENDERING = new Set(['desc', 'title', 'metadata']);
      const inSvg = typeof el.ownerSVGElement !== 'undefined' && el.ownerSVGElement !== null;
      if (inSvg && SVG_NON_RENDERING.has(el.tagName.toLowerCase())) continue;
      let fg = null;
      if (inSvg) {
        const fillPaint = cs.fill && cs.fill !== 'none' ? parse(cs.fill) : null;
        const strokePaint = cs.stroke && cs.stroke !== 'none' ? parse(cs.stroke) : null;
        fg = fillPaint && fillPaint.a > 0 ? fillPaint : strokePaint;
      }
      if (!fg) fg = parse(cs.color);
      if (!fg || fg.a === 0) continue;
      // A Range around the text node is the tightest true box for the glyphs — see
      // `underlays`. Cheap, and exact where the element box is not.
      const tr = document.createRange();
      tr.selectNodeContents(n);
      const bg = effectiveBg(el, underlays(el, tr.getBoundingClientRect()));
      const fgc = fg.a < 1 ? over(fg.rgb, bg, fg.a) : fg.rgb;
      const w = parseInt(cs.fontWeight, 10) || 400;
      // WCAG "large text": >=24px, or >=18.66px when bold (>=700)
      const large = fs >= 24 || (fs >= 18.66 && w >= 700);
      out.push({
        page, cls, tag: el.tagName.toLowerCase(),
        text: t.slice(0, 44), fs: +fs.toFixed(1), w, large,
        fg: fgc.map(Math.round), bg: bg.map(Math.round),
        r: +ratio(fgc, bg).toFixed(2), need: large ? 3 : 4.5,
        exempt: exemptInks.has(fgc.map(Math.round).join(',')),
      });
    }
    // pseudo-elements carry real text in this engine (axis labels, badges)
    for (const el of sec.querySelectorAll('*')) {
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(el, pe);
        const content = cs.content;
        if (!content || content === 'none' || content === 'normal') continue;
        if (!/[A-Za-z0-9]/.test(content)) continue;
        const fs = parseFloat(cs.fontSize); if (!fs) continue;
        const fg = parse(cs.color); if (!fg) continue;
        // BLIND SPOT 1: the PSEUDO's own background. A pseudo is not in the DOM, so
        // an ancestor climb starting at its originating element steps straight past
        // the fill the pseudo paints for itself — which in this engine is usually the
        // whole point of the pseudo (the `RECOMMENDATION` chip on split-compare's
        // verdict, the numbered counter disc on split-panel.watermark). Both scored
        // 1.09:1 white-on-near-white while rendering as white on a solid accent fill.
        // Seed the stack with the pseudo's own paint, THEN the owner's sibling
        // underlays, then climb. A pseudo needs `underlays()` at least as much as a
        // text node does — the pagination pseudo on a cover sits over an absolutely
        // positioned rail (base.modifiers.css), and without this it scored 1.00:1
        // white-on-white where it really renders 11.29:1 on the rail.
        const bg = effectiveBg(el, [parse(cs.backgroundColor), ...underlays(el)].filter(Boolean));
        const fgc = fg.a < 1 ? over(fg.rgb, bg, fg.a) : fg.rgb;
        const w = parseInt(cs.fontWeight, 10) || 400;
        const large = fs >= 24 || (fs >= 18.66 && w >= 700);
        out.push({
          page, cls, tag: el.tagName.toLowerCase() + pe,
          text: content.replace(/^"|"$/g, '').slice(0, 44), fs: +fs.toFixed(1), w, large,
          fg: fgc.map(Math.round), bg: bg.map(Math.round),
          r: +ratio(fgc, bg).toFixed(2), need: large ? 3 : 4.5,
          exempt: exemptInks.has(fgc.map(Math.round).join(',')),
        });
      }
    }
  }
  return out;
};

(async () => {
  const files = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  let fails = 0, total = 0;
  for (const f of files) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto('file://' + require('path').resolve(f), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 400));
    const rows = await page.evaluate(PROBE);
    total += rows.length;
    const under = rows.filter((x) => x.r < x.need);
    const bad = under.filter((x) => !x.exempt);
    const exempt = under.filter((x) => x.exempt);
    console.log(`\n${'='.repeat(78)}\n${f}  —  ${rows.length} text runs, ${bad.length} below AA${exempt.length ? ` (+${exempt.length} in the WCAG-exempt decorative tier, not counted)` : ''}\n${'='.repeat(78)}`);
    for (const b of bad) {
      fails++;
      console.log(
        `  p${String(b.page).padStart(2)} ${b.cls.padEnd(30).slice(0, 30)} ${b.tag.padEnd(14)}` +
        ` ${String(b.fs).padStart(5)}px/${String(b.w).padEnd(3)} ${b.r.toFixed(2)}:1 (need ${b.need})` +
        `  fg rgb(${b.fg}) on rgb(${b.bg})\n      "${b.text}"`
      );
    }
    // font-size report for the matrix axis labels specifically
    const axis = rows.filter((x) => /REACH|COGNITION/i.test(x.text));
    if (axis.length) {
      console.log('  ── axis label sizes ──');
      for (const a of axis) console.log(`     ${a.text.padEnd(24)} ${a.fs}px  weight ${a.w}  ${a.r}:1`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}\n${total} runs checked · ${fails} below AA\n`);
  process.exit(fails ? 1 : 0);
})();
