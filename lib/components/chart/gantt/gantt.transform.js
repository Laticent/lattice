/**
 * gantt — a continuous-time schedule chart. Chart-family member;
 * kernel-as-module.
 *
 * The largest of the family's kernels: it owns the time model (two
 * vocabularies, one scale), the axis ticks, the SVG geometry in both the
 * landscape and portrait viewBoxes, and the bar-label fit. The family
 * dispatches here through the `kernel` block in gantt.manifest.json and
 * supplies only the chart-frame wrap.
 */

const { parseTopLevelLis, extractFirstList } = require('../../../core/html-lists');
const {
  escAttr, plainText, stripTrailingPills, spliceFirstList, CHART_STATUS,
} = require('../_chart-family/transform-utils');
const { nextRenderSeq, renderIdPrefix } = require('../../../core/render-ids');
const {
  wrapSvgLabel, measureLabel, ADVANCE_MONO_TRACKED, ADVANCE_HAND_TRACKED,
} = require('../_chart-family/svg-label');
const markDetail = require('../_chart-family/mark-detail');

// Plain TEXT out of a markdown-it fragment — the shared one. It strips to a
// FIXED POINT (removing a tag can splice a new one out of the surrounding
// text) and decodes entities; a local single-pass copy was both a second
// implementation of a utility that already existed and a CodeQL
// js/incomplete-multi-character-sanitization high.
const stripTags = (s) => plainText(s == null ? '' : s);

// ── Gantt: continuous-time model ─────────────────────────────────────────────
// A time POINT is an ISO date (2026-03-15), a quarter (Q1, or year-qualified
// 2026 Q1), or a month (Jan, 2026 Jan). Every point resolves to a numeric
// position so bars + milestones lay on ONE continuous scale. Two vocabularies:
//   • ordinal (quarters or months, no dates) — unit = month-index; ticks are an
//     equal-width grid in month-space (quarters = 3 units, months = 1; exact).
//   • date (any ISO date present) — unit = epoch-days; ticks land on month /
//     quarter boundaries positioned by percent.
// `..` is the ONE span delimiter — in the eyebrow window AND in task spans.
// `after:` is parsed out and ignored here (validated in lint-core, never drawn).
// 2026-06-21-gantt-component-redesign.md.

const GANTT_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const GANTT_MONTHS_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const GANTT_MONTH_LABEL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ganttDayOf(y, mo, d) { return Math.round(Date.UTC(y, mo, d) / 86400000); }

// Classify + parse one time point. Returns null when unrecognised.
//   { kind: 'date', day }            — ISO date → epoch days
//   { kind: 'q',   year|null, idx }  — quarter (idx 0..3)
//   { kind: 'm',   year|null, idx }  — month   (idx 0..11)
function parseTimePoint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    const y = +d[1], mo = +d[2] - 1, dd = +d[3];
    const t = Date.UTC(y, mo, dd);
    const dt = new Date(t);
    // Date.UTC never returns NaN for overflow (2026-13-01 → 2027), so reject a
    // value that didn't round-trip — a malformed date is null, not a silent roll.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== dd) return null;
    return { kind: 'date', day: Math.round(t / 86400000) };
  }
  const q = s.match(/^(?:(\d{4})\s*)?Q([1-4])$/i);
  if (q) return { kind: 'q', year: q[1] ? +q[1] : null, idx: +q[2] - 1 };
  // Month — an EXACT 3-letter abbrev or full name only, never a prefix, so a
  // label word ("Marketing", "Decision", "September") can't masquerade as one.
  const m = s.match(/^(?:(\d{4})\s*)?([A-Za-z]+)$/);
  if (m) {
    const w = m[2].toLowerCase();
    let mi = w.length === 3 ? GANTT_MONTHS.indexOf(w) : -1;
    if (mi < 0) mi = GANTT_MONTHS_FULL.indexOf(w);
    if (mi >= 0) return { kind: 'm', year: m[1] ? +m[1] : null, idx: mi };
  }
  return null;
}

// Split a span token on `..` → { startRaw, endRaw } (a bar) or { pointRaw } (a
// single point → milestone). Tolerant of optional surrounding whitespace.
function parseSpanToken(tok) {
  const parts = String(tok || '').split('..');
  if (parts.length >= 2) return { startRaw: parts[0].trim(), endRaw: parts.slice(1).join('..').trim() };
  return { pointRaw: String(tok || '').trim() };
}

