/**
 * INLINE SPARKS — `~{12 14 13 17 21}:bar:c3:lg` in inline code becomes a word-sized chart.
 *
 *   `~{12 14 13 17 21}`          a line (a SERIES defaults to line), size md, text color
 *   `~{72%}` `~{18/24}`          a ring (a RATIO defaults to ring)
 *   `~{72/80}:bullet`            a bar against a target tick
 *   `~{3 5 -2 4}:bar:c3:lg`      bars, categorical slot 3, large
 *   `~{…}:end:minmax:zero:fill`  markers, a zero baseline, the line's full width
 *   `~{…}:bare` `:outline` `:rounded`  this spark's frame, surface and corners, over the
 *                                slide's `spark-*` class and the deck's `spark:` register
 *                                (lib/core/resolve-spark.js); the default is framed, solid, square
 *
 * The spec — the seven types, the three sizes, why the opener is `~{`, why a line runs low
 * to high unless the author writes `:zero`, and where a spark belongs — is
 * `engineering/decisions/2026-09-28-inline-sparks.md`. This file is its kernel.
 *
 * SHAPED LIKE `inline-pills.js`, ON PURPOSE (HARD RULE #1). Pure: no DOM, no markdown-it, no
 * fs. `resolve()` is the one decision both render paths share, and it returns FIELDS, never
 * markup. The markdown-it path builds a string from them (`sparkHtml`); the runtime mirror
 * builds real nodes (`sparkElement`), because assigning markup inside an already-sanitized
 * preview frame is the post-sanitize injection HARD RULE #22 bars.
 *
 * A SPAN THAT DOESN'T PARSE STAYS LITERAL, and nothing is guessed — the pill rule, for the
 * pill's reason. A plausible wrong chart survives review; a literal `~{3 5 4}:c13` on a slide
 * doesn't. `diagnose()` names what was wrong, so `lint:deck` can say it.
 */

const SERIES_TYPES = Object.freeze(['line', 'area', 'bar', 'step', 'winloss']);
const RATIO_TYPES = Object.freeze(['ring', 'bullet']);
const TYPES = Object.freeze([...SERIES_TYPES, ...RATIO_TYPES]);
const COLORS = Object.freeze(Array.from({ length: 12 }, (_, i) => `c${i + 1}`));
const SIZES = Object.freeze(['sm', 'md', 'lg']);
const MARKERS = Object.freeze(['end', 'minmax']);
/** Types that draw a line through the points — the only ones markers and `:zero` apply to. */
const LINE_TYPES = Object.freeze(['line', 'area', 'step']);
/** The frame, surface and corner words — the same words the `spark:` register uses. */
const { SPARK_FRAME_NAMES, SPARK_SURFACE_NAMES, SPARK_CORNER_NAMES } = require('./resolve-spark.js');
const STYLE_AXES = Object.freeze([['frame', SPARK_FRAME_NAMES], ['surface', SPARK_SURFACE_NAMES], ['corners', SPARK_CORNER_NAMES]]);
/** Every modifier word, for telling a spark attempt from someone else's `~{` (see `split`). */
const ALL_MODS = new Set([...TYPES, ...COLORS, ...SIZES, ...MARKERS, 'fill', 'zero',
  ...SPARK_FRAME_NAMES, ...SPARK_SURFACE_NAMES, ...SPARK_CORNER_NAMES]);
/** Past this, bars merge at `md` and the data wants a chart, not a spark (spec §10 f). */
const MAX_POINTS = 48;

// A number as an author types it: an optional sign (ASCII or U+2212 minus), digits, optional
// decimals. No units, no thousands separators — the reader's number is in the text beside
// the spark, and a whitespace split needs no locale rules.
const NUM_RE = /^[+\-−]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const toNumber = (s) => Number(s.replace('−', '-'));

/**
 * Split one code_inline token's text into its data and modifiers.
 * @returns {{data: object, mods: string[]} | {error: string} | null}
 *   null = not a spark at all (the O(1) reject); `{error}` = opened like one but broken.
 */
