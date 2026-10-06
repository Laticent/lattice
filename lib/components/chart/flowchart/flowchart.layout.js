/**
 * flowchart — the browser half, as a Trama adapter.
 *
 * Trama (`@laticent/trama`, docs/src/lib/trama/) owns the pipeline every graph chart
 * shares: the redraw signature, the fit and the type floor, the live layout in a worker,
 * the SVG write and the observers (engineering/decisions/2026-09-27-trama-graph-chart-library.md).
 * This file is what is the flowchart's own:
 *   - which figures it draws and where their parts are;
 *   - reading and sanitizing `data-fc-model` (HARD RULE #22);
 *   - measuring its harness (shapes, line labels, group titles) into the kernel's
 *     input, with the spacing presets;
 *   - painting its markup: groups and lines through Trama's shared painters (`ctx.groups`,
 *     `ctx.lines`, which the state chart paints with too), and its own shapes.
 *
 * `flowchartAdapter` ships as source, like Trama's own functions: the CLI export
 * serializes it with `.toString()` into the bootstrap `<script>` (FLOWCHART_BROWSER_JS
 * below). So it closes over NOTHING outside its body. Everything it needs from Trama
 * (the unit scale, `rectL`, `textLines`, the outline and path helpers) arrives on the
 * context the pipeline hands it.
 */
