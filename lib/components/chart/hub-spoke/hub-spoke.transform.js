/**
 * hub-spoke — one hub, its satellites, and what flows between them. Chart-family
 * member; kernel-as-module (the family dispatches here through the `kernel` block in
 * hub-spoke.manifest.json).
 *
 * WHAT THIS FILE DECIDES, AND WHAT IT DOES NOT. The reading of the slide — the pill
 * grammar, the channel rule, the flow classes, the hub's text fit and every lint — is
 * `lib/core/hub-spoke-model.js`, shared with the linter and the voice (HARD RULE #7).
 * This file owns the GEOMETRY: where the discs sit, how wide the connectors are, where
 * each label lands so it touches nothing, and the SVG that draws it. It emits no color:
 * every paint is a token in hub-spoke.styles.css (HARD RULE #3).
 *
 * THE LOOK ("Bold Hub"). A neutral heavy hub disc — its own body, never a categorical
 * slot, the heaviest mark on the slide — joined to solid satellite discs by
 * constant-width filled connectors. The figure spreads to the stage's width, and the
 * viewBox is 200 units tall on a landscape stage, the piechart's DIAGRAM_H, so a name
 * here prints at the size a pie key prints. Satellites are NEUTRAL unless the author
 * groups them; a status pill paints its own spoke and nothing else.
 *
 * GEOMETRY INVARIANTS (asserted in test/unit/components/hub-spoke.test.js):
 *   · the hub stays inside the stage and outside every satellite;
 *   · every connector shows at least MIN_NECK units between the discs (plus a head's
 *     length for each arrowhead), so the figure never collapses into a molecule; a
 *     tiered figure keeps TIER_NECK hub → branch and TWIG_NECK branch → leaf, at its
 *     narrower bands, and no two of its discs overlap;
 *   · a floor the solver cannot keep is reported in `meta.bad`, and the model's
 *     `crowding()` predicts every such slide, so a broken floor never ships with a
 *     clean lint;
 *   · hub radius : largest satellite radius stays within [1.6, 3.0];
 *   · no label touches a disc, a connector, a halo, another label or the stage edge —
 *     the placer reports anything it cannot place as `unresolved`, and the kernel
 *     retries with narrower names and a label column before accepting one.
 */

