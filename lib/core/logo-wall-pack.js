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
 *   - a row is as tall as its tallest mark, not a fixed band (the CSS drops the band's
 *     `min-height` on a packed wall), so the plan's height is the height the browser draws;
 *   - the rows, their gaps and any captions fit a stage estimated from the slide's shape (measured
 *     per canvas, see STAGE_SHARE). The old wall did not: three rows under an eyebrow drew 439 px
 *     into a 400 px stage at 1280×720;
 *   - a wall that would fit only with marks below MIN_AREA_SHARE of a square at the band keeps the
 *     old grid, so a slide that cannot hold its marks still shows the export's overflow flag;
 *   - the cap starts at the old mark band × √2 (so with a 1:2 crest in the set, a square mark keeps
 *     its old size) and falls back to the band before any mark shrinks;
 *   - a wall with captions holds every mark to the band, sized from the same area anchor, so a
 *     captioned wall of one shape keeps its old size too.
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
const { aspectFromSvgTag } = require('./image-aspect');

// MUST equal the CSS in logo-wall.styles.css, pinned by test/unit/components/logo-wall-pack.test.js.
// The band is `--logo-cell-h` (cqi of the stage, whose width is the list's width). A packed wall
// stamps both of its gaps in the same unit (`--logo-gx` / `--logo-gy`, read as cqi), so the plan's
// spacing is the drawn spacing on every canvas: the `--sp-*` tokens the unpacked wall uses do not
// scale with the list's width outside 16:9 (a planner that assumed they did under-budgeted the row
// gap of a mobile deck by 3×). The values are the old wall's at 16:9 (`--sp-2xl` 64 px and `--sp-xl`
// 48 px over a 1152 px list) and, for the tall and strip reflow, at portrait and mobile (column
// 0.08-0.095 of the list, row 0.11-0.127).
const LOGO_BAND = Object.freeze({ default: 0.09, dense: 0.065 });
const LOGO_GAP = Object.freeze({ default: 0.0556, dense: 0.0417, reflow: 0.09 });
const LOGO_ROW_GAP = Object.freeze({ default: 0.0556, dense: 0.0417, reflow: 0.11 });
// The universal `compact` modifier shrinks the whole spacing scale to 0.75 (lib/shared/shared.styles.css),
// so the old wall's gaps shrank with it and its cells widened (4 × 252 + 3 × 48 px at 1280×720).
const COMPACT_SPACING = 0.75;
// Below this share of a square at the band, a mark is too small to read: the wall keeps the old
// grid instead, whose overflow the export flags. A 24-mark captioned dense wall packed down to 5 px
// marks before this floor existed, and lost its overflow warning.
const MIN_AREA_SHARE = 0.35;
const LOGO_COLS = Object.freeze({ default: 4, dense: 6, reflowDefault: 2, reflowDense: 3 });
// How much a cap may exceed the band when the slide has room: enough that a 1:2 crest reaches the
// area of a square at the band.
const CAP_STRETCH = Math.SQRT2;
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
// A caption (name and pill) under a mark, as a share of the slide's SHORT side (its type scales with
// the canvas, not the list's width), measured on the same canvases and keyed the same way. The
// planner allows CAPTION_MARGIN more. A single worst case (0.125 everywhere) shrank a captioned
// wall of 3:1 wordmarks at 16:9 below the old equal cells, so the allowance follows the canvas.
const CAPTION_SHARE = Object.freeze([
  [0.4615, 0.094], // mobile
  [0.5625, 0.094], // story
  [0.8, 0.094], // portrait
  [1, 0.121], // square
  [4 / 3, 0.061], // standard
  [16 / 9, 0.078], // 1280×720 (4K measures 0.069)
]);
const CAPTION_MARGIN = 1.1;

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
const captionShare = (aspect) => interpolate(CAPTION_SHARE, aspect) * CAPTION_MARGIN;
// The last cell of a row stops this short of the row's end, so rounding in the browser can never
// push it onto the next line.
const ROW_SLACK = 0.001;

const FAMILY_REFLOW = new Set(['tall', 'strip']);
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
 * @returns {{mode:'packed'|'fallback', listStyle?:string, itemStyles?:string[], result?:object}}
 */
