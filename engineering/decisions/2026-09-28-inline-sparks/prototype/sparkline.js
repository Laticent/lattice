/**
 * PROTOTYPE — inline sparklines ("sparks"). `~{12 14 13 17 21}:bar:c3:lg` in inline code
 * becomes a small SVG chart that sits in a line of text.
 *
 * Shaped like lib/core/inline-pills.js on purpose: parse → resolve (pure fields, no markup)
 * → one builder per render path. This file only has the string builder; the runtime's
 * DOM builder would read the same `resolve()` fields (HARD RULE #22: no markup assigned
 * inside the frame).
 */

const SERIES_TYPES = ['line', 'area', 'bar', 'step', 'winloss'];
const RATIO_TYPES = ['bullet', 'ring'];
const TYPES = [...SERIES_TYPES, ...RATIO_TYPES];
const COLORS = Array.from({ length: 12 }, (_, i) => `c${i + 1}`);
const SIZES = ['sm', 'md', 'lg'];
const MARKERS = ['end', 'minmax'];
// `:zero` pins the baseline at 0 for the shape types; bar is always zero-based.
const SCALES = ['zero'];
const MAX_POINTS = 48;

// A number as an author types it: optional sign (ASCII or U+2212), digits, optional decimals.
const NUM_RE = /^[+\-−]?(\d+(\.\d+)?|\.\d+)$/;
const num = (s) => Number(s.replace('−', '-'));

/** `~{…}` + `:mods`. Null = leave the `<code>` literal. */
function parse(text) {
  if (typeof text !== 'string' || text.length < 4) return null;
  if (text.charCodeAt(0) !== 0x7e /* ~ */ || text.charCodeAt(1) !== 0x7b /* { */) return null;
  const close = text.indexOf('}', 2);
  if (close < 0) return null;
  const body = text.slice(2, close).trim();
  const tail = text.slice(close + 1);
  if (tail && tail[0] !== ':') return null;
  const data = parseData(body);
  if (!data) return null;
  return { data, mods: tail ? tail.slice(1).split(':') : [] };
}

/** Two data shapes: a SERIES (2+ numbers) or a RATIO (`72/80`, `72%`). */
function parseData(body) {
  const tokens = body.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const t = tokens[0];
    const pct = /^(\d+(\.\d+)?)%$/.exec(t);
    if (pct) return { kind: 'ratio', value: num(pct[1]), target: 100, pct: true };
    const parts = t.split('/');
    if (parts.length === 2 && parts.every((p) => NUM_RE.test(p))) {
      const [value, target] = parts.map(num);
      if (target <= 0 || value < 0) return null;
      return { kind: 'ratio', value, target, pct: false };
    }
    return null;
  }
  if (tokens.length < 2 || tokens.length > MAX_POINTS) return null;
  if (!tokens.every((t) => NUM_RE.test(t))) return null;
  return { kind: 'series', values: tokens.map(num) };
}

/** Sort mods into axes. Unknown, repeated or type-incompatible → null (literal). */
function resolveMods(mods, data) {
  const out = { type: null, c: null, size: null, fill: false, zero: false, markers: [] };
  for (const m of mods) {
    if (TYPES.includes(m)) { if (out.type) return null; out.type = m; }
    else if (COLORS.includes(m)) { if (out.c) return null; out.c = m; }
    else if (SIZES.includes(m)) { if (out.size) return null; out.size = m; }
    else if (m === 'fill') { if (out.fill) return null; out.fill = true; }
    else if (SCALES.includes(m)) { if (out.zero) return null; out.zero = true; }
    else if (MARKERS.includes(m)) { if (out.markers.includes(m)) return null; out.markers.push(m); }
    else return null;
  }
  out.type = out.type || (data.kind === 'ratio' ? 'ring' : 'line');
  const wantsSeries = SERIES_TYPES.includes(out.type);
  if (wantsSeries !== (data.kind === 'series')) return null;
  if (out.markers.length && !['line', 'area', 'step'].includes(out.type)) return null;
  if (out.fill && out.type === 'ring') return null;
  if (out.zero && !['line', 'area', 'step'].includes(out.type)) return null;
  out.size = out.size || 'md';
  return out;
}