function split(text) {
  if (typeof text !== 'string' || text.length < 3) return null;
  if (text.charCodeAt(0) !== 0x7e /* ~ */ || text.charCodeAt(1) !== 0x7b /* { */) return null;
  const close = text.indexOf('}', 2);
  // A SPARK ATTEMPT HAS A DIGIT IN ITS DATA, OR A SPARK MODIFIER AFTER IT. Without either it
  // is someone else's `~{`: LaTeX's `\~{}` (a typeset tilde) and `\~{n}` (an ñ) are the common
  // ones, and neither is a broken spark, so neither gets a lint warning or loses its escape
  // backslash. `~{abc}:bar` names a spark type, so it IS an attempt and gets told why not.
  if (!/\d/.test(close < 0 ? text : text.slice(2, close))) {
    const first = close < 0 ? '' : text.slice(close + 1).split(':')[1];
    if (!first || !ALL_MODS.has(first)) return null;
  }
  if (close < 0) return { error: 'the data has no closing `}`' };
  const tail = text.slice(close + 1);
  if (tail && tail[0] !== ':') return { error: 'modifiers follow the `}` with a `:`' };
  const data = parseData(text.slice(2, close).trim());
  if (data.error) return data;
  return { data, mods: tail ? tail.slice(1).split(':') : [] };
}

/** A SERIES (2–48 numbers) or a RATIO (`72/80`, `72%`). */
function parseData(body) {
  const tokens = body.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: 'there is no data between the braces' };
  if (tokens.length === 1) {
    const t = tokens[0];
    const pct = /^([+\-\u2212]?)(\d+(?:\.\d+)?)%$/.exec(t);
    if (pct) {
      const value = Number(pct[2]);
      if (!Number.isFinite(value)) return { error: 'that number is too large to draw' };
      if (pct[1] && pct[1] !== '+') return { error: 'a percentage runs from 0 up' };
      return { kind: 'ratio', value, target: 100, pct: true };
    }
    const parts = t.split('/');
    if (parts.length === 2 && parts.every((p) => NUM_RE.test(p))) {
      const [value, target] = parts.map(toNumber);
      if (!Number.isFinite(value) || !Number.isFinite(target)) return { error: 'that number is too large to draw' };
      if (!(target > 0) || value < 0) return { error: 'a ratio needs a value of 0 or more over a total above 0' };
      return { kind: 'ratio', value, target, pct: false };
    }
    if (NUM_RE.test(t)) return { error: 'one number is not a trend — write a series of two or more, or a ratio like `72/80` or `72%`' };
    return { error: `\`${t}\` is not a number — no units, commas or currency signs` };
  }
  if (tokens.length > MAX_POINTS) return { error: `a spark holds at most ${MAX_POINTS} points — this has ${tokens.length}` };
  const bad = tokens.find((t) => !NUM_RE.test(t));
  if (bad) return { error: `\`${bad}\` is not a number — no units, commas or currency signs` };
  const values = tokens.map(toNumber);
  // Each value finite is not enough: the RANGE can overflow (1e308 and -1e308).
  if (!values.every(Number.isFinite) || !Number.isFinite(Math.max(...values) - Math.min(...values))) {
    return { error: 'a number is too large to draw' };
  }
  return { kind: 'series', values };
}

