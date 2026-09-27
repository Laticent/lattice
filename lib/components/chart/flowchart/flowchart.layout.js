/**
 * flowchart — the browser half, as a Trama adapter.
 *
 * Trama (`@laticent/trama`, docs/src/lib/trama/) owns the pipeline every graph chart
 * shares: the redraw signature, the fit and the type floor, the live layout in a worker,
 * the SVG write and the observers (engineering/decisions/2026-09-27-trama-graph-chart-library.md).
 * This file is what is the flowchart's own:
 *   - which figures it draws and where their parts are;
 *   - reading and sanitizing `data-fc-model` (HARD RULE #22);
 *   - measuring its harness (shapes, line labels, group titles, notes) into the kernel's
 *     input, with the spacing presets;
 *   - painting its markup (groups, lines, heads, labels, titles, shapes, notes).
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
    })).filter((x) => x.id);
    const groups = (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 200).map((x) => clean({
      id: str(x?.id), name: str(x?.name), parent: x?.parent == null ? null : str(x.parent), slot: slot(x?.slot),
    })).filter((x) => x.id);
    const edges = (Array.isArray(raw.edges) ? raw.edges : []).slice(0, 2000).map((x) => clean({
      from: str(x?.from), to: str(x?.to), dir: pick(x?.dir, DIR_SET) || 'out',
      label: x?.label ? str(x.label) : undefined, heavy: x?.heavy === true ? true : undefined, back: x?.back === true ? true : undefined,
      style: clean({ slot: slot(x?.style?.slot), pattern: pick(x?.style?.pattern, PATTERN_SET), head: pick(x?.style?.head, HEAD_SET), loose: x?.style?.loose === true ? true : undefined }),
    })).filter((x) => x.from && x.to);
    const notes = (Array.isArray(raw.notes) ? raw.notes : []).slice(0, 200).map((x) => ({ on: str(x?.on), text: str(x?.text) }));
    return { shapes, groups, edges, notes };
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
      return [fig.getAttribute('data-fc-model'), fig.getAttribute('data-fc-dir'), fig.getAttribute('data-fc-spacing'),
        styleSig(harness.querySelector('.fc-node')), styleSig(harness.querySelector('.fc-elabel'))];
    },
    measure(model, ctx) {
      const { fig, harness, S, rectL, textLines, grow } = ctx;
      const sizes = {};
      const lines = {};
      const fontPx = {};
      for (const el of harness.querySelectorAll('.fc-node[data-id]')) {
        const id = el.getAttribute('data-id');
        const r = rectL(el);
        const nameEl = el.querySelector('.fc-name') || el;
        lines[id] = textLines(nameEl);
        try { fontPx[id] = Number.parseFloat(getComputedStyle(nameEl).fontSize) / S || 15; } catch (_e) { fontPx[id] = 15; }
        const kind = el.getAttribute('data-shape') || 'box';
        const g = grow(kind, r.width / S, r.height / S);
        sizes[id] = { w: g.w, h: g.h, tw: r.width / S, th: r.height / S, kind };
      }
      const labelSizes = {};
      let labelFont = 12;
      for (const el of harness.querySelectorAll('.fc-elabel[data-edge]')) {
        const r = rectL(el);
        labelSizes[+el.getAttribute('data-edge')] = { w: r.width / S + 6, h: r.height / S };
        try { labelFont = Number.parseFloat(getComputedStyle(el).fontSize) / S || labelFont; } catch (_e) { /* keep */ }
      }
      const groupTitleSizes = {};
      let titleFont = 11;
      for (const el of harness.querySelectorAll('.fc-gtitle[data-group]')) {
        const r = rectL(el);
        groupTitleSizes[el.getAttribute('data-group')] = { w: r.width / S, h: r.height / S };
        try { titleFont = Number.parseFloat(getComputedStyle(el).fontSize) / S || titleFont; } catch (_e) { /* keep */ }
      }
      // Notes join the layout as small tethered boxes beside the shape they annotate.
      const shapes = model.shapes.slice();
      const edges = model.edges.slice();
      const noteLines = {};
      let noteFont = 11;
      for (const el of harness.querySelectorAll('.fc-note[data-note]')) {
        const i = +el.getAttribute('data-note');
        const n = model.notes?.[i];
        const host = n && shapes.find((s) => s.id === n.on);
        if (!host) continue;
        const id = `fc-note-${i}`;
        const r = rectL(el);
        sizes[id] = { w: r.width / S, h: r.height / S, tw: r.width / S, th: r.height / S, kind: 'note' };
        noteLines[id] = textLines(el);
        try { noteFont = Number.parseFloat(getComputedStyle(el).fontSize) / S || noteFont; } catch (_e) { /* keep */ }
        shapes.push({ id, name: '', parent: host.parent || null, shape: 'note' });
        edges.push({ from: n.on, to: id, dir: 'none', style: { pattern: 'dotted' }, tether: true });
      }

      const compact = fig.getAttribute('data-fc-spacing') === 'compact';
      const port = fig.querySelector('.fc-canvas') || fig;
      const view = rectL(port);
      const pinned = fig.getAttribute('data-fc-dir');
      const titleH = Object.values(groupTitleSizes).reduce((m, z) => Math.max(m, z.h), 12);
      const args = [{ shapes, groups: model.groups || [], edges }, sizes, {
        dir: pinned === 'lr' || pinned === 'tb' ? pinned : undefined,
        labelSizes,
        groupTitleSizes,
        stage: { w: view.width / S, h: view.height / S },
        maxScale: ctx.maxScale,
        spacing: compact
          ? { node: 20, rank: 40, edge: 10, groupPad: 10, groupPadTop: titleH + 12, lane: 7 }
          : { node: 30, rank: 58, edge: 14, groupPad: 14, groupPadTop: titleH + 16 },
      }];
      return { args, sizes, lines, fontPx, labelFont, titleFont, edges, noteLines, noteFont };
    },
    paint(model, m, geo, ctx) {
      const { r1, esc, outline, toOutline, cut, rounded, head } = ctx;
      const { sizes, lines, fontPx, labelFont, titleFont, edges, noteLines, noteFont } = m;
      const parts = [];
      const depth = (gid) => { let d = 0; let p = model.groups.find((g) => g.id === gid)?.parent; while (p) { d++; p = model.groups.find((g) => g.id === p)?.parent; } return d; };
      const groups = (model.groups || []).slice().sort((a, b) => depth(a.id) - depth(b.id));
      for (const g of groups) {
        const b = geo.groups[g.id];
        if (!b) continue;
        parts.push(`<rect class="fc-group" data-group="${esc(g.id)}"${g.slot ? ` data-slot="${esc(g.slot)}"` : ''} data-depth="${depth(g.id)}" x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="10"/>`);
      }
      // Everything a line must stop at: labels and group titles (section 5, step 4).
      const holes = [];
      for (const r of geo.routes) if (r.labelAt && r.labelSize) holes.push({ x: r.labelAt.x - r.labelSize.w / 2, y: r.labelAt.y - r.labelSize.h / 2, w: r.labelSize.w, h: r.labelSize.h });
      for (const t of Object.values(geo.titles || {})) holes.push({ x: t.x - 3, y: t.y, w: t.w + 6, h: t.h });
      const HEAD = 7;
      for (const r of geo.routes) {
        const e = edges[r.index];
        if (!e || r.points.length < 2) continue;
        const st = e.style || {};
        const endHead = e.tether ? null : e.dir === 'out' || e.dir === 'both' ? (st.head || 'arrow') : null;
        const startHead = e.tether ? null : e.dir === 'in' || e.dir === 'both' ? (st.head || 'arrow') : null;
        const P = r.points.map((p) => ({ ...p }));
        const kindOf = (id) => (sizes[id] ? sizes[id].kind : null);
        const nb = (id) => geo.nodes[id];
        if (nb(r.from) && P.length > 1) P[0] = toOutline(P[0], P[1], nb(r.from), kindOf(r.from));
        if (nb(r.to) && P.length > 1) P[P.length - 1] = toOutline(P[P.length - 1], P[P.length - 2], nb(r.to), kindOf(r.to));
        // Back the stroke off the tip so it never pokes through the head.
        const pts = P.map((p) => ({ ...p }));
        const back = (i, j, by) => { const a = pts[i], b = pts[j]; const L = Math.hypot(a.x - b.x, a.y - b.y); if (L > by + 1) { a.x -= ((a.x - b.x) / L) * by; a.y -= ((a.y - b.y) / L) * by; } };
        const n = pts.length;
        if (endHead === 'arrow') back(n - 1, n - 2, HEAD * 0.8);
        if (startHead === 'arrow') back(0, 1, HEAD * 0.8);
        const attrs = `${e.heavy ? ' data-heavy="1"' : ''}${st.pattern ? ` data-pattern="${esc(st.pattern)}"` : ''}${st.slot ? ` data-slot="${esc(st.slot)}"` : ''}${e.back ? ' data-back="1"' : ''}${e.tether ? ' data-tether="1"' : ''}`;
        const runs = cut(pts, holes);
        let g = `<g class="fc-edge-group" data-edge="${r.index}"${attrs}>`;
        for (const run of runs) g += `<path class="fc-edge" d="${rounded(run, 8)}"/>`;
        if (endHead) g += head(endHead, P[P.length - 1], P[P.length - 1].x - P[P.length - 2].x, P[P.length - 1].y - P[P.length - 2].y, HEAD * (e.heavy ? 1.25 : 1), 'fc-head');
        if (startHead) g += head(startHead, P[0], P[0].x - P[1].x, P[0].y - P[1].y, HEAD * (e.heavy ? 1.25 : 1), 'fc-head');
        if (r.labelAt && e.label) g += `<text class="fc-edge-label" x="${r1(r.labelAt.x)}" y="${r1(r.labelAt.y)}" font-size="${r1(labelFont)}" text-anchor="middle" dominant-baseline="central">${esc(e.label)}</text>`;
        parts.push(`${g}</g>`);
      }
      for (const g of groups) {
        const t = geo.titles?.[g.id];
        if (!t) continue;
        parts.push(`<text class="fc-group-title" data-group="${esc(g.id)}"${g.slot ? ` data-slot="${esc(g.slot)}"` : ''} x="${r1(t.x)}" y="${r1(t.y + t.h / 2)}" font-size="${r1(titleFont)}" dominant-baseline="central">${esc(g.name)}</text>`);
      }
      model.shapes.forEach((s, i) => {
        const b = geo.nodes[s.id];
        if (!b) return;
        const kind = s.shape || 'box';
        const a = `${s.status ? ` data-s="${esc(s.status)}"` : ''}${s.slot ? ` data-slot="${esc(s.slot)}"` : ''}${s.fill ? ` data-fill="${esc(s.fill)}"` : ''}${s.border ? ` data-border="${esc(s.border)}"` : ''}${s.text ? ` data-text="${esc(s.text)}"` : ''}`;
        const fs = fontPx[s.id] || 15;
        const ls = lines[s.id] || [s.name];
        const lh = fs * 1.2;
        const y0 = b.cy - ((ls.length - 1) * lh) / 2;
        const tspans = ls.map((l, k) => `<tspan x="${r1(b.cx)}" y="${r1(y0 + k * lh)}" dominant-baseline="central">${esc(l)}</tspan>`).join('');
        parts.push(`<g class="fc-node-group" data-id="${esc(s.id)}" data-shape="${esc(kind)}"${a}>` +
          outline(kind, b.x, b.y, b.w, b.h, ` class="fc-shape" data-mark="${i}" data-label="${esc(s.name)}" data-shape="${esc(kind)}"${a}`, ' class="fc-shape-rim"') +
          `<text class="fc-name" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="central">${tspans}</text></g>`);
      });
      for (const [id, ls] of Object.entries(noteLines)) {
        const b = geo.nodes[id];
        if (!b) continue;
        const lh = noteFont * 1.25;
        const y0 = b.cy - ((ls.length - 1) * lh) / 2;
        parts.push(`<g class="fc-note-group"><rect class="fc-note-card" x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="4"/>` +
          `<text class="fc-note-text" font-size="${r1(noteFont)}" text-anchor="middle" dominant-baseline="central">${ls.map((l, k) => `<tspan x="${r1(b.cx)}" y="${r1(y0 + k * lh)}" dominant-baseline="central">${esc(l)}</tspan>`).join('')}</text></g>`);
      }
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
