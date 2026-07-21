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

const GEOM = {
  viewBox: '0 0 320 180',
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

// Portrait geometry (deck orientation === 'portrait'): SAME width — so the
// left-label / right-value columns and the band centre line are unchanged — but
// a much taller viewBox so the funnel fills a tall box instead of letterboxing
// into a short landscape band. The bands grow vertically (bandH derives from
// top/bottom), the side labels simply span the taller column. Render-time,
// keyed on the deck-wide stamp — see 2026-06-19-chart-adaptive-sizing.md §7.
const GEOM_TALL = { ...GEOM, viewBox: '0 0 320 420', bottom: 404 };

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

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
    if (s.label) parts.push(`<text class="funnel-label" data-anima-role="label" x="${labelX}" y="${yMid.toFixed(1)}">${esc(s.label)}</text>`);
    if (s.valueRaw) parts.push(`<text class="funnel-value" data-anima-role="label" x="${valueX}" y="${yMid.toFixed(1)}">${esc(s.valueRaw)}</text>`);

    // Conversion rate to the next stage, printed in the gap below this band.
    if (i < n - 1) {
      const prev = s.num, next = stages[i + 1].num;
      if (prev > 0) {
        const pct = Math.round((next / prev) * 100);
        parts.push(`<text class="funnel-conv" data-anima-role="label" x="${cx}" y="${(y1 + gap / 2).toFixed(1)}">${pct}%</text>`);
      }
    }
  }

  const svg = `<svg class="funnel-svg" viewBox="${g.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">${parts.join('')}</svg>`;
  // Optional per-stage detail: an inert <template> payload inside the figure
  // (read by the reveal layer via data-mark) + a speaker-note comment after it
  // (the static-PDF fallback). Both empty when no stage carries a sublist, so a
  // plain funnel stays byte-identical. See mark-detail.js.
  const detailWrap = markDetail.detailPayload(stages);
  const note = markDetail.detailNote(stages);
  return `<div class="funnel-figure" style="--funnel-stages:${n}">${svg}${detailWrap}</div>${note}`;
}

module.exports = { parseFunnel, buildFunnel, GEOM };
