/**
 * state-chart — the browser half, as a Trama adapter (state chart v2).
 *
 * Trama (`@laticent/trama`, docs/src/lib/trama/) owns the pipeline every graph chart
 * shares: the redraw signature, the fit and the type floor, the live layout in a worker,
 * the SVG write and the observers; and its kernel lays the machine out, with the
 * reading-order grid (`wrap`) as a candidate beside dagre, so a chain wraps into rows in
 * reading order and needs no dagre at all
 * (engineering/decisions/2026-09-27-trama-graph-chart-library.md §4-§5). Lines, their
 * heads and labels and the composite boxes are painted by Trama's shared painters
 * (`ctx.lines`, `ctx.groups`), the flowchart's house style. This file is what is the
 * state chart's own:
 *   - which figures it draws and where their parts are;
 *   - reading and sanitizing `data-sc-model` (HARD RULE #22);
 *   - the machine's entry and end markers, added to the kernel's input as two small
 *     shapes and the lines that reach them;
 *   - measuring its harness (tiles with their badges, transition labels, composite
 *     titles) into the kernel's input;
 *   - painting its tiles: the chart family's gradient fill, the status accent, the end
 *     state's ring, the badge and the name.
 *
 * `stateChartAdapter` ships as source: the CLI export serializes it with `.toString()`
 * into the bootstrap `<script>` (`browserJs` below). So it closes over NOTHING outside its
 * body; what it needs from Trama arrives on the context the pipeline hands it.
 */