function flowchartAdapter() {
  /**
   * The model is UNTRUSTED. The server writes it, but a deck can forge a
   * `.flowchart-figure[data-fc-model]` in raw HTML, and `data-*` attributes survive the
   * slide sanitizer, so this pass runs AFTER every guard (HARD RULE #22, the
   * post-sanitize shape). Every structural field is rebuilt from a closed set or an
   * integer range; a value outside it is dropped, never passed on. Author text (names,
   * labels, notes, ids) stays text and is escaped where it is painted.
   */
  function sanitizeModel(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shapes)) return null;
    const SHAPE_SET = ['box', 'square', 'pill', 'diamond', 'circle', 'cylinder', 'io', 'doc'];
    const STATUS_SET = ['on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred'];
    const HEAD_SET = ['open', 'dot', 'cross'];
    const PATTERN_SET = ['dashed', 'dotted'];
    const DIR_SET = ['out', 'in', 'both', 'none'];
    const str = (v) => (typeof v === 'string' ? v.slice(0, 400) : typeof v === 'number' ? String(v) : '');
    const slot = (v) => (Number.isInteger(v) && v >= 1 && v <= 8 ? v : undefined);
    const pick = (v, set) => (set.includes(v) ? v : undefined);
    const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
    const shapes = raw.shapes.slice(0, 500).map((x) => clean({
      id: str(x?.id), name: str(x?.name), parent: x?.parent == null ? null : str(x.parent),
      shape: pick(x?.shape, SHAPE_SET) || 'box', status: pick(x?.status, STATUS_SET),
      slot: slot(x?.slot), fill: slot(x?.fill), border: slot(x?.border), text: slot(x?.text),
      // An icon is a name in the set's own spelling; the DRAWING is read from the harness and
      // rebuilt by Trama's `drawing` (a closed vocabulary), never from the model.
      icon: typeof x?.icon === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x.icon) ? x.icon : undefined,
      iconOnly: x?.iconOnly === true && typeof x?.icon === 'string' ? true : undefined,
    })).filter((x) => x.id);
    const groups = (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 200).map((x) => clean({
      id: str(x?.id), name: str(x?.name), parent: x?.parent == null ? null : str(x.parent), slot: slot(x?.slot),
    })).filter((x) => x.id);
    const edges = (Array.isArray(raw.edges) ? raw.edges : []).slice(0, 2000).map((x) => clean({
      from: str(x?.from), to: str(x?.to), dir: pick(x?.dir, DIR_SET) || 'out',
      label: x?.label ? str(x.label) : undefined, heavy: x?.heavy === true ? true : undefined, back: x?.back === true ? true : undefined,
      style: clean({ slot: slot(x?.style?.slot), pattern: pick(x?.style?.pattern, PATTERN_SET), head: pick(x?.style?.head, HEAD_SET), loose: x?.style?.loose === true ? true : undefined }),
    })).filter((x) => x.from && x.to);
    return { shapes, groups, edges };
  }

  // A theme switch changes the type and padding without changing a size, so the first
  // node's and label's computed font and box join the signature (a style read, not a
  // layout).
  const styleSig = (el) => {
    if (!el) return '';
    try { const c = getComputedStyle(el); return [c.font, c.letterSpacing, c.padding, c.borderWidth, c.lineHeight].join(','); } catch (_e) { return ''; }
  };

  return {
    selector: '.flowchart-figure[data-fc-model]',
    figure: '.flowchart-figure',
    attr: 'fc',
    parts(fig) {
      const box = fig.querySelector('.flowchart-scale');
      const harness = fig.querySelector('.fc-harness');
      const svg = fig.querySelector('svg.flowchart-svg');
      if (!box || !harness || !svg) return null;
      return { box, harness, svg, port: fig.querySelector('.fc-canvas') || fig };
    },
    readModel(fig) {
      return sanitizeModel(JSON.parse(fig.getAttribute('data-fc-model') || ''));
    },
    signature(fig, harness) {
      return [fig.getAttribute('data-fc-model'), fig.getAttribute('data-fc-dir'), fig.getAttribute('data-fc-spacing'), fig.getAttribute('data-fc-style'),
        styleSig(harness.querySelector('.fc-node')), styleSig(harness.querySelector('.fc-elabel'))];
    },
    measure(model, ctx) {
      const { fig, harness, S, rectL, textLines, grow, drawing } = ctx;
      const sizes = Object.create(null);
      const lines = Object.create(null);
      const fontPx = Object.create(null);
      // A node with an icon: the drawing and where the harness put it and the name, relative to
      // the tile's center, so a tile the kernel grows (a diamond, a circle) keeps both in place.
      const icons = Object.create(null);
      for (const el of harness.querySelectorAll('.fc-node[data-id]')) {
        const id = el.getAttribute('data-id');
        const r = rectL(el);
        const nameEl = el.querySelector('.fc-name') || el;
        lines[id] = textLines(nameEl);
        try { fontPx[id] = Number.parseFloat(getComputedStyle(nameEl).fontSize) / S || 15; } catch (_e) { fontPx[id] = 15; }
        const iconEl = el.querySelector('.graph-icon');
        const shapes = iconEl ? drawing(iconEl.querySelector('svg')) : '';
        if (shapes) {
          const ir = rectL(iconEl);
          const nr = rectL(nameEl);
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          icons[id] = {
            shapes, size: ir.width / S, x: (ir.left - cx) / S, y: (ir.top - cy) / S,
            dx: (nr.left + nr.width / 2 - cx) / S, dy: (nr.top + nr.height / 2 - cy) / S,
          };
        }
        const kind = el.getAttribute('data-shape') || 'box';
        const g = grow(kind, r.width / S, r.height / S);
        sizes[id] = { w: g.w, h: g.h, tw: r.width / S, th: r.height / S, kind };
      }
      const labelSizes = Object.create(null);
      let labelFont = 12;
      for (const el of harness.querySelectorAll('.fc-elabel[data-edge]')) {
        const r = rectL(el);
        labelSizes[+el.getAttribute('data-edge')] = { w: r.width / S + 6, h: r.height / S };
        try { labelFont = Number.parseFloat(getComputedStyle(el).fontSize) / S || labelFont; } catch (_e) { /* keep */ }
      }
      const groupTitleSizes = Object.create(null);
      let titleFont = 11;
      for (const el of harness.querySelectorAll('.fc-gtitle[data-group]')) {
        const r = rectL(el);
        groupTitleSizes[el.getAttribute('data-group')] = { w: r.width / S, h: r.height / S };
        try { titleFont = Number.parseFloat(getComputedStyle(el).fontSize) / S || titleFont; } catch (_e) { /* keep */ }
      }
      const shapes = model.shapes;
      const edges = model.edges;
      const compact = fig.getAttribute('data-fc-spacing') === 'compact';
      const port = fig.querySelector('.fc-canvas') || fig;
      const view = rectL(port);
      const pinned = fig.getAttribute('data-fc-dir');
      const titleH = Object.values(groupTitleSizes).reduce((m, z) => Math.max(m, z.h), 12);
      const args = [{ shapes, groups: model.groups || [], edges }, sizes, {
        dir: pinned === 'lr' || pinned === 'tb' ? pinned : undefined,
        wrap: true,
        ...(fig.getAttribute('data-fc-order') === 'graph' ? { order: 'graph' } : {}),
        labelSizes,
        groupTitleSizes,
        stage: { w: view.width / S, h: view.height / S },
        maxScale: ctx.maxScale,
        spacing: compact
          ? { node: 20, rank: 40, edge: 10, groupPad: 10, groupPadTop: titleH + 12, lane: 7 }
          : { node: 30, rank: 58, edge: 14, groupPad: 14, groupPadTop: titleH + 16 },
      }];
      return { args, sizes, lines, fontPx, icons, labelFont, titleFont, edges, curved: fig.getAttribute('data-fc-style') === 'curved' };
    },
    paint(model, m, geo, ctx) {
      const { r1, esc, outline } = ctx;
      const { sizes, lines, fontPx, labelFont, titleFont, edges, curved } = m;
      const icons = m.icons || {};
      const g = ctx.groups(model.groups || [], geo, titleFont, { box: 'fc-group', title: 'fc-group-title' });
      const parts = [g.under];
      // `curved` is a paint setting: the router's elbows, with generously rounded corners.
      parts.push(ctx.lines(geo, edges, (id) => (sizes[id] ? sizes[id].kind : null), {
        cls: { group: 'fc-edge-group', path: 'fc-edge', head: 'fc-head', label: 'fc-edge-label' },
        radius: curved ? 22 : 8,
        labelFont,
      }));
      parts.push(g.over);
      model.shapes.forEach((s, i) => {
        const b = geo.nodes[s.id];
        if (!b) return;
        const kind = s.shape || 'box';
        const a = `${s.status ? ` data-s="${esc(s.status)}"` : ''}${s.slot ? ` data-slot="${esc(s.slot)}"` : ''}${s.fill ? ` data-fill="${esc(s.fill)}"` : ''}${s.border ? ` data-border="${esc(s.border)}"` : ''}${s.text ? ` data-text="${esc(s.text)}"` : ''}`;
        // The mark contract (slot-contract.md) on the SHAPE only, never the group: a node painted
        // from its author category carries that slot as `data-hue`; one painted from a status or
        // an explicit fill is not one of the eight hues and carries none. Inlined because this
        // adapter is serialized with toString() and closes over nothing — its server twin is
        // `hueContract` in flowchart.transform.js, and the two must say the same thing.
        const hue = s.slot && !s.status && !s.fill ? ` data-hue="${esc(s.slot)}" data-encodes="hue" data-paint="fill"` : '';
        const fs = fontPx[s.id] || 15;
        const ls = lines[s.id] || [s.name];
        const lh = fs * 1.2;
        // An icon (`icon=`) sits where the harness put it, beside the name in `lr`, above it in
        // `tb`; `icon-only` paints the drawing alone and keeps the name as its <title>.
        const ic = s.icon ? icons[s.id] : null;
        const tx = b.cx + (ic ? ic.dx : 0);
        const y0 = b.cy + (ic ? ic.dy : 0) - ((ls.length - 1) * lh) / 2;
        const tspans = ls.map((l, k) => `<tspan x="${r1(tx)}" y="${r1(y0 + k * lh)}" dominant-baseline="central">${esc(l)}</tspan>`).join('');
        const art = ic ? `<svg class="fc-icon" x="${r1(b.cx + ic.x)}" y="${r1(b.cy + ic.y)}" width="${r1(ic.size)}" height="${r1(ic.size)}" viewBox="0 0 24 24" overflow="visible">${s.iconOnly ? `<title>${esc(s.name)}</title>` : ''}${ic.shapes}</svg>` : '';
        const name = ic && s.iconOnly ? '' : `<text class="fc-name" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
        parts.push(`<g class="fc-node-group" data-id="${esc(s.id)}" data-shape="${esc(kind)}"${a}>` +
          outline(kind, b.x, b.y, b.w, b.h, ` class="fc-shape" data-mark="${i}" data-label="${esc(s.name)}" data-shape="${esc(kind)}"${a}${hue}`, ' class="fc-shape-rim"') +
          `${art}${name}</g>`);
      });
      return parts.join('');
    },
  };
}

/**
 * Draw every flowchart in `doc`. The runtime calls this with the kernel factory it
 * bundled; `opts.onlyFresh` draws only figures that have never been drawn.
 */
function installFlowchartLayout(rootDoc, kernelFactory, opts) {
  const { installGraphPass } = require('@laticent/trama');
  installGraphPass(rootDoc, kernelFactory, flowchartAdapter, opts);
}

// The serialized pass for the emulator's bootstrap <script>: Trama's kernel and pipeline
// and this adapter, as source, self-invoking. dagre is NOT here; the emulator prepends its
// IIFE, for the reason state-chart.transform.js gives above STATE_CHART_BROWSER_JS.
function browserJs() {
  const { graphLayoutKernel, installGraphPass } = require('@laticent/trama');
  return `(function(){var __fcKernel=${graphLayoutKernel.toString()};var __fcAdapter=${flowchartAdapter.toString()};(${installGraphPass.toString()})(document,__fcKernel,__fcAdapter);})();`;
}

module.exports = { flowchartAdapter, installFlowchartLayout, browserJs };
