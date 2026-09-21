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
// The family's ONE aria-hidden wrapper (HARD RULE #1) — see its docblock for
// why `role="img"` does not do this by itself.
const { ariaHiddenMarks } = require('../_chart-family/cartesian');

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
  // A lane is no longer ONE row. Its height is derived from how many sub-rows the
  // packer needed: laneHeightOf() = rows*barH + (rows-1)*rowGap + 2*lanePadY, so
  // a single-row lane measures 21 units (12 bar + 2*4.5 pad).
  //
  // THESE ARE CONSTANTS, and that is the design rather than an oversight. An
  // earlier cut made barH a ceiling and compressed the band as the row count
  // grew, so a chart carrying more rows drew them thinner — and, before the svg
  // became width-driven, drew its CAPTIONS smaller too. That is the engine
  // quietly absorbing an authoring problem: the bars shrink, the chart still
  // "fits", and nobody is told the slide is carrying more than it should.
  //
  // The component owns a BUDGET instead. It is NOT a machine-readable `capacity`
  // block — gantt deliberately declares none, because the schema requires
  // `capacity.axis` and an axis enrolls the component in auto-split
  // (`splitFactsFor`, lib/core/split-facts.js), which gantt provably does not do:
  // seven lanes at portrait with `autosplit: on` render one clipped page. So the
  // budget lives in the component's docs (`dataShapeGuidance`, `commonMistakes`)
  // and the ENFORCEMENT is the render, which reports CONTENT CLIPPED and names
  // the first thing it cut. Six comments in this file and its tests used to
  // assert the `capacity` block existed; it never did.
  //
  // The geometry stays put either way: a gantt of any size draws its bars and its
  // captions at exactly one physical size, and a plan too big for its stage
  // overflows and is named, the same as any other component past its budget.
  barH: 12,          // bar height, centered in its sub-row
  rowGap: 4,         // sub-row gap WITHIN a lane (tighter than 2*lanePadY, so a
                     // lane's rows group before they separate)
  lanePadY: 4.5,     // lane band → first/last bar
  barRx: 3,
  // THE KEY'S BLOCK IS LANDSCAPE-ONLY TIGHT, and the asymmetry with
  // GANTT_GEOM_TALL is the point. What the trim buys is HEIGHT, not width: the
  // svg is `width: 100%; flex-shrink: 0`, so it paints the full chart body on
  // every chart (measured in Chromium on all five gallery gantt pages: 1152px
  // exactly, bars 28.8px exactly, on viewBoxes from 123u to 144u). Chrome cannot
  // cost width any more, and with the band fixed it cannot cost bar height
  // either. It costs the one scarce axis left — vbH, which is what pushes a
  // chart past its stage. 14 + 16 + 6 of gap/key/pad is 36 units; 9 + 12 + 4 is
  // 25. The 11 units saved are 26.4px at the gallery's 2.4px/unit, near enough
  // one more bar row (12u = 28.8px) of budget. An earlier version of this
  // comment justified the trim with a width measurement (1059px of 1152, 8%);
  // that was taken before `flex-shrink: 0`, and it is exactly the property that
  // stopped being true.
  //
  // CLEARANCE ABOVE THE KEY is lanePadY + legendGap - legendSwatch/2, and with the
  // band fixed it is a CONSTANT 9 units (4.5 + 9 - 4.5) on every chart — it no
  // longer moves with a ceiling and a floor, because there is no longer a ceiling
  // or a floor. An earlier version of this comment described it sliding between
  // 30u and 8.5u and warned it did not always clear the swatch; both halves went
  // false when the adaptive band was deleted. Portrait keeps the looser block:
  // its stage is tall, so the same units buy nothing back and only open a gap.
  legendGap: 9,      // plot bottom → status key
  legendH: 12,
  legendSwatch: 9,
  padBottom: 4,
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
// `live` IS NOT `done`. They shared 'pass' here and shared --state-pass-ink in
// the stylesheet, so a legend naming three statuses painted two of them the same
// green — pixel-identical, measured across five gallery pages. On the default
// page the finished "Signal taxonomy" and the running "Scoring model" sit edge
// to edge in one row and a reader cannot tell which is which, which is the only
// thing a gantt's colour is for. Running work is `info`; finished work is `pass`.
//
// And a bar with NO status now falls to 'mute' rather than 'info'. It used to
// take the same blue as a declared `pilot`/`decision`, so every gallery page
// showed a blue bar the legend never named. Unstated status should read as
// unstated, not as a fourth category.
const GANTT_STATUS_FILL = {
  'on-track': 'pass', done: 'pass',
  live: 'info', pilot: 'info', decision: 'info',
  'at-risk': 'warn', warn: 'warn',
  blocked: 'fail', fail: 'fail',
  deferred: 'mute',
};
/**
 * Five ramps, eleven status words — so some words must share, and WHICH share is
 * the design. An unstated bar also lands on `mute`, deliberately: it is the
 * family's neutral. `deferred` shares that ramp and is separated from it in CSS
 * by `fill-opacity`, which draws it hollow — don't "simplify" that away, or a
 * declared status and the absence of one paint the same bar, and an unstated bar
 * emits no legend chip that could tell them apart.
 */
