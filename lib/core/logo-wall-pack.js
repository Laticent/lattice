/**
 * Logo-wall packing — every mark at the same visual weight.
 *
 * Before this, every mark was drawn `contain` in an equal cell under a fixed band height, so a
 * mark's area followed its shape: rendered at 1280×720, a 3:1 wordmark got 3.6× the area of a 1:2
 * crest (2.75× in `dense`). Now the `rows` strategy of @laticent/mosaico (docs/src/lib/mosaico)
 * gives each mark the same area unless that would make it taller than a cap, and breaks the list
 * into balanced, centered rows (engineering/decisions/2026-10-16-mosaico-layout-library.md §4.3,
 * §6; equal-weight is equal area with a height cap, §9 decision 6).
 *
 * The layout keeps the wall's rhythm and fits its stage:
 *   - every cell is at least the old column width, so a row holds at most the old column count;
 *   - the wall has at most the old row count;
 *   - a row is band-tall, as before, when the wall fits that way; a wall that must shrink to fit
 *     its stage stands each row at its tallest mark instead (the CSS drops the band's `min-height`
 *     on a packed wall and the stamp pads each mark to its row), so the stamped height is drawn;
 *   - the rows, their gaps and any captions fit a stage estimated from the slide's shape (measured
 *     per canvas, see STAGE_SHARE). The old wall did not: three rows under an eyebrow drew 439 px
 *     into a 400 px stage at 1280×720;
 *   - a wall that would fit only with marks below MIN_AREA_SHARE of a square at the band keeps the
 *     old grid, so a slide that cannot hold its marks still shows the export's overflow flag;
 *   - no mark stands taller than the band, so no row stands taller than the old wall's, and a wall
 *     that fit before fits whatever its heading does (a wall allowed to grow into the room the stage
 *     estimate promised overflowed once its heading wrapped);
 *   - the shared area stays inside the range of the old marks' areas, so a wall of one shape draws
 *     every mark exactly as before, on every canvas, captioned or not. Inside that range it is
 *     AREA_ANCHOR squares at the band, halved per halving of the narrowest shape down to 1:2: with a
 *     crest in the set the wide marks match a square at the band, and the crest, held at the band,
 *     keeps its old size with half their area (3.6× before).
 *
 * Units are fractions of the list's width, which is what the stamped CSS percentages resolve
 * against. No DOM, no fs: the CLI (string stamp, after the inline-SVG swap in lattice.js) and the
 * live preview (lib/transformers/logo-marks.js `applyToDom`, which measures each mark) call the
 * same `planWall`, so both pick the same layout (HARD RULE #1).
 *
 * A mark whose shape cannot be read (a remote raster that failed, an unreadable file) leaves the
 * whole wall on the old equal-cell grid: `data-logo-wall="fallback"`, no styles stamped.
 */

const { pack } = require('@laticent/mosaico');
const { canvasScaleFor } = require('../adaptive/families');
const { aspectFromSvgTag } = require('./image-aspect');