/** Sort modifiers into their axes, so order is free. Any unknown, repeated or misapplied one fails. */
function resolveMods(mods, data) {
  const out = { type: null, c: null, size: null, fill: false, zero: false, frame: null, surface: null, corners: null, markers: [] };
  const once = (axis, m) => `\`:${m}\` repeats the ${axis}`;
  for (const m of mods) {
    if (TYPES.includes(m)) { if (out.type) return { error: once('type', m) }; out.type = m; }
    else if (COLORS.includes(m)) { if (out.c) return { error: once('color', m) }; out.c = m; }
    else if (SIZES.includes(m)) { if (out.size) return { error: once('size', m) }; out.size = m; }
    else if (m === 'fill') { if (out.fill) return { error: once('width', m) }; out.fill = true; }
    else if (m === 'zero') { if (out.zero) return { error: once('scale', m) }; out.zero = true; }
    else if (STYLE_AXES.some(([, names]) => names.includes(m))) {
      const [axis] = STYLE_AXES.find(([, names]) => names.includes(m));
      if (out[axis]) return { error: once(axis, m) };
      out[axis] = m;
    }
    else if (MARKERS.includes(m)) { if (out.markers.includes(m)) return { error: once('marker', m) }; out.markers.push(m); }
    else if (m === '') return { error: 'there is an empty modifier — a `::` or a trailing `:`' };
    else return { error: `\`:${m}\` is not a spark modifier` };
  }
  const series = data.kind === 'series';
  out.type = out.type || (series ? 'line' : 'ring');
  if (SERIES_TYPES.includes(out.type) !== series) {
    return { error: series
      ? `a ${out.type} takes one value, like \`72/80\` or \`72%\`, not a series`
      : `a ${out.type} needs a series of two or more numbers, not one value` };
  }
  if (!LINE_TYPES.includes(out.type)) {
    const lineOnly = out.markers[0] || (out.zero ? 'zero' : null);
    if (lineOnly) return { error: `\`:${lineOnly}\` only goes on line, area and step, not ${out.type}` };
  }
  if (out.fill && out.type === 'ring') return { error: '`:fill` stretches a spark sideways, which a ring cannot do' };
  out.size = out.size || 'md';
  return out;
}

// ── Geometry ─────────────────────────────────────────────────────────────────────────────
// Everything but the ring draws into a 100×30 box stretched to the span
// (preserveAspectRatio none); the CSS keeps strokes even under the stretch. Dots are NOT
// drawn here: a circle in a stretched box is an ellipse, so a dot is returned in PERCENT of
// the box and each builder places it as a round HTML element over the drawing.
const W = 100;
const H = 30;
const PX = 3;
const PY = 4;
const R = 9; // ring radius in its 24×24 box
const CIRC = 2 * Math.PI * R;
const r2 = (n) => Math.round(n * 100) / 100;

function seriesMarks(type, values, { markers, zero }) {
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  // A bar's LENGTH is its value, so bars always start at zero. The line types show the
  // shape of change from low to high, unless the author asks for `:zero` (spec §6).
  const zeroBased = type === 'bar' || zero;
  const lo = zeroBased ? Math.min(0, lo0) : lo0;
  const hi = zeroBased ? Math.max(0, hi0) : hi0;
  const span = hi - lo;
  // A flat series draws on the middle line rather than dividing by zero.
  const y = (v) => (span ? r2(H - PY - ((v - lo) / span) * (H - 2 * PY)) : H / 2);
  const zeroLine = lo < 0 && hi > 0 ? [{ el: 'path', d: `M${PX} ${y(0)}H${W - PX}`, role: 'zero' }] : [];

  if (type === 'bar' || type === 'winloss') {
    const slot = (W - 2 * PX) / values.length;
    const bw = r2(slot * (values.length > 24 ? 0.8 : 0.66));
    const mid = H / 2;
    const bars = values.map((v, i) => {
      const x = r2(PX + i * slot + (slot - bw) / 2);
      if (type === 'winloss') {
        if (v === 0) return { el: 'rect', x, y: mid - 0.75, w: bw, h: 1.5, role: 'tie' };
        const h = r2(mid - PY - 1);
        return v > 0 ? { el: 'rect', x, y: PY, w: bw, h, role: 'up' } : { el: 'rect', x, y: mid + 1, w: bw, h, role: 'down' };
      }
      const y0 = y(0);
      const yv = y(v);
      // A zero-height bar still shows as a sliver, so a zero month reads as zero, not missing.
      return { el: 'rect', x, y: Math.min(y0, yv), w: bw, h: Math.max(r2(Math.abs(y0 - yv)), 0.8), role: 'up' };
    });
    return type === 'bar' ? [...zeroLine, ...bars] : bars;
  }

  const pts = values.map((v, i) => [r2(PX + (i * (W - 2 * PX)) / (values.length - 1)), y(v)]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    d += type === 'step' ? `H${pts[i][0]}V${pts[i][1]}` : `L${pts[i][0]} ${pts[i][1]}`;
  }
  const marks = [];
  if (type === 'area') {
    const floor = r2(H - PY);
    marks.push({ el: 'path', d: `${d}L${pts[pts.length - 1][0]} ${floor}L${pts[0][0]} ${floor}Z`, role: 'area' });
  }
  marks.push(...zeroLine, { el: 'path', d, role: 'line' });
  const dot = (i, role) => ({ el: 'dot', x: r2((pts[i][0] / W) * 100), y: r2((pts[i][1] / H) * 100), role });
  if (markers.includes('minmax')) marks.push(dot(values.indexOf(lo0), 'min'), dot(values.indexOf(hi0), 'max'));
  if (markers.includes('end')) marks.push(dot(pts.length - 1, 'end'));
  return marks;
}