function ganttFillKey(status) {
  return GANTT_STATUS_FILL[status] || 'mute';
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
  // As landscape, and constant for the same reason. The band carries the same
  // 0.8 the landscape one took when the `max-height` cap was deleted, and for
  // the same cause: a capped SVG letterboxed to fit, so BOTH bands were sized
  // against a shrink that no longer happens. Portrait was the half that got
  // missed — the canonical two-lane fixture painted 9px past `.cell-stage`,
  // which is `overflow: clip`, so it was cut in silence. A single-row lane
  // measures 45 units (15 name + 16 bar + 2*7 pad).
  rowGap: 5,
  lanePadY: 7,
  laneNameH: 15,     // the name band inside a lane
  barH: 16,
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

  // One clipPath per distinct bar rect, so the leading accent can be clipped to
  // the bar it belongs to (see the accent's comment in the draw pass). Deduped
  // by geometry — a gallery page where several bars share a span emits one clip
  // for the set — and id-prefixed like the gradients, because two charts on one
  // slide would otherwise collide in the document-wide SVG id namespace.
  const clipDefs = [];
  // THE FAMILY KEY IS THE ID STEM, and that identity is the whole guard. The
  // anti-squat probe in lib/core/render-ids.js matches its FAMILIES pattern
  // against the DECK SOURCE, so a key of `gantt-clip` against a stem of
  // `gantt-barclip` would leave the hole open even after the pattern was
  // updated: a deck squatting `gantt-barclip-1-0` contains no `gantt-clip`.
  // Reproduced before this was keyed correctly — a deck carrying
  // `<clipPath id="gantt-barclip-1-0">` took the unprefixed id, and SVG's
  // first-def-wins then clipped the first bar's accent to the AUTHOR's shape.
  // `gantt-barclip` is listed in FAMILIES alongside `gantt-fill`.
  const clipSeq = nextRenderSeq('gantt-barclip');
  const clipIds = new Map();
  const barClip = (x, y, w) => {
    const key = `${x.toFixed(2)}|${y.toFixed(2)}|${w.toFixed(2)}`;
    let id = clipIds.get(key);
    if (!id) {
      id = `${renderIdPrefix()}gantt-barclip-${clipSeq}-${clipIds.size}`;
      clipIds.set(key, id);
      // `fill="none"` because this rect paints NOTHING — a clip is geometry. It
      // is not cosmetic: `rect` is a paintable tag to the scoped-CSS black-fill
      // guard (tools/check-viz-render.js), which walks every one and reads its
      // computed fill, and an omitted fill computes to BLACK. Two of these
      // failed `viz-black-render` as "a themed color resolved to nothing" —
      // exactly the #956 symptom the guard exists to catch, from an element
      // that is never painted. `none` is in its TRANSPARENT set.
      clipDefs.push(`<clipPath id="${id}"><rect fill="none" x="${x.toFixed(2)}" y="${y.toFixed(2)}" ` +
        `width="${w.toFixed(2)}" height="${G.barH}" rx="${G.barRx}"/></clipPath>`);
    }
    return id;
  };

  const lanesTop = axisRuleY + 4;
  let lanesSvg = '<g class="gantt-lanes">';
  let barsSvg = '';

  // ── Pass A — resolve every task's HORIZONTAL extent, before anything is drawn.
  //
  // A lane used to draw all of its tasks at one midY, and that is not a spacing
  // bug — it is an OCCLUSION bug that reads as a spacing bug. Overlapping spans
  // are the whole reason a gantt exists ("the lane-stacked bars make concurrency
  // visible at a glance", gantt.docs.md), and two overlapping bars on one row
  // cannot both be seen: the later one paints over the earlier one and the pair
  // reads as two abutting segments of a relay. Measured on the committed default
  // gallery page, `Signal taxonomy` (Q1..Q2, x 115.5→290.5) and `Scoring model
  // v2` (Q2..Q3, x 204.5→379.5) overlapped by 86 of their 175 units — half of
  // each bar hidden — and the STRESS page, whose own footer says "A full quarter
  // of overlapping tracks", rendered four lanes of tricolor slab with no overlap
  // visible anywhere. The chart was stating the opposite of its data.
  //
  // So extents are resolved first and PACKED into sub-rows (pass B) instead of
  // being drawn as they are parsed. A task's extent is its mark plus whatever
  // caption cannot sit inside that mark — a milestone's name always rides beside
  // its diamond, so a diamond that packs next to a bar has to reserve the label's
  // room too or the two collide on the row packing just bought them.
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const gut = ganttGutter(G);                 // inter-bar gutter, orientation-stable

  const laid = lanes.map((lane) => lane.tasks.map((t) => {
    const valid = t.pts.length && !t.pts.some(p => !p);
    const label = stripTags(t.label).trim();
    const isMilestone = valid && (t.milestone || t.span.pointRaw != null);
    if (!valid) {
      // Unparseable / missing span — a full-width muted placeholder. It claims
      // the whole row so nothing packs beside a bar whose span nobody can read.
      return { t, label, kind: 'unscaled', x0: plotX0, x1: plotX1, left: plotX0, right: plotX1 };
    }
    if (isMilestone) {
      const x = xOfPct(clamp(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0])));
      const r = G.barH * 0.42;
      const wide = measureLabel(label, { width: 1e4, fontSize: G.fsBar, maxLines: 1 })
        .lines[0].length * G.fsBar * GANTT_FIT_ADVANCE;
      // Reserve for the PREFERRED side (right, the reading direction). The draw
      // pass may still flip it left when the row it lands on has more room there.
      return { t, label, kind: 'milestone', x: x, r, x0: x - r, x1: x + r, wide,
        left: x - r, right: x + r + G.fsBar * 0.35 + wide };
    }
    const p0 = clamp(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0]));
    const p1 = clamp(pct(ganttPointSpan(t.pts[1], mode, baseYear)[1]));
    const x0 = xOfPct(p0) + gut;
    const x1 = Math.max(x0 + 2, xOfPct(p1) - gut);
    const est = label.length * G.fsBar * GANTT_FIT_ADVANCE;
    // A BAR RESERVES ITS MARK, NEVER ITS CAPTION. Folding the caption in made a
    // long NAME — a typography fact — buy a sub-row, and a sub-row is this
    // chart's way of saying "these run at the same time", which is a DATA fact.
    // Measured: one lane of three strictly sequential tasks (`Q1..Q1`,
    // `Q2..Q2`, `Q3..Q3`) split onto two rows purely because the middle task was
    // named "Enterprise data modernization wave two", and a reader saw
    // concurrency that is not in the plan — the same misreading sub-rows exist to
    // remove, running backwards. Rename it shorter and all three sat on one row.
    //
    // What a long caption does instead is degrade, which `ganttBarLabel` already
    // handles in three steps: inside the bar, else into genuinely clear space
    // after it, else ellipsized on its own bar with the popover and the speaker
    // note still carrying the full name. Truncation is the honest failure here;
    // an invented row is not.
    //
    // A MILESTONE IS THE EXCEPTION, below: its name always rides BESIDE the
    // diamond — there is no inside to fall back to — so its reserve must carry
    // the label or two milestones would pack onto one row and overprint.
    return { t, label, kind: 'bar', x0, x1, est, left: x0, right: x1 };
  }));

  // ── Pass B — pack each lane's tasks into sub-rows (greedy, first fit) ──
  //
  // First-fit in SOURCE ORDER, which keeps an author's reading order down the
  // lane: task 1 takes row 0, and a later task joins the first row whose last
  // mark clears it by GANTT_ROW_CLEAR. Tasks that do not overlap still share a
  // row, so the common "three sequential phases" lane stays one row tall and does
  // not spend height it does not owe.
  const packed = laid.map((tasks) => {
    const rowRight = [];
    for (const it of tasks) {
      let r = 0;
      while (r < rowRight.length && it.left < rowRight[r] + ganttRowClear(G)) r++;
      it.row = r;
      rowRight[r] = Math.max(rowRight[r] || -Infinity, it.right);
    }
    return { tasks, rows: Math.max(1, rowRight.length) };
  });

  // Lane heights vary with the packing, so every vertical position downstream
  // (lane rules, the today line, the plot bottom, the key) reads this table
  // rather than multiplying by a constant laneH.
  const laneHeightOf = (rows) =>
    (G.portrait ? G.laneNameH : 0) + rows * G.barH + (rows - 1) * G.rowGap + 2 * G.lanePadY;
  const laneTops = [];
  let ly0 = lanesTop;
  for (const p of packed) { laneTops.push(ly0); ly0 += laneHeightOf(p.rows); }
  const plotBottom = ly0;

  // ── Pass C — draw ──
  lanes.forEach((lane, li) => {
    const rowY = laneTops[li];
    const laneH = laneHeightOf(packed[li].rows);
    const rowsTop = rowY + (G.portrait ? G.laneNameH : 0) + G.lanePadY;
    // The y-center of sub-row `r` within this lane.
    const midOf = (r) => rowsTop + r * (G.barH + G.rowGap) + G.barH / 2;
    // The lane NAME sits on its FIRST row, which is what makes it read as the
    // heading for the rows under it. Centering it on the whole band instead left
    // it floating in the gap BETWEEN two rows, pointing at neither — and on a
    // three-row lane it landed on the middle row, where it looked like that
    // task's own label. For a single-row lane the two are the same point by
    // construction (rowY + lanePadY + barH/2 === rowY + laneH/2), so nothing that
    // fits on one row moves.
    const midY = midOf(0);
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
      lanesSvg += `<line class="gantt-lane-rule" x1="0" y1="${(rowY + laneH).toFixed(2)}" ` +
        `x2="${G.vbW}" y2="${(rowY + laneH).toFixed(2)}"/>`;
    }

    // The clear space around a caption is bounded by this task's NEIGHBORS ON
    // ITS OWN SUB-ROW — not by the next task in the lane. Bounding by the lane
    // was what ellipsized a caption with room to spare: `Scoring model v2` runs
    // to x 379.5 but the next task in the lane starts at 293.5, so the caption
    // was squeezed into 86 units and truncated to "Scoring model...". A task on
    // another row is not in its way.
    const byRow = new Map();
    for (const it of packed[li].tasks) {
      if (!byRow.has(it.row)) byRow.set(it.row, []);
      byRow.get(it.row).push(it);
    }

    packed[li].tasks.forEach((it) => {
      const siblings = byRow.get(it.row);
      const si = siblings.indexOf(it);
      const nextX = si + 1 < siblings.length ? siblings[si + 1].left : plotX1;
      // The previous mark's RESERVED right edge, not its bar's right edge — a
      // caption that sits AFTER its bar is part of what a left-flipped milestone
      // label must not print over, and `x1` does not include it. Only the
      // milestone branch reads this, and only in the one case packing cannot
      // pre-clear: the LAST mark on a row, whose reserved label ran past plotX1
      // and so may still flip left.
      const prevX = si > 0 ? siblings[si - 1].right : plotX0;
      const t = it.t;
      const sAttr = t.status ? ` data-s="${escAttr(t.status)}"` : '';
      if (t.status) presentStatuses.add(t.status);
      const mAttr = markAttrs(t);
      const midYr = midOf(it.row);
      const barY = midYr - G.barH / 2;
      const label = it.label;

      if (it.kind === 'unscaled') {
        barsSvg += `<rect class="gantt-bar gantt-bar--unscaled" data-anima-role="bar"${sAttr}${mAttr} ` +
          `x="${plotX0}" y="${barY.toFixed(2)}" width="${plotW}" height="${G.barH}" rx="${G.barRx}" ` +
          `fill="${fillOf('mute')}"/>`;
        barsSvg += ganttBarLabel(label, plotX0, plotX0 + plotW, midYr, nextX, G);
        return;
      }

      const fillKey = ganttFillKey(t.status);

      if (it.kind === 'milestone') {
        const { x } = it;
        // From the RESOLVED band, not pass A's ceiling estimate — a compressed
        // chart would otherwise draw diamonds taller than the bars beside them.
        const r = G.barH * 0.42;
        // A milestone is a zero-duration POINT, not a bar — the role says so, so
        // motion treats it as a point rather than building it like a span.
        barsSvg += `<polygon class="gantt-milestone" data-anima-role="point"${sAttr}${mAttr} ` +
          `points="${x.toFixed(2)},${(midYr - r).toFixed(2)} ${(x + r).toFixed(2)},${midYr.toFixed(2)} ` +
          `${x.toFixed(2)},${(midYr + r).toFixed(2)} ${(x - r).toFixed(2)},${midYr.toFixed(2)}" ` +
          `fill="${fillOf(fillKey)}"/>`;
        // Room on each side of the diamond, bounded by the neighbors ON THIS
        // ROW — not by the frame. Flipping left "to stay in frame" is what
        // printed a milestone's name straight across the bar before it.
        const pad = G.fsBar * 0.35;
        const roomR = nextX - (x + r + pad);
        const roomL = (x - r - pad) - prevX;
        // Prefer the right (the reading direction); go left only when the right
        // cannot hold it and the left genuinely can.
        const toLeft = it.wide > roomR && roomL > roomR;
        barsSvg += wrapSvgLabel(label, {
          x: toLeft ? x - r - pad : x + r + pad, y: midYr,
          width: Math.max(12, toLeft ? roomL : roomR),
          fontSize: G.fsBar, anchor: toLeft ? 'end' : 'start',
          vAlign: 'middle', baseline: 'central', maxLines: 1,
          className: 'gantt-mlabel',
        }).svg;
        return;
      }

      const { x0: bx0, x1: bx1 } = it;
      barsSvg += `<rect class="gantt-bar" data-anima-role="bar"${sAttr}${mAttr} ` +
        `x="${bx0.toFixed(2)}" y="${barY.toFixed(2)}" width="${(bx1 - bx0).toFixed(2)}" ` +
        `height="${G.barH}" rx="${G.barRx}" fill="${fillOf(fillKey)}"/>` +
        // The bar's LEFT ACCENT — the HTML bar's `border-left: var(--chart-fill-accent)
        // solid var(--fill-ink)`, which reinforces the hue at the bar's leading edge and
        // is a deliberate part of the chart-family's fill language (kanban card, progress
        // bar). SVG has no per-side stroke, so it is a narrow rect at the bar's start.
        //
        // IT IS CLIPPED TO THE BAR, and that is what makes it the bar's edge rather
        // than a tab stuck to its side. The accent used to carry its own corner
        // radius (`min(accentW/2, barRx)` = 0.83 against the bar's 3), so across the
        // bar's rounded corner the fill had pulled right by up to 3 units while the
        // accent had pulled right by 0.83 — the accent's corners stood OUTSIDE the
        // bar's silhouette, and the bar's own stroke ran between the two as a seam.
        // At 7x the left edge read as three vertical bands: accent, seam, fill.
        // A clipPath of the bar's own rounded rect removes the mismatch at the
        // source: the accent cannot leave the shape it belongs to, whatever the
        // radius, the orientation or the frame size.
        `<rect class="gantt-bar-accent" aria-hidden="true"${sAttr} ` +
        `clip-path="url(#${barClip(bx0, barY, bx1 - bx0)})" ` +
        `x="${bx0.toFixed(2)}" y="${barY.toFixed(2)}" width="${ganttAccentW(G)}" ` +
        `height="${G.barH}"/>`;
      barsSvg += ganttBarLabel(label, bx0, bx1, midYr, nextX, G);
    });
  });
  lanesSvg += '</g>';


  // ── Optional "today" line — opt-in via the eyebrow only ──
  let todaySvg = '';
  if (todayText) {
    const tp = parseTimePoint(todayText);
    if (tp) {
      const p = pct(ganttPointSpan(tp, mode, baseYear)[0]);
      if (p >= 0 && p <= 100) {
        const x = xOfPct(p);
        const cap = 3;
        // Cap and line BOTH start at capTop, above the plot band — the line runs
        // THROUGH the cap rather than beginning under it, and that is what makes
        // the two read as one marker pointing into the schedule. (They used to
        // start at lanesTop, which dropped the triangle onto the first lane's
        // first bar.) Measured in Chromium on the demo deck: line top and cap top
        // both 1011.7px, axis rule 1015.7, tick labels ending at 1007.3 — the cap
        // straddles the rule with 4.4px of clearance under the ticks.
        const capTop = lanesTop - cap * 1.9;
        todaySvg = `<g class="gantt-today" aria-hidden="true">` +
          `<line x1="${x.toFixed(2)}" y1="${capTop.toFixed(2)}" x2="${x.toFixed(2)}" y2="${plotBottom.toFixed(2)}"/>` +
          `<polygon points="${(x - cap).toFixed(2)},${capTop.toFixed(2)} ${(x + cap).toFixed(2)},${capTop.toFixed(2)} ` +
            `${x.toFixed(2)},${(capTop + cap * 1.4).toFixed(2)}"/></g>`;
      }
    }
  }

  // ── Status key — swatch + label per status present, in canonical order ──
  const keyStatuses = CHART_STATUS.filter(s => presentStatuses.has(s));
  let legendSvg = '';
  let legendBottom = plotBottom;
  if (keyStatuses.length) {
    // Swatch → label gap is the family's (svg-legend.js SWATCH_GAP_R = 5/9 of the
    // font size), not a flat 3 units. 0.6 is the family's conservative average
    // advance (AVG_ADVANCE_R), so a chip's width estimate matches the key rail's.
    const swGap = G.fsLegend * (5 / 9);
    const chips = keyStatuses.map((st) => {
      const text = st;
      const w = G.legendSwatch + swGap + text.length * G.fsLegend * 0.6;
      return { st, text, w };
    });
    const totalW = chips.reduce((a, c) => a + c.w, 0) + (chips.length - 1) * 10;
    let cx = Math.max(4, (G.vbW - totalW) / 2);
    const ly = plotBottom + G.legendGap;
    // No ARIA role here: the marks ride in an `aria-hidden` group (cartesian.js
    // § ariaHiddenMarks), so a list role would be inert. The statuses ride the
    // <desc> above, per task, which is where a reader will actually meet them.
    legendSvg = '<g class="gantt-legend" aria-hidden="true">';
    for (const c of chips) {
      // THE SWATCH CENTERS ON THE LABEL, and `ly` IS that center — the label
      // below is emitted `dominant-baseline="central"` at `ly`, so the glyphs'
      // optical middle is `ly` (measured: the family body face lands its
      // cap-to-baseline center within 1px of it at 200dpi).
      //
      // It used to be `ly - legendSwatch * 0.8`, which put the swatch's center
      // 2.7 units — 30% of the swatch's own height — ABOVE the text it keys. On
      // the committed gallery page that measured as a swatch centered at 1021.5px
      // against a label centered at 1036.5px: the key was the most visibly
      // mis-set object on the slide. The family's vertical key does the same job
      // with `baseFirst - FS*0.34 - SW/2` (svg-legend.js emitRows) — the 0.34
      // there converts an ALPHABETIC baseline to the same optical center this
      // one already has, so the two agree on where a swatch sits.
      legendSvg += `<rect class="gantt-legend-swatch" data-s="${escAttr(c.st)}" ` +
        `x="${cx.toFixed(2)}" y="${(ly - G.legendSwatch / 2).toFixed(2)}" ` +
        `width="${G.legendSwatch}" height="${G.legendSwatch}" rx="${(G.legendSwatch * 0.22).toFixed(2)}" ` +
        `fill="${fillOf(ganttFillKey(c.st))}"/>`;
      legendSvg += wrapSvgLabel(c.text, {
        x: cx + G.legendSwatch + swGap, y: ly, width: 90, fontSize: G.fsLegend,
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
  // screen reader could walk lane by lane; the marks are now wrapped
  // `aria-hidden` (cartesian.js § ariaHiddenMarks), so without this a reader
  // would hear only "Gantt chart, image". Re-enumerate the schedule — the same technique the keyed
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

  // PAINT ORDER: the today rule goes UNDER the bars. It is a reference line, not
  // a mark — drawn last it printed a full-strength info-blue stripe across every
  // bar it crossed, and its cap collided with the first lane's bar. Behind them
  // it still reads (the lane band between bars is open) without defacing the data.
  const body = axisSvg + lanesSvg + todaySvg + barsSvg + legendSvg;

  const svg = `<svg class="gantt-svg" viewBox="0 0 ${G.vbW} ${vbH}" ` +
    `preserveAspectRatio="xMidYMid meet" role="img"><title>Gantt chart</title>${desc}` +
    `<defs>${grad.defs}${clipDefs.join('')}</defs>${ariaHiddenMarks(body)}</svg>`;

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

// Width of a bar's leading accent edge — the SVG stand-in for the HTML bar's
// `border-left: var(--chart-fill-accent)`, which is clamp(4px, 0.31cqi, 7px).
//
// IT CANNOT BE A CONSTANT IN VIEWBOX UNITS, because gantt has two of them: 480
// landscape and 300 portrait. A flat `2` painted 4.8px on one and 7.7px on the
// other, and at 7px the accent was the heaviest edge anywhere in the family —
// seven times the 1px every other mark now draws. It also ate the inter-bar
// gutter: two adjacent bars showed a 6px coloured band between them that was
// not a gap but the NEXT bar's accent, so three tasks in a row read as one slab
// chopped by rules.
//
// Expressed as a fraction of the viewBox it is close to the same physical width
// in both orientations — measured 4.00px landscape, 3.38px portrait, against the
// 4.8 / 7.7 split the flat constant gave.
//
// IT IS NOT THE DOM TOKEN, AND ABOVE HD IT DELIBERATELY EXCEEDS IT. Measured at
// the four sizes the register offers, against `--chart-fill-accent`
// (`clamp(4px, 0.31cqi, 7px)`) resolved on the same slide:
//
//     size       frame        accent   token   hairline
//     hd         1280x720      4.00px    4px      1px
//     portrait   1080x1350     3.38px    4px      1px
//     mobile     1080x2340     3.38px    4px      1px
//     4K         3840x2160    12.00px    7px      2px
//
// A viewBox fraction is linear and a clamp is not, so the two diverge above HD.
// That divergence is the intended one: the accent is part of the MARK — it is
// the bar's own leading edge, the SVG port of the HTML bar's `border-left` — so
// it scales with the SLIDE, as the bar's drawn height does. Note what it does
// NOT track: `GANTT_ACCENT_FRAC` is a fraction of vbW, while `barH` and `barRx`
// are viewBox constants, so shrinking the band moved accent/bar from 11.1% to
// 13.9% and barRx/bar from 20% to 25%. Both still read at 150dpi, but the two
// are independent numbers, not one following the other. The
// token's 7px cap is sized for a DOM card that does NOT grow with the slide. An
// accent pinned at 7px on a 4K gantt would read as a hairline against a bar
// three times its HD height.
//
// What that costs, stated plainly: at 4K the accent is 6x the hairline, and the
// argument that retired the old flat `2` ("seven times the 1px every other mark
// draws") does not hold at that size. The difference is that the old constant
// was seven times heavier on ONE orientation and 4.8x on the other, for no
// reason either; this is a ratio that follows the mark it belongs to.
const GANTT_ACCENT_FRAC = 4 / 1152;
const ganttAccentW = (G) => +(G.vbW * GANTT_ACCENT_FRAC).toFixed(3);

// The gutter each bar insets by, so consecutive tasks read as separate marks.
// Same reasoning: a constant in user units is two different gaps.
// Anchored to the LANDSCAPE value it has always had (1.5 units at vbW 480), so
// landscape geometry is byte-identical and only the portrait frame — where the
// same literal was a 60% wider gap — is normalized. gantt.test.js pins the
// landscape number, and it should: it is real geometry, not a style choice.
// RAISED FROM 1.5 (2026-09-20). At 1.5 the clear space between two marks that
// abut on the axis was 3 units — about 5px on an HD slide, and the two bars'
// own strokes plus a `today` rule crossing between them closed it to nothing.
// Measured on the committed default gallery page, `Pilot onboarding` ends at
// 290.5 and `Org-wide rollout` starts at 293.5, and the raster showed 4px of
// white, the 5px today line, then 3px of white: two independent tasks reading
// as one slab. 2.5 gives a 5-unit gap that survives both strokes.
//
// It costs each bar 2 units of length (1.4% of the 356-unit plot). That is the
// standard trade every schedule chart makes — a bar whose ends are ambiguous
// communicates its duration worse than one shortened by a pixel.
const GANTT_GUTTER_FRAC = 2.5 / 480;
const ganttGutter = (G) => +(G.vbW * GANTT_GUTTER_FRAC).toFixed(3);

// How much clear space the packer requires before two marks may share a sub-row:
// the same gap the gutter already draws between two bars that abut on the axis.
// Anything tighter is an overlap, and an overlap earns its own row.
//
// The epsilon is load-bearing. Two tasks that abut EXACTLY — A ends Q2, B starts
// Q3, the ordinary sequential lane — produce `B.left - A.right === 2*gutter` by
// construction, and without the slack a float ulp in that subtraction would push
// B onto a second row and double the lane's height for no visible reason.
const ganttRowClear = (G) => ganttGutter(G) * 2 - 0.05;

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

// `ganttGutter` is exported for the TESTS, which express their assertions as
// percentages of the axis and so have to undo the inset the gutter adds. They
// used to restate it as a literal `BAR_INSET = 1.5`, which is the one thing the
// helpers' own comment says not to do — and it went stale the first time the
// gutter moved.
module.exports = {
  transformSection, buildGanttChart, GANTT_GEOM, GANTT_GEOM_TALL, ganttGutter,
};