// Resolve a point to [startVal, endVal] in the chart's unit. A span's START
// token contributes startVal; its END token contributes endVal — so `Q1..Q2`
// covers Q1 AND Q2 (inclusive), and a single date is zero-width.
function ganttPointSpan(pt, mode, baseYear) {
  if (mode === 'date') {
    if (pt.kind === 'date') return [pt.day, pt.day];
    const y = pt.year != null ? pt.year : (baseYear != null ? baseYear : 2000);
    if (pt.kind === 'q') return [ganttDayOf(y, pt.idx * 3, 1), ganttDayOf(y, pt.idx * 3 + 3, 1)];
    return [ganttDayOf(y, pt.idx, 1), ganttDayOf(y, pt.idx + 1, 1)];
  }
  // ordinal — month-index units
  if (pt.kind === 'date') {
    const dt = new Date(pt.day * 86400000);
    const ym = dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    return [ym, ym + 1];
  }
  const y = pt.year != null ? pt.year : (baseYear != null ? baseYear : 0);
  if (pt.kind === 'q') return [y * 12 + pt.idx * 3, y * 12 + pt.idx * 3 + 3];
  return [y * 12 + pt.idx, y * 12 + pt.idx + 1];
}

// Read the eyebrow's inline-code pills → { window, today } (both raw strings).
// The eyebrow paragraph may carry the axis window (the pill containing `..`) and
// an optional `today <point>` pill, in any order.
function parseGanttEyebrow(eyebrowHtml) {
  const codes = [...String(eyebrowHtml || '').matchAll(/<code[^>]*>([^<]*)<\/code>/g)]
    .map(m => m[1].trim());
  let window = '', today = '';
  for (const c of codes) {
    if (/^today\b/i.test(c)) today = c.replace(/^today\s*:?\s*/i, '').trim();
    else if (c.includes('..')) window = c;
  }
  return { window, today };
}

// Build axis ticks → [{ label, mid }] where mid is the period MIDPOINT in the
// chart's unit. Both modes reduce to evenly-or-calendar-spaced period midpoints,
// positioned later by percent over [axisMin, axisMax].
function buildGanttTicks(axisMin, axisMax, mode, hasMonthVocab) {
  const ticks = [];
  if (mode === 'ordinal') {
    const step = hasMonthVocab ? 1 : 3;          // month vs quarter periods
    const start = Math.floor(axisMin / step) * step;
    for (let v = start; v < axisMax; v += step) {
      const monthIdx = ((v % 12) + 12) % 12;
      const label = hasMonthVocab
        ? GANTT_MONTH_LABEL[monthIdx]
        : 'Q' + (Math.floor(monthIdx / 3) + 1);
      ticks.push({ label, mid: v + step / 2 });
    }
    return ticks;
  }
  // date mode — values are epoch-days; step by calendar month/quarter
  const stepMonths = (axisMax - axisMin) > 31 * 16 ? 3 : 1;
  const d0 = new Date(axisMin * 86400000);
  const y = d0.getUTCFullYear();
  const m = stepMonths === 3 ? Math.floor(d0.getUTCMonth() / 3) * 3 : d0.getUTCMonth();
  let cursor = ganttDayOf(y, m, 1);
  let guard = 0;
  while (cursor < axisMax && guard++ < 600) {
    const cd = new Date(cursor * 86400000);
    const cy = cd.getUTCFullYear(), cm = cd.getUTCMonth();
    const next = ganttDayOf(cy, cm + stepMonths, 1);
    const mid = (Math.max(cursor, axisMin) + Math.min(next, axisMax)) / 2;
    const yTag = cm === 0 ? ` '${String(cy).slice(2)}` : '';
    const label = stepMonths === 3
      ? 'Q' + (Math.floor(cm / 3) + 1) + yTag
      : GANTT_MONTH_LABEL[cm] + yTag;
    ticks.push({ label, mid });
    cursor = next;
  }
  return ticks;
}


// ── Gantt geometry, in viewBox user units ──────────────────────────────────
// The gantt used to be percentage-positioned HTML (`--gantt-x` / `--gantt-w` on
// absolutely-placed <div>s). That made it the one chart-family member the
// motion system could not touch: chartToScene reads the first <svg> in the
// section, and a gantt had none, so `motion-on` skipped the whole chart and
// left the poster up. It is SVG-native now — same axis math, same fill recipe,
// same popover marks, but every bar and milestone is an addressable node in one
// scaling viewBox. Lane names and bar captions wrap instead of ellipsizing.
//
// Width is fixed; HEIGHT grows with the lane count, so the unit gets taller (and
// scales down) as lanes are added rather than squeezing the rows.
const GANTT_GEOM = {
  vbW: 480,
  laneW: 104,        // right edge of the lane-name column
  gutter: 10,        // lane column → plot gap
  padRight: 10,
  axisH: 20,         // tick row height, above the axis rule
  laneH: 26,         // one lane row
  barH: 15,          // bar height, centered in the lane row
  barRx: 3,
  legendGap: 14,     // plot bottom → status key
  legendH: 16,
  legendSwatch: 9,
  padBottom: 6,
  fsTick: 8.5,       // mirrors --fs-meta at this viewBox scale
  // The tick label's wrap box. It pairs with fsTick — together they set the
  // one-line character budget, so the two belong in the same object rather than
  // one here and one as a literal at the call site. Retuning either moves the
  // ceiling on the tracked-label advances (svg-label.js), which is why a test
  // derives that ceiling from THESE numbers instead of restating them.
  tickBoxW: 56,
  fsLane: 9,
  fsBar: 8.5,
  fsLegend: 8.5,
};