// MUST equal the CSS in logo-wall.styles.css, pinned by test/unit/components/logo-wall-pack.test.js.
// The band is `--logo-cell-h` (cqi of the stage, whose width is the list's width). A packed wall
// stamps both of its gaps in the same unit (`--logo-gx` / `--logo-gy`, read as cqi), so the plan's
// spacing is the drawn spacing on every canvas. The old wall's gaps are spacing tokens: `--sp-2xl`
// (5% of the slide's width at 16:9, so 5/90 of the list's) and `--sp-xl` (3.75%), each times the
// deck's `--canvas-scale` (lib/adaptive/families.js canvasScaleFor: 1.65 square, about 2 tall).
// A wide wall spaces both ways by `--logo-gap`; the tall and strip reflow puts `--sp-xl` between
// columns and `--sp-2xl` between rows, dense or not.
const LOGO_BAND = Object.freeze({ default: 0.09, dense: 0.065 });
const SP_2XL = 5 / 90;
const SP_XL = 3.75 / 90;
const SP_LG = 2.5 / 90;
// The universal `compact` modifier redefines the spacing scale at 0.75 of the 16:9 tokens, without
// `--canvas-scale` (lib/shared/shared.styles.css), so a compact wall's gaps are the same fraction
// of the list on every canvas.
const COMPACT_SPACING = 0.75;
// Below this share of a square at the band, a mark is too small to read: the wall keeps the old
// grid instead, whose overflow the export flags. A 24-mark captioned dense wall packed down to 5 px
// marks before this floor existed, and lost its overflow warning.
const MIN_AREA_SHARE = 0.35;
const LOGO_COLS = Object.freeze({ default: 4, dense: 6, reflowDefault: 2, reflowDense: 3 });
// The shared area before the clamp to the old range, in squares at the band. A mark whose old area
// was above it comes down to it, and a thin wide mark below it grows toward it; the band holds both.
const AREA_ANCHOR = 2;
// The list takes 90% of the slide's width. Under a headline (no eyebrow) it takes this share of the
// slide's height, measured on CLI renders at each canvas the deck sizes offer, keyed by the slide's
// width / height: the header is closer to a fixed height than to a fixed share, so a taller slide
// leaves the wall more. Interpolated between rows, then less EYEBROW for a possible eyebrow (at
// 1280×720 the eyebrow costs 38 px of 438). A low estimate only shrinks the marks; it can never
// overflow the slide.
const STAGE_WIDTH = 0.9;
const STAGE_SHARE = Object.freeze([
  [0.4615, 0.85], // mobile 1080×2340
  [0.5625, 0.819], // story 1080×1920
  [0.8, 0.751], // portrait 1080×1350
  [1, 0.733], // square 1080×1080
  [4 / 3, 0.706], // standard 960×720
  [16 / 9, 0.608], // 1280×720 and 4K
]);
const EYEBROW = 0.06;
// A caption (a one-line name and a pill) under a mark, as a share of the slide's SHORT side (its type
// scales with the canvas, not the list's width), measured from the mark's foot to the item's foot
// on the same canvases and keyed the same way. A captioned wall's rows never stand taller than the
// old wall's (every mark is held to the band), so this estimate only decides how far a wall that
// would overflow shrinks. A high one shrank walls that fit, so it is measured, with no margin.
const CAPTION_SHARE = Object.freeze([
  [0.4615, 0.101], // mobile
  [0.5625, 0.1], // story
  [0.8, 0.098], // portrait
  [1, 0.075], // square
  [4 / 3, 0.059], // standard
  [16 / 9, 0.078], // 1280×720 (4K measures 0.076)
]);

function interpolate(t, aspect) {
  if (aspect <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (aspect <= t[i][0]) {
      const [a0, s0] = t[i - 1];
      const [a1, s1] = t[i];
      return s0 + ((s1 - s0) * (aspect - a0)) / (a1 - a0);
    }
  }
  return t[t.length - 1][1];
}
const stageShare = (aspect) => interpolate(STAGE_SHARE, aspect);
const captionShare = (aspect) => interpolate(CAPTION_SHARE, aspect);
// The last cell of a row stops this short of the row's end, so rounding in the browser can never
// push it onto the next line.
const ROW_SLACK = 0.001;

const FAMILY_REFLOW = new Set(['tall', 'strip']);
// The shapes @laticent/mosaico takes as given (docs/src/lib/mosaico/index.ts itemAspect).
const MARK_ASPECT_MIN = 0.05;
const MARK_ASPECT_MAX = 20;
const SLIDE_ASPECT_MIN = 0.3;
const SLIDE_ASPECT_MAX = 4;

/**
 * @param {(number|null)[]} aspects  each mark's width / height, in written order; null = unknown
 * @param {object} opts
 * @param {boolean} [opts.dense]
 * @param {boolean} [opts.compact]      the universal `compact` modifier (spacing at 0.75)
 * @param {string}  [opts.family]       the section's `data-family` (`tall` / `strip` reflow to fewer columns)
 * @param {number}  [opts.slideAspect]  the slide's width / height (default 16:9)
 * @param {boolean} [opts.captions]     any mark carries a caption (name or pill)
 * @param {{captionW:number, captionH:number, stage:number}} [opts.measured]  what the page MEASURED of a
 *   captioned wall that overflowed: its widest caption line, its tallest caption (with the gap above it)
 *   and the room under the headline, each a fraction of the list's width (`measureWall`). The wall takes
 *   the most columns whose cell holds that caption, and plans against the measured room instead of the
 *   estimates. Only a wall the page saw overflow is re-planned, so a wall that fits keeps its plan.
 * @returns {{mode:'packed'|'fallback', listStyle?:string, itemStyles?:string[], result?:object}}
 */