function planWall(aspects, opts = {}) {
  const n = Array.isArray(aspects) ? aspects.length : 0;
  if (!n || aspects.some((a) => !(Number.isFinite(a) && a > 0))) return { mode: 'fallback' };
  const reflow = FAMILY_REFLOW.has(opts.family);
  const band = opts.dense ? LOGO_BAND.dense : LOGO_BAND.default;
  const spacing = opts.compact ? COMPACT_SPACING : 1;
  const gap = spacing * (reflow ? LOGO_GAP.reflow : opts.dense ? LOGO_GAP.dense : LOGO_GAP.default);
  const rowGap = spacing * (reflow ? LOGO_ROW_GAP.reflow : opts.dense ? LOGO_ROW_GAP.dense : LOGO_ROW_GAP.default);
  const cols = reflow ? (opts.dense ? LOGO_COLS.reflowDense : LOGO_COLS.reflowDefault) : opts.dense ? LOGO_COLS.dense : LOGO_COLS.default;
  const rowsBefore = Math.ceil(n / cols);
  // Outside a sane range the measurement is a hidden or collapsed section, not a canvas (as in
  // lib/components/imagery/collage/collage.pack.js): fall back to 16:9.
  const sa = opts.slideAspect;
  const slideAspect = Number.isFinite(sa) && sa >= SLIDE_ASPECT_MIN && sa <= SLIDE_ASPECT_MAX ? sa : 16 / 9;
  // In fractions of the list's width: the list is STAGE_WIDTH of the slide's width.
  const stage = (stageShare(slideAspect) - EYEBROW) / STAGE_WIDTH / slideAspect;
  const captionH = (captionShare(slideAspect) * Math.min(1, 1 / slideAspect)) / STAGE_WIDTH;
  const res = pack(aspects, {}, {
    strategy: 'rows',
    goal: 'equal-weight',
    gap,
    rowGap,
    // A captioned wall holds every mark to the band (the caption height is budgeted per row, not
    // per mark), but sizes the marks from the same anchor as an uncaptioned wall: otherwise a
    // captioned wall of 3:1 wordmarks drew them a quarter narrower than the old equal cells did.
    heightCap: opts.captions ? band : band * CAP_STRETCH,
    areaCap: band * CAP_STRETCH,
    minHeightCap: band,
    maxPerRow: cols,
    maxRows: rowsBefore,
    maxHeight: Math.max(0, stage - (opts.captions ? rowsBefore * captionH : 0)),
    minCell: (1 - (cols - 1) * gap) / cols,
  });
  if (!res.ok || !(res.area >= MIN_AREA_SHARE * band * band)) return { mode: 'fallback' };
  // Rounded DOWN, so a row's stamped cells, gaps and padding never sum past the width.
  const f = (v) => Math.floor(v * 1e5) / 1e5;
  const itemStyles = new Array(n);
  for (const row of res.rows) {
    const used = row.reduce((s, i) => s + res.cells[i].w, 0) + (row.length - 1) * gap;
    const pad = Math.max(0, (1 - used) / 2);
    const rowH = Math.max(...row.map((i) => res.rects[i].h));
    row.forEach((i, k) => {
      const cell = res.cells[i].w;
      // Every mark in a row stands in a box as tall as the row's tallest mark, padded above and
      // below, so the captions under a row line up. A percentage padding resolves against the
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
  const m = /^data:image\/svg\+xml(;base64)?,(.*)$/is.exec(url || '');
  if (!m) return null;
  try {
    // atob + TextDecoder, not Buffer: the live preview runs this in a browser.
    return m[1] ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[2]);
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
function stampWall(sectionHtml, slideAspect) {
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

module.exports = {
  LOGO_BAND, LOGO_GAP, LOGO_ROW_GAP, COMPACT_SPACING, LOGO_COLS, MIN_AREA_SHARE, CAP_STRETCH, STAGE_WIDTH, stageShare, captionShare, EYEBROW,
  planWall, stampWall, aspectOfMarkHtml, svgFromDataUri,
};