// status → the semantic --state-* pair the canonical chart fill uses. Identical
// mapping to the CSS that styled the old <div> bars, so a bar keeps its exact
// color and a legend chip can never drift from the bar it stands for.
const GANTT_STATUS_FILL = {
  'on-track': 'pass', done: 'pass', live: 'pass',
  'at-risk': 'warn', warn: 'warn',
  blocked: 'fail', fail: 'fail',
  pilot: 'info', decision: 'info',
  deferred: 'mute',
};
function ganttFillKey(status) {
  return GANTT_STATUS_FILL[status] || 'info';
}

// PORTRAIT geometry — the SVG port of the reflow gantt.styles.css used to do
// with a container query (§10 of 2026-06-19-chart-adaptive-sizing). A baked
// viewBox cannot reflow, so the kernel emits the tall arrangement instead:
// the lane NAME sits above its bars on the full width (no left column stealing
// room), rows are taller, and the unit is narrow-and-tall so it fills a
// portrait box rather than letterboxing into a thin band. Without this, going
// SVG-native would have silently lost the portrait layout.
const GANTT_GEOM_TALL = {
  vbW: 300,
  // No left label column — the lane NAME rides above its bars on the full
  // width, which is what the container query used to achieve. A small left
  // inset keeps the bars and names off the viewBox edge.
  laneW: 8,
  gutter: 0,
  padRight: 8,
  axisH: 20,
  laneH: 52,         // name row + bar row
  laneNameH: 15,     // the name band inside a lane
  barH: 20,
  barRx: 3,
  legendGap: 14,
  legendH: 16,
  legendSwatch: 9,
  padBottom: 6,
  fsTick: 7,
  tickBoxW: 56,      // as landscape — the smaller fsTick buys the budget here
  fsLane: 8.5,
  fsBar: 7.5,
  fsLegend: 7.5,
  portrait: true,
};

// One vertical fill gradient per semantic slot present. SVG `fill` cannot take a
// CSS linear-gradient, so the canonical recipe from chart-family.css is emitted
// as inline stops — same hue/percentage/light-dark pair, so an SVG bar, a kanban
// card and a progress bar still paint identically and stay canvas-aware.
function ganttGradientDefs(keys) {
  const ns = nextRenderSeq('gantt-fill');
  const defs = keys.map((k) =>
    `<linearGradient id="${renderIdPrefix()}gantt-fill-${k}-${ns}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" style="stop-color:light-dark(` +
        `color-mix(in oklab, var(--state-${k}-hue) var(--chart-fill-top-l), var(--bg)),` +
        `color-mix(in oklab, var(--state-${k}-hue) var(--chart-fill-top-d), black))"/>` +
      `<stop offset="100%" style="stop-color:light-dark(` +
        `color-mix(in oklab, var(--state-${k}-hue) var(--chart-fill-bottom-l), var(--bg)),` +
        `color-mix(in oklab, var(--state-${k}-hue) var(--chart-fill-bottom-d), black))"/>` +
    `</linearGradient>`).join('');
  return { defs, id: (k) => `${renderIdPrefix()}gantt-fill-${k}-${ns}` };
}

/**
 * @param {boolean} [hand]  True on a `mode: sketch` slide, where `.gantt-tick`
 *   resolves `--font-label` to the hand sans. The tick's wrap budget and
 *   collision cull are computed from a STATIC per-character advance, so the
 *   builder has to know which face the CSS will paint or the two desync — the
 *   exact defect that held this label back in #1647. Defaults to the mono path,
 *   so a caller that never heard of the finish keeps today's behavior.
 */
