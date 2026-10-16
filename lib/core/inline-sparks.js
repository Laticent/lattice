/**
 * INLINE SPARKS — `~{12 14 13 17 21, bar, c3, lg}` in inline code becomes a word-sized chart.
 *
 *   `~{12 14 13 17 21}`          a line (a SERIES defaults to line), size md, color c1
 *   `~{72%}` `~{18/24}`          a ring (a RATIO defaults to ring)
 *   `~{72/80, bullet}`           a bar against a target tick
 *   `~{3 5 -2 4, bar, c3, lg}`   bars, categorical slot 3, large
 *   `~{…, end, minmax, zero, fill}`  markers, a zero baseline, the line's full width
 *   `~{…, bare}` `etching` `rounded`  this spark's frame, look and corners, over the
 *                                slide's `spark-*` class and the deck's `spark:` register
 *                                (lib/core/resolve-spark.js); the default is framed, pigment, square
 *
 * The spec — the seven types, the three sizes, why the opener is `~{`, why a line runs low
 * to high unless the author writes `zero`, and where a spark belongs — is
 * `engineering/decisions/2026-09-28-inline-sparks.md`. This file is its kernel.
 *
 * SHAPED LIKE `inline-pills.js`, ON PURPOSE (HARD RULE #1). Pure: no DOM, no markdown-it, no
 * fs. `resolve()` is the one decision both render paths share, and it returns FIELDS, never
 * markup. The markdown-it path builds a string from them (`sparkHtml`); the runtime mirror
 * builds real nodes (`sparkElement`), because assigning markup inside an already-sanitized
 * preview frame is the post-sanitize injection HARD RULE #22 bars.
 *
 * A SPAN THAT DOESN'T PARSE STAYS LITERAL, and nothing is guessed — the pill rule, for the
 * pill's reason. A plausible wrong chart survives review; a literal `~{3 5 4, c13}` on a slide
 * doesn't. `diagnose()` names what was wrong, so `lint:deck` can say it.
 */

const SERIES_TYPES = Object.freeze(['line', 'area', 'bar', 'step', 'winloss']);
const RATIO_TYPES = Object.freeze(['ring', 'bullet']);
const TYPES = Object.freeze([...SERIES_TYPES, ...RATIO_TYPES]);
const COLORS = Object.freeze(Array.from({ length: 12 }, (_, i) => `c${i + 1}`));
const SIZES = Object.freeze(['sm', 'md', 'lg']);
const MARKERS = Object.freeze(['end', 'minmax']);
/** Types that draw a line through the points — the only ones markers and `zero` apply to. */
const LINE_TYPES = Object.freeze(['line', 'area', 'step']);
/** The frame, look and corner words — the same words the `spark:` register uses. */
const { SPARK_FRAME_NAMES, SPARK_LOOK_NAMES, SPARK_CORNER_NAMES } = require('./resolve-spark.js');
const { coreSlot } = require('./segno-slots.js');
/** Every modifier word, for telling a spark attempt from someone else's `~{` (see `split`). */
const ALL_MODS = new Set([...TYPES, ...COLORS, ...SIZES, ...MARKERS, 'fill', 'zero',
  ...SPARK_FRAME_NAMES, ...SPARK_LOOK_NAMES, ...SPARK_CORNER_NAMES]);
/** Past this, bars merge at `md` and the data wants a chart, not a spark (spec §10 f). */
const MAX_POINTS = 48;

// A number as an author types it: an optional sign (ASCII or U+2212 minus), digits, optional
// decimals. No units, no thousands separators — the reader's number is in the text beside
// the spark, and a whitespace split needs no locale rules.
const NUM_RE = /^[+\-−]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const toNumber = (s) => Number(s.replace('−', '-'));

/**
 * Read one code_inline token's text with Segno's spark slot (lib/core/segno-slots.js):
 * `~{12 14 17, bar, c3, lg}` is a TAGGED record whose first item is the data and whose other
 * items are modifier words in any order. Segno does the reading — the tag, the separators,
 * a repeated or unknown word — and this file keeps what only a spark knows: what its data
 * may be and which modifiers go with which type.
 * @returns {{data: object, bound: object} | {error: string} | null}
 *   null = not a spark at all (the O(1) reject); `{error}` = opened like one but broken.
 */