function planWall(aspects, opts = {}) {
  const n = Array.isArray(aspects) ? aspects.length : 0;
  // mosaico reads a shape outside (MARK_ASPECT_MIN, MARK_ASPECT_MAX) as 1:1, which would plan a 1:20
  // rule as a square and draw it twenty times too tall: such a wall keeps the old grid.
  if (!n || aspects.some((a) => !(Number.isFinite(a) && a > MARK_ASPECT_MIN && a < MARK_ASPECT_MAX))) return { mode: 'fallback' };
  const reflow = FAMILY_REFLOW.has(opts.family);
  const band = opts.dense ? LOGO_BAND.dense : LOGO_BAND.default;
  // Outside a sane range the measurement is a hidden or collapsed section, not a canvas (as in
  // lib/components/imagery/collage/collage.pack.js): fall back to 16:9.
  const sa = opts.slideAspect;
  const slideAspect = Number.isFinite(sa) && sa >= SLIDE_ASPECT_MIN && sa <= SLIDE_ASPECT_MAX ? sa : 16 / 9;
  const spacing = opts.compact ? COMPACT_SPACING : canvasScaleFor(slideAspect);
  const m = opts.measured && Number.isFinite(opts.measured.captionW) ? opts.measured : null;
  // A wall the page measured overflowing spaces its columns as the dense wall does (--sp-xl) and its rows
  // by --sp-lg: its captions already part the rows, and the height the gaps give back goes to the marks. At
  // the default row gap eight captioned marks at x1.4 packed to 0.335 of a band, under the legibility
  // floor; at --sp-lg they take the full band (measured, fit-everywhere-model.md §25).
  const gap = spacing * (reflow || opts.dense || m ? SP_XL : SP_2XL);
  const rowGap = spacing * (m ? SP_LG : !reflow && opts.dense ? SP_XL : SP_2XL);
  let cols = reflow ? (opts.dense ? LOGO_COLS.reflowDense : LOGO_COLS.reflowDefault) : opts.dense ? LOGO_COLS.dense : LOGO_COLS.default;
  // MEASURED COLUMNS (owner, 2026-11-15; fit-everywhere-model.md §25): fewer columns only when a caption
  // the page measured is wider than the cell, so a wall whose captions fit keeps its count.
  if (m) while (cols > 1 && (1 - (cols - 1) * gap) / cols < m.captionW) cols -= 1;
  const rowsBefore = Math.ceil(n / cols);
  // The old wall drew each mark `contain` in a column-wide cell under the band.
  const cell = (1 - (cols - 1) * gap) / cols;
  const oldAreas = aspects.map((a) => Math.min(cell, a * band) ** 2 / a);
  const anchor = AREA_ANCHOR * band * band * Math.min(1, Math.max(Math.min(...aspects), 0.5));
  const area = Math.min(Math.max(anchor, Math.min(...oldAreas)), Math.max(...oldAreas));
  // In fractions of the list's width: the list is STAGE_WIDTH of the slide's width.
  // Wider than 16:9, the engine keeps a 16:9 content box at the slide's height (lib/engine/css.js
  // wideFactor), so the list is 0.9 of THAT width, and the header and captions are drawn at 16:9 sizes.
  const boxAspect = Math.min(slideAspect, 16 / 9);
  const stage = m && m.stage > 0 ? m.stage : (stageShare(boxAspect) - EYEBROW) / STAGE_WIDTH / boxAspect;
  const captionH = m && m.captionH >= 0 ? m.captionH : (captionShare(boxAspect) * Math.min(1, 1 / boxAspect)) / STAGE_WIDTH;
  const maxHeight = Math.max(0, stage - (opts.captions ? rowsBefore * captionH : 0));
  const res = pack(aspects, {}, {
    strategy: 'rows',
    goal: 'equal-weight',
    gap,
    rowGap,
    // Every mark is held to the band, as in the old wall, captioned or not.
    heightCap: band,
    area,
    maxPerRow: cols,
    maxRows: rowsBefore,
    maxHeight,
    minCell: cell,
  });
  if (!res.ok || !(res.area >= MIN_AREA_SHARE * band * band)) return { mode: 'fallback' };
  // Rounded DOWN, so a row's stamped cells, gaps and padding never sum past the width.
  const f = (v) => Math.floor(v * 1e5) / 1e5;
  const itemStyles = new Array(n);
  // Rows stand band-tall, as the old wall's did, so a wall the stage estimate says fits draws its
  // rows where it used to. Only a wall that had to shrink to fit its stage stands each row at its tallest mark.
  const bandRows = res.rows.length * band + (res.rows.length - 1) * rowGap <= maxHeight + 1e-12;
  for (const row of res.rows) {
    const used = row.reduce((s, i) => s + res.cells[i].w, 0) + (row.length - 1) * gap;
    const pad = Math.max(0, (1 - used) / 2);
    const rowH = bandRows ? band : Math.max(...row.map((i) => res.rects[i].h));
    row.forEach((i, k) => {
      const cell = res.cells[i].w;
      // Every mark in a row stands in a box as tall as the row, padded above and below, so the
      // captions under a row line up. A percentage padding resolves against the
      // cell's width, hence the division.
      const parts = [`--logo-cell:${f(cell)}`, `--logo-mw:${f(res.rects[i].w / cell)}`, `--logo-ar:${f(aspects[i])}`, `--logo-mpad:${f((rowH - res.rects[i].h) / 2 / cell)}`];
      // The first and last cells of a row carry the row's leftover width as padding, which
      // centers the row AND fills the line, so the browser breaks exactly where the plan does.
      if (k === 0) parts.push(`--logo-ps:${f(pad)}`);
      if (k === row.length - 1) parts.push(`--logo-pe:${f(Math.max(0, pad - ROW_SLACK))}`);
      itemStyles[i] = parts.join(';');
    });
  }
  return { mode: 'packed', listStyle: `--logo-gx:${f(gap)};--logo-gy:${f(rowGap)}`, itemStyles, result: res };
}