function buildGanttChart(ulInner, eyebrowHtml, orientation, hand = false) {
  const { window: windowText, today: todayText } = parseGanttEyebrow(eyebrowHtml);

  // ── Pass 1 — parse lanes → tasks → typed tokens ──
  const lanes = parseTopLevelLis(ulInner).map(lane => {
    const sub = extractFirstList(lane);
    const label = (sub ? lane.slice(0, sub.start) : lane).replace(/<\/?p>/g, '').trim();
    const tasks = [];
    if (sub) {
      for (const item of parseTopLevelLis(sub.inner)) {
        // Peel an optional nested sublist → this task's reveal detail (the popover
        // payload + speaker note), via the shared substrate, BEFORE reading the
        // pills — the same capture order pie/funnel/state-chart use.
        const { lead, detail } = markDetail.splitDetail(item);
        const bc = lead.replace(/<\/?p>/g, '').trim();
        const { leadStripped, pills } = stripTrailingPills(bc);
        let spanTok = '', status = '', milestone = false;
        for (const p of pills) {
          const pl = p.trim();
          if (/^after\s*:/i.test(pl)) continue;                 // dependency — lint only
          if (/^milestone$/i.test(pl)) { milestone = true; continue; }
          if (CHART_STATUS.includes(pl.toLowerCase())) { status = pl.toLowerCase(); continue; }
          if (pl.includes('..') || parseTimePoint(pl)) { spanTok = pl; }
          // any other token is ignored here; lint-core flags it
        }
        const sp = parseSpanToken(spanTok);
        const rawPts = sp.pointRaw != null ? [sp.pointRaw] : [sp.startRaw, sp.endRaw];
        const pts = rawPts.map(parseTimePoint);
        const spanText = sp.pointRaw != null ? sp.pointRaw : [sp.startRaw, sp.endRaw].filter(Boolean).join('–');
        tasks.push({ label: leadStripped.trim(), status, milestone, span: sp, pts, detail, spanText });
      }
    }
    return { label, tasks };
  });

  // ── Determine mode + base year ──
  const allPts = [];
  for (const lane of lanes) for (const t of lane.tasks) for (const p of t.pts) if (p) allPts.push(p);
  const win = windowText ? parseSpanToken(windowText) : null;
  const winPts = win && win.startRaw != null
    ? [parseTimePoint(win.startRaw), parseTimePoint(win.endRaw)].filter(Boolean)
    : [];
  const scopePts = [...allPts, ...winPts];
  const mode = scopePts.some(p => p.kind === 'date') ? 'date' : 'ordinal';
  const hasMonthVocab = scopePts.some(p => p.kind === 'm' || p.kind === 'date');
  const years = scopePts.map(p => p.year).filter(y => y != null);
  const baseYear = years.length ? Math.min(...years) : (mode === 'date' ? 2000 : 0);

  // ── Axis window — eyebrow override, else min start / max end across tasks ──
  let axisMin = Infinity, axisMax = -Infinity;
  if (winPts.length === 2) {
    axisMin = ganttPointSpan(winPts[0], mode, baseYear)[0];
    axisMax = ganttPointSpan(winPts[1], mode, baseYear)[1];
  } else {
    for (const lane of lanes) for (const t of lane.tasks) {
      if (!t.pts.length || t.pts.some(p => !p)) continue;
      const s = ganttPointSpan(t.pts[0], mode, baseYear)[0];
      const e = t.span.pointRaw != null ? s : ganttPointSpan(t.pts[1], mode, baseYear)[1];
      axisMin = Math.min(axisMin, s);
      axisMax = Math.max(axisMax, e);
    }
  }
  if (!Number.isFinite(axisMin) || !Number.isFinite(axisMax)) {
    axisMin = 0; axisMax = 4;                 // nothing parseable — empty ordinal axis
  } else if (axisMax <= axisMin) {
    // A single zero-width point (e.g. one date milestone). Pad a window around
    // it in the chart's own unit so it lands mid-axis instead of off-screen.
    const pad = mode === 'date' ? 30 : 1;
    axisMin -= pad; axisMax += pad;
  }
  const span = axisMax - axisMin;
  const pct = (v) => (((v - axisMin) / span) * 100);

  // ── Geometry: the plot band, and a height that grows with the lane count ──
  const G = orientation === 'portrait' ? GANTT_GEOM_TALL : GANTT_GEOM;
  const plotX0 = G.laneW + G.gutter;
  const plotX1 = G.vbW - G.padRight;
  const plotW = plotX1 - plotX0;
  const xOf = (v) => plotX0 + (pct(v) / 100) * plotW;
  const xOfPct = (p) => plotX0 + (p / 100) * plotW;

  // ── Axis — tick labels at each period midpoint, then the axis rule ──
  // ONE advance for both tick consumers below (the collision cull and the wrap
  // budget), selected from the face `.gantt-tick` will actually paint. Reading it
  // once here is the point: the two used to name the same constant literally, and
  // a face that reached only one of them would cull against one width and wrap to
  // another. Both are calibrated over the closed tick vocabulary — see the
  // derivation comments on the constants in svg-label.js.
  const advTick = hand ? ADVANCE_HAND_TRACKED : ADVANCE_MONO_TRACKED;
  const allTicks = buildGanttTicks(axisMin, axisMax, mode, hasMonthVocab)
    .filter(t => pct(t.mid) >= -0.01 && pct(t.mid) <= 100.01);
  // Drop ticks that would COLLIDE with the one before them. A 12-month axis on
  // a 480-unit viewBox gives each month ~30 units, but a year-stamped label
  // ("Jan '26") paints wider than that in tracked mono — so the labels
  // overprinted ("Jan '26Feb"). Thinning by measured width keeps the axis
  // readable at any span; the first and last ticks always survive so the axis
  // never loses its bounds.
  const ticks = [];
  let lastRight = -Infinity;
  allTicks.forEach((t, i) => {
    const half = stripTags(t.label).length * G.fsTick * advTick / 2;
    const x = xOf(t.mid);
    const isLast = i === allTicks.length - 1;
    if (x - half > lastRight + 2 || i === 0) {
      ticks.push(t);
      lastRight = x + half;
    } else if (isLast) {
      // Keep the final tick by dropping whichever one crowds it.
      ticks.pop();
      ticks.push(t);
      lastRight = x + half;
    }
  });
  const axisRuleY = G.axisH;
  let axisSvg = '<g class="gantt-axis" aria-hidden="true">';
  for (const t of ticks) {
    axisSvg += wrapSvgLabel(stripTags(t.label), {
      x: xOf(t.mid), y: G.axisH - 6, width: G.tickBoxW, fontSize: G.fsTick,
      // .gantt-tick is --font-label with letter-spacing: 0.12em — wider per
      // character than the proportional default assumes, on either face.
      advance: advTick,
      anchor: 'middle', vAlign: 'baseline', maxLines: 1,
      className: 'gantt-tick',
    }).svg;
  }
  axisSvg += `<line class="gantt-axis-rule" x1="0" y1="${axisRuleY}" x2="${G.vbW}" y2="${axisRuleY}"/>`;
  axisSvg += '</g>';

  // ── Lanes + bars / milestones ──
  // Status is encoded by BAR COLOR with no text on the bar, so a cold-open /
  // emailed reader needs a key; collect the statuses used and emit one below.
  const presentStatuses = new Set();
  // Per-mark detail (shared with every other chart): each bar/milestone is a
  // MARK tagged with a chart-wide 0-based data-mark + invisible
  // data-label/data-value (the popover title source). `marks` is built in the
  // SAME order so detailPayload/detailNote key their templates/notes by index.
  let markIdx = 0;
  const marks = [];
  const markAttrs = (t) => {
    const mi = markIdx++;
    const plainLabel = stripTags(t.label).trim();
    // One value for BOTH surfaces (popover data-value + speaker-note valueRaw):
    // the span, or the status when a task has no span (the unscaled case), so the
    // on-screen popover and the PDF note never diverge.
    const value = t.spanText || t.status || '';
    marks.push({ label: plainLabel, valueRaw: value, detail: t.detail || '' });
    return ` data-mark="${mi}" data-label="${escAttr(plainLabel)}"` +
      (value ? ` data-value="${escAttr(value)}"` : '');
  };

  // The gradient ids are minted UP FRONT and interpolated directly at each use.
  // An earlier cut emitted a `__GRAD_key__` placeholder and regex-substituted it
  // across the finished body — but the body contains author text, so a task
  // literally named "Cut __GRAD_pass__ over" had its own caption rewritten to a
  // gradient id. A placeholder that travels through untrusted content is the
  // wrong mechanism regardless of how unlikely the collision is.
  const grad = ganttGradientDefs(['pass', 'warn', 'fail', 'info', 'mute']);
  const fillOf = (key) => `url(#${grad.id(key)})`;
  const lanesTop = axisRuleY + 4;
  let lanesSvg = '<g class="gantt-lanes">';
  let barsSvg = '';
  lanes.forEach((lane, li) => {
    const rowY = lanesTop + li * G.laneH;
    // Landscape centers the bar row in the lane; portrait puts the name band on
    // top and the bars below it.
    const midY = G.portrait
      ? rowY + G.laneNameH + (G.laneH - G.laneNameH) / 2
      : rowY + G.laneH / 2;
    // Lane name — wraps instead of the old CSS ellipsis, so a long swimlane name
    // is readable rather than truncated. Portrait puts it above the bars on the
    // full width (the reflow the container query used to do).
    lanesSvg += G.portrait
      ? wrapSvgLabel(stripTags(lane.label), {
        x: plotX0, y: rowY + G.laneNameH - 4, width: plotX1 - plotX0, fontSize: G.fsLane,
        anchor: 'start', vAlign: 'baseline', maxLines: 1,
        className: 'gantt-lane-label', attrs: ' data-pos="above"',
      }).svg
      : wrapSvgLabel(stripTags(lane.label), {
        x: G.laneW - 6, y: midY, width: G.laneW - 10, fontSize: G.fsLane,
        anchor: 'end', vAlign: 'middle', baseline: 'central', maxLines: 2,
        className: 'gantt-lane-label',
      }).svg;
    if (li < lanes.length - 1) {
      lanesSvg += `<line class="gantt-lane-rule" x1="0" y1="${(rowY + G.laneH).toFixed(2)}" ` +
        `x2="${G.vbW}" y2="${(rowY + G.laneH).toFixed(2)}"/>`;
    }

    // Where each mark in this lane starts, so a caption that has to sit BESIDE
    // its bar knows how much clear room it really has. Without this, a long name
    // spilled right and printed straight through the next bar (and through a
    // milestone's own label).
    const clampPct = (v) => Math.max(0, Math.min(100, v));
    let prevEndX = plotX0;
    const startXs = lane.tasks.map((t) => {
      if (!t.pts.length || t.pts.some(p => !p)) return plotX0;
      return xOfPct(clampPct(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0])));
    });
    lane.tasks.forEach((t, ti) => {
      // The clear space around this task's caption: from the previous mark's
      // right edge to the next mark's start. A caption may borrow either gap but
      // never print into a neighbor.
      const nextX = ti + 1 < startXs.length ? startXs[ti + 1] : plotX1;
      const prevX = ti > 0 ? prevEndX : plotX0;
      const sAttr = t.status ? ` data-s="${escAttr(t.status)}"` : '';
      if (t.status) presentStatuses.add(t.status);
      const mAttr = markAttrs(t);
      const valid = t.pts.length && !t.pts.some(p => !p);
      const label = stripTags(t.label).trim();
      const barY = midY - G.barH / 2;

      if (!valid) {
        // Unparseable / missing span — keep the task visible (full-width, muted)
        // rather than dropping it; lint-core flags the cause.
        barsSvg += `<rect class="gantt-bar gantt-bar--unscaled" data-anima-role="bar"${sAttr}${mAttr} ` +
          `x="${plotX0}" y="${barY.toFixed(2)}" width="${plotW}" height="${G.barH}" rx="${G.barRx}" ` +
          `fill="${fillOf('mute')}"/>`;
        barsSvg += ganttBarLabel(label, plotX0, plotX0 + plotW, midY, nextX, G);
        prevEndX = plotX0 + plotW;
        return;
      }

      const clamp = (v) => Math.max(0, Math.min(100, v));
      const isMilestone = t.milestone || t.span.pointRaw != null;
      const fillKey = ganttFillKey(t.status);

      if (isMilestone) {
        const x = xOfPct(clamp(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0])));
        const r = G.barH * 0.42;
        // A milestone is a zero-duration POINT, not a bar — the role says so, so
        // motion treats it as a point rather than building it like a span.
        barsSvg += `<polygon class="gantt-milestone" data-anima-role="point"${sAttr}${mAttr} ` +
          `points="${x.toFixed(2)},${(midY - r).toFixed(2)} ${(x + r).toFixed(2)},${midY.toFixed(2)} ` +
          `${x.toFixed(2)},${(midY + r).toFixed(2)} ${(x - r).toFixed(2)},${midY.toFixed(2)}" ` +
          `fill="${fillOf(fillKey)}"/>`;
        // Label beside the diamond, flipped to the left near the right edge so it
        // never runs off the frame.
        // Room on each side of the diamond, bounded by the neighboring marks —
        // NOT by the frame. Flipping left "to stay in frame" is what printed a
        // milestone's name straight across the bar before it.
        const roomR = nextX - (x + r + 3);
        const roomL = (x - r - 3) - prevX;
        const w = measureLabel(label, { width: 1e4, fontSize: G.fsBar, maxLines: 1 });
        const wide = w.lines[0].length * G.fsBar * GANTT_FIT_ADVANCE;
        // Prefer the right (the reading direction); go left only when the right
        // cannot hold it and the left genuinely can.
        const toLeft = wide > roomR && roomL > roomR;
        barsSvg += wrapSvgLabel(label, {
          x: toLeft ? x - r - 3 : x + r + 3, y: midY,
          width: Math.max(12, toLeft ? roomL : roomR),
          fontSize: G.fsBar, anchor: toLeft ? 'end' : 'start',
          vAlign: 'middle', baseline: 'central', maxLines: 1,
          className: 'gantt-mlabel',
        }).svg;
        prevEndX = x + r;
        return;
      }

      // Clamp to the visible axis so a task reaching beyond an explicit eyebrow
      // window clips at the frame instead of overflowing the label column / edge.
      const p0 = clamp(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0]));
      const p1 = clamp(pct(ganttPointSpan(t.pts[1], mode, baseYear)[1]));
      const bx0 = xOfPct(p0) + 1.5;               // thin inter-bar gutter
      const bx1 = Math.max(bx0 + 2, xOfPct(p1) - 1.5);
      barsSvg += `<rect class="gantt-bar" data-anima-role="bar"${sAttr}${mAttr} ` +
        `x="${bx0.toFixed(2)}" y="${barY.toFixed(2)}" width="${(bx1 - bx0).toFixed(2)}" ` +
        `height="${G.barH}" rx="${G.barRx}" fill="${fillOf(fillKey)}"/>` +
        // The bar's LEFT ACCENT — the HTML bar's `border-left: var(--chart-fill-accent)
        // solid var(--fill-ink)`, which reinforces the hue at the bar's leading edge and
        // is a deliberate part of the chart-family's fill language (kanban card, progress
        // bar). SVG has no per-side stroke, so it is a narrow rect at the bar's start,
        // rounded to match the bar's own corner so it reads as one shape.
        `<rect class="gantt-bar-accent" aria-hidden="true"${sAttr} ` +
        `x="${bx0.toFixed(2)}" y="${barY.toFixed(2)}" width="${GANTT_ACCENT_W}" ` +
        `height="${G.barH}" rx="${Math.min(GANTT_ACCENT_W / 2, G.barRx)}"/>`;
      barsSvg += ganttBarLabel(label, bx0, bx1, midY, nextX, G);
      prevEndX = bx1;
    });
  });
  lanesSvg += '</g>';

  const plotBottom = lanesTop + lanes.length * G.laneH;

  // ── Optional "today" line — opt-in via the eyebrow only ──
  let todaySvg = '';
  if (todayText) {
    const tp = parseTimePoint(todayText);
    if (tp) {
      const p = pct(ganttPointSpan(tp, mode, baseYear)[0]);
      if (p >= 0 && p <= 100) {
        const x = xOfPct(p);
        const cap = 3;
        todaySvg = `<g class="gantt-today" aria-hidden="true">` +
          `<line x1="${x.toFixed(2)}" y1="${lanesTop}" x2="${x.toFixed(2)}" y2="${plotBottom.toFixed(2)}"/>` +
          `<polygon points="${(x - cap).toFixed(2)},${lanesTop} ${(x + cap).toFixed(2)},${lanesTop} ` +
            `${x.toFixed(2)},${(lanesTop + cap * 1.4).toFixed(2)}"/></g>`;
      }
    }
  }

  // ── Status key — swatch + label per status present, in canonical order ──
  const keyStatuses = CHART_STATUS.filter(s => presentStatuses.has(s));
  let legendSvg = '';
  let legendBottom = plotBottom;
  if (keyStatuses.length) {
    const chips = keyStatuses.map((st) => {
      const text = st;
      const w = G.legendSwatch + 3 + text.length * G.fsLegend * 0.6;
      return { st, text, w };
    });
    const totalW = chips.reduce((a, c) => a + c.w, 0) + (chips.length - 1) * 10;
    let cx = Math.max(4, (G.vbW - totalW) / 2);
    const ly = plotBottom + G.legendGap;
    // No ARIA role here: the svg is role="img", which makes its whole subtree
    // presentational, so a list role would be inert. The statuses ride the
    // <desc> above, per task, which is where a reader will actually meet them.
    legendSvg = '<g class="gantt-legend" aria-hidden="true">';
    for (const c of chips) {
      legendSvg += `<rect class="gantt-legend-swatch" data-s="${escAttr(c.st)}" ` +
        `x="${cx.toFixed(2)}" y="${(ly - G.legendSwatch * 0.8).toFixed(2)}" ` +
        `width="${G.legendSwatch}" height="${G.legendSwatch}" rx="2" ` +
        `fill="${fillOf(ganttFillKey(c.st))}"/>`;
      legendSvg += wrapSvgLabel(c.text, {
        x: cx + G.legendSwatch + 3, y: ly, width: 90, fontSize: G.fsLegend,
        anchor: 'start', vAlign: 'baseline', baseline: 'central', maxLines: 1,
        className: 'gantt-legend-label',
      }).svg;
      cx += c.w + 10;
    }
    legendSvg += '</g>';
    legendBottom = ly + G.legendH;
  }

  const vbH = Math.ceil(legendBottom + G.padBottom);

  // The diagram's accessible DESCRIPTION. The gantt used to be HTML text a
  // screen reader could walk lane by lane; an <svg role="img"> makes its whole
  // subtree presentational, so without this a reader would hear only "Gantt
  // chart, image". Re-enumerate the schedule — the same technique the keyed
  // charts use for their key (svg-legend.js buildDesc).
  const descLanes = lanes.map((lane) => {
    const tasks = lane.tasks.map((t) => {
      const when = t.spanText ? `, ${t.spanText}` : '';
      const st = t.status ? `, ${t.status}` : '';
      return `${stripTags(t.label)}${when}${st}`;
    }).join('; ');
    return tasks ? `${stripTags(lane.label)}: ${tasks}` : stripTags(lane.label);
  }).filter(Boolean).join('. ');
  const desc = descLanes ? `<desc>${escAttr(descLanes)}</desc>` : '';

  const body = axisSvg + lanesSvg + barsSvg + todaySvg + legendSvg;

  const svg = `<svg class="gantt-svg" viewBox="0 0 ${G.vbW} ${vbH}" ` +
    `preserveAspectRatio="xMidYMid meet" role="img"><title>Gantt chart</title>${desc}` +
    `<defs>${grad.defs}</defs>${body}</svg>`;

  // Optional per-task detail → two coexisting surfaces from one authored sublist
  // (mark-detail.js), identical to the SVG charts + state-chart: (1) an inert
  // <template class="chart-detail" data-mark="i"> the parent-hosted reveal layer
  // shows in a popover on hover/tap; (2) the same detail folded into the slide's
  // speaker note. Emitted as SIBLINGS of the svg so the inert <template>s
  // (which carry data-mark) aren't miscounted as marks by the reveal layer.
  return `<div class="gantt-chart">${svg}</div>` +
    markDetail.detailPayload(marks) + markDetail.detailNote(marks);
}

