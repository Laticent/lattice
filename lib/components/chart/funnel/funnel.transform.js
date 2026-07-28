/**
 * funnel chart kernel — parsing + SVG geometry for the `funnel` chart-family
 * member. A vertical stack of centred trapezoids whose width is proportional
 * to each stage's value, with the stage-to-stage conversion rate printed in
 * the gaps. The drop-off is the read.
 *
 * Shape (one default, no variants today):
 *   ## Heading.
 *   - Stage label `value`
 *   - Next stage   `value`
 *
 * Each `<li>` is one stage: lead text = label, trailing inline-code = the
 * value (any number; commas/units tolerated). Stages render top-to-bottom in
 * authored order; the widest value sets full width.
 *
 * Like radar / quadrant / state-chart this is a kernel MODULE consumed by the
 * single chart-family dispatcher (lib/components/chart/_chart-family/
 * chart-family.js), which the registry adapter routes to all three render
 * paths (lattice-emulator.js, lib/runtime/index.js). Write
 * once, render everywhere. Palette stays in CSS: bands carry a `--i` index and
 * the text uses classes styled in funnel.styles.css, so the kernel emits no
 * hard-coded colour.
 */

// Shared per-mark detail substrate (data-mark template payload + speaker-note
// fallback), generalized from the pie. See mark-detail.js and
// engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
const markDetail = require('../_chart-family/mark-detail');
// Canonical depth-aware list walker (lib/core) — was a local copy.
const { parseTopLevelLis: topLevelLis } = require('../../../core/html-lists');
// Shared wrapping <text> emitter — the same line-breaker the SVG-native legend
// uses, lifted to the diagram side. See svg-label.js.
const { wrapSvgLabel } = require('../_chart-family/svg-label');
const { plainText } = require('../_chart-family/transform-utils');

const GEOM = {
  viewBox: '0 0 320 180',
  viewW: 320, // viewBox width, in user units — the right-hand value column
              // wraps against it, so it must stay in step with `viewBox`.
  top: 16,
  bottom: 172,
  cx: 160, // funnel centre = viewBox centre, so the bands sit on the slide's
           // optical centre; labels (left) and values (right) flank symmetrically
           // (was 188, which pushed the whole composition right-of-centre).
  fullW: 150, // widest band spans cx ± fullW/2  → x 85 … 235
  labelX: 76, // right edge of the left-hand label column (text-anchor end)
  valueX: 244, // left edge of the right-hand value column (text-anchor start)
  gap: 12, // vertical gap between bands, where the conversion % sits
  minW: 14, // floor so a tiny stage still renders a visible band
};

// Nominal label sizes, in viewBox user units, MIRRORING funnel.styles.css.
// CSS owns what is painted (these classes carry literal px there, which inside
// a viewBox ARE user units); the kernel must know the same numbers to break
// lines to the right width. The mirror is gated by funnel.test.js, which reads
// the stylesheet and fails if the two ever drift apart — a silent drift would
// wrap to a width the glyphs don't actually occupy.
const FS = { label: 8.5, value: 9, conv: 6.5 };

// Side-column inset, user units: the label column runs from the viewBox edge to
// `labelX`, so wrapping to the FULL column would let a line touch x=0. A small
// inset keeps air between the text and the slide edge.
const COL_INSET = 4;

// Portrait geometry (deck orientation === 'portrait'): SAME width — so the
// left-label / right-value columns and the band centre line are unchanged — but
// a much taller viewBox so the funnel fills a tall box instead of letterboxing
// into a short landscape band. The bands grow vertically (bandH derives from
// top/bottom), the side labels simply span the taller column. Render-time,
// keyed on the deck-wide stamp — see 2026-06-19-chart-adaptive-sizing.md §7.
const GEOM_TALL = { ...GEOM, viewBox: '0 0 320 420', bottom: 404 };

// Plain TEXT out of a markdown-it fragment — the SHARED helper. The local copy
// this replaces decoded only `&amp;`, so `&lt;`, `&gt;`, `&quot;` and `&#39;`
// survived into `wrapSvgLabel`, which escaped them a second time: a stage named
// `Leads <30 days` painted the literal `Leads &lt;30 days`. It also stripped in
// one pass, where the shared one strips to a fixed point.
const stripTags = (s) => plainText(s);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Parse the stage list into a model. Returns null when there's nothing to
 * draw (so the dispatcher leaves the section untouched and the chart-frame
 * wrap bails — same contract as the other kernels).
 */