function ratioMarks(type, { value, target }) {
  if (type === 'ring') {
    const f = Math.max(0, Math.min(1, value / target));
    return [
      { el: 'circle', r: R, role: 'track' },
      // The arc's dash is set from the real circumference: print ignores `pathLength`.
      { el: 'circle', r: R, role: 'arc', dash: `${r2(f * CIRC)} ${r2(CIRC)}` },
    ];
  }
  // 8% of headroom past the larger of value and target, so the tick never sits on the edge.
  const top = Math.max(value, target) * 1.08;
  const sx = (v) => r2(PX + (v / top) * (W - 2 * PX));
  return [
    { el: 'rect', x: PX, y: 9, w: W - 2 * PX, h: 12, role: 'track' },
    { el: 'rect', x: PX, y: 11, w: r2(sx(value) - PX), h: 8, role: 'value' },
    { el: 'path', d: `M${sx(target)} 5V25`, role: 'target' },
  ];
}

// Two decimals for ordinary values, but a small value keeps its significant digits, so a
// rate series (0.001 → 0.004) isn't read out as "from 0 to 0".
// Plain digits always — never `1e-7`, which a screen reader says as "1 e minus 7".
const SMALL = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2, useGrouping: false });
const fmt = (n) => (Math.abs(n) < 1 && n !== 0 ? SMALL.format(n) : String(r2(n)));

/** What a screen reader hears — the numbers, never the drawing. */
function labelFor(type, data) {
  if (data.kind === 'ratio') {
    if (data.pct) return `${fmt(data.value)}%`;
    return type === 'bullet'
      ? `${fmt(data.value)} against a target of ${fmt(data.target)}`
      : `${fmt(data.value)} of ${fmt(data.target)}`;
  }
  const v = data.values;
  if (type === 'winloss') {
    const up = v.filter((n) => n > 0).length;
    const down = v.filter((n) => n < 0).length;
    return `${up} up, ${down} down, of ${v.length}`;
  }
  return `Trend, ${v.length} points, from ${fmt(v[0])} to ${fmt(v[v.length - 1])}, ` +
    `low ${fmt(Math.min(...v))}, high ${fmt(Math.max(...v))}`;
}

/** Split and sort, keeping the reason on failure. */
function interpret(text) {
  const parsed = split(text);
  if (!parsed || parsed.error) return parsed;
  const axes = resolveMods(parsed.mods, parsed.data);
  if (axes.error) return axes;
  return { data: parsed.data, axes };
}

/**
 * THE ONE DECISION both render paths share: code text → the spark's parts, or null.
 * @returns {{type:string, size:string, c:string|null, fill:boolean, zero:boolean,
 *   markers:string[], view:number[], marks:object[], label:string}|null}
 */
function resolve(text) {
  const r = interpret(text);
  if (!r || r.error) return null;
  const { data, axes } = r;
  const marks = data.kind === 'series' ? seriesMarks(axes.type, data.values, axes) : ratioMarks(axes.type, data);
  return { ...axes, view: axes.type === 'ring' ? [24, 24] : [W, H], marks, label: labelFor(axes.type, data) };
}