// A bar's caption. It goes INSIDE the bar when it fits, and beside it when it
// does not — the old HTML bar clipped the text with `overflow:hidden`, so a task
// on a short bar simply lost its name. Nothing is ever clipped now: the caption
// moves to whichever side has room, and only falls back to inside-and-wrapped
// when neither side does.
// The advance used to decide WHERE a caption goes. Deliberately less
// conservative than the 0.6 the line-breaker wraps with, because the two
// decisions have opposite failure costs: wrapping early is invisible, but
// judging "it doesn't fit" too eagerly ellipsizes a caption that had room. In
// SVG the bar is not a clipping box (the old HTML bar had overflow:hidden), so
// a caption that overhangs its bar by a unit or two is harmless — which makes
// the generous estimate the safe one here.
const GANTT_FIT_ADVANCE = 0.5;

// Width of a bar's leading accent edge, in viewBox units — the SVG stand-in for
// the HTML bar's `border-left: var(--chart-fill-accent)`.
const GANTT_ACCENT_W = 2;

function ganttBarLabel(label, bx0, bx1, midY, limitX, G) {
  if (!label) return '';
  // The caption's room INSIDE the bar stops at the next mark in this lane, not
  // at the bar's own end. A milestone drawn WITHIN a long bar's span sits in the
  // middle of that room, and bounding only by the bar printed the caption
  // straight through the diamond and its label (`Enterprise data ⟡atGArm
  // modernization`). `limitX` is exactly the "where the next mark begins" the
  // caller already computes for the beside-branch; the inside branch simply
  // never consulted it.
  const inner = Math.max(0, Math.min(bx1, limitX) - bx0 - 6);
  const est = label.length * G.fsBar * GANTT_FIT_ADVANCE;
  // Inside the bar whenever it fits — that is where a Gantt caption belongs.
  if (est <= inner) {
    return wrapSvgLabel(label, {
      x: bx0 + 4, y: midY, width: inner, fontSize: G.fsBar,
      anchor: 'start', vAlign: 'middle', baseline: 'central', maxLines: 1,
      className: 'gantt-bar-label', attrs: ' data-pos="inside"',
    }).svg;
  }
  // Otherwise beside it, but ONLY into genuinely clear space: `limitX` is where
  // the next mark in this lane begins, so a caption can borrow the gap without
  // printing through its neighbor.
  const roomRight = limitX - bx1 - 6;
  if (roomRight >= est) {
    return wrapSvgLabel(label, {
      x: bx1 + 4, y: midY, width: roomRight, fontSize: G.fsBar,
      anchor: 'start', vAlign: 'middle', baseline: 'central', maxLines: 1,
      className: 'gantt-bar-label', attrs: ' data-pos="after"',
    }).svg;
  }
  // Neither fits. Keep it on its own bar and let it ellipsize: a visibly
  // truncated name that is unambiguously attached to its bar beats a full name
  // printed across a neighboring task. The popover and the speaker note both
  // still carry the complete label.
  return wrapSvgLabel(label, {
    x: bx0 + 4, y: midY, width: Math.max(inner, 18), fontSize: G.fsBar,
    anchor: 'start', vAlign: 'middle', baseline: 'central', maxLines: 1,
    className: 'gantt-bar-label', attrs: ' data-pos="inside"',
  }).svg;
}

function transformSection(html, ctx) {
  // The eyebrow paragraph may carry TWO pills — the axis window and a `today`
  // marker — so capture a whole paragraph that is only inline-code pills and
  // let the builder read both (window has `..`, today starts with `today`).
  const eyeMatch = html.match(/<p[^>]*>((?:\s*<code[^>]*>[^<]*<\/code>)+)\s*<\/p>/);
  // `sketch` re-points --font-label at the hand sans, and the tick's layout math
  // is a static per-character advance, so the builder needs the class token too —
  // the same way journey and word-cloud read ctx.cls. Keyed on the token
  // rather than the deck's `mode:` because that is what the CSS keys on, so a
  // per-slide `_class: boardroom` opt-out lands on both sides at once.
  const hand = ctx.classTokens.includes('sketch');
  return spliceFirstList(html, (ext) => buildGanttChart(ext.inner, eyeMatch ? eyeMatch[1] : '', ctx.orientation, hand));
}

module.exports = { transformSection, buildGanttChart, GANTT_GEOM, GANTT_GEOM_TALL };