const { parseTopLevelLis } = require('../../../core/html-lists');
const { escAttr, plainText, stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');
const { ariaHiddenMarks } = require('../_chart-family/cartesian');
const markDetail = require('../_chart-family/mark-detail');
const HS = require('../../../core/hub-spoke-model');
const { service } = require('../../../plugins/services.js');

const PAD = 4;
const FS = 10;              // satellite name — the pie key is 9 (19.06px); 10 prints at 21.2px
const FV = 10.4;            // satellite value
const FSS = 9.5;            // status word
const TALL_SMALL = 10;      // status word and key on a tall (portrait / square) stage
const EMPH = 1.35;          // an alarm spoke's value scale
const LH = 1.2;
const MIN_NECK = 24;        // visible connector floor, user units
// Tiered floors. A branch connector is 7 units wide and a twig 4, against the flat
// band's 10, so their floors scale with the band: each still shows a connector about
// two and a half widths long between the discs — a spoke, never a molecule.
const TIER_NECK = 18;       // hub → branch
const TWIG_NECK = 8;        // branch → leaf
const FLOW_W = [6, 9, 12, 15];
const NECK_W = 10;          // the default connector width (no flow channel)
const SET_BACK = 0.6;       // arrow tip → target body
const HALO_GAP = 2.4;
const HALO_W = 2.0;

// The stage in user units, per orientation. Landscape locks the height to the pie's
// DIAGRAM_H and takes its width from the measured chart body (1152 × 424 CSS px on the
// 1280 × 720 frame = 2.72). A tall or square box gets a narrower, taller viewBox so the
// type keeps its size against the box instead of shrinking to fit a landscape spread.
const STAGES = {
  landscape: { W: 544, H: 200 },
  square: { W: 400, H: 250 },
  portrait: { W: 380, H: 350 },
};

const f2 = (v) => Number(Number(v).toFixed(2));
const P = (x, y) => `${f2(x)},${f2(y)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Reading the HTML list (the production path) ──────────────────────────────
const unwrapP = (s) => String(s).replace(/<\/?p>/g, '').trim();

/** A list item → `{ label, pills, childrenHtml }`: label plain, pills decoded. */
function readItem(liInner) {
  const { lead, detail } = markDetail.splitDetail(liInner);
  const { leadStripped, pills } = stripTrailingPills(unwrapP(lead));
  const { text, dropped } = HS.dropInlineKinds(leadStripped, (span) => plainText(span));
  return { label: plainText(text), pills: [...pills.map((p) => plainText(p)), ...dropped], childrenHtml: detail };
}

/**
 * The slide's list as the model's tree. Flat: a satellite's sublist is its DETAIL
 * (mark-detail, level 3). Tiered: a satellite's sublist is its LEAVES, and a leaf's
 * sublist is the leaf's detail (level 4).
 */
function htmlTree(ulInner, tiered) {
  return parseTopLevelLis(ulInner).map((li) => {
    const hub = readItem(li);
    const children = hub.childrenHtml ? parseTopLevelLis(hub.childrenHtml).map((c) => {
      const sat = readItem(c);
      if (!tiered) return { label: sat.label, pills: sat.pills, children: [], detail: sat.childrenHtml };
      const leaves = sat.childrenHtml ? parseTopLevelLis(sat.childrenHtml).map((g) => {
        const leaf = readItem(g);
        return { label: leaf.label, pills: leaf.pills, children: [], detail: leaf.childrenHtml };
      }) : [];
      return { label: sat.label, pills: sat.pills, children: leaves, detail: '' };
    }) : [];
    return { label: hub.label, pills: hub.pills, children };
  });
}

// ── Shapes ───────────────────────────────────────────────────────────────────
// The geometry is Trama's radial kernel (engineering/decisions/2026-10-05-trama-radial-layout.md):
// it places circles, bands and label boxes and knows nothing of hubs, flows or statuses.
// Everything below hands it what this chart's marks mean as plain numbers, and paints.
//
// Required LAZILY, on the first hub-spoke slide, like the flowchart's pass: the engine loads
// every chart's transform up front, and a top-level require would stop the whole engine
// loading wherever `@laticent/trama` does not resolve (an `./engine` consumer of a package
// that does not ship it), not just this chart. The `/radial` entry carries only this kernel.
let kernel = null;
const K = () => {
  if (!kernel) kernel = require('@laticent/trama/radial').radialLayoutKernel();
  return kernel;
};

// Trama names the floors a layout could not keep in its own words; this chart's `meta.bad`
// and its retry policy use these. A code with no entry throws, so a renamed Trama code fails
// the tests loudly rather than silently changing what `meta.bad` reports.
const FLOOR_WORDS = { crowd: 'crowd', neck: 'neck', tall: 'tall', width: 'width', 'outer-neck': 'twig' };
function ourFloors(bad) {
  return bad.map((b) => {
    if (!Object.hasOwn(FLOOR_WORDS, b)) throw new Error(`hub-spoke: Trama reported a floor code this chart does not know: '${b}'`);
    return FLOOR_WORDS[b];
  });
}
const circle = (cx, cy, r) => K().circlePath(cx, cy, r);
const ring = (cx, cy, r0, r1) => K().annulusPath(cx, cy, r0, r1);
const neckPath = (x0, y0, r0, x1, y1, r1, w) => K().bandPath(x0, y0, r0, x1, y1, r1, w);
const headLen = (w) => K().headLen(w);

/** Arrowheads for one connector, named by the end they point at. The tip sits SET_BACK
 *  off the TARGET body (past the halo when the target carries one). */
function arrowsFor(x0, y0, r0, x1, y1, r1, w, dir) {
  return K().bandHeads(x0, y0, r0, x1, y1, r1, w, dir === 'out' || dir === 'both', dir === 'in' || dir === 'both', SET_BACK)
    .map((a) => ({ d: a.d, to: a.to === 'end' ? 'satellite' : 'hub' }));
}

// ── Label blocks ────────────────────────────────────────────────────────────
/**
 * The rows a spoke's label prints: its name (wrapped, never ellipsized), its value,
 * and its status word. `compact` — the fallback for a crowded wing — folds the value
 * and the status onto the name's last line, so a label costs one row less.
 */
function labelBlock(s, maxW, { hand, alarm, compact = false, fs = FS, fss = FSS }) {
  const nameOpts = { hand, bold: alarm };
  const longest = Math.max(0, ...String(s.label).split(/\s+/).map((w) => HS.textWidth(w, fs, nameOpts)));
  const wrapW = Math.max(maxW, Math.min(longest, maxW * 1.5));
  const rows = HS.wrapText(s.label, wrapW, fs, nameOpts).map((t) => ({ kind: 'name', t, fs, tails: [] }));
  const status = s.status ? HS.spokenStatus(s.status) : '';
  const fv = alarm ? FV * EMPH : FV;
  const tails = [];
  if (s.value) tails.push({ kind: 'value', t: s.value, fs: fv });
  if (status) tails.push({ kind: 'status', t: status, fs: fss });
  const bold = { hand, bold: true };
  const rowW = (r) => HS.textWidth(r.t, r.fs, { hand, bold: r.kind !== 'name' || alarm }) +
    r.tails.reduce((a, t) => a + HS.textWidth(` ${t.t}`, t.fs, bold), 0);
  if (compact && tails.length && rows.length) {
    const last = rows[rows.length - 1];
    const trial = { ...last, tails };
    if (rowW(trial) <= wrapW * 1.25) rows[rows.length - 1] = trial;
    else rows.push({ ...tails[0], tails: tails.slice(1) });
  } else {
    for (const t of tails) rows.push({ ...t, tails: [] });
  }
  if (!rows.length) rows.push({ kind: 'name', t: '', fs, tails: [] });
  const hs = rows.map((r) => Math.max(r.fs, ...r.tails.map((t) => t.fs)) * LH);
  return { rows, hs, h: hs.reduce((a, b) => a + b, 0), w: Math.max(...rows.map(rowW)) };
}

// An `icon-only` item prints no label beside its disc: the icon stands in the disc and the
// name is its title and its accessible name (§ 14 of the icons note). It still measures, as
// nothing, so the solve and the placer need no special case.
const NO_LABEL = Object.freeze({ rows: [], hs: [], h: 0, w: 0 });
const blockFor = (s, maxW, o) => (s.iconOnly ? NO_LABEL : labelBlock(s, maxW, o));

// ── Icons (`{icon=…}`, engineering/decisions/2026-09-29-inline-icons.md § 14) ─────────
// The drawing comes from the host (lib/plugins/services.js), never the plugin: with the icons
// plugin off for this deck, or its data not on this surface, `drawHtml` is null and the item
// keeps its name, exactly as a chart that never wrote an icon. The square sits centered in
// its disc at ICON_K × the radius, capped, so it never reaches the disc's edge or an inner
// halo; it paints in the disc's knock-out ink (hub-spoke.styles.css).
const ICON_K = 1.1;
const ICON_MAX = 30;
function iconSide(r, innerHalo) {
  const side = Math.min(ICON_K * r, ICON_MAX);
  // Under an inner halo the square's CORNERS stay inside the ring (half-diagonal side / √2).
  return innerHalo ? Math.min(side, Math.SQRT2 * (r - HALO_GAP - HALO_W) - 1) : side;
}
function emitIcon(it, cx, cy, side, forMark, paint = '') {
  if (!it.draw || side <= 0) return '';
  const svg = it.draw.replace(/^<svg/, `<svg x="${f2(cx - side / 2)}" y="${f2(cy - side / 2)}" width="${f2(side)}" height="${f2(side)}"`);
  const title = it.iconOnly ? `<title>${esc(it.label)}</title>` : '';
  const mark = forMark == null ? '' : ` data-mark-for="${forMark}"`;
  return `<g class="hub-spoke-icon" data-icon="${escAttr(it.icon)}"${it.iconOnly ? ' data-icon-only=""' : ''}${paint}${mark}>${title}${svg}</g>`;
}
/** Fetch each item's drawing once; an item whose icon cannot be drawn reads as one without. */
function withDrawings(model, off) {
  const items = [model.hub, ...model.spokes, ...model.spokes.flatMap((s) => s.leaves || [])];
  if (!items.some((it) => it.icon)) return model;
  const draw = service('icons', 'drawHtml', off);
  for (const it of items) {
    if (!it.icon || it.draw) continue;
    it.draw = draw ? draw(it.icon, 'hub-spoke-icon-svg') : null;
    if (!it.draw) { it.icon = ''; it.iconOnly = false; }
  }
  return model;
}

// `attrs` carries the label's `data-mark-for`: every <text> that names a mark links to it
// itself (chart-tap-proxies.test.js), and the wrapping <g> carries none, so the reveal
// layer dims each label once rather than twice.
function emitLabel(lb, x, yTop, anchor, attrs) {
  let y = yTop;
  return lb.rows.map((r, i) => {
    const b = y + lb.hs[i] * 0.8;
    y += lb.hs[i];
    const tails = r.tails.map((t) => `<tspan class="hub-spoke-${t.kind}" font-size="${f2(t.fs)}"> ${esc(t.t)}</tspan>`).join('');
    return `<text class="hub-spoke-${r.kind}"${attrs} x="${f2(x)}" y="${f2(b)}" text-anchor="${anchor}" font-size="${f2(r.fs)}">${esc(r.t)}${tails}</text>`;
  }).join('');
}

// ── Collision geometry (user units) ─────────────────────────────────────────
const placeLabels = (items, obstacles, stage) => K().placeLabels(items, obstacles, stage);
const scorePlaced = (p, placed, obstacles, stage) => K().scorePlaced(p, placed, obstacles, stage);
const leaderGeom = (p, obstacles) => K().leader(p, obstacles);

const leaderSvg = (pts) => (pts.length === 2
  ? `<line class="chart-leader" x1="${f2(pts[0][0])}" y1="${f2(pts[0][1])}" x2="${f2(pts[1][0])}" y2="${f2(pts[1][1])}"/>`
  : `<polyline class="chart-leader" points="${pts.map((q) => P(q[0], q[1])).join(' ')}"/>`);

const conesFor = (n, tall) => K().conesFor(n, tall);

/** The model's name for the stage shape: landscape, or a tall one. */
function stageName(orientation) {
  return STAGES[orientation] ? orientation : 'landscape';
}

function stageFor(orientation) {
  return STAGES[orientation] || STAGES.landscape;
}

// ═══════════════ single tier ═══════════════
function layoutFlat(model, opts) {
  const { hand } = opts;
  const { W, H } = stageFor(opts.orientation);
  const tall = W / H < 2;
  const spokes = model.spokes;
  const n = spokes.length;
  const mods = model.mods;
  const C = HS.channelOf(model);
  const groups = HS.groupsOf(model);
  const useGroups = groups.length >= 1 && groups.length <= HS.LIMITS.groups;
  // A tall stage prints the small voices (status word, key) a step larger, so on a
  // portrait deck they still clear the family floor (11px × --canvas-scale).
  const small = tall ? TALL_SMALL : undefined;
  const key = keyLayout(useGroups ? groups : [], W, hand, small);
  const KH = key.KH;
  const half = (H - KH) / 2 - PAD;
  const [, RH0, RS0] = HS.ladderFor(n);
  const rs0 = C.channel === 'size' ? HS.sizedRadiusMax(n) : RS0;
  // The hub's ceiling: the model's (shared with the linter, so a hub the linter passes
  // is a hub that fits), scaled up when a taller stage has the room.
  const hubCap = Math.min(HS.hubCeiling(n, { sized: C.channel === 'size', stage: stageName(opts.orientation) }), half - 8);
  let ht = HS.hubFit(model.hub, hubCap, { hand });
  let rsMin = Math.max(9, ht.r / HS.HUB_RATIO_MAX);
  const flowCls = C.flowCls;
  const dirs = spokes.map((s) => HS.directionOf(s, mods));
  // Past eight spokes the connectors thin a step, so twelve bands and their heads still
  // clear each other at the hub.
  const thin = n > 8 ? 0.8 : 1;
  const widthAt = (i, band) => (C.channel === 'flow' ? FLOW_W[flowCls[i] - 1] : NECK_W) * thin * band;

  const radiiAt = (rsMax) => {
    if (C.channel !== 'size') return spokes.map(() => ({ r: rsMax, clamped: false }));
    return HS.sizedDiscs(spokes.map((s) => s.num), rsMax);
  };
  const hubAt = (rsMax) => Math.min(HS.HUB_RATIO_MAX * rsMax, half - 2,
    Math.max(HS.HUB_RATIO_MIN * rsMax, ht.r, RH0 * rsMax / rs0));

  const attempt = (nameW, compact, band, coneAt) => {
    const widthOf = (i) => widthAt(i, band);
    const lbs = spokes.map((s) => blockFor(s, nameW, { hand, alarm: s.alarm, compact, fss: small }));
    const halo = (s) => (s.alarm ? HALO_GAP + HALO_W : 0);
    const dirHeads = (i) => (!dirs[i] ? 0 : dirs[i] === 'both' ? 2 : 1);
    // Trama settles the ring. What it is told: the floor is the connector a reader sees
    // between the discs, and an arrowhead needs its own length plus a stub of band behind
    // it, or the head swallows the spoke; the hub's ceiling is the model's, shared with the
    // linter, so a hub the linter passes is a hub that fits.
    const star = K().solveStar({
      n, W, half, pad: PAD, tall, cone: coneAt, minNeck: MIN_NECK, rs0, rsMin,
      labelW: lbs.map((lb) => lb.w), halo: spokes.map(halo),
      floor: (i) => Math.max(MIN_NECK, dirHeads(i) * headLen(widthOf(i)) + 10) + halo(spokes[i]),
      radiiAt, centerAt: hubAt,
      centerCeil: (r) => Math.min(HS.HUB_RATIO_MAX * Math.max(...r), half - 2, RH0 + 6),
    });
    const { T, Rh, rsMax } = star;
    const bad = ourFloors(star.bad);

    // Place the labels.
    const obstacles = [{ kind: 'circle', x: 0, y: 0, r: Rh, self: 'hub' }];
    const items = [];
    spokes.forEach((s, i) => {
      const [x, y] = T.pts[i];
      const id = `s${i}`;
      const w = widthOf(i);
      obstacles.push({ kind: 'seg', x0: 0, y0: 0, x1: x, y1: y, w, self2: id });
      const rr = T.r[i] + halo(s);
      obstacles.push({ kind: 'circle', x, y, r: rr, node: id });
      if (s.iconOnly) return;
      items.push({ id, cx: x, cy: y, r: rr, side: x > 0.5 ? 1 : x < -0.5 ? -1 : (i < Math.ceil(n / 2) ? 1 : -1), lb: lbs[i], prio: (s.alarm ? 1000 : 0) + Math.abs(y), s, i,
        rewrap: (w) => labelBlock(s, w / 1.5, { hand, alarm: s.alarm, compact, fss: small }) });
    });
    const keyShift = KH / 2;
    const stage = { l: -W / 2 + PAD / 2, r: W / 2 - PAD / 2, t: -H / 2 + 1 + keyShift, b: H / 2 - 1 - KH + keyShift };
    stage.colR = Math.max(...items.filter((it) => it.side > 0).map((it) => it.cx + it.r), 0) + 6;
    stage.colL = Math.min(...items.filter((it) => it.side < 0).map((it) => it.cx - it.r), 0) - 6;
    const { placed, unresolved } = placeLabels(items, obstacles, stage);
    return { lbs, T, Rh, rsMax, bad, placed, unresolved, obstacles, stage, nameW, compact, ht, band };
  };

  // Fallbacks, in order: the full name budget; narrower budgets; value and status on one row.
  const budgetsWide = useGroups ? [104, 120, 92, 80, 68] : n <= 8 ? [120, 104, 92, 80, 68] : [116, 132, 100, 88, 76, 64];
  const budgets = tall ? [96, 80, 68, 56] : budgetsWide;
  let best = null;
  const ht0 = ht;
  // Last resorts before accepting a broken floor, in order: set the hub's text a step
  // smaller, so the disc can give way — but never past the size the text still fits at;
  // then, when an ARROWHEAD is what the connector cannot hold (two heads on a short
  // spoke, the "bow-tie"), step every band thinner, which shortens every head with it.
  // The flow classes keep their steps; only the scale moves.
  const heady = dirs.some(Boolean);
  outer: for (const band of [1, 0.8, 0.68]) {
    if (band < 1 && !(heady && best.bad.includes('neck'))) break;
    ht = ht0;
    rsMin = Math.max(9, ht.r / HS.HUB_RATIO_MAX);
    for (const hubScale of [1, 0.9, 0.8]) {
      if (hubScale < 1) {
        const smaller = HS.hubFit(model.hub, hubCap * hubScale, { hand });
        if (smaller.overflow) break;
        ht = smaller;
        rsMin = Math.max(9, ht.r / HS.HUB_RATIO_MAX);
      }
      for (const compact of [false, true]) {
        for (const nameW of budgets) {
          for (const coneAt of conesFor(n, tall)) {
            const a = attempt(nameW, compact, band, coneAt);
            // Broken geometry (discs too close, a connector under its floor) is worse than
            // any label that needs a leader, so it scores first.
            const score = a.bad.length * 1000 + a.unresolved * 100;
            if (!best || score < best.score) best = { ...a, score };
            if (!a.unresolved && !a.bad.length) break outer;
          }
        }
      }
    }
  }
  const widthOf = (i) => widthAt(i, best.band);
  return { ...best, W, H, KH, key, n, C, groups, useGroups, dirs, widthOf, hubCap };
}

function hueOf(s, groups, useGroups) {
  if (!useGroups || !s.group) return 0;
  return groups.indexOf(s.group) + 1;
}

function statusAttr(status) {
  return status ? ` data-s="${escAttr(status)}"` : '';
}

/** The slot attributes a filled mark carries: a group hue, or a status, or nothing. */
function paintAttrs(hue, status, encodes) {
  if (status) return `${statusAttr(status)} data-paint="fill" data-encodes="${encodes}"`;
  if (hue) return ` data-hue="${hue}" data-paint="fill" data-encodes="${encodes}"`;
  return '';
}

function buildFlat(model, opts) {
  const L = layoutFlat(model, opts);
  const { W, H, KH, C, groups, useGroups, T, Rh, ht, placed } = L;
  const spokes = model.spokes;
  const necks = [];
  const arrows = [];
  const halos = [];
  const marks = [];
  const icons = [];
  spokes.forEach((s, i) => {
    const [x, y] = T.pts[i];
    const r = T.r[i];
    const hue = hueOf(s, groups, useGroups);
    if (s.icon) icons.push(emitIcon(s, x, y, iconSide(r, s.alarm && C.channel === 'size'), i, `${hue && !s.status ? ` data-hue="${hue}"` : ''}${statusAttr(s.status)}`));
    const w = L.widthOf(i);
    const emph = s.alarm ? ' data-emph="true"' : '';
    const flow = C.channel === 'flow' ? ` data-flow="${C.flowCls[i]}"` : '';
    // The connector keeps its group hue; a status belongs to the node, not the flow.
    necks.push(`<path class="hub-spoke-neck"${paintAttrs(hue, '', 'presence')}${flow} d="${neckPath(0, 0, Rh, x, y, r, w)}"/>`);
    const dir = L.dirs[i];
    const haloOut = s.alarm && C.channel !== 'size' && a0(dir) ? HALO_GAP + HALO_W : 0;
    for (const a of arrowsFor(0, 0, Rh, x, y, r + haloOut, w, dir)) {
      arrows.push(`<path class="hub-spoke-arrow"${hue ? ` data-hue="${hue}"` : ''}${s.alarm ? statusAttr(s.status) : ''} data-dir="${dir}" data-to="${a.to}" d="${a.d}"/>`);
    }
    if (s.alarm) {
      // In `sized`, an outer halo would make a flagged disc look bigger, which is the
      // one thing the size channel must not do — so the ring sits INSIDE the disc there.
      const inner = C.channel === 'size';
      const r0 = inner ? Math.max(1, r - HALO_GAP - HALO_W) : r + HALO_GAP;
      const r1 = inner ? Math.max(2, r - HALO_GAP) : r + HALO_GAP + HALO_W;
      halos.push(`<path class="hub-spoke-halo${inner ? ' hub-spoke-halo--inner' : ''}"${statusAttr(s.status)} fill-rule="evenodd" d="${ring(x, y, r0, r1)}"/>`);
    }
    const clamped = C.channel === 'size' && T.rr[i].clamped ? ' data-clamped="true"' : '';
    const size = C.channel === 'size' ? ` data-size="${f2(r / L.rsMax)}"` : '';
    marks.push(`<path class="hub-spoke-node" data-mark="${i}"${paintAttrs(hue, s.status, 'hue')}${emph} data-label="${escAttr(s.label)}"${s.value ? ` data-value="${escAttr(s.value)}"` : ''}${size}${clamped} data-anima-role="node" d="${circle(x, y, r)}"/>`);
  });
  // An inner halo paints over its own disc, so it has to follow the discs.
  const innerHalo = C.channel === 'size';
  const hub = emitHub(0, 0, Rh, ht, model);
  const texts = [];
  const leaders = [];
  for (const p of placed) {
    const s = p.it.s;
    const hue = hueOf(s, groups, useGroups);
    const attrs = `${hue ? ` data-hue="${hue}"` : ''}${statusAttr(s.status)}${s.alarm ? ' data-emph="true"' : ''}`;
    texts.push(`<g class="hub-spoke-label">${emitLabel(p.it.lb, p.ax, p.R.t, p.anchor, `${attrs} data-mark-for="${p.it.i}"`)}</g>`);
    const l = leaderGeom(p, L.obstacles);
    if (l) leaders.push(leaderSvg(l));
  }
  let body = `<g class="hub-spoke-necks">${necks.join('')}</g>` +
    `<g class="hub-spoke-arrows">${arrows.join('')}</g>` +
    (innerHalo ? '' : `<g class="hub-spoke-halos">${halos.join('')}</g>`) +
    `<g class="hub-spoke-nodes">${marks.join('')}${hub.mark}</g>` +
    (innerHalo ? `<g class="hub-spoke-halos">${halos.join('')}</g>` : '') +
    (icons.some(Boolean) || hub.icon ? `<g class="hub-spoke-icons">${hub.icon}${icons.join('')}</g>` : '') +
    `<g class="hub-spoke-leaders">${leaders.join('')}</g>` +
    `<g class="hub-spoke-labels">${hub.text}${texts.join('')}</g>`;
  if (useGroups) {
    body = `<g transform="translate(0 ${f2(-KH / 2)})">${body}</g>${keyBand(L.key, H)}`;
  }
  return { body, W, H, meta: layoutMeta(L, model) };
}

function a0(dir) { return dir === 'out' || dir === 'both'; }

// The key band: rows of pie-key swatches under the figure, inside the viewBox. It costs
// the figure height but never shrinks the type, which a side rail did (it took 197 of
// 544 units of width and dropped the satellites to r = 9). It wraps to a second row
// rather than overrunning the stage.
const KFS = 9;
const KSW = 9;
const KGAP = 16;
const KROW = 14;
function keyLayout(labels, W, hand, kfs = KFS) {
  if (!labels.length) return { KH: 0, rows: [], kfs };
  const widths = labels.map((g) => KSW + 5 + HS.textWidth(g, kfs, { hand }));
  const rows = [[]];
  let used = 0;
  labels.forEach((g, k) => {
    const need = (rows[rows.length - 1].length ? KGAP : 0) + widths[k];
    if (rows[rows.length - 1].length && used + need > W - 2 * PAD) { rows.push([]); used = 0; }
    rows[rows.length - 1].push({ g, k, w: widths[k] });
    used += (rows[rows.length - 1].length > 1 ? KGAP : 0) + widths[k];
  });
  return { KH: rows.length * (KROW + kfs - KFS) + 4, rows, kfs };
}
function keyBand(key, H) {
  const out = [];
  key.rows.forEach((row, ri) => {
    const total = row.reduce((a, c) => a + c.w, 0) + KGAP * (row.length - 1);
    let x = -total / 2;
    const rowH = KROW + key.kfs - KFS;
    const y = H / 2 - key.KH + 2 + rowH * ri + rowH / 2;
    for (const c of row) {
      out.push(`<rect class="chart-key-swatch" data-hue="${c.k + 1}" data-paint="fill" data-encodes="hue" x="${f2(x)}" y="${f2(y - KSW / 2)}" width="${KSW}" height="${KSW}" rx="1.5"/>` +
        `<text class="chart-key-label" x="${f2(x + KSW + 5)}" y="${f2(y + key.kfs * 0.36)}" font-size="${key.kfs}">${esc(c.g)}</text>`);
      x += c.w + KGAP;
    }
  });
  return `<g class="hub-spoke-key">${out.join('')}</g>`;
}

function emitHub(cx, cy, Rh, ht, model) {
  const value = model.hub.value;
  const mark = `<path class="hub-spoke-hub" data-label="${escAttr(model.hub.label)}"${value ? ` data-value="${escAttr(value)}"` : ''} data-anima-role="node" d="${circle(cx, cy, Rh)}"/>`;
  // The type grows into a roomier disc (never past 1.3×), and never shrinks below the fit.
  const k = ht.overflow ? 1 : Math.min(1.3, Math.max(1, (Rh - 4) / Math.max(1, ht.r - 4)));
  const fsN = ht.fsN * k;
  const ft = ht.ft * Math.min(1.45, k * 1.1);
  // An icon-only hub with no value has nothing else to hold, so its icon fills the disc the
  // layout chose rather than the small row the fit reserved.
  const alone = model.hub.iconOnly && !ht.lines.length && !value;
  const side = !model.hub.icon ? 0 : alone ? Math.max(HS.hubIconSide(fsN), Rh * 0.9) : HS.hubIconSide(fsN);
  const iconH = side ? side + (ht.lines.length || value ? fsN * HS.HUB_ICON_GAP : 0) : 0;
  const blockH = iconH + ht.lines.length * fsN * LH + (value ? ft * 1.05 : 0);
  let y = cy - blockH / 2;
  const icon = side ? emitIcon(model.hub, cx, y + side / 2, side, null, ' data-hub=""') : '';
  y += iconH;
  const name = ht.lines.map((l) => {
    const b = y + fsN * 0.9;
    y += fsN * LH;
    return `<text class="hub-spoke-hub-name" x="${f2(cx)}" y="${f2(b)}" text-anchor="middle" font-size="${f2(fsN)}">${esc(l)}</text>`;
  }).join('');
  const tot = value ? `<text class="hub-spoke-hub-value" x="${f2(cx)}" y="${f2(y + ft * 0.86)}" text-anchor="middle" font-size="${f2(ft)}">${esc(value)}</text>` : '';
  return { mark, text: name + tot, icon };
}

function layoutMeta(L, model) {
  const r = L.T.r;
  const minNeck = Math.min(...L.T.pts.map((p, i) => Math.hypot(p[0], p[1]) - L.Rh - r[i]));
  return {
    tier: 'flat', n: L.n, channel: L.C.channel, Rh: L.Rh, rMax: Math.max(...r), rMin: Math.min(...r),
    ratio: L.Rh / Math.max(...r), minNeck, bad: L.bad, unresolved: L.unresolved, W: L.W, H: L.H,
    hubOverflow: L.ht.overflow, placed: L.placed, obstacles: L.obstacles, stage: L.stage,
    nodes: L.T.pts.map((p, i) => ({ x: p[0], y: p[1], r: r[i], halo: model.spokes[i].alarm ? HALO_GAP + HALO_W : 0 })),
    labelSizes: L.lbs.flatMap((lb) => lb.rows.flatMap((row) => [row.fs, ...row.tails.map((t) => t.fs)])),
    nameW: L.nameW, compact: L.compact, keyShift: L.KH / 2,
  };
}

// ═══════════════ two tiers ═══════════════
/** A branch's key-band text: its name, its value, and its status word. */
function branchKeyText(b) {
  return [b.label, b.value, b.status ? HS.spokenStatus(b.status) : ''].filter(Boolean).join(' ');
}

/** Does this label's name break a word across lines? */
function cutsWord(it) {
  const names = it.lb.rows.filter((r) => r.kind === 'name').map((r) => r.t);
  return names.length > 1 && names.join(' ') !== String(it.s.label || '').trim().split(/\s+/).join(' ');
}

// The branch ring as a fraction of the leaf ring, [x, y]: the usual proportion first.
const BRANCH_RINGS = [[0.52, 0.62], [0.58, 0.66], [0.64, 0.7], [0.7, 0.74]];

function layoutTiered(model, opts, keyed = false, prefer = null) {
  const { hand } = opts;
  const { W, H } = stageFor(opts.orientation);
  const br = model.spokes;
  const nb = br.length;
  const mods = model.mods;
  // Keyed: the branch names move into a key band under the figure (the branch IS the
  // group), the fallback when a crowded figure leaves no lane beside a branch disc.
  const small = W / H < 2 ? TALL_SMALL : undefined;
  const key = keyLayout(keyed ? model.spokes.map(branchKeyText) : [], W, hand, small);
  const KH = key.KH;
  const half = (H - KH) / 2 - PAD;
  const rb = HS.TIER_BRANCH_R;
  const rl = 7;
  const wb = 7;
  const wl = 4;
  const hubCap = Math.min(HS.hubCeiling(nb, { tiered: true, stage: stageName(opts.orientation) }), half - 8);
  const haloL = HALO_GAP * 0.75 + HALO_W * 0.8;
  const haloB = (b) => (b.alarm ? HALO_GAP + HALO_W : 0);
  const SPACINGS = W / H < 2 ? ['angle', 'arc'] : ['arc', 'angle'];
  const keyable = !keyed && nb <= HS.LIMITS.groups;
  const heads = (dir) => (!dir ? 0 : dir === 'both' ? 2 : 1);
  // The floors each connector must keep, arrowheads and halos included — the flat rule
  // (a head needs its own length plus a stub of band behind it), at the tiered widths.
  const needB = br.map((b) => Math.max(TIER_NECK, heads(HS.directionOf(b, mods)) * headLen(wb) + 10) + haloB(b));
  const needL = br.map((b) => b.leaves.map((l) => Math.max(TWIG_NECK, heads(l.dir) * headLen(wl) + 6) + (l.alarm ? haloL : 0) + haloB(b)));
  // The hub ladder, largest first: the preferred disc for this text; the same text in
  // the smallest disc it fits (never under HUB_RATIO_MIN × the branch); then the text a
  // step smaller, while it still fits without cutting. The first rung whose connectors
  // all keep their floors wins, so the hub gives way before a branch touches it.
  const hubLadder = [];
  const wholeWords = (t) => t.lines.join(' ') === String(model.hub.label || '').trim().split(/\s+/).join(' ');
  const hubWhole = wholeWords(HS.hubFit(model.hub, hubCap, { hand }));
  for (const scale of [1, 0.9, 0.8]) {
    const t = HS.hubFit(model.hub, hubCap * scale, { hand });
    // A smaller disc is never bought by cutting the hub's name mid-word ("networ / k").
    if (scale < 1 && (t.overflow || (hubWhole && !wholeWords(t)))) break;
    const floor = Math.max(HS.HUB_RATIO_MIN * rb, t.r);
    const top = Math.min(HS.HUB_RATIO_MAX * rb, Math.max(floor, 34));
    for (const k of [0, 0.5, 1]) {
      const Rh = top - (top - floor) * k;
      if (!hubLadder.some((h) => Math.abs(h.Rh - Rh) < 0.25)) hubLadder.push({ Rh, ht: t });
    }
  }
  // Leaves take global slots in two wings; a gap separates branches; cones at 12 and 6.
  // Trama places the two rings and checks every floor; the ladder rungs carry the hub's
  // text fit through the search untouched.
  const GAPS = 1.2;
  const rings = K().twoRings({
    counts: br.map((b) => b.leaves.length), gaps: GAPS, rIn: rb, rOut: rl,
    haloIn: br.map(haloB), haloOut: br.map((b) => b.leaves.map((l) => (l.alarm ? haloL : 0))),
    floorIn: needB, floorOut: needL, gapIn: 6, gapOut: 2,
  });
  const ladder = hubLadder.map((h) => ({ R: h.Rh, ...h }));

  // The arrangement and the leaf labels depend on the leaf budget, the fold and the cone
  // only — the branch budget touches nothing but the branch names — so each is solved
  // once per (leafW, compact, EXT) and reused across the branch budgets.
  const arrangements = new Map();
  const arrangementFor = (leafW, compact, EXT) => {
    const k = `${leafW}|${compact}|${EXT}`;
    if (arrangements.has(k)) return arrangements.get(k);
    const lbl = br.map((b) => b.leaves.map((l) => blockFor(l, leafW, { hand, alarm: l.alarm, compact, fss: small })));
    const maxLw = Math.max(0, ...lbl.flat().map((l) => l.w));
    const RYo = half - rl - haloL - 1;
    const RXo = Math.max(RYo * 0.9, Math.min(RYo * 2.3, W / 2 - PAD - rl - haloL - 5 - maxLw));
    // The branch ring at its usual proportion of the leaf ring and the largest hub whose
    // connectors all keep their floors; then the same ring with the hub stepping down;
    // then a wider branch ring (branches crowding each other in a short wing, the keyed
    // figure's usual trouble), which shortens the twigs. Failing all of them, the
    // arrangement that breaks the fewest floors — reported in meta.bad.
    const found = rings.search(EXT, RXo, RYo, ladder, BRANCH_RINGS, SPACINGS);
    const ours = (g) => g && { ...g, bad: ourFloors(g.bad) };
    const out = { lbl, G: ours(found.G), lean: ours(found.lean), leaves: new Map() };
    arrangements.set(k, out);
    return out;
  };

  // `bound` is the best score so far: an attempt that provably cannot beat it (broken
  // floors against a clean best, or more leaf misses than the best has in all) stops
  // there, which changes no choice — it only skips work whose result would be discarded.
  const attempt = (leafW, compact, EXT, branchW, bound) => {
    const A = arrangementFor(leafW, compact, EXT);
    const first = place(A, A.G, compact, branchW, bound);
    if (!first.unresolved || !A.lean) return { ...first, leafW, compact, EXT, branchW };
    const second = place(A, A.lean, compact, branchW, Math.min(bound, first.score));
    return { ...(second.score < first.score ? second : first), leafW, compact, EXT, branchW };
  };

  /** Place every label on one arrangement, leaves first, and score it. */
  const place = (A, G, compact, branchW, bound) => {
    const { geo, Rh, ht, bad } = G;
    if (bad.length * 1000 >= bound) return { score: Infinity };
    const lbl = A.lbl;
    const obstacles = [{ kind: 'circle', x: 0, y: 0, r: Rh, self: 'hub' }];
    const items = [];
    br.forEach((b, i) => {
      const { x: bx, y: by } = geo[i];
      const bid = `b${i}`;
      const bh = haloB(b);
      obstacles.push({ kind: 'seg', x0: 0, y0: 0, x1: bx, y1: by, w: wb, self2: `${bid}n` });
      obstacles.push({ kind: 'circle', x: bx, y: by, r: rb + bh, node: bid });
      b.leaves.forEach((l, j) => {
        const { x: lx, y: ly } = geo[i].children[j];
        const lid = `l${i}-${j}`;
        const lh = l.alarm ? haloL : 0;
        obstacles.push({ kind: 'seg', x0: bx, y0: by, x1: lx, y1: ly, w: wl, self2: lid });
        obstacles.push({ kind: 'circle', x: lx, y: ly, r: rl + lh, node: lid });
        if (!l.iconOnly) items.push({ id: lid, cx: lx, cy: ly, ox: bx, oy: by, r: rl + lh, side: lx >= 0 ? 1 : -1, lb: lbl[i][j], prio: (l.alarm ? 1000 : 50) + Math.abs(ly), s: l, bi: i, li: j, tier: 'leaf' });
      });
      if (b.iconOnly) return;
      const lb = labelBlock(b, branchW, { hand, alarm: b.alarm, compact, fss: small });
      items.push({ id: bid, cx: bx, cy: by, r: rb + bh, side: bx >= 0 ? 1 : -1, lb, prio: 10, s: b, bi: i, tier: 'branch', branch: true, crowded: true, neck: { x0: 0, y0: 0 } });
    });
    const stage = { l: -W / 2 + PAD / 2, r: W / 2 - PAD / 2, t: -H / 2 + 1 + KH / 2, b: H / 2 - 1 - KH / 2 };
    const leafItems = items.filter((it) => !it.branch);
    stage.colR = leafItems.some((it) => it.side > 0) ? Math.max(...leafItems.filter((it) => it.side > 0).map((it) => it.cx + it.r)) + 6 : 0;
    stage.colL = leafItems.some((it) => it.side < 0) ? Math.min(...leafItems.filter((it) => it.side < 0).map((it) => it.cx - it.r)) - 6 : 0;
    // Leaves first (they own the rim); then branch names into whatever lane is left. The
    // leaf pass does not depend on the branch budget, so it is placed once per arrangement
    // (copied, because the final re-score below writes each label's hits).
    if (!A.leaves.has(G)) A.leaves.set(G, placeLabels(leafItems, obstacles, stage));
    const p1c = A.leaves.get(G);
    const p1 = { placed: p1c.placed.map((q) => ({ ...q, it: leafItems.find((it) => it.id === q.it.id) })) };
    // A leaf that collides here still collides once the branch names are placed (every
    // hit it counted is still there, and more labels only add hits), so its misses are a
    // floor under this attempt's score.
    const leafMiss = p1.placed.filter((q) => q.hits).length;
    if (bad.length * 1000 + leafMiss * 100 >= bound) return { score: Infinity };
    const branchObs = obstacles.concat(p1.placed.map((q) => ({ kind: 'rect', R: q.R })));
    const p2 = keyed ? { placed: [] } : placeLabels(items.filter((it) => it.branch), branchObs, { ...stage, colR: null, prePlaced: p1.placed });
    const placed = p1.placed.concat(p2.placed);
    for (const q of placed) q.hits = scorePlaced(q, placed, obstacles, stage);
    const unresolved = placed.filter((q) => q.hits).length;
    // A branch name that finds no lane is the one miss the key band can still fix (the
    // keyed retry in buildTiered), so it costs less than a leaf label that does not fit.
    const branchMiss = placed.filter((q) => q.hits && q.it.branch).length;
    // A name cut mid-word ("Distributio / n") is legal but ugly, so it costs more than a
    // branch name the key band can take, and a layout that keeps every word whole wins.
    const cut = placed.filter((q) => cutsWord(q.it)).length;
    const score = bad.length * 1000 + (unresolved - branchMiss) * 100 + branchMiss * (keyable ? 10 : 100) + cut * 30;
    return { geo, placed, unresolved, obstacles, stage, bad, Rh, ht, score };
  };
  // Fallbacks, in order: full leaf budget with value and status folded onto the name's
  // line; wider and narrower budgets; a different cone at 12 and 6 o'clock; unfolded rows.
  // `prefer` (the keyed retry) tries the unkeyed search's best settings first, so a key
  // band that fixes the branch names usually costs one attempt, not the whole search.
  const tries = [];
  for (const EXT of [0.5, 0.36, 0.64]) {
    for (const compact of [true, false]) {
      for (const [leafW, branchW] of [[84, 70], [84, 50], [100, 60], [72, 44]]) tries.push([leafW, compact, EXT, branchW]);
    }
  }
  // Last, a narrower leaf budget (names wrap to two lines): the room it frees beside the
  // leaves widens the leaf ring, which is what a tall stage runs out of when a flagged
  // branch needs its halo on both sides of its disc.
  for (const EXT of [0.5, 0.36, 0.64]) for (const [leafW, branchW] of [[60, 44], [48, 40]]) tries.push([leafW, true, EXT, branchW]);
  if (prefer) tries.unshift([prefer.leafW, prefer.compact, prefer.EXT, prefer.branchW]);
  let best = null;
  let tried = 0;
  for (const t of tries) {
    const a = attempt(...t, best ? best.score : Infinity);
    tried++;
    if (!best || a.score < best.score) best = a;
    if (!a.score) break;
  }
  return { W, H, KH, key, keyed, rb, rl, wb, wl, haloL, ...best, tried };
}

function buildTiered(model, opts) {
  let L = layoutTiered(model, opts, false);
  let attempts = L.tried;
  if (L.unresolved && L.placed.some((q) => q.hits && q.it.branch) && model.spokes.length <= HS.LIMITS.groups) {
    const keyedL = layoutTiered(model, opts, true, L);
    attempts += keyedL.tried;
    if (keyedL.score < L.score) L = keyedL;
  }
  const { W, H, Rh, rb, rl, wb, wl, geo, haloL } = L;
  const br = model.spokes;
  const mods = model.mods;
  const necks = [];
  const arrows = [];
  const halos = [];
  const marks = [];
  const icons = [];
  let mark = 0;
  // Every mark is numbered in reading order: branch, then its leaves.
  const markOf = [];
  br.forEach((b, i) => {
    const hue = br.length <= HS.LIMITS.groups ? i + 1 : 0;
    const { x: bx, y: by } = geo[i];
    const bm = mark++;
    markOf.push({ b: bm, leaves: [] });
    const dir = HS.directionOf(b, mods);
    necks.push(`<path class="hub-spoke-neck"${paintAttrs(hue, '', 'presence')} d="${neckPath(0, 0, Rh, bx, by, rb, wb)}"/>`);
    for (const a of arrowsFor(0, 0, Rh, bx, by, rb + (b.alarm && a0(dir) ? HALO_GAP + HALO_W : 0), wb, dir)) {
      arrows.push(`<path class="hub-spoke-arrow"${hue ? ` data-hue="${hue}"` : ''}${b.alarm ? statusAttr(b.status) : ''} data-dir="${dir}" data-to="${a.to}" d="${a.d}"/>`);
    }
    if (b.alarm) halos.push(`<path class="hub-spoke-halo"${statusAttr(b.status)} fill-rule="evenodd" d="${ring(bx, by, rb + HALO_GAP, rb + HALO_GAP + HALO_W)}"/>`);
    if (b.icon) icons.push(emitIcon(b, bx, by, iconSide(rb, false), bm, `${hue && !b.status ? ` data-hue="${hue}"` : ''}${statusAttr(b.status)}`));
    marks.push(`<path class="hub-spoke-node hub-spoke-branch" data-mark="${bm}"${paintAttrs(hue, b.status, 'hue')}${b.alarm ? ' data-emph="true"' : ''} data-label="${escAttr(b.label)}"${b.value ? ` data-value="${escAttr(b.value)}"` : ''} data-anima-role="node" d="${circle(bx, by, rb)}"/>`);
    b.leaves.forEach((l, j) => {
      const { x: lx, y: ly } = geo[i].children[j];
      const lm = mark++;
      markOf[i].leaves.push(lm);
      const ldir = l.dir;
      necks.push(`<path class="hub-spoke-twig"${paintAttrs(hue, '', 'presence')} d="${neckPath(bx, by, rb, lx, ly, rl, wl)}"/>`);
      for (const a of arrowsFor(bx, by, rb, lx, ly, rl + (l.alarm && a0(ldir) ? haloL : 0), wl, ldir)) {
        arrows.push(`<path class="hub-spoke-arrow"${hue ? ` data-hue="${hue}"` : ''}${l.alarm ? statusAttr(l.status) : ''} data-dir="${ldir}" data-to="${a.to === 'hub' ? 'branch' : 'leaf'}" d="${a.d}"/>`);
      }
      if (l.alarm) halos.push(`<path class="hub-spoke-halo"${statusAttr(l.status)} fill-rule="evenodd" d="${ring(lx, ly, rl + HALO_GAP * 0.75, rl + haloL)}"/>`);
      if (l.icon) icons.push(emitIcon(l, lx, ly, iconSide(rl, false), lm, `${hue && !l.status ? ` data-hue="${hue}"` : ''}${statusAttr(l.status)}`));
      marks.push(`<path class="hub-spoke-leaf" data-mark="${lm}"${paintAttrs(hue, l.status, 'hue')}${l.alarm ? ' data-emph="true"' : ''} data-label="${escAttr(l.label)}"${l.value ? ` data-value="${escAttr(l.value)}"` : ''} data-anima-role="node" d="${circle(lx, ly, rl)}"/>`);
    });
  });
  const hub = emitHub(0, 0, Rh, L.ht, model);
  const texts = [];
  const leaders = [];
  for (const p of L.placed) {
    const it = p.it;
    const s = it.s;
    const hue = br.length <= HS.LIMITS.groups ? it.bi + 1 : 0;
    const attrs = `${hue ? ` data-hue="${hue}"` : ''} data-tier="${it.tier}"${statusAttr(s.status)}${s.alarm ? ' data-emph="true"' : ''}`;
    const forMark = it.tier === 'branch' ? markOf[it.bi].b : markOf[it.bi].leaves[it.li];
    texts.push(`<g class="hub-spoke-label">${emitLabel(it.lb, p.ax, p.R.t, p.anchor, `${attrs} data-mark-for="${forMark}"`)}</g>`);
    const l = leaderGeom(p, L.obstacles);
    if (l) leaders.push(leaderSvg(l));
  }
  let body = `<g class="hub-spoke-necks">${necks.join('')}</g><g class="hub-spoke-arrows">${arrows.join('')}</g>` +
    `<g class="hub-spoke-halos">${halos.join('')}</g><g class="hub-spoke-nodes">${marks.join('')}${hub.mark}</g>` +
    (icons.some(Boolean) || hub.icon ? `<g class="hub-spoke-icons">${hub.icon}${icons.join('')}</g>` : '') +
    `<g class="hub-spoke-leaders">${leaders.join('')}</g><g class="hub-spoke-labels">${hub.text}${texts.join('')}</g>`;
  if (L.keyed) body = `<g transform="translate(0 ${f2(-L.KH / 2)})">${body}</g>${keyBand(L.key, H)}`;
  const meta = {
    tier: 'tiered', keyed: L.keyed, attempts, n: br.length, channel: 'none', Rh, rMax: rb, rMin: rl, ratio: Rh / rb, unresolved: L.unresolved,
    W, H, hubOverflow: L.ht.overflow, placed: L.placed, obstacles: L.obstacles, stage: L.stage, bad: L.bad,
    nodes: geo.flatMap((g, i) => [{ x: g.x, y: g.y, r: rb, halo: br[i].alarm ? HALO_GAP + HALO_W : 0, tier: 'branch' },
      ...g.children.map((q, j) => ({ x: q.x, y: q.y, r: rl, halo: br[i].leaves[j].alarm ? haloL : 0, tier: 'leaf', px: g.x, py: g.y, pr: rb }))]),
    labelSizes: L.placed.flatMap((p) => p.it.lb.rows.flatMap((row) => [row.fs, ...row.tails.map((t) => t.fs)])), keyShift: L.KH / 2,
  };
  return { body, W, H, meta, markOf };
}

// ── Accessible name and description ───────────────────────────────────────────
function spokeWords(s, mods, withDir = true) {
  const dir = withDir ? HS.directionOf(s, mods) : s.dir;
  const flow = dir === 'out' ? 'flowing out' : dir === 'in' ? 'flowing in' : dir === 'both' ? 'flowing both ways' : '';
  return [s.label, s.value, s.status ? HS.spokenStatus(s.status) : '', s.group, flow].filter(Boolean).join(', ');
}

function describe(model) {
  const { hub, spokes, mods } = model;
  const head = `${hub.label}${hub.value ? `, ${hub.value}` : ''}`;
  const C = HS.channelOf(model);
  const frame = C.channel === 'size' ? ' Disc area shows each value.'
    : C.channel === 'flow' ? ` Connector weight shows each value, in ${HS.FLOW_STEPS} steps.` : '';
  const cls = mods.flow ? ` Flow runs ${mods.flow === 'both' ? 'both ways' : mods.flow === 'out' ? 'out from the hub' : 'in to the hub'}.` : '';
  if (mods.tiered) {
    // Lead with the structure's takeaway — how the hub divides, which branch carries the
    // most, what is flagged — and only then walk every branch and its leaves.
    const total = spokes.reduce((a, b) => a + b.leaves.length, 0);
    const most = Math.max(0, ...spokes.map((b) => b.leaves.length));
    const top = spokes.filter((b) => b.leaves.length === most);
    const largest = most && top.length === 1 && spokes.length > 1 ? ` ${top[0].label} is the largest, with ${most} ${most === 1 ? 'leaf' : 'leaves'}.` : '';
    const flagged = [...spokes, ...spokes.flatMap((b) => b.leaves)].filter((x) => x.alarm);
    const flags = flagged.length ? ` Flagged: ${flagged.map((x) => `${x.label} (${HS.spokenStatus(x.status)})`).join(', ')}.` : '';
    const parts = spokes.map((b) => {
      const leaves = b.leaves.map((l) => spokeWords(l, { flow: '' })).join('; ');
      return `${spokeWords(b, mods)}${leaves ? ` — ${leaves}` : ''}`;
    });
    return `${head} divides into ${spokes.length} ${spokes.length === 1 ? 'branch' : 'branches'} with ${total} ${total === 1 ? 'leaf' : 'leaves'} in all.${largest}${flags}${cls} ${parts.join('. ')}.`;
  }
  return `${head}, connected to ${spokes.length} ${spokes.length === 1 ? 'spoke' : 'spokes'}.${cls}${frame} ${spokes.map((s) => spokeWords(s, mods)).join('; ')}.`;
}

// ── Entry points ─────────────────────────────────────────────────────────────
/**
 * Lay out a model. Exported for the unit tests, which assert the invariants on the
 * geometry itself (overlaps, neck floor, hub ceiling) rather than on the SVG string.
 */
function layoutHubSpoke(model, opts = {}) {
  // An icon the host cannot draw (plugin off, data not here) is dropped before anything is
  // measured, so no fit reserves room for a drawing that will not come.
  withDrawings(model, opts.off || null);
  return model.mods.tiered ? buildTiered(model, opts) : buildFlat(model, opts);
}

function buildHubSpoke(model, opts = {}) {
  const out = layoutHubSpoke(model, opts);
  const { W, H } = out;
  const leafCount = model.spokes.reduce((a, b) => a + (b.leaves || []).length, 0);
  const title = model.mods.tiered
    ? `${model.hub.label || 'Hub'}: ${model.spokes.length} ${model.spokes.length === 1 ? 'branch' : 'branches'}, ${leafCount} ${leafCount === 1 ? 'leaf' : 'leaves'}`
    : `${model.hub.label || 'Hub'}: hub and ${model.spokes.length} spokes`;
  const svg = `<svg class="hub-spoke-svg" viewBox="${f2(-W / 2)} ${f2(-H / 2)} ${f2(W)} ${f2(H)}" preserveAspectRatio="xMidYMid meet" role="img">` +
    `<title>${esc(title)}</title><desc>${esc(describe(model))}</desc>${ariaHiddenMarks(out.body)}</svg>`;
  // Per-mark detail: flat satellites carry theirs; tiered leaves carry theirs.
  const detailMarks = [];
  if (model.mods.tiered) {
    model.spokes.forEach((b, i) => {
      detailMarks[out.markOf[i].b] = { label: b.label, valueRaw: b.value, detail: '' };
      b.leaves.forEach((l, j) => { detailMarks[out.markOf[i].leaves[j]] = { label: l.label, valueRaw: l.value, detail: l.detail }; });
    });
  } else {
    model.spokes.forEach((s, i) => { detailMarks[i] = { label: s.label, valueRaw: s.value, detail: s.detail }; });
  }
  const html = `<div class="hub-spoke-figure">${svg}${markDetail.detailPayload(detailMarks)}</div>${markDetail.detailNote(detailMarks)}`;
  return { html, meta: out.meta };
}

/** Parse the section's first list into the shared model. */
function parseHubSpoke(ulInner, classTokens, off = null) {
  const tiered = (classTokens || []).includes('tiered');
  return HS.buildModel(htmlTree(ulInner, tiered), classTokens, { off });
}

function transformSection(html, ctx) {
  const hand = ctx.classTokens.includes('sketch');
  return spliceFirstList(html, (ext) => {
    const off = ctx.pluginsOff || null;
    const model = parseHubSpoke(ext.inner, ctx.classTokens, off);
    if (!model?.spokes.length) return null;
    return buildHubSpoke(model, { orientation: ctx.orientation, hand, off }).html;
  });
}

module.exports = {
  transformSection, parseHubSpoke, buildHubSpoke, layoutHubSpoke, htmlTree, describe,
  STAGES, MIN_NECK, TIER_NECK, TWIG_NECK, FS, FSS, TALL_SMALL, FLOW_W, stageName,
  // For the unit tests' geometry probes. A getter, so loading this module still loads no kernel.
  get __geometry() {
    const k = K();
    return { rectHitsCircle: k.rectHitsCircle, rectHitsSeg: k.rectHitsSeg, rectHitsRect: k.rectHitsRect, segDist: k.segDist, leaderGeom };
  },
};