function parseFunnel(ulInner) {
  const stages = topLevelLis(ulInner).map((item) => {
    // Split an optional nested detail sublist off the stage BEFORE reading the
    // label/value pill (same order as buildPieChart) — it's the present-mode
    // popover payload, not part of the label.
    const { lead: rawLead, detail } = markDetail.splitDetail(item);
    const lead = rawLead.replace(/<\/?p>/g, '').trim();
    const m = lead.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
    const label = stripTags(m ? m[1] : lead);
    const valueRaw = m ? m[2].trim() : '';
    const numMatch = valueRaw.replace(/,/g, '').match(/-?[\d.]+/);
    const num = numMatch ? parseFloat(numMatch[0]) : 0;
    return { label, valueRaw, num, detail };
  }).filter((s) => s.label || s.valueRaw);
  if (stages.length < 2) return null;
  const maxNum = stages.reduce((m, s) => Math.max(m, s.num), 0) || 1;
  return { stages, maxNum };
}

function buildFunnel(model, orientation) {
  const { stages, maxNum } = model;
  const n = stages.length;
  const g = orientation === 'portrait' ? GEOM_TALL : GEOM;
  const { top, bottom, cx, fullW, labelX, valueX, gap, minW } = g;
  const bandH = (bottom - top - (n - 1) * gap) / n;
  const widthFor = (num) => Math.max(minW, (num / maxNum) * fullW);

  const parts = [];
  for (let i = 0; i < n; i++) {
    const s = stages[i];
    const y0 = top + i * (bandH + gap);
    const y1 = y0 + bandH;
    const yMid = (y0 + y1) / 2;
    const topW = widthFor(s.num);
    const botW = i < n - 1 ? widthFor(stages[i + 1].num) : topW;
    const pts = [
      [cx - topW / 2, y0], [cx + topW / 2, y0],
      [cx + botW / 2, y1], [cx - botW / 2, y1],
    ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

    // data-label / data-value: an invisible, uniform title source the reveal
    // layer reads for the popover (the band itself carries no text). Byte-
    // identical in the rendered PDF (attributes don't paint), like data-mark.
    // `data-anima-role`: native ANIMATION metadata (2026-07-19 §0.75). The role lets Anima
    // choreograph the chart authoritatively — reading a declared role, not GUESSING from the class.
    // The renderer emits SEMANTICS (the role) only; Anima's per-section ingest mints the addressable
    // per-mark `id`s at view time (chart-anima.ts), so we deliberately emit NO id here — a fixed
    // `funnel-band-N` id is not document-unique (two funnels on one deck would collide), and the
    // ingest overwrites it anyway. Like `data-mark`, the role doesn't paint — the PDF stays byte-identical.
    parts.push(`<polygon class="funnel-band" data-mark="${i}" data-anima-role="bar"` +
      ` data-label="${esc(s.label)}"${s.valueRaw ? ` data-value="${esc(s.valueRaw)}"` : ''}` +
      ` style="--i:${i}" points="${pts}"/>`);
    // Stage label flanks the band on the left; its value on the right. Both
    // sit on the canvas (not on the coloured band) so contrast is never at the
    // mercy of the fill ramp or a narrow band.
    //
    // Both WRAP to their column (svg-label.js) instead of running off the
    // viewBox: a long stage name used to be clipped at x=0 with no warning.
    // `vAlign: 'middle'` keeps the block optically centered on the band as it
    // grows lines, matching the `dominant-baseline: central` the CSS sets, so a
    // one-line label lands on exactly the y it always did.
    //
    // maxLines comes from the band PITCH (band + gap), not the band height. A
    // side label's only collision risk is the label of the stage above/below,
    // and consecutive labels are centered a full pitch apart — so the space a
    // label may occupy is the pitch, which is taller than the band itself. (An
    // earlier cut capped on bandH and needlessly ellipsized a 4-line label that
    // had room.) The 0.92 factor keeps visible air between two adjacent blocks
    // rather than letting them touch. The taller portrait viewBox (GEOM_TALL)
    // widens the pitch, so it allows more lines for free.
    const pitch = bandH + gap;
    const maxLines = Math.max(1, Math.floor((pitch * 0.92 - FS.label) / (FS.label * 1.16)) + 1);
    if (s.label) {
      parts.push(wrapSvgLabel(s.label, {
        x: labelX, y: yMid, width: labelX - COL_INSET, fontSize: FS.label,
        anchor: 'end', vAlign: 'middle', maxLines,
        // The CSS paints `dominant-baseline: central`. Declaring it here is what
        // keeps the emitter's optical box bracketing the real glyphs — leaving it
        // out boxes the label as if it sat on an alphabetic baseline, which is
        // exactly the phantom-box class that routed quadrant labels through
        // "STRATEGIC BETS". Harmless while the funnel runs no placement pass; a
        // trap for the one that adds it.
        baseline: 'central',
        className: 'funnel-label', attrs: ' data-anima-role="label"',
        // CSS owns the painted size (funnel.styles.css); the kernel only
        // mirrors it to break lines. Emitting the attribute too would be dead
        // weight — the CSS rule outranks a presentation attribute anyway.
        emitFontSize: false,
      }).svg);
    }
    if (s.valueRaw) {
      parts.push(wrapSvgLabel(s.valueRaw, {
        x: valueX, y: yMid, width: g.viewW - valueX - COL_INSET, fontSize: FS.value,
        anchor: 'start', vAlign: 'middle', maxLines,
        baseline: 'central',
        className: 'funnel-value', attrs: ' data-anima-role="label"',
        emitFontSize: false,
      }).svg);
    }

    // Conversion rate to the next stage, printed in the gap below this band.
    if (i < n - 1) {
      const prev = s.num, next = stages[i + 1].num;
      if (prev > 0) {
        const pct = Math.round((next / prev) * 100);
        // A percentage is short by construction, so this never actually wraps —
        // it goes through the shared emitter anyway so every in-diagram label
        // has ONE emission path (and so a future long-form conversion caption
        // wraps for free instead of re-introducing a bare <text>).
        parts.push(wrapSvgLabel(`${pct}%`, {
          x: cx, y: y1 + gap / 2, width: fullW, fontSize: FS.conv,
          anchor: 'middle', vAlign: 'middle', maxLines: 1,
          className: 'funnel-conv', attrs: ' data-anima-role="label"',
          emitFontSize: false,
        }).svg);
      }
    }
  }

  // NAMED, and NOT aria-hidden. This root used to be `aria-hidden="true"` with no
  // `<title>` — and since every stage label and conversion percentage is drawn as
  // SVG `<text>` INSIDE it, the whole chart was absent from the accessibility tree.
  // The `.funnel-figure` wrapper holds nothing else (just an inert <template>), so a
  // screen reader reached a funnel slide and found an empty box. See the
  // semantic-html ADR §17.5.
  //
  // `<desc>` re-enumerates the stages, mirroring what svg-legend's buildDesc does
  // for the legend-bearing charts: the `<title>` says WHAT it is, the `<desc>` gives
  // the data a sighted reader gets from the labels.
  const descText = stages
    .map((s) => (s.valueRaw ? `${s.label} ${s.valueRaw}` : s.label))
    .filter(Boolean)
    .join(', ');
  const desc = descText ? `<desc>Stages — ${esc(descText)}</desc>` : '';
  const svg = `<svg class="funnel-svg" viewBox="${g.viewBox}" preserveAspectRatio="xMidYMid meet" role="img">` +
    `<title>Funnel chart</title>${desc}${parts.join('')}</svg>`;
  // Optional per-stage detail: an inert <template> payload inside the figure
  // (read by the reveal layer via data-mark) + a speaker-note comment after it
  // (the static-PDF fallback). Both empty when no stage carries a sublist, so a
  // plain funnel stays byte-identical. See mark-detail.js.
  const detailWrap = markDetail.detailPayload(stages);
  const note = markDetail.detailNote(stages);
  return `<div class="funnel-figure" style="--funnel-stages:${n}">${svg}${detailWrap}</div>${note}`;
}

module.exports = { parseFunnel, buildFunnel, GEOM };