// ── geometry ──────────────────────────────────────────────────────────────────
// Series types draw into a 100×30 box stretched to the span (preserveAspectRatio none);
// strokes and dots opt out of the stretch with vector-effect, so they stay round and even.
const W = 100, H = 30, PX = 3, PY = 4;
const r2 = (n) => Math.round(n * 100) / 100;

function scaleY(lo, hi) {
  const span = hi - lo || 1;
  return (v) => r2(H - PY - ((v - lo) / span) * (H - 2 * PY));
}
function xs(n) {
  return Array.from({ length: n }, (_, i) => r2(PX + (i * (W - 2 * PX)) / (n - 1)));
}

function seriesMarks(type, values, markers, zero) {
  const marks = [];
  const lo0 = Math.min(...values), hi0 = Math.max(...values);
  // A bar's LENGTH is its value, so bars always start at zero. Line, area and step show
  // the shape of change between the low and the high, unless the author asks for `:zero`.
  const zeroBased = type === 'bar' || zero;
  const lo = zeroBased ? Math.min(0, lo0) : lo0;
  const hi = zeroBased ? Math.max(0, hi0) : hi0;
  const y = scaleY(lo, hi);
  const crosses = lo < 0 && hi > 0;

  if (type === 'bar' || type === 'winloss') {
    const n = values.length;
    const slot = (W - 2 * PX) / n;
    const bw = r2(slot * (n > 24 ? 0.8 : 0.66));
    const mid = H / 2;
    values.forEach((v, i) => {
      const x = r2(PX + i * slot + (slot - bw) / 2);
      if (type === 'winloss') {
        if (v === 0) marks.push({ el: 'rect', x, y: mid - 0.75, w: bw, h: 1.5, role: 'tie' });
        else if (v > 0) marks.push({ el: 'rect', x, y: PY, w: bw, h: r2(mid - PY - 1), role: 'up' });
        else marks.push({ el: 'rect', x, y: mid + 1, w: bw, h: r2(mid - PY - 1), role: 'down' });
      } else {
        const y0 = y(0), yv = y(v);
        marks.push({ el: 'rect', x, y: Math.min(y0, yv), w: bw, h: Math.max(r2(Math.abs(y0 - yv)), 0.8), role: v < 0 ? 'down' : 'up' });
      }
    });
    if (type === 'bar' && crosses) marks.unshift({ el: 'path', d: `M${PX} ${y(0)}H${W - PX}`, role: 'zero' });
    return marks;
  }

  const x = xs(values.length);
  const pts = values.map((v, i) => [x[i], y(v)]);
  let d;
  if (type === 'step') {
    d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += `H${pts[i][0]}V${pts[i][1]}`;
  } else {
    d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
  }
  if (type === 'area') {
    const base = r2(H - PY);
    marks.push({ el: 'path', d: `${d}L${pts[pts.length - 1][0]} ${base}L${pts[0][0]} ${base}Z`, role: 'area' });
  }
  if (crosses) marks.push({ el: 'path', d: `M${PX} ${y(0)}H${W - PX}`, role: 'zero' });
  marks.push({ el: 'path', d, role: 'line' });
  if (markers.includes('minmax')) {
    const iMin = values.indexOf(lo0), iMax = values.indexOf(hi0);
    marks.push({ el: 'dot', x: pts[iMin][0], y: pts[iMin][1], role: 'min' });
    marks.push({ el: 'dot', x: pts[iMax][0], y: pts[iMax][1], role: 'max' });
  }
  if (markers.includes('end')) {
    const p = pts[pts.length - 1];
    marks.push({ el: 'dot', x: p[0], y: p[1], role: 'end' });
  }
  return marks;
}

