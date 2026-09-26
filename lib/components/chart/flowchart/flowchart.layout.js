/**
 * flowchart — the browser half: measure the harness, lay the chart out, paint it.
 *
 * `installFlowchartLayout` ships two ways, like the state chart's pass:
 *   - the runtime bundle calls it with the imported router kernel;
 *   - the emulator / CLI export serializes it with `.toString()` into a bootstrap
 *     `<script>` (FLOWCHART_BROWSER_JS below), beside the router's own source.
 * So it closes over NOTHING outside its body. dagre arrives as
 * `globalThis.__latticeDagre` (tools/build-dagre-bundle.js); without it the harness
 * stays up, which is a readable list of tiles, never a blank figure.
 *
 * UNITS. The layout runs in the HD baseline (a 1280px-wide section), so the router's
 * fixed thresholds mean the same thing at any render size: measured boxes are
 * divided by S (section width / 1280), and the SVG viewBox stays in HD units while
 * the scale box is S times larger in CSS px.
 *
 * WHAT IT LEARNED FROM THE STATE CHART, each a defect that shipped there once:
 *   - rects are read through rectL(), which divides out a host's CSS transform (the
 *     docs filmstrip scales every slide);
 *   - the SVG is written only when its markup CHANGED, because the runtime answers
 *     any child replacement with a content pass that calls this again;
 *   - the text lines are read with Range rects, which is not a DOM write. Each draw does
 *     toggle the harness back into layout (an attribute and the box's inline size), which
 *     fires the attribute observer; measured with the real runtime, the chart settles
 *     with zero SVG repaints after that, because the paint is written only on change;
 *   - `<title>`/`<desc>` are kept and every painted child is aria-hidden;
 *   - the harness is hidden with `visibility`, not removed, so the next re-measure
 *     (resize, webfonts) still has boxes to read;
 *   - the letterbox fit counter-scales the type floor (#1213).
 */
