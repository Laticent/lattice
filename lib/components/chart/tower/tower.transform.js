/**
 * tower chart kernel — a reinsurance program drawn as the layers a broker
 * places: a retention at the bottom, then each layer above it, written as its
 * limit in excess of its attachment (`$40M xs $50M`), and each layer split
 * across the reinsurers who took a share of it.
 *
 * Shape:
 *   ## Heading.
 *   - Layer 3 `$200M xs $160M`
 *     - Acme Re `30%`
 *     - Globex Re `25%`
 *   - Layer 2 `$70M xs $90M`
 *     - Acme Re `40%`
 *   - Retention `$50M`
 *
 * EQUAL HEIGHTS, NOT TO SCALE. A real program runs from a $50M retention to a
 * $200M top layer, and drawn to scale the bottom layers — where most of the
 * premium and most of the conversation is — collapse to slivers. The owner
 * chose the version that is easiest to read (2026-10-16): every layer is the
 * same height, its size is printed beside it in the notation the market uses,
 * and the boundary between two layers carries its dollar figure on the right
 * edge. So the geometry answers "who carries what share of which layer", and
 * the type answers "how big is each layer". The `<desc>` says the layers are
 * not to scale, because a screen reader cannot see the labels doing that work.
 *
 * Layers are sorted by attachment, lowest at the bottom, whatever order the
 * author wrote them in. A pill with no `xs` is the RETENTION: the band from zero
 * to that figure, drawn as a dashed outline because no reinsurer is on it.
 *
 * Shares are the nested bullets, each a reinsurer and a percentage of the
 * layer. A reinsurer keeps ONE color across every layer (slot by first
 * appearance), which is the whole read of a tower: whose line runs up the
 * program. What the shares leave unplaced is drawn as an empty segment named
 * `Open`. The share figure is printed INSIDE its segment (one of two charts that
 * print on a mark, with risk-matrix's numbered markers), because a tower's segments are wide bands by
 * construction and a percentage beside every segment would not fit; its color
 * is computed from the segment's own fill (the `chart-status` pill idiom) so it
 * holds contrast on every slot in both canvases. A segment too narrow for its
 * figure prints nothing, and the figure is still in the `<desc>` and the
 * popover.
 *
 * The kernel emits no color (HARD RULE #3): a segment carries `data-hue` and
 * tower.styles.css paints it.
 */

const markDetail = require('../_chart-family/mark-detail');
const cart = require('../_chart-family/cartesian');
const { keySvg } = require('../_chart-family/legend-svg-key');
const { wrapSvgLabel } = require('../_chart-family/svg-label');
const { plainText, spliceFirstList, escAttr } = require('../_chart-family/transform-utils');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { readTowerSize, readTowerShare } = require('../../../core/tower-size');

// The family caps categorical slots at six; a seventh reinsurer and beyond
// share one `Others` slot, summed per layer, rather than repeating a color that
// would claim two reinsurers are one.
const CAP = 6;
const OTHERS = 'Others';
const OPEN = 'Open';

// Nominal sizes in viewBox user units, MIRRORING tower.styles.css (gated by
// tower.test.js, which reads the stylesheet).
const FS = { name: 8, note: 6.5, edge: 6.5, share: 6.5 };

// The two side columns size to their widest text, within these bounds, the way
// the Cartesian value gutter does (cartesian.js `tickGutter`): a fixed column cut
// `EUR 100M` to `EUR…` and wrapped `EUR 25 Mio. xs EUR 25 Mio.` onto three lines.
const NAME_W = { min: 82, max: 118 }; // the left column: layer name over its notation
const EDGE_W = { min: 30, max: 54 };  // the right column: the boundary figures
const ADVANCE = 0.6;                  // a conservative average glyph advance / font size
const PAD_Y = 8;        // headroom for the top boundary figure, and footroom
const GAP = 2;          // between two layers — the boundary figure sits on it
const MIN_SHARE_W = 18; // narrower than this, a segment prints no figure