function ratioMarks(type, { value, target }) {
  if (type === 'ring') {
    const f = Math.max(0, Math.min(1, value / target));
    return [
      { el: 'circle', cx: 12, cy: 12, r: 9, role: 'track' },
      { el: 'circle', cx: 12, cy: 12, r: 9, role: 'arc', len: r2(f * 100) },
    ];
  }
  // bullet: domain 0..max(value, target) with headroom so the tick never sits on the edge
  const top = Math.max(value, target) * 1.08;
  const sx = (v) => r2(PX + (v / top) * (W - 2 * PX));
  return [
    { el: 'rect', x: PX, y: 9, w: W - 2 * PX, h: 12, role: 'track' },
    { el: 'rect', x: PX, y: 11, w: r2(sx(value) - PX), h: 8, role: 'value' },
    { el: 'path', d: `M${sx(target)} 5V25`, role: 'target' },
  ];
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(r2(n)));

function labelFor(type, data) {
  if (data.kind === 'ratio') {
    if (data.pct) return `${fmt(data.value)}%`;
    return type === 'bullet'
      ? `${fmt(data.value)} against a target of ${fmt(data.target)}`
      : `${fmt(data.value)} of ${fmt(data.target)}`;
  }
  const v = data.values;
  if (type === 'winloss') {
    const up = v.filter((n) => n > 0).length, down = v.filter((n) => n < 0).length;
    return `${up} up, ${down} down, of ${v.length}`;
  }
  return `Trend, ${v.length} points, from ${fmt(v[0])} to ${fmt(v[v.length - 1])}, low ${fmt(Math.min(...v))}, high ${fmt(Math.max(...v))}`;
}

/** THE ONE DECISION both paths share: code text → fields, or null. */
function resolve(text) {
  const p = parse(text);
  if (!p) return null;
  const axes = resolveMods(p.mods, p.data);
  if (!axes) return null;
  const marks = p.data.kind === 'series'
    ? seriesMarks(axes.type, p.data.values, axes.markers, axes.zero)
    : ratioMarks(axes.type, p.data);
  const view = axes.type === 'ring' ? [24, 24] : [W, H];
  return { ...axes, view, marks, label: labelFor(axes.type, p.data) };
}

const CIRC = 2 * Math.PI * 9;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

function markHtml(m) {
  const role = `class="s-${m.role}"`;
  if (m.el === 'rect') return `<rect ${role} x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}"/>`;
  if (m.el === 'circle') {
    const arc = m.len != null
      ? ` stroke-dasharray="${r2((m.len / 100) * CIRC)} ${r2(CIRC)}" transform="rotate(-90 12 12)"`
      : '';
    return `<circle ${role} cx="${m.cx}" cy="${m.cy}" r="${m.r}"${arc}/>`;
  }
  return `<path ${role} d="${m.d}"/>`;
}

function sparkHtml(text) {
  const s = resolve(text);
  if (!s) return null;
  const attrs = ['class="lat-spark"', `data-type="${s.type}"`, `data-size="${s.size}"`, 'role="img"', `aria-label="${esc(s.label)}"`];
  if (s.c) attrs.push(`data-c="${s.c}"`);
  if (s.fill) attrs.push('data-fill=""');
  const par = s.type === 'ring' ? '' : ' preserveAspectRatio="none"';
  const drawn = s.marks.filter((m) => m.el !== 'dot').map(markHtml).join('');
  // Dots sit OUTSIDE the stretched svg, placed in percent, so they stay round at any width.
  const dots = s.marks.filter((m) => m.el === 'dot')
    .map((m) => `<i class="s-dot s-${m.role}" style="--x:${r2((m.x / W) * 100)};--y:${r2((m.y / H) * 100)}%"></i>`).join('');
  return `<span ${attrs.join(' ')}><svg viewBox="0 0 ${s.view[0]} ${s.view[1]}"${par} aria-hidden="true">${drawn}</svg>${dots}</span>`;
}

module.exports = { parse, parseData, resolveMods, resolve, sparkHtml, TYPES, SERIES_TYPES, RATIO_TYPES, SIZES, COLORS, MARKERS };