function stateChartAdapter() {
  /**
   * The model is UNTRUSTED. The server writes it, but a deck can forge a
   * `.state-chart-figure[data-sc-model]` in raw HTML, and `data-*` attributes survive the
   * slide sanitizer, so this pass runs AFTER every guard (HARD RULE #22, the post-sanitize
   * shape). Every structural field is rebuilt from a closed set or an integer range; a
   * value outside it is dropped, never passed on. Author text (names, labels, ids) stays
   * text and is escaped where it is painted.
   */
  function sanitizeModel(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.states)) return null;
    const SHAPE_SET = ['box', 'square', 'pill', 'diamond', 'circle', 'cylinder', 'io', 'doc'];
    const STATUS_SET = ['on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred'];
    const HEAD_SET = ['open', 'dot', 'cross'];
    const PATTERN_SET = ['dashed', 'dotted'];
    const DIR_SET = ['out', 'in', 'both', 'none'];
    const str = (v) => (typeof v === 'string' ? v.slice(0, 400) : typeof v === 'number' ? String(v) : '');
    const slot = (v) => (Number.isInteger(v) && v >= 1 && v <= 8 ? v : undefined);
    const pick = (v, set) => (set.includes(v) ? v : undefined);
    const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
    // The synthetic markers own these ids; a forged state may not take them.
    const own = (id) => id && id !== 'sc-start' && id !== 'sc-end';
    const shapes = raw.states.slice(0, 500).map((x, i) => clean({
      id: str(x?.id), name: str(x?.name), parent: x?.parent == null ? null : str(x.parent),
      index: i + 1, shape: pick(x?.shape, SHAPE_SET) || 'box', status: pick(x?.status, STATUS_SET),
      start: x?.start === true ? true : undefined, end: x?.end === true ? true : undefined,
      slot: slot(x?.slot), fill: slot(x?.fill), border: slot(x?.border), text: slot(x?.text),
      // An icon is a name in the set's own spelling; the DRAWING is read from the harness and
      // rebuilt by Trama's `drawing` (a closed vocabulary), never from the model.
      icon: typeof x?.icon === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x.icon) ? x.icon : undefined,
      iconOnly: x?.iconOnly === true && typeof x?.icon === 'string' ? true : undefined,
    })).filter((x) => own(x.id));
    const groups = (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 200).map((x) => clean({
      id: str(x?.id), name: str(x?.name), parent: x?.parent == null ? null : str(x.parent), slot: slot(x?.slot),
    })).filter((x) => own(x.id));
    const edges = (Array.isArray(raw.edges) ? raw.edges : []).slice(0, 2000).map((x) => clean({
      from: str(x?.from), to: str(x?.to), dir: pick(x?.dir, DIR_SET) || 'out',
      label: x?.label ? str(x.label) : undefined, heavy: x?.heavy === true ? true : undefined, back: x?.back === true ? true : undefined,
      style: clean({ slot: slot(x?.style?.slot), pattern: pick(x?.style?.pattern, PATTERN_SET), head: pick(x?.style?.head, HEAD_SET), loose: x?.style?.loose === true ? true : undefined }),
    })).filter((x) => own(x.from) && own(x.to));
    return { shapes, groups, edges, badges: raw.badges !== false };
  }

  // The status word -> tone table (graph-key.js and the stylesheet's status table are the
  // other statements of it; a unit test holds them equal).
  const STATUS_TONE = {
    'on-track': 'pass', done: 'pass',
    live: 'info', pilot: 'info', decision: 'info',
    'at-risk': 'warn', warn: 'warn',
    blocked: 'fail', fail: 'fail',
    deferred: 'mute',
  };
  // The markers' sizes, in layout units: a dot, and a ring around a dot.
  const START = 14;
  const END = 20;

  /**
   * THE KERNEL'S INPUT, from the sanitized model. The machine's MARKERS join the layout as
   * two small shapes: the entry dot before the first state, in reading order, with a line to
   * the start state, and the end ring after the last, with a line from every end state.
   * They are shapes like any other, so the router keeps every line off them and the grid
   * reads them in order. The export's dagre gate asks Trama `isChain` of exactly this
   * (state-chart.adoption.js), so the gate and the drawing cannot disagree.
   */
  function kernelModel(model) {
    const shapes = [];
    const edges = model.edges.slice();
    const start = model.shapes.find((s) => s.start);
    const ends = model.shapes.filter((s) => s.end);
    if (start) {
      shapes.push({ id: 'sc-start', name: '', parent: start.parent || null, shape: 'start' });
      edges.push({ from: 'sc-start', to: start.id, dir: 'out', style: {} });
    }
    for (const s of model.shapes) shapes.push(s);
    if (ends.length) {
      shapes.push({ id: 'sc-end', name: '', parent: ends.length === 1 ? ends[0].parent || null : null, shape: 'end' });
      for (const s of ends) edges.push({ from: s.id, to: 'sc-end', dir: 'out', style: {} });
    }
    return { shapes, groups: model.groups || [], edges };
  }

  // A theme switch changes the type and padding without changing a size, so the first
  // tile's, badge's and label's computed font and box join the signature.
  const styleSig = (el) => {
    if (!el) return '';
    try { const c = getComputedStyle(el); return [c.font, c.letterSpacing, c.padding, c.borderWidth, c.lineHeight].join(','); } catch (_e) { return ''; }
  };
  const fontOf = (el, S, dflt) => {
    try { return Number.parseFloat(getComputedStyle(el).fontSize) / S || dflt; } catch (_e) { return dflt; }
  };

  return {
    // Not part of Trama's adapter contract: the export's dagre gate reads these in Node.
    sanitize: sanitizeModel,
    kernelModel,
    selector: '.state-chart-figure[data-sc-model]',
    figure: '.state-chart-figure',
    attr: 'sc',
    parts(fig) {
      const box = fig.querySelector('.state-chart-scale');
      const harness = fig.querySelector('.sc-harness');
      const svg = fig.querySelector('svg.state-chart-edges');
      if (!box || !harness || !svg) return null;
      return { box, harness, svg, port: fig.querySelector('.sc-canvas') || fig };
    },
    readModel(fig) {
      return sanitizeModel(JSON.parse(fig.getAttribute('data-sc-model') || ''));
    },
    signature(fig, harness) {
      return [fig.getAttribute('data-sc-model'), fig.getAttribute('data-sc-dir'), fig.getAttribute('data-sc-style'), fig.getAttribute('data-sc-badges'),
        styleSig(harness.querySelector('.state-node')), styleSig(harness.querySelector('.state-index')), styleSig(harness.querySelector('.sc-elabel'))];
    },
    measure(model, ctx) {
      const { fig, harness, S, rectL, textLines, grow, drawing } = ctx;
      const sizes = Object.create(null);
      const tiles = Object.create(null);
      for (const el of harness.querySelectorAll('.state-node[data-id]')) {
        const id = el.getAttribute('data-id');
        const r = rectL(el);
        const kind = el.getAttribute('data-shape') || 'box';
        const g = grow(kind, r.width / S, r.height / S);
        sizes[id] = { w: g.w, h: g.h, tw: r.width / S, th: r.height / S, kind };
        // The name and the badge are painted where the tile put them, relative to its
        // center and its top-right corner, so a tile the kernel grows keeps them in place.
        const t = { lines: [], font: 15, dx: 0, dy: 0, lh: 18 };
        const lab = el.querySelector('.state-label');
        if (lab) {
          const lr = rectL(lab);
          t.lines = textLines(lab);
          t.font = fontOf(lab, S, 15);
          t.dx = (lr.left + lr.width / 2 - (r.left + r.width / 2)) / S;
          t.dy = (lr.top + lr.height / 2 - (r.top + r.height / 2)) / S;
          t.lh = lr.height / S / Math.max(1, t.lines.length);
        }
        const bd = el.querySelector('.state-index');
        if (bd) {
          const br = rectL(bd);
          t.badge = { text: String(bd.textContent || '').trim(), font: fontOf(bd, S, 9), right: (r.right - br.right) / S, cy: (br.top + br.height / 2 - r.top) / S };
        }
        // An icon: the drawing, and where the tile put it relative to its center, as for the name.
        const iconEl = el.querySelector('.graph-icon');
        const shapes = iconEl ? drawing(iconEl.querySelector('svg')) : '';
        if (shapes) {
          const ir = rectL(iconEl);
          t.icon = {
            shapes, size: ir.width / S,
            x: (ir.left - (r.left + r.width / 2)) / S, y: (ir.top - (r.top + r.height / 2)) / S,
          };
        }
        tiles[id] = t;
      }
      const labelSizes = Object.create(null);
      let labelFont = 12;
      for (const el of harness.querySelectorAll('.sc-elabel[data-edge]')) {
        const r = rectL(el);
        labelSizes[+el.getAttribute('data-edge')] = { w: r.width / S + 6, h: r.height / S };
        labelFont = fontOf(el, S, labelFont);
      }
      const groupTitleSizes = Object.create(null);
      let titleFont = 11;
      for (const el of harness.querySelectorAll('.sc-gtitle[data-group]')) {
        const r = rectL(el);
        groupTitleSizes[el.getAttribute('data-group')] = { w: r.width / S, h: r.height / S };
        titleFont = fontOf(el, S, titleFont);
      }
      const km = kernelModel(model);
      if (km.shapes[0]?.id === 'sc-start') sizes['sc-start'] = { w: START, h: START, kind: 'start' };
      if (km.shapes[km.shapes.length - 1]?.id === 'sc-end') sizes['sc-end'] = { w: END, h: END, kind: 'end' };
      const { shapes, edges } = km;
      const port = fig.querySelector('.sc-canvas') || fig;
      const view = rectL(port);
      const pinned = fig.getAttribute('data-sc-dir');
      const titleH = Object.values(groupTitleSizes).reduce((m, z) => Math.max(m, z.h), 12);
      const args = [{ shapes, groups: model.groups || [], edges }, sizes, {
        dir: pinned === 'lr' || pinned === 'tb' ? pinned : undefined,
        wrap: true,
        ...(fig.getAttribute('data-sc-order') === 'graph' ? { order: 'graph' } : {}),
        labelSizes,
        groupTitleSizes,
        stage: { w: view.width / S, h: view.height / S },
        maxScale: ctx.maxScale,
        spacing: { node: 30, rank: 58, edge: 14, groupPad: 14, groupPadTop: titleH + 16 },
      }];
      return { args, sizes, tiles, labelFont, titleFont, edges, curved: fig.getAttribute('data-sc-style') === 'curved' };
    },
    paint(model, m, geo, ctx) {
      const { r1, esc, outline, doc, fig } = ctx;
      const { sizes, tiles, labelFont, titleFont, edges, curved } = m;
      const parts = [];

      // THE TILE FILL is the chart family's canonical gradient, which SVG `fill` cannot
      // take from CSS, so it is emitted here: one ramp per paint present, ids unique to
      // this figure. A neutral tile and a slot take the family's fill ramp; a STATUS tile
      // takes the pill's stops (18/30 light, 42/54 dark), the AA-vetted recipe for text
      // on a status tint, the same four literals the stylesheet's status rule sets.
      let n = 0;
      for (const f of doc.querySelectorAll('.state-chart-figure')) { if (f === fig) break; n++; }
      const gid = `sc-fill-${n}`;
      const ramp = (id, hue) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" style="stop-color:light-dark(color-mix(in oklab, var(${hue}) var(--chart-fill-top-l), var(--bg)),color-mix(in oklab, var(${hue}) var(--chart-fill-top-d), black))"/>` +
        `<stop offset="100%" style="stop-color:light-dark(color-mix(in oklab, var(${hue}) var(--chart-fill-bottom-l), var(--bg)),color-mix(in oklab, var(${hue}) var(--chart-fill-bottom-d), black))"/>` +
        '</linearGradient>';
      const lit = (hue, pos, l, d) => `<stop offset="${pos}" style="stop-color:light-dark(color-mix(in oklab, var(${hue}) ${l}%, var(--bg)),color-mix(in oklab, var(${hue}) ${d}%, black))"/>`;
      const fills = Object.create(null);
      let defs = ramp(gid, '--muted-mark');
      // A STATUS wins over a slot, as it does on the flowchart (its status rule outranks its
      // slot rule): the status is a meaning the key names, a slot only a color.
      const fillOf = (s) => {
        const tone = s.status ? STATUS_TONE[s.status] : null;
        const sl = s.fill || s.slot;
        if (sl && (!tone || tone === 'mute')) {
          const id = `${gid}-c${sl}`;
          if (!fills[id]) { fills[id] = 1; defs += ramp(id, `--chart-cat-${sl}-hue`); }
          return id;
        }
        if (!tone || tone === 'mute') return gid;
        const id = `${gid}-s-${tone}`;
        if (!fills[id]) {
          fills[id] = 1;
          defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${lit(`--state-${tone}-hue`, '0%', 18, 42)}${lit(`--state-${tone}-hue`, '100%', 30, 54)}</linearGradient>`;
        }
        return id;
      };
      const fillIds = Object.create(null);
      for (const s of model.shapes) fillIds[s.id] = fillOf(s);
      parts.push(`<defs>${defs}</defs>`);

      const g = ctx.groups(model.groups || [], geo, titleFont, { box: 'state-group', title: 'state-group-title' });
      parts.push(g.under);
      // `curved` is a paint setting: the router's elbows, with generously rounded corners.
      parts.push(ctx.lines(geo, edges, (id) => (sizes[id] ? sizes[id].kind : null), {
        cls: { group: 'state-edge-group', path: 'state-edge', head: 'state-edge-arrow', label: 'state-edge-label' },
        radius: curved ? 22 : 8,
        labelFont,
        pathAttrs: ' data-anima-role="bar"',
        headAttrs: ' data-anima-role="bar"',
      }));
      parts.push(g.over);

      // The markers.
      const sb = geo.nodes['sc-start'];
      if (sb) parts.push(`<g class="state-marker" data-kind="start">${outline('start', sb.x, sb.y, sb.w, sb.h, ' class="state-marker-disc"', '')}</g>`);
      const eb = geo.nodes['sc-end'];
      if (eb) parts.push(`<g class="state-marker" data-kind="terminal">${outline('end', eb.x, eb.y, eb.w, eb.h, ' class="state-marker-ring"', ' class="state-marker-disc"')}</g>`);

      // The tiles.
      for (const s of model.shapes) {
        const b = geo.nodes[s.id];
        if (!b) continue;
        const kind = s.shape || 'box';
        const t = tiles[s.id] || { lines: [s.name], font: 15, dx: 0, dy: 0, lh: 18 };
        const role = s.start ? 'start' : s.end ? 'terminal' : '';
        const a = `${role ? ` data-kind="${role}"` : ''}${s.status ? ` data-s="${esc(s.status)}"` : ''}${s.slot ? ` data-slot="${esc(s.slot)}"` : ''}${s.border ? ` data-border="${esc(s.border)}"` : ''}`;
        const mark = ` data-index="${s.index}" data-mark="${s.index - 1}" data-label="${esc(s.name)}"${s.status ? ` data-value="${esc(s.status)}"` : ''}`;
        const shapeAttrs = ` class="state-node-shape"${mark}${a} data-anima-role="region" fill="url(#${fillIds[s.id]})"`;
        let out = `<g class="state-node-group" data-id="${esc(s.id)}"${s.text ? ` data-text="${esc(s.text)}"` : ''}>`;
        if (kind === 'box') {
          const rx = Math.min(b.h / 2, 10);
          // The end state wears a second ring: SVG has no `outline`, so it is a rect.
          if (s.end) out += `<rect class="state-node-ring" x="${r1(b.x - 3)}" y="${r1(b.y - 3)}" width="${r1(b.w + 6)}" height="${r1(b.h + 6)}" rx="${r1(rx + 3)}"/>`;
          out += `<rect${shapeAttrs} x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="${r1(rx)}"/>`;
          // The leading accent, only on a state with a status or a slot (gantt's rule: on
          // a state with neither it would say nothing), clipped to the tile's corner.
          if (s.status || s.slot) {
            const aw = Math.min(3, b.w / 4);
            const dy = rx - Math.sqrt(Math.max(0, rx * rx - (rx - aw) * (rx - aw)));
            const d = `M${r1(b.x + aw)} ${r1(b.y + dy)}L${r1(b.x + aw)} ${r1(b.y + b.h - dy)}A${r1(rx)} ${r1(rx)} 0 0 1 ${r1(b.x)} ${r1(b.y + b.h - rx)}L${r1(b.x)} ${r1(b.y + rx)}A${r1(rx)} ${r1(rx)} 0 0 1 ${r1(b.x + aw)} ${r1(b.y + dy)}Z`;
            out += `<path class="state-node-accent"${s.status ? ` data-s="${esc(s.status)}"` : ''}${s.slot ? ` data-slot="${esc(s.slot)}"` : ''} d="${d}"/>`;
          }
        } else {
          out += outline(kind, b.x, b.y, b.w, b.h, shapeAttrs, ' class="state-node-ring"');
        }
        if (t.badge && model.badges) {
          out += `<text class="state-index-t"${s.status && STATUS_TONE[s.status] !== 'mute' ? ` data-s="${esc(s.status)}"` : ''} x="${r1(b.x + b.w - t.badge.right)}" y="${r1(b.y + t.badge.cy)}" text-anchor="end" dominant-baseline="central" font-size="${r1(t.badge.font)}">${esc(t.badge.text)}</text>`;
        }
        const ls = t.lines.length ? t.lines : [s.name];
        const y0 = b.cy + t.dy - ((ls.length - 1) * t.lh) / 2;
        const x = b.cx + t.dx;
        // An icon (`icon=`) where the harness put it; `icon-only` paints the drawing alone and
        // keeps the name as its <title>.
        const ic = s.icon ? t.icon : null;
        if (ic) out += `<svg class="sc-icon" x="${r1(b.cx + ic.x)}" y="${r1(b.cy + ic.y)}" width="${r1(ic.size)}" height="${r1(ic.size)}" viewBox="0 0 24 24" overflow="visible">${s.iconOnly ? `<title>${esc(s.name)}</title>` : ''}${ic.shapes}</svg>`;
        // `dominant-baseline` on every <tspan>: a tspan's own `auto` does not resolve
        // against its parent in WebKit, and paints the name a font-size high (#2297).
        if (!(ic && s.iconOnly)) out += `<text class="state-label-t" text-anchor="middle" dominant-baseline="central" font-size="${r1(t.font)}">${ls.map((l, k) => `<tspan x="${r1(x)}" y="${r1(y0 + k * t.lh)}" dominant-baseline="central">${esc(l)}</tspan>`).join('')}</text>`;
        parts.push(`${out}</g>`);
      }
      return parts.join('');
    },
  };
}

/**
 * The `inline` variant's fit. Its rows are HTML (not a graph, so no layout pass draws
 * them), and a tall machine would be sheared by the stage's clip; so the rows' box is
 * letterboxed into the figure, never scaled up, with the type floor raised by 1/k so the
 * transform brings it back to the floor the token asks for. The floor grows the text,
 * which changes the box, so the scale is solved again until it holds (three rounds at
 * most). Serialized like the adapter: closes over nothing.
 */
function fitInlineStateCharts(rootDoc) {
  const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const floorOf = (el) => {
    let v = '';
    try { v = String(getComputedStyle(el).getPropertyValue('--chart-text-min') || '').trim(); } catch (_e) { return 11; }
    const px = /^(-?[\d.]+)px$/.exec(v);
    if (px && +px[1] > 0) return +px[1];
    const calc = /^calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)$/.exec(v);
    return calc && +calc[1] * +calc[2] > 0 ? +calc[1] * +calc[2] : 11;
  };
  for (const fig of doc.querySelectorAll('.state-chart-figure[data-variant="inline"]')) {
    const box = fig.querySelector('.state-chart-scale');
    if (!box) continue;
    try { const t = getComputedStyle(fig).transform; if (t && t !== 'none') continue; } catch (_e) { /* measure anyway */ }
    // A host that scales the whole slide (a thumbnail) scales both boxes alike, so the
    // ratio below needs no correction for it.
    const base = floorOf(fig);
    let k = 1;
    for (let round = 0; round < 3; round++) {
      box.style.transform = 'translate(-50%, -50%)';
      if (k < 1) box.style.setProperty('--chart-text-min', `${(base / k).toFixed(3)}px`);
      else box.style.removeProperty('--chart-text-min');
      const v = fig.getBoundingClientRect();
      const r = box.getBoundingClientRect();
      if (!(v.width > 0 && v.height > 0 && r.width > 0 && r.height > 0)) break;
      const next = Math.min(1, v.width / r.width, v.height / r.height);
      const settled = Math.abs(next - k) / k < 0.01;
      k = next;
      if (settled) break;
    }
    const fitted = Math.abs(k - 1) >= 0.005;
    box.style.transform = `translate(-50%, -50%)${fitted ? ` scale(${k.toFixed(4)})` : ''}`;
    if (fitted) box.setAttribute('data-fit-k', k.toFixed(4)); else box.removeAttribute('data-fit-k');
    if (k < 1) box.style.setProperty('--chart-text-min', `${(base / k).toFixed(3)}px`);
    else box.style.removeProperty('--chart-text-min');
  }
}

/**
 * Draw every state chart in `doc`. The runtime calls this with the kernel factory it
 * bundled; `opts.onlyFresh` draws only figures that have never been drawn.
 */
function installStateChartLayout(rootDoc, kernelFactory, opts) {
  const { installGraphPass } = require('@laticent/trama');
  installGraphPass(rootDoc, kernelFactory, stateChartAdapter, opts);
  fitInlineStateCharts(rootDoc);
}

// The serialized pass for the emulator's bootstrap <script>: Trama's kernel and pipeline,
// this adapter and the inline fit, as source, self-invoking. dagre is NOT here: the
// emulator prepends its IIFE only when a machine needs it (state-chart.adoption.js); a
// chain lays out on the kernel's grid without it.
function browserJs() {
  const { graphLayoutKernel, installGraphPass } = require('@laticent/trama');
  return `(function(){var __scKernel=${graphLayoutKernel.toString()};var __scAdapter=${stateChartAdapter.toString()};(${installGraphPass.toString()})(document,__scKernel,__scAdapter);var __scFit=${fitInlineStateCharts.toString()};__scFit(document);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){__scFit(document);});})();`;
}

module.exports = { stateChartAdapter, fitInlineStateCharts, installStateChartLayout, browserJs };