function readLead(item) {
  const lead = item.replace(/<\/?p>/g, '').trim();
  const m = lead.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
  return { label: plainText(m ? m[1] : lead).trim(), raw: m ? plainText(m[2]).trim() : '' };
}

/**
 * Parse the layer list. Returns null when there is nothing to draw, so the
 * dispatcher leaves the section untouched (the family contract). The size and
 * share pills are read by lib/core/tower-size.js, the reader the narrator shares,
 * so a pill the chart drops is one the narration drops too.
 */
function parseTower(ulInner) {
  const layers = [];
  for (const item of parseTopLevelLis(ulInner)) {
    const { lead, detail } = markDetail.splitDetail(item);
    const { label, raw } = readLead(lead);
    const size = readTowerSize(raw);
    if (!size) continue;
    // A reinsurer written twice in one layer is one line of it: summed, so it
    // draws one segment and is said once.
    const byName = new Map();
    // `splitDetail` hands back the nested list's own `<li>`s.
    for (const sub of detail ? parseTopLevelLis(detail) : []) {
      const sh = readLead(markDetail.splitDetail(sub).lead);
      const pct = readTowerShare(sh.raw);
      if (sh.label && pct != null) byName.set(sh.label, (byName.get(sh.label) || 0) + pct);
    }
    const shares = [...byName].map(([name, pct]) => ({ name, pct }));
    layers.push({ label, raw, ...size, shares });
  }
  if (!layers.length) return null;
  layers.sort((a, b) => a.attach - b.attach || a.top - b.top);

  // One slot per reinsurer, by first appearance from the BOTTOM of the
  // program up, which is the order a reader's eye climbs it.
  const names = [];
  for (const l of layers) for (const s of l.shares) if (!names.includes(s.name)) names.push(s.name);
  const folded = names.length > CAP;
  const keep = folded ? names.slice(0, CAP - 1) : names;
  const slotOf = new Map(keep.map((n, i) => [n, i + 1]));
  for (const l of layers) {
    const segs = [];
    const folds = [];
    for (const s of l.shares) {
      if (slotOf.has(s.name)) segs.push({ ...s, slot: slotOf.get(s.name) });
      else folds.push(s);
    }
    // Slot order, not authored order, so a reinsurer sits in the same place in
    // every layer and its line reads straight up the program.
    segs.sort((a, b) => a.slot - b.slot);
    // `members` keeps the folded names, so the popover can say who `Others` is.
    if (folds.length) segs.push({ name: OTHERS, pct: folds.reduce((t, f) => t + f.pct, 0), slot: CAP, members: folds });
    const placed = segs.reduce((t, s) => t + s.pct, 0);
    l.segs = segs;
    l.placed = placed;
    // Rounded BEFORE the test, to the precision it prints at: three shares of
    // 33.33% leave 0.01, which drew a hairline `Open 0%` and said "open zero percent".
    l.open = l.shares.length ? Math.max(0, round1(100 - placed)) : 0;
    l.over = round1(placed) > 100;
  }
  const series = keep.map((n, i) => ({ name: n, slot: i + 1 }));
  if (folded) series.push({ name: OTHERS, slot: CAP });
  return { layers, series, affix: cart.affixOf(layers.flatMap((l) => [l.limitRaw, l.attachRaw].filter(Boolean))) };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function pctText(v) {
  return `${round1(v)}%`;
}

function buildTower(model, ctx = {}) {
  const { layers, series, affix } = model;
  const view = cart.viewFor(ctx.orientation, ctx.paneView);
  const n = layers.length;
  const top = Math.max(...layers.map((l) => l.top));
  const fmt = cart.markFormatter({ ticks: [top], step: top / 10, affix });

  const noteOf = (l) => (l.retention ? l.limitRaw : `${l.limitRaw} xs ${l.attachRaw}`);
  const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));
  const nameW = clamp(Math.max(...layers.map((l) => Math.max(
    noteOf(l).length * FS.note, l.label.length * FS.name) * ADVANCE)) + 6, NAME_W);
  const edgeVals = [...new Set(layers.flatMap((l) => [l.attach, l.top]).filter((v) => v > 0))];
  const edgeW = clamp(Math.max(...edgeVals.map((v) => fmt(v).length)) * FS.edge * ADVANCE + 8, EDGE_W);
  const x0 = nameW + 4;
  const x1 = view.w - edgeW;
  const w = x1 - x0;
  const bandH = (view.h - 2 * PAD_Y - (n - 1) * GAP) / n;
  // Layer i (0 = lowest) sits at the bottom of the stack.
  const yTop = (i) => view.h - PAD_Y - (i + 1) * bandH - i * GAP;

  const parts = [];
  const edges = [];
  // Too short a band for a name over its note — a crowded tower in a small
  // pane — prints no names rather than names printed across each other.
  const named = bandH + GAP >= FS.name * 1.1;
  const maxLines = Math.max(1, Math.floor(bandH / (FS.note * 1.2)));

  layers.forEach((l, i) => {
    const y = yTop(i);
    const mid = y + bandH / 2;
    const common = `data-mark="${i}" data-anima-role="bar" data-label="${escAttr(l.label)}"` +
      ` data-value="${escAttr(l.raw)}"`;
    if (l.retention) {
      parts.push(`<rect class="tower-retention" ${common} data-paint="none" data-encodes="none"` +
        ` x="${cart.round2(x0)}" y="${cart.round2(y)}" width="${cart.round2(w)}" height="${cart.round2(bandH)}"/>`);
      const retained = wrapSvgLabel('Retained', {
        x: x0 + w / 2, y: mid, width: w - 8, fontSize: FS.share, anchor: 'middle', vAlign: 'middle',
        maxLines: 1, baseline: 'central', className: 'tower-retained', emitFontSize: false,
        attrs: ` data-mark-for="${i}"`,
      });
      // Like a share figure: a word cut to `Ret…` is not printed at all.
      if (!retained.truncated && bandH >= FS.share * 1.6) parts.push(retained.svg);
    } else if (!l.segs.length) {
      // A layer written with no shares: its size is known, its panel is not.
      parts.push(`<rect class="tower-layer" ${common} data-paint="fill" data-encodes="none"` +
        ` x="${cart.round2(x0)}" y="${cart.round2(y)}" width="${cart.round2(w)}" height="${cart.round2(bandH)}"/>`);
    } else {
      // Shares past 100% are drawn scaled to the layer's width, so the band
      // never spills past the column; the `<desc>` says it is over-placed.
      const scale = l.over ? 100 / l.placed : 1;
      let x = x0;
      const runs = l.segs.map((s) => ({ ...s, cls: 'tower-share' }));
      if (l.open > 0) runs.push({ name: OPEN, pct: l.open, raw: pctText(l.open), cls: 'tower-open' });
      runs.forEach((s) => {
        const sw = (s.pct * scale / 100) * w;
        const hue = s.slot ? ` data-hue="${s.slot}" data-encodes="hue" data-paint="fill"` : ' data-encodes="none" data-paint="none"';
        parts.push(`<rect class="${s.cls}" data-mark="${i}" data-anima-role="bar"${hue}` +
          ` data-label="${escAttr(`${l.label} · ${s.name}`)}" data-value="${escAttr(pctText(s.pct))}"` +
          ` x="${cart.round2(x)}" y="${cart.round2(y)}" width="${cart.round2(sw)}" height="${cart.round2(bandH)}"/>`);
        if (sw >= MIN_SHARE_W && bandH >= FS.share * 1.6) {
          const opts = {
            x: x + sw / 2, y: mid, width: sw - 4, fontSize: FS.share, anchor: 'middle', vAlign: 'middle',
            maxLines: 1, baseline: 'central', emitFontSize: false,
            className: s.cls === 'tower-open' ? 'tower-open-value' : 'tower-share-value',
            attrs: `${s.slot ? ` data-hue="${s.slot}"` : ''} data-mark-for="${i}"`,
          };
          // `Open 15%` where it fits, the bare `15%` where it does not: an
          // ellipsized `Open…` hides the one number the segment is there for.
          let label = wrapSvgLabel(s.cls === 'tower-open' ? `${OPEN} ${pctText(s.pct)}` : pctText(s.pct), opts);
          if (label.truncated && s.cls === 'tower-open') label = wrapSvgLabel(pctText(s.pct), opts);
          if (!label.truncated) parts.push(label.svg);
        }
        x += sw;
      });
    }

    // The left column: the layer's name over its size, in the market's notation.
    const note = noteOf(l);
    if (named) {
    const name = wrapSvgLabel(l.label, {
      x: nameW, y: mid - (bandH >= FS.name * 2.6 ? FS.note * 0.6 : 0), width: nameW - 4, fontSize: FS.name,
      anchor: 'end', vAlign: bandH >= FS.name * 2.6 ? 'bottom' : 'middle', maxLines: 1,
      baseline: 'central', className: 'tower-name', emitFontSize: false, attrs: ` data-mark-for="${i}"`,
    });
    parts.push(name.svg);
    if (bandH >= FS.name * 2.6) {
      parts.push(wrapSvgLabel(note, {
        x: nameW, y: mid + FS.note * 0.5, width: nameW - 4, fontSize: FS.note,
        anchor: 'end', vAlign: 'top', maxLines: Math.max(1, maxLines - 1),
        baseline: 'central', className: 'tower-note', emitFontSize: false, attrs: ` data-mark-for="${i}"`,
      }).svg);
    }
    }

    // Boundary figures on the right. Where a layer attaches exactly where the one
    // below exhausts, the two share one figure, on the gap between them, linked
    // to the layer it tops (a tap on `$90M` opens Layer 1). Where they do NOT
    // meet — an uncovered gap or an overlap — the two figures differ, so each
    // sits against its own band instead of both landing on the one gap.
    const prev = layers[i - 1];
    if (!prev) {
      if (l.attach > 0) edges.push({ v: l.attach, y: y + bandH, mark: i });
    } else if (prev.top === l.attach) {
      edges.push({ v: l.attach, y: y + bandH + GAP / 2, mark: i - 1 });
    } else {
      edges.push({ v: prev.top, y: yTop(i - 1) + FS.edge * 0.6, mark: i - 1 });
      edges.push({ v: l.attach, y: y + bandH - FS.edge * 0.6, mark: i });
    }
    if (i === n - 1) edges.push({ v: l.top, y, mark: i });
  });

  // A figure that would print across the one before it is dropped (a crowded
  // tower in a small pane); the `<desc>` still reads every boundary.
  let lastY = Infinity;
  for (const { v, y, mark } of edges) {
    if (lastY - y < FS.edge) continue;
    lastY = y;
    parts.push(wrapSvgLabel(fmt(v), {
      x: x1 + 4, y, width: edgeW - 6, fontSize: FS.edge, anchor: 'start', vAlign: 'middle',
      maxLines: 1, baseline: 'central', className: 'tower-edge', emitFontSize: false,
      attrs: ` data-mark-for="${mark}"`,
    }).svg);
  }

  // The key: one row per reinsurer, then what an unfilled or dashed band means
  // when the chart draws one.
  const rows = series.map((s) => ({
    // The mark contract (legend-svg-key.js `swatchContract`): a swatch carries what its
    // marks carry, or a finish that re-paints the shares leaves the key behind.
    swatchClass: 'tower-swatch', swatchAttrs: ` data-hue="${s.slot}" data-encodes="hue" data-paint="fill"`, label: s.name,
  }));
  if (layers.some((l) => l.open > 0)) rows.push({ swatchClass: 'tower-swatch-open', label: OPEN });
  if (layers.some((l) => l.retention)) rows.push({ swatchClass: 'tower-swatch-retained', label: 'Retained' });

  let svgW = view.w;
  let svgH = view.h;
  let dx = 0;
  let dy = 0;
  let defs = '';
  let keyBody = '';
  if (rows.length) {
    const key = keySvg({
      rows, diagramRight: view.w - 2, diagramHeight: view.h, hasValues: false, orientation: ctx.orientation,
    });
    svgW = key.viewW; svgH = key.viewH; dx = key.diagramDx; dy = key.diagramDy;
    defs = key.defs; keyBody = key.body;
  }

  const svg = cart.buildSvgRoot({
    view: { w: svgW, h: svgH },
    className: 'tower-svg',
    title: 'Reinsurance tower',
    desc: buildDesc(model, fmt),
    defs,
    body: `<g transform="translate(${dx} ${dy})">${parts.join('')}</g>${keyBody}`,
  });

  const marks = layers.map((l) => ({
    label: l.label,
    valueRaw: l.raw,
    detail: l.segs.length
      ? l.segs.map((s) => `<li>${escAttr(s.name)} ${escAttr(pctText(s.pct))}${othersOf(s)}</li>`).join('') +
        (l.open > 0 ? `<li>${OPEN} ${pctText(l.open)}</li>` : '')
      : '',
  }));
  return `<div class="tower-figure">${svg}${markDetail.detailPayload(marks)}</div>${markDetail.detailNote(marks)}`;
}