function split(text) {
  if (typeof text !== 'string' || text.length < 3) return null;
  if (text.charCodeAt(0) !== 0x7e /* ~ */ || text.charCodeAt(1) !== 0x7b /* { */) return null;
  // A SPARK ATTEMPT HAS A DIGIT IN IT, OR A SPARK WORD. Without either it is someone else's
  // `~{`: LaTeX's `\~{}` (a typeset tilde) and `\~{n}` (an ñ) are the common ones, and neither
  // is a broken spark, so neither gets a lint warning or loses its escape backslash.
  // `~{abc, bar}` names a spark type, so it IS an attempt and gets told why not.
  if (!/\d/.test(text) && !text.slice(2).split(/[,}\s=]+/).some((w) => ALL_MODS.has(w.toLowerCase()))) return null;
  const r = sparkSlot().read(text);
  if (!r.ok) {
    // A thousands comma (`~{1,200 1,450}`) splits the data into items, so Segno reports a
    // stray word; the author's mistake is the comma, so say that.
    const comma = /^~\{\s*(?:[^\s,}]+\s+)*([^\s,}]*\d,\d[^\s,}]*)/.exec(text);
    if (comma) return { error: `\`${comma[1]}\` is not a number — no units, commas or currency signs` };
    return { error: r.diagnostics[0].message };
  }
  const data = parseData(r.value.data.trim());
  if (data.error) return data;
  return { data, bound: r.value };
}

let slot = null;
const sparkSlot = () => (slot ??= coreSlot('spark'));

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

/**
 * The bound record's words as the spark's axes, then the rules only a spark knows. Segno has
 * already refused an unknown word or a repeated axis; what is left is which words go together.
 */
function resolveMods(b, data) {
  const out = {
    type: b.type || null,
    c: b.color ? `c${b.color}` : null,
    size: b.size || null,
    fill: !!b.fill,
    zero: !!b.zero,
    frame: b.frame || null,
    look: b.look || null,
    corners: b.corners || null,
    markers: MARKERS.filter((m) => b[m]),
  };
  const series = data.kind === 'series';
  out.type = out.type || (series ? 'line' : 'ring');
  if (SERIES_TYPES.includes(out.type) !== series) {
    return { error: series
      ? `a ${out.type} takes one value, like \`72/80\` or \`72%\`, not a series`
      : `a ${out.type} needs a series of two or more numbers, not one value` };
  }
  if (!LINE_TYPES.includes(out.type)) {
    const lineOnly = out.markers[0] || (out.zero ? 'zero' : null);
    if (lineOnly) return { error: `\`${lineOnly}\` only goes on line, area and step, not ${out.type}` };
  }
  if (out.fill && out.type === 'ring') return { error: '`fill` stretches a spark sideways, which a ring cannot do' };
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
  // shape of change from low to high, unless the author asks for `zero` (spec §6).
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
  // ONE ENTRY: the same span is asked twice in a row (`resolve` then `diagnose` for a broken
  // escape or in `lint:deck`), and the answer is a pure function of the text.
  if (text === lastText) return lastResult;
  const r = interpretUncached(text);
  // Frozen, so "every caller only reads it" is enforced rather than assumed.
  if (r && !r.error) {
    Object.freeze(r.data);
    Object.freeze(r.axes.markers);
    Object.freeze(r.axes);
    Object.freeze(r);
  }
  lastText = text;
  lastResult = r;
  return r;
}
let lastText = null;
let lastResult = null;
function interpretUncached(text) {
  const parsed = split(text);
  if (!parsed || parsed.error) return parsed;
  const axes = resolveMods(parsed.bound, parsed.data);
  if (axes.error) return axes;
  return { data: parsed.data, axes };
}

/**
 * THE ONE DECISION both render paths share: code text → the spark's parts, or null.
 * @returns {{type:string, size:string, c:string|null, fill:boolean, zero:boolean,
 *   markers:string[], view:number[], marks:object[], label:string}|null}
 */