function installFlowchartLayout(rootDoc, kernelFactory, opts) {
  const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof kernelFactory !== 'function') return;
  const onlyFresh = Boolean(opts?.onlyFresh);
  const K = kernelFactory();
  const HD = 1280;
  const MAX_SCALE = 1.25;

  let VIS = 1;
  function rectL(el) {
    const r = el.getBoundingClientRect();
    if (VIS === 1) return r;
    return { left: r.left / VIS, top: r.top / VIS, right: r.right / VIS, bottom: r.bottom / VIS, width: r.width / VIS, height: r.height / VIS };
  }
  function readVis(sec) {
    VIS = 1;
    if (sec && typeof sec.getBoundingClientRect === 'function' && sec.offsetWidth > 0) {
      const kr = sec.getBoundingClientRect().width / sec.offsetWidth;
      if (kr > 0 && kr < 100 && Math.abs(kr - 1) > 0.005) VIS = kr;
    }
  }
  function readTextMin(el, fallback) {
    let v = '';
    try { v = String(getComputedStyle(el).getPropertyValue('--chart-text-min') || '').trim(); } catch (_e) { return fallback; }
    const px = /^(-?[\d.]+)px$/.exec(v);
    if (px) return +px[1] > 0 ? +px[1] : fallback;
    const calc = /^calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)$/.exec(v);
    if (calc) { const n = +calc[1] * +calc[2]; return n > 0 ? n : fallback; }
    return fallback;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** The lines the browser actually broke `el`'s text into, read with Range rects. */
  function textLines(el) {
    const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const node = el.firstChild;
    if (!node || node.nodeType !== 3 || typeof doc.createRange !== 'function') return [text];
    const raw = node.nodeValue;
    const range = doc.createRange();
    const lines = [];
    let top = null;
    let cur = '';
    const re = /\S+/g;
    for (let m = re.exec(raw); m; m = re.exec(raw)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rs = range.getClientRects();
      const t = rs.length ? Math.round(rs[0].top) : top;
      if (top !== null && t !== null && Math.abs(t - top) > 2) { lines.push(cur); cur = m[0]; } else cur = cur ? `${cur} ${m[0]}` : m[0];
      top = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  }

  /** The outline a shape word asks for, around the text box (w, h) centred at (cx, cy). */
  function outline(kind, x, y, w, h, a) {
    const cx = x + w / 2, cy = y + h / 2;
    switch (kind) {
      case 'square': return `<rect${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"/>`;
      case 'pill': return `<rect${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}"/>`;
      case 'circle': return `<ellipse${a} cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"/>`;
      case 'diamond': return `<path${a} d="M${r1(cx)} ${r1(y)}L${r1(x + w)} ${r1(cy)}L${r1(cx)} ${r1(y + h)}L${r1(x)} ${r1(cy)}Z"/>`;
      case 'io': { const s = Math.min(h * 0.35, w * 0.2); return `<path${a} d="M${r1(x + s)} ${r1(y)}L${r1(x + w)} ${r1(y)}L${r1(x + w - s)} ${r1(y + h)}L${r1(x)} ${r1(y + h)}Z"/>`; }
      case 'cylinder': {
        const ry = Math.min(h * 0.14, 8);
        return `<path${a} d="M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${r1(ry)} 0 0 1 ${r1(x + w)} ${r1(y + ry)}L${r1(x + w)} ${r1(y + h - ry)}A${r1(w / 2)} ${r1(ry)} 0 0 1 ${r1(x)} ${r1(y + h - ry)}Z"/>` +
          `<path class="fc-shape-rim" d="M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${r1(ry)} 0 0 0 ${r1(x + w)} ${r1(y + ry)}"/>`;
      }
      case 'doc': {
        const wv = Math.min(h * 0.12, 6);
        return `<path${a} d="M${r1(x)} ${r1(y)}L${r1(x + w)} ${r1(y)}L${r1(x + w)} ${r1(y + h - wv)}C${r1(x + w * 0.75)} ${r1(y + h - 3 * wv)} ${r1(x + w * 0.25)} ${r1(y + h + wv)} ${r1(x)} ${r1(y + h - wv)}Z"/>`;
      }
      default: return `<rect${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="6"/>`;
    }
  }
  /** How much bigger than its text box each outline must be to hold the text. */
  function grow(kind, w, h) {
    switch (kind) {
      case 'diamond': return { w: w * 1.55, h: h * 1.7 };
      case 'circle': { const d = Math.max(w * 0.92, h * 1.3); return { w: d, h: d }; }
      case 'io': return { w: w + h * 0.7, h };
      case 'cylinder': return { w, h: h + 12 };
      case 'doc': return { w, h: h + 6 };
      case 'pill': return { w: w + h * 0.4, h };
      default: return { w, h };
    }
  }

  /**
   * Where a run arriving at a box along one axis meets the shape's OUTLINE. The router
   * ends every line at the bounding box; a diamond, circle, pill or slanted side sits
   * inside it, so the painter carries the end on to the outline itself.
   */
  function toOutline(end, prev, b, kind) {
    const horiz = Math.abs(end.y - prev.y) < 0.05;
    const inward = horiz ? Math.sign(b.cx - end.x) : Math.sign(b.cy - end.y);
    const hw = b.w / 2, hh = b.h / 2;
    let depth = 0; // how far past the bounding box the outline sits, along the run
    if (horiz) {
      const t = Math.min(1, Math.abs(end.y - b.cy) / hh);
      if (kind === 'diamond') depth = hw * t;
      else if (kind === 'circle') depth = hw * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      else if (kind === 'pill') { const r = hh; const dy = Math.abs(end.y - b.cy); depth = r - Math.sqrt(Math.max(0, r * r - dy * dy)); }
      else if (kind === 'io') { const sl = Math.min(b.h * 0.35, b.w * 0.2); const f = (end.y - b.y) / b.h; depth = inward > 0 ? sl * (1 - f) : sl * f; }
      return { x: end.x + inward * depth, y: end.y };
    }
    const t = Math.min(1, Math.abs(end.x - b.cx) / hw);
    if (kind === 'diamond') depth = hh * t;
    else if (kind === 'circle') depth = hh * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
    else if (kind === 'cylinder' && inward > 0) { const ry = Math.min(b.h * 0.14, 8); depth = ry * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    return { x: end.x, y: end.y + inward * depth };
  }

  /** Split an orthogonal polyline where it passes under any of `boxes`. */
  function cut(pts, boxes) {
    const runs = [];
    let cur = [pts[0]];
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      const horiz = Math.abs(a.y - b.y) < 0.05;
      const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const gaps = [];
      for (const bx of boxes) {
        const inCross = horiz ? a.y > bx.y && a.y < bx.y + bx.h : a.x > bx.x && a.x < bx.x + bx.w;
        if (!inCross) continue;
        const g0 = Math.max(lo, horiz ? bx.x : bx.y), g1 = Math.min(hi, horiz ? bx.x + bx.w : bx.y + bx.h);
        if (g1 > g0) gaps.push([g0, g1]);
      }
      if (!gaps.length) { cur.push(b); continue; }
      gaps.sort((u, v) => u[0] - v[0]);
      const fwd = horiz ? b.x >= a.x : b.y >= a.y;
      const at = (v) => (horiz ? { x: v, y: a.y } : { x: a.x, y: v });
      const ordered = fwd ? gaps : gaps.map(([g0, g1]) => [g1, g0]).reverse();
      for (const [g0, g1] of ordered) {
        cur.push(at(g0));
        if (cur.length > 1) runs.push(cur);
        cur = [at(g1)];
      }
      cur.push(b);
    }
    if (cur.length > 1) runs.push(cur);
    return runs.filter((r) => r.length > 1 && r.some((p, i) => i > 0 && Math.hypot(p.x - r[i - 1].x, p.y - r[i - 1].y) > 0.5));
  }
  /** An orthogonal polyline with its corners rounded. */
  function rounded(pts, rad) {
    let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
    for (let j = 1; j < pts.length; j++) {
      const p = pts[j];
      if (j === pts.length - 1) { d += `L${r1(p.x)} ${r1(p.y)}`; break; }
      const a = pts[j - 1], b = pts[j + 1];
      const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
      const r = Math.min(rad, la / 2, lb / 2);
      if (r < 0.5) { d += `L${r1(p.x)} ${r1(p.y)}`; continue; }
      const p1 = { x: p.x - ((p.x - a.x) / la) * r, y: p.y - ((p.y - a.y) / la) * r };
      const p2 = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
      d += `L${r1(p1.x)} ${r1(p1.y)}Q${r1(p.x)} ${r1(p.y)} ${r1(p2.x)} ${r1(p2.y)}`;
    }
    return d;
  }
  /** A head at `tip`, pointing along (dx, dy). Drawn, never typed (HARD RULE #29). */
  function head(kind, tip, dx, dy, size) {
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const at = (a, b) => `${r1(tip.x - ux * a + px * b)} ${r1(tip.y - uy * a + py * b)}`;
    if (kind === 'dot') return `<circle class="fc-head" data-head="dot" cx="${r1(tip.x - ux * size * 0.45)}" cy="${r1(tip.y - uy * size * 0.45)}" r="${r1(size * 0.4)}"/>`;
    if (kind === 'open') return `<path class="fc-head" data-head="open" d="M${at(size, size * 0.55)}L${at(0, 0)}L${at(size, -size * 0.55)}"/>`;
    if (kind === 'cross') return `<path class="fc-head" data-head="cross" d="M${at(size * 1.1, size * 0.5)}L${at(size * 0.1, -size * 0.5)}M${at(size * 1.1, -size * 0.5)}L${at(size * 0.1, size * 0.5)}"/>`;
    return `<path class="fc-head" data-head="arrow" d="M${at(0, 0)}L${at(size, size * 0.5)}L${at(size, -size * 0.5)}Z"/>`;
  }

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

  function applyFit(fig, box, natW, natH) {
    const view = rectL(fig);
    if (!(view.width > 0 && view.height > 0 && natW > 0 && natH > 0)) return;
    let k = Math.min(view.width / natW, view.height / natH);
    if (k > MAX_SCALE) k = MAX_SCALE;
    const fitted = Math.abs(k - 1) >= 0.005;
    box.style.transform = `translate(-50%, -50%)${fitted ? ` scale(${k.toFixed(4)})` : ''}`;
    if (fitted) box.setAttribute('data-fit-k', k.toFixed(4)); else box.removeAttribute('data-fit-k');
    // The type floor, counter-scaled: raise the DECLARED floor by 1/k so the transform
    // brings it back down to the floor the token asks for. Only ever upwards.
    if (k < 1) box.style.setProperty('--chart-text-min', `${(readTextMin(fig, 11) / k).toFixed(3)}px`);
    else box.style.removeProperty('--chart-text-min');
  }

  function draw(fig) {
    const dagre = globalThis.__latticeDagre;
    const box = fig.querySelector('.flowchart-scale');
    const harness = fig.querySelector('.fc-harness');
    const svg = fig.querySelector('svg.flowchart-svg');
    if (!box || !harness || !svg) return;
    if (!dagre) { fig.setAttribute('data-fc-nolayout', '1'); return; }
    fig.removeAttribute('data-fc-nolayout');
    // A figure mid-reveal (the docs Drawing Board tilts it) measures foreshortened.
    try { const t = getComputedStyle(fig).transform; if (t && t !== 'none') return; } catch (_e) { /* measure anyway */ }
    let model;
    try { model = sanitizeModel(JSON.parse(fig.getAttribute('data-fc-model') || '')); } catch (_e) { return; }
    if (!model?.shapes.length) return;
    const sec = typeof fig.closest === 'function' ? fig.closest('section') : null;
    // A redraw with nothing changed (the resize observer's first call, fonts that were
    // already loaded, the DOMContentLoaded pass) would measure every label again, which
    // forces a page layout per read. Its inputs are cheap to read, so skip it when they
    // match the last completed draw.
    // A theme switch changes the type and padding without changing a size, so the first
    // node's and label's computed font and box join the signature (a style read, not a
    // layout).
    const port0 = fig.querySelector('.fc-canvas') || fig;
    const styleSig = (el) => {
      if (!el) return '';
      try { const c = getComputedStyle(el); return [c.font, c.letterSpacing, c.padding, c.borderWidth, c.lineHeight].join(','); } catch (_e) { return ''; }
    };
    const sig = [fig.getAttribute('data-fc-model'), fig.getAttribute('data-fc-dir'), fig.getAttribute('data-fc-spacing'), sec ? sec.offsetWidth : 0, port0.clientWidth, port0.clientHeight, doc.fonts ? doc.fonts.status : '',
      styleSig(harness.querySelector('.fc-node')), styleSig(harness.querySelector('.fc-elabel'))].join('\u0001');
    if (fig.__fcSig === sig && fig.getAttribute('data-fc-drawn')) return;
    readVis(sec);
    const S = sec && sec.offsetWidth > 0 ? sec.offsetWidth / HD : 1;

    // Measure with the harness laid out and the box unscaled.
    fig.removeAttribute('data-fc-drawn');
    box.style.transform = 'translate(-50%, -50%)';
    box.style.width = '';
    box.style.height = '';
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
    const geo = K.layout({ shapes, groups: model.groups || [], edges }, sizes, {
      dir: pinned === 'lr' || pinned === 'tb' ? pinned : undefined,
      labelSizes,
      groupTitleSizes,
      stage: { w: view.width / S, h: view.height / S },
      maxScale: MAX_SCALE,
      spacing: compact
        ? { node: 20, rank: 40, edge: 10, groupPad: 10, groupPadTop: titleH + 12, lane: 7 }
        : { node: 30, rank: 58, edge: 14, groupPad: 14, groupPadTop: titleH + 16 },
    }, dagre);
    if (!geo) return;

    // ── Paint ────────────────────────────────────────────────────────────────
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
      if (endHead) g += head(endHead, P[P.length - 1], P[P.length - 1].x - P[P.length - 2].x, P[P.length - 1].y - P[P.length - 2].y, HEAD * (e.heavy ? 1.25 : 1));
      if (startHead) g += head(startHead, P[0], P[0].x - P[1].x, P[0].y - P[1].y, HEAD * (e.heavy ? 1.25 : 1));
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
        outline(kind, b.x, b.y, b.w, b.h, ` class="fc-shape" data-mark="${i}" data-label="${esc(s.name)}" data-shape="${esc(kind)}"${a}`) +
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

    const keep = (String(svg.innerHTML || '').match(/^\s*(?:<(?:title|desc)\b[\s\S]*?<\/(?:title|desc)>\s*)+/) || [''])[0];
    const paint = keep + parts.join('');
    if (svg.__fcPaint !== paint) {
      svg.innerHTML = paint;
      svg.__fcPaint = paint;
      for (const el of svg.children ? [...svg.children] : []) {
        const tag = String(el.tagName || '').toLowerCase();
        if (tag !== 'title' && tag !== 'desc') el.setAttribute('aria-hidden', 'true');
      }
    }
    const vb = `0 0 ${r1(geo.width)} ${r1(geo.height)}`;
    if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
    box.style.width = `${r1(geo.width * S)}px`;
    box.style.height = `${r1(geo.height * S)}px`;
    fig.setAttribute('data-fc-drawn', '1');
    if (fig.getAttribute('data-fc-laid') !== geo.dir) fig.setAttribute('data-fc-laid', geo.dir);
    applyFit(port, box, geo.width * S, geo.height * S);
    fig.__fcSig = sig;
  }

  let rafPending = 0;
  function scheduleDrawAll() {
    const w = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!w || typeof w.requestAnimationFrame !== 'function') { drawAll(); return; }
    if (rafPending) w.cancelAnimationFrame(rafPending);
    rafPending = w.requestAnimationFrame(() => { rafPending = 0; drawAll(); });
  }
  function drawAll(freshOnly) {
    const figs = doc.querySelectorAll('.flowchart-figure[data-fc-model]');
    for (const f of figs) {
      if (freshOnly === true && f.getAttribute('data-fc-drawn')) continue;
      try { draw(f); } catch (_e) { /* one figure must not strand the rest */ }
    }
  }
  function observeAll() {
    const ro = doc.__fcResizeObserver;
    if (!ro) return;
    for (const f of doc.querySelectorAll('.flowchart-figure')) ro.observe(f);
  }

  drawAll(onlyFresh);
  if (doc.__fcLayoutInstalled) { observeAll(); return; }
  doc.__fcLayoutInstalled = true;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => drawAll());
  if (doc.fonts?.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(() => drawAll());
  if (typeof ResizeObserver !== 'undefined') {
    doc.__fcResizeObserver = new ResizeObserver(() => { scheduleDrawAll(); });
    observeAll();
  }
}

// The serialized pass for the emulator's bootstrap <script>: the router's source and
// this pass, self-invoking. dagre is NOT here; the emulator prepends its IIFE, for
// the reason state-chart.transform.js gives above STATE_CHART_BROWSER_JS.
function browserJs() {
  const { graphLayoutKernel } = require('../_chart-family/graph-layout');
  return `(function(){var __fcKernel=${graphLayoutKernel.toString()};(${installFlowchartLayout.toString()})(document,__fcKernel);})();`;
}

module.exports = { installFlowchartLayout, browserJs };