/** Who an `Others` segment is: `(Orion Re 10%, Atlas Re 15%)`, else nothing. */
function othersOf(s, esc = escAttr) {
  return s.members ? ` (${s.members.map((m) => `${esc(m.name)} ${pctText(m.pct)}`).join(', ')})` : '';
}

/**
 * Where two adjacent layers do not meet: `uncovered from $90M to $100M`, or
 * `Layer B overlaps Layer A from $80M to $100M`. Equal-height bands cannot show
 * either, so it is said in words.
 */
function seams(layers, fmt) {
  const out = [];
  for (let i = 1; i < layers.length; i++) {
    const a = layers[i - 1];
    const b = layers[i];
    if (b.attach > a.top) out.push(`uncovered from ${fmt(a.top)} to ${fmt(b.attach)}`);
    else if (b.attach < a.top) out.push(`${b.label} overlaps ${a.label} from ${fmt(b.attach)} to ${fmt(Math.min(a.top, b.top))}`);
  }
  return out;
}

/** The data a sighted reader gets from the labels, read aloud, top layer first. */
function buildDesc(model, fmt) {
  const lines = model.layers.slice().reverse().map((l) => {
    if (l.retention) return `${l.label}: ${fmt(l.limit)} retained`;
    const size = `${l.label}: ${fmt(l.limit)} excess of ${fmt(l.attach)}`;
    if (!l.segs.length) return size;
    // Plain text: `buildSvgRoot` escapes the whole `<desc>` once.
    const parts = l.segs.map((s) => `${s.name} ${pctText(s.pct)}${othersOf(s, String)}`);
    if (l.open > 0) parts.push(`${OPEN.toLowerCase()} ${pctText(l.open)}`);
    if (l.over) parts.push(`over-placed at ${pctText(l.placed)}`);
    return `${size}, ${parts.join(', ')}`;
  });
  const seam = seams(model.layers, fmt);
  return `Layers drawn at equal height, not to scale, top layer first. ${lines.join('; ')}.` +
    (seam.length ? ` ${seam.map((t) => t[0].toUpperCase() + t.slice(1)).join('. ')}.` : '');
}

/** The chart-family entrypoint (see the `kernel` block in tower.manifest.json). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseTower(ext.inner);
    return model ? buildTower(model, ctx) : null;
  });
}

module.exports = { transformSection, parseTower, buildTower, buildDesc, FS };