function resolve(text, _off, probe) {
  const r = interpret(text);
  if (!r || r.error) return null;
  if (probe) return true; // decided: the marks are the drawing's job
  const { data, axes } = r;
  const marks = data.kind === 'series' ? seriesMarks(axes.type, data.values, axes) : ratioMarks(axes.type, data);
  return { ...axes, view: axes.type === 'ring' ? [24, 24] : [W, H], marks, label: labelFor(axes.type, data) };
}

/**
 * The span's fields for an editor: every axis the author can set, plus the data itself
 * (`{kind:'series', values}` or `{kind:'ratio', value, target, pct}`). Null when the span is not a
 * spark the engine draws. A copy, so a caller may change it.
 * `dataText` is the numbers as the author wrote them, so an editor can change one and keep the rest.
 * @returns {{data: object, dataText: string, type:string, size:string, c:string|null, fill:boolean, zero:boolean,
 *   markers:string[], frame:string|null, look:string|null, corners:string|null}|null}
 */
function read(text) {
  const r = interpret(text);
  if (!r || r.error) return null;
  const dataItem = spanItems(text)?.[0];
  const dataText = dataItem && dataItem.name === null ? String(dataItem.value.text).trim() : '';
  return { ...r.axes, markers: [...r.axes.markers], dataText, data: r.data.kind === 'series' ? { ...r.data, values: [...r.data.values] } : { ...r.data } };
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

/**
 * The span's attributes, as ordered pairs both builders apply. `data-src` is the author's own
 * span text, so an editor that measures the rendered spark (too big for its container) can find
 * the exact span to fix without a source map. It is escaped like every other value.
 */
function hostAttrs(s, text) {
  const a = [['class', 'lat-spark'], ['data-type', s.type], ['data-size', s.size], ['role', 'img'], ['aria-label', s.label], ['data-src', text]];
  if (s.c) a.push(['data-c', s.c]);
  if (s.fill) a.push(['data-fill', '']);
  // Only what the author wrote on THIS spark; the slide class and the deck register fill in
  // the rest in CSS, so the most specific word wins without the kernel knowing the slide.
  if (s.frame) a.push(['data-frame', s.frame]);
  if (s.look) a.push(['data-look', s.look]);
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
  return `<span${attrString(hostAttrs(s, text))}><svg${attrString(svgAttrs(s))}>${drawn}</svg>${dots}</span>`;
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
  const host = set(doc.createElement('span'), hostAttrs(s, text));
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

/**
 * The axes in the order an author settles them — what "next" means to the Studio's
 * autocomplete. A spark reads type first, then how big, then its color and markers.
 */
const NEXT_ORDER = Object.freeze([
  ['type', TYPES], ['size', SIZES], ['color', COLORS], ['look', SPARK_LOOK_NAMES], ['marker', MARKERS],
  ['scale', ['zero']], ['width', ['fill']], ['frame', SPARK_FRAME_NAMES], ['corners', SPARK_CORNER_NAMES],
]);

/**
 * What may come next after `text` (a spark with its complete modifiers so far, e.g.
 * `~{1 2 3, bar}`): every word the KERNEL accepts appended, in axis order, and the first axis
 * with any — so the menu never offers a ring on a series, a marker on a bar, or a repeat.
 * @returns {{ next: string, words: {label: string, axis: string}[] } | null}
 */
function nextWords(text) {
  if (!resolve(text)) return null;
  const words = [];
  for (const [axis, list] of NEXT_ORDER) {
    for (const label of list) if (resolve(withWord(text, label))) words.push({ label, axis });
  }
  return words.length ? { next: words[0].axis, words } : null;
}

/** `~{1 2 3, bar}` with one more word before its closing brace: `~{1 2 3, bar, lg}`. */
function withWord(text, word) {
  const close = text.lastIndexOf('}');
  return `${text.slice(0, close).trimEnd()}, ${word}${text.slice(close)}`;
}


// ── The writer ───────────────────────────────────────────────────────────────────────────
// The Studio's spark editor (docs/src/components/studio/SparkPanel.tsx) changes one thing at a
// time and this is what writes it. SHAPED LIKE `editPill` (inline-pills.js): it replaces only the
// words that change, leaves every other byte of the author's span alone, and returns null rather
// than guess. A result is accepted only if the kernel's own reader (`interpret`) still reads it as a
// spark, so a combination the engine refuses (a marker on a bar) is a null here, never a span that
// quietly stops being one. The field-by-field comparison after it is a backstop: no input in a
// 1.3M-case differential (span x edit) has reached it, so it is not pinned by a test.
const segnoParse = (text) => require('@laticent/segno/read').parse(text);

const FLAG_WORDS = Object.freeze(['fill', 'zero', ...MARKERS]);
const NAMED_AXES = Object.freeze(['type', 'size', 'color', 'frame', 'look', 'corners']);
const AXIS_VOCAB = Object.freeze({ type: TYPES, size: SIZES, color: COLORS });

/** The span's record items with offsets into `text` (the `~` is stripped for the parser and added back), or null. */
function spanItems(text) {
  if (typeof text !== 'string' || text.charCodeAt(0) !== 0x7e) return null;
  const p = segnoParse(text.slice(1));
  if (!p.ok || p.item.value.kind !== 'record') return null;
  return p.item.value.items.map((it) => ({ ...it, from: it.from + 1, to: it.to + 1 }));
}

/** Which axis a modifier item (not the data) fills: by its name, else by the word it is. */
function itemAxis(it) {
  if (it.value.kind !== 'scalar') return null;
  const w = String(it.value.text).trim().toLowerCase();
  if (it.name) {
    const n = String(it.name).toLowerCase();
    return NAMED_AXES.includes(n) ? n : null;
  }
  if (FLAG_WORDS.includes(w)) return w;
  for (const axis of ['type', 'size', 'color']) if (AXIS_VOCAB[axis].includes(w)) return axis;
  return null;
}

/** Add `word` as the last item. */
function appendWord(text, items, word) {
  const last = items[items.length - 1];
  return `${text.slice(0, last.to)}, ${word}${text.slice(last.to)}`;
}

/** Remove item `i` and its separator. Never empties the braces (the data item is item 0 and stays). */
function dropItem(text, items, i) {
  if (i <= 0) return null;
  const it = items[i];
  return i < items.length - 1
    ? text.slice(0, it.from) + text.slice(items[i + 1].from)
    : text.slice(0, items[i - 1].to) + text.slice(it.to);
}

/** Set one single-word axis (`type`, `size`, `color`). `word` null = absent. */
function setAxisWord(text, axis, word) {
  const items = spanItems(text);
  if (!items) return null;
  const at = items.map((it, i) => (i > 0 && itemAxis(it) === axis ? i : -1)).filter((i) => i >= 0);
  if (at.length > 1) return null; // two words for one axis: the span is already ambiguous
  if (at.length === 0) return word === null ? text : appendWord(text, items, word);
  const it = items[at[0]];
  const written = String(it.value.text).trim().toLowerCase();
  if (word === written) return text; // already says it: keep its bytes
  if (word === null) return dropItem(text, items, at[0]);
  // Segno lower-cases a name; the author's own casing (`Size=lg`) is theirs to keep.
  const spelled = it.name ? `${text.slice(it.from, it.from + it.name.length)}=${word}` : word;
  return text.slice(0, it.from) + spelled + text.slice(it.to);
}

/** Turn one flag word (`end`, `minmax`, `fill`, `zero`) on or off. */
function setFlagWord(text, flag, on) {
  const items = spanItems(text);
  if (!items) return null;
  const at = items.map((it, i) => (i > 0 && itemAxis(it) === flag ? i : -1)).filter((i) => i >= 0);
  if (at.length > 1) return null;
  if (on) return at.length ? text : appendWord(text, items, flag);
  return at.length ? dropItem(text, items, at[0]) : text;
}

/** The data item's text, replaced. The data is item 0 of the record and nothing else. */
function setDataText(text, dataText) {
  const items = spanItems(text);
  if (!items || items[0].name !== null) return null;
  return text.slice(0, items[0].from) + dataText + text.slice(items[0].to);
}

/**
 * Change one or more things about a spark, writing only the words that change.
 *   data     the numbers: an array of finite numbers, or the data text (`12 14 17`, `72/80`, `72%`)
 *   type     one of TYPES, or null = the default for the data (line for a series, ring for a ratio)
 *   size     one of SIZES, or null = md
 *   color    `c1`…`c12`, or null = the default
 *   end, minmax, fill, zero   booleans
 * An absent key leaves the axis alone. Several keys apply together, so a panel can switch to a bar
 * and clear the markers a bar cannot carry in one write.
 * @param {string} text the span, `~{…}`
 * @param {{data?: string|number[], type?: string|null, size?: string|null, color?: string|null,
 *   end?: boolean, minmax?: boolean, fill?: boolean, zero?: boolean}} edit
 * @returns {string|null} the new span text, or null when the span is not a spark, the engine would
 *   refuse the result, or the result would not say what was asked
 */
function editSpark(text, edit) {
  const before = interpret(text);
  if (!before || before.error || !edit || typeof edit !== 'object') return null;
  let cur = text;
  let wantData = before.data;
  if (edit.data !== undefined) {
    const dataText = Array.isArray(edit.data) ? (edit.data.every(Number.isFinite) ? edit.data.join(' ') : null) : edit.data;
    if (typeof dataText !== 'string' || /[,}\r\n`]/.test(dataText)) return null;
    wantData = parseData(dataText.trim());
    if (wantData.error) return null;
    cur = setDataText(cur, dataText.trim());
    if (cur === null) return null;
  }
  // The type default depends on the data, so it is settled after the data is.
  const implied = wantData.kind === 'series' ? 'line' : 'ring';
  const words = {};
  for (const axis of ['type', 'size', 'color']) {
    if (edit[axis] === undefined) continue; // absent, like a key that is not there
    let w = edit[axis] === null ? null : String(edit[axis]).trim().toLowerCase();
    if (w !== null && !AXIS_VOCAB[axis].includes(w)) return null;
    // A word the span already spells out stays as written, even when it is the default (`line`, `md`).
    const written = (spanItems(cur) ?? []).filter((it, i) => i > 0 && itemAxis(it) === axis).map((it) => String(it.value.text).trim().toLowerCase());
    if (!(w !== null && written.includes(w)) && ((axis === 'type' && w === implied) || (axis === 'size' && w === 'md'))) w = null;
    words[axis] = w;
    cur = setAxisWord(cur, axis, w);
    if (cur === null) return null;
  }
  for (const flag of FLAG_WORDS) {
    if (edit[flag] === undefined) continue;
    if (typeof edit[flag] !== 'boolean') return null;
    cur = setFlagWord(cur, flag, edit[flag]);
    if (cur === null) return null;
  }
  const after = interpret(cur);
  if (!after || after.error) return null;
  // The result must say what was asked and nothing else changed.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(after.data, wantData)) return null;
  const want = { ...before.axes };
  if ('type' in words) want.type = words.type ?? implied;
  else if (before.axes.type === (before.data.kind === 'series' ? 'line' : 'ring')) want.type = implied; // an implied type follows the data
  if ('size' in words) want.size = words.size ?? 'md';
  if ('color' in words) want.c = words.color;
  for (const f of ['fill', 'zero']) if (edit[f] !== undefined) want[f] = edit[f];
  const markers = MARKERS.filter((m) => (edit[m] !== undefined ? edit[m] : before.axes.markers.includes(m)));
  for (const k of ['type', 'size', 'c', 'fill', 'zero']) if (after.axes[k] !== want[k]) return null;
  if (!same(after.axes.markers, markers)) return null;
  return cur;
}

module.exports = {
  resolve, read, diagnose, sparkHtml, sparkElement, nextWords, withWord, editSpark,
  TYPES, SERIES_TYPES, RATIO_TYPES, COLORS, SIZES, MARKERS, MAX_POINTS,
};