/** A data: URI's SVG text, or null. */
function svgFromDataUri(url) {
  // Any media-type parameters are allowed (`;charset=utf-8`, which the Studio's asset inliner writes).
  const m = /^data:image\/svg\+xml((?:;[^,;]*)*),(.*)$/is.exec(url || '');
  if (!m) return null;
  const base64 = /;base64$/i.test(m[1]);
  try {
    // atob + TextDecoder, not Buffer: the live preview runs this in a browser.
    return base64 ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[2]);
  } catch {
    return null;
  }
}

/** A mark's aspect from its inline `<svg>` or a data: SVG mask, or null. */
function aspectOfMarkHtml(spanHtml) {
  const inline = /<svg\b[^>]*>/i.exec(spanHtml);
  let tag = inline ? inline[0] : null;
  if (!tag) {
    const url = /--logo-mask:url\('([^']*)'\)/.exec(spanHtml);
    const svg = url && svgFromDataUri(url[1]);
    tag = svg ? (/<svg\b[^>]*>/i.exec(svg) || [null])[0] : null;
  }
  const d = tag ? aspectFromSvgTag(tag) : null;
  return d && d.w > 0 && d.h > 0 ? d.w / d.h : null;
}

const readAttr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

// The wall's list and its top-level items: `<div class="cell-stage">` then the first `<ul>`.
const WALL_UL_RE = /(<div class="cell-stage">\s*<ul)([^>]*)>/;
const MARK_RE = /<span\b[^>]*\sclass="[^"]*\blogo-mark\b[^"]*"[^>]*>(?:<svg\b[\s\S]*?<\/svg>)?<\/span>/g;

/**
 * String-path stamp (the CLI, after lattice.js has inlined each local mark's `<svg>`).
 * Idempotent: a list that already carries `data-logo-wall` is left alone.
 * @param {string} sectionHtml  one `<section …>…</section>`
 * @param {number} [slideAspect]
 */
function stampWall(sectionHtml, slideAspect, measured) {
  if (typeof sectionHtml !== 'string' || sectionHtml.indexOf('logo-mark') === -1) return sectionHtml;
  const open = sectionHtml.match(/^<section\b[^>]*>/i);
  if (!open || !/(?:^|\s)logo-wall(?:\s|$)/.test(readAttr(open[0], 'class') || '')) return sectionHtml;
  const at = sectionHtml.search(WALL_UL_RE);
  if (at === -1) return sectionHtml;
  // Idempotent: a list already stamped (packed or fallback) is left alone.
  if (/\sdata-logo-wall=/.test(WALL_UL_RE.exec(sectionHtml.slice(at))[2])) return sectionHtml;
  // Walk the list's top-level `<li>`s by depth, so a caption's nested `<ul><li>` is not a mark.
  const ulStart = sectionHtml.indexOf('<ul', at);
  const tagRe = /<(\/?)(ul|li)\b[^>]*>/g;
  tagRe.lastIndex = ulStart;
  let depth = 0;
  const items = []; // [start, end) of each top-level <li>
  let m;
  let ulEnd = -1;
  while ((m = tagRe.exec(sectionHtml))) {
    const closing = m[1] === '/';
    if (m[2] === 'ul') {
      depth += closing ? -1 : 1;
      if (depth === 0) { ulEnd = m.index; break; }
    } else if (depth === 1) {
      if (!closing) items.push([m.index, -1]);
      else items[items.length - 1][1] = m.index;
    }
  }
  if (ulEnd === -1 || !items.length || items.some(([, e]) => e === -1)) return sectionHtml;
  const aspects = [];
  let captions = false;
  for (const [s, e] of items) {
    const body = sectionHtml.slice(s, e);
    const mark = body.match(MARK_RE);
    aspects.push(mark ? aspectOfMarkHtml(mark[0]) : null);
    if (/<ul\b/.test(body)) captions = true;
  }
  const plan = planWall(aspects, {
    dense: /(?:^|\s)dense(?:\s|$)/.test(readAttr(open[0], 'class') || ''),
    compact: /(?:^|\s)compact(?:\s|$)/.test(readAttr(open[0], 'class') || ''),
    family: readAttr(open[0], 'data-family'),
    slideAspect,
    captions,
    measured,
  });
  // Rebuild back to front so the offsets stay valid.
  let out = sectionHtml;
  if (plan.mode === 'packed') {
    for (let k = items.length - 1; k >= 0; k--) {
      const s = items[k][0];
      const tagEnd = out.indexOf('>', s);
      const tag = out.slice(s, tagEnd);
      const style = plan.itemStyles[k];
      const next = /\sstyle="/.test(tag) ? tag.replace(/\sstyle="([^"]*)"/, (_x, v) => ` style="${style};${v}"`) : `${tag} style="${style}"`;
      out = out.slice(0, s) + next + out.slice(tagEnd);
    }
  }
  return out.replace(WALL_UL_RE, (_all, open, own) => {
    if (/\sdata-logo-wall=/.test(own)) return `${open}${own}>`;
    if (plan.mode !== 'packed') return `${open} data-logo-wall="fallback"${own}>`;
    const merged = /\sstyle="/.test(own) ? own.replace(/\sstyle="([^"]*)"/, (_s, v) => ` style="${plan.listStyle};${v}"`) : `${own} style="${plan.listStyle}"`;
    return `${open} data-logo-wall="packed"${merged}>`;
  });
}

// The properties a stamp writes (`planWall`'s list and item styles). A re-stamp removes these and no
// others, so an author's own `--logo-ink` on a raw-HTML item survives.
const STAMPED = ['--logo-gx', '--logo-gy', '--logo-cell', '--logo-mw', '--logo-ar', '--logo-mpad', '--logo-ps', '--logo-pe'];

/**
 * Re-plan a wall the page measured overflowing (`measureWall`), in a section `stampWall` already stamped:
 * its stamp (the `data-logo-wall` mark and every `--logo-*` property it wrote) comes off, then the wall is
 * stamped again from the measurement. Author styles on the list and its items stay. A measured plan that
 * does not pack leaves the section as it was.
 */
function restampWall(sectionHtml, slideAspect, measured) {
  const at = sectionHtml.search(WALL_UL_RE);
  if (at === -1) return sectionHtml;
  const ulStart = sectionHtml.indexOf('<ul', at);
  // The wall's own close, by depth: each caption is a nested list, so the first `</ul>` is a caption's.
  let depth = 0;
  let ulEnd = -1;
  for (let i = ulStart; i < sectionHtml.length;) {
    const open = sectionHtml.indexOf('<ul', i);
    const close = sectionHtml.indexOf('</ul>', i);
    if (close < 0) break;
    if (open >= 0 && open < close) { depth += 1; i = open + 3; continue; }
    depth -= 1;
    if (depth === 0) { ulEnd = close; break; }
    i = close + 5;
  }
  // Strip by scanning each open tag in the list: no pattern, just the stamp's own names.
  const strip = (tag) => {
    let t = tag.split(' data-logo-wall="packed"').join('').split(' data-logo-wall="fallback"').join('');
    const s = t.indexOf(' style="');
    if (s < 0) return t;
    const e = t.indexOf('"', s + 8);
    const kept = t.slice(s + 8, e).split(';').filter((d) => d.trim() && !STAMPED.includes(d.split(':')[0].trim())).join(';');
    t = kept ? `${t.slice(0, s)} style="${kept}"${t.slice(e + 1)}` : t.slice(0, s) + t.slice(e + 1);
    return t;
  };
  let out = '';
  let i = ulStart;
  const end = ulEnd < 0 ? sectionHtml.length : ulEnd;
  while (i < end) {
    const lt = sectionHtml.indexOf('<', i);
    if (lt < 0 || lt >= end) { out += sectionHtml.slice(i, end); break; }
    out += sectionHtml.slice(i, lt);
    const gt = sectionHtml.indexOf('>', lt);
    const tag = sectionHtml.slice(lt, gt + 1);
    out += tag.startsWith('<ul') || tag.startsWith('<li') ? strip(tag) : tag;
    i = gt + 1;
  }
  const next = stampWall(sectionHtml.slice(0, ulStart) + out + sectionHtml.slice(end), slideAspect, measured);
  // A measured plan that cannot pack (its marks would fall under the legibility floor) changes nothing:
  // the old grid would clip as the estimate's plan does, so the wall keeps the stamp it has.
  return next.indexOf('data-logo-wall="packed"') >= 0 ? next : sectionHtml;
}

/**
 * MEASURE a stamped, captioned wall in the page (owner, 2026-11-15: measured columns). DOM only and
 * self-contained, so the CLI runs it in the export's page by its source and the live preview calls it
 * directly. Returns null for a wall with no captions or no width, else `over` (a caption line wider than
 * its cell, or a row below the stage) and the facts `planWall`'s `measured` reads, as fractions of the
 * list's width.
 */
function measureWall(list) {
  const lb = list.getBoundingClientRect();
  const W = lb.width;
  if (!(W > 0)) return null;
  const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
  const items = Array.from(list.children).filter((el) => el.tagName === 'LI');
  const boxes = items.map((li) => li.getBoundingClientRect());
  let captionW = 0;
  let captionH = 0;
  let wide = false;
  let any = false;
  items.forEach((li, k) => {
    const box = boxes[k];
    const cap = li.querySelector(':scope > ul');
    if (!cap) return;
    any = true;
    // A caption is centered under its mark, so it spills half its excess each side. Between two columns it
    // may take its half of the gap, which touches nothing; at the row's ends it may not pass the list,
    // whose edge is the stage's. Only a spill past that room runs into a neighbor or off the slide.
    const sameRow = (b) => Math.abs(b.top - box.top) < 1;
    const first = !boxes.some((b, n) => n !== k && sameRow(b) && b.left < box.left);
    const last = !boxes.some((b, n) => n !== k && sameRow(b) && b.left > box.left);
    const room = Math.min(first ? box.left - lb.left : gap / 2, last ? lb.right - box.right : gap / 2);
    for (const line of Array.from(cap.children)) {
      const range = li.ownerDocument.createRange();
      range.selectNodeContents(line);
      const w = Math.max(range.getBoundingClientRect().width, ...Array.from(line.children).map((c) => c.getBoundingClientRect().width));
      captionW = Math.max(captionW, w);
      if ((w - box.width) / 2 > room + 0.5) wide = true;
    }
    const rowGap = parseFloat(getComputedStyle(li).rowGap) || 0;
    captionH = Math.max(captionH, cap.getBoundingClientRect().height + rowGap);
  });
  if (!any) return null;
  const stageEl = list.parentElement;
  const sb = stageEl.getBoundingClientRect();
  // The rows overflow when they pass the stage's box, which is what clips them; the room a re-plan packs
  // into stops at the stage's padding, so a re-planned wall keeps the stage's inset.
  const bottom = Math.max(0, ...boxes.map((b) => b.bottom));
  const floor = sb.bottom - (parseFloat(getComputedStyle(stageEl).paddingBottom) || 0);
  return { over: wide || bottom > sb.bottom + 0.5, captionW: captionW / W, captionH: captionH / W, stage: (floor - lb.top) / W };
}

module.exports = {
  LOGO_BAND, SP_2XL, SP_XL, COMPACT_SPACING, LOGO_COLS, MIN_AREA_SHARE, AREA_ANCHOR, STAGE_WIDTH, stageShare, captionShare, EYEBROW,
  planWall, stampWall, restampWall, measureWall, aspectOfMarkHtml, svgFromDataUri,
};