/**
 * Why a span that OPENS like a spark doesn't render as one — for `lint:deck`.
 * A spark ATTEMPT opens with `~{` and has a digit in its data (see `split`).
 * @returns {string|null} null when the text is not a spark attempt, or when it renders.
 */
function diagnose(text) {
  const r = interpret(text);
  return r?.error ?? null;
}

// ── Builders ─────────────────────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The span's attributes, as ordered pairs both builders apply. */
function hostAttrs(s) {
  const a = [['class', 'lat-spark'], ['data-type', s.type], ['data-size', s.size], ['role', 'img'], ['aria-label', s.label]];
  if (s.c) a.push(['data-c', s.c]);
  if (s.fill) a.push(['data-fill', '']);
  // Only what the author wrote on THIS spark; the slide class and the deck register fill in
  // the rest in CSS, so the most specific word wins without the kernel knowing the slide.
  if (s.frame) a.push(['data-frame', s.frame]);
  if (s.surface) a.push(['data-surface', s.surface]);
  if (s.corners) a.push(['data-corners', s.corners]);
  return a;
}

/** One drawn mark as [tag, attribute pairs]. Dots are not drawn marks. */
function markAttrs(m) {
  const cls = ['class', `s-${m.role}`];
  if (m.el === 'rect') return ['rect', [cls, ['x', m.x], ['y', m.y], ['width', m.w], ['height', m.h]]];
  if (m.el === 'circle') {
    const a = [cls, ['cx', 12], ['cy', 12], ['r', m.r]];
    if (m.dash) a.push(['stroke-dasharray', m.dash], ['transform', 'rotate(-90 12 12)']);
    return ['circle', a];
  }
  return ['path', [cls, ['d', m.d]]];
}

function svgAttrs(s) {
  const a = [['viewBox', `0 0 ${s.view[0]} ${s.view[1]}`], ['aria-hidden', 'true']];
  if (s.type !== 'ring') a.push(['preserveAspectRatio', 'none']);
  return a;
}

/** A dot's attributes. `--x`/`--y` are kernel numbers, never author text. */
function dotAttrs(m) {
  return [['class', `lat-spark-dot s-${m.role}`], ['style', `--x:${m.x};--y:${m.y}`]];
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ESCAPES[ch]);
const attrString = (pairs) => pairs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

/** Render to an HTML string — the markdown-it path, which emits `html_inline`. */
function sparkHtml(text) {
  const s = resolve(text);
  if (!s) return null;
  const drawn = s.marks.filter((m) => m.el !== 'dot').map((m) => {
    const [tag, a] = markAttrs(m);
    return `<${tag}${attrString(a)}/>`;
  }).join('');
  const dots = s.marks.filter((m) => m.el === 'dot')
    .map((m) => `<span${attrString(dotAttrs(m))}></span>`).join('');
  return `<span${attrString(hostAttrs(s))}><svg${attrString(svgAttrs(s))}>${drawn}</svg>${dots}</span>`;
}

/**
 * Build the spark as real nodes — the runtime's DOM path. Attributes only, never markup,
 * so nothing here needs a sanction or a sanitizer.
 * @param {Document} doc
 */
function sparkElement(doc, text) {
  const s = resolve(text);
  if (!s) return null;
  const set = (el, pairs) => { for (const [k, v] of pairs) el.setAttribute(k, String(v)); return el; };
  const host = set(doc.createElement('span'), hostAttrs(s));
  const svg = set(doc.createElementNS(SVG_NS, 'svg'), svgAttrs(s));
  for (const m of s.marks) {
    if (m.el === 'dot') continue;
    const [tag, a] = markAttrs(m);
    svg.appendChild(set(doc.createElementNS(SVG_NS, tag), a));
  }
  host.appendChild(svg);
  for (const m of s.marks) {
    if (m.el !== 'dot') continue;
    host.appendChild(set(doc.createElement('span'), dotAttrs(m)));
  }
  return host;
}

module.exports = {
  resolve, diagnose, sparkHtml, sparkElement,
  TYPES, SERIES_TYPES, RATIO_TYPES, COLORS, SIZES, MARKERS, MAX_POINTS,
};
