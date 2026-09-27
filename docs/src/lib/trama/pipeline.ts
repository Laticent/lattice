/**
 * Trama's browser pipeline: measure a figure, lay it out, fit it, paint it.
 *
 * `installGraphPass(doc, kernelFactory, adapterFactory, opts)` draws every figure an
 * adapter selects. The adapter is the chart: it reads and sanitizes its model, measures
 * its own harness, and paints its own markup. This file owns everything that is the same
 * for every graph chart:
 *   - the redraw signature, so a pass with nothing new costs no layout;
 *   - the fit and the type floor, solved as one fixed point in one draw;
 *   - the per-position fit memory, since a live preview replaces the element on each edit;
 *   - live layout: in a host that stamps `data-lattice-live-layout`, a redraw of a chart
 *     drawn here before is laid out in a worker, the newest edit wins, and the figure
 *     keeps its last drawing meanwhile;
 *   - the SVG write (only on change, `<title>`/`<desc>` kept, painted children hidden
 *     from assistive tech) and the observers.
 *
 * SERIALIZATION. The CLI export ships this function as source (`fn.toString()`) in a
 * bootstrap `<script>`, and the worker is built from the kernel's source. So this
 * function, the kernel factory and the adapter factory each close over NOTHING: they
 * reach each other only as arguments, and the paint helpers an adapter needs are handed
 * to it on its context. Types are erased at build time; a value import here would break
 * every export.
 *
 * UNITS. Layout runs in the HD baseline (a 1280px-wide section), so the kernel's fixed
 * thresholds mean the same thing at any render size: measured boxes are divided by S
 * (section width / 1280), and the SVG viewBox stays in HD units while the scale box is S
 * times larger in CSS px.
 */
import type { Box, Geometry, GraphModel, KernelFactory, LayoutOptions, Point, Rect, SizeMap } from './types';

/** A rect in the page's own CSS px, with any host transform divided out. */
export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** What the pipeline hands an adapter: the figure, the unit scale and the helpers. */
export interface GraphContext {
  doc: Document;
  fig: HTMLElement;
  harness: Element;
  /** Section width / 1280: divide a measured px size by S to get layout units. */
  S: number;
  maxScale: number;
  rectL(el: Element): RectLike;
  textLines(el: Element): string[];
  r1(v: number): number;
  esc(t: unknown): string;
  outline(kind: string, x: number, y: number, w: number, h: number, attrs: string, rimAttrs: string): string;
  grow(kind: string, w: number, h: number): { w: number; h: number };
  toOutline(end: Point, prev: Point, b: Box, kind: string | null): Point;
  cut(pts: Point[], boxes: Rect[]): Point[][];
  rounded(pts: Point[], rad: number): string;
  head(kind: string, tip: Point, dx: number, dy: number, size: number, cls: string): string;
}

/** What an adapter's `measure` returns: the kernel's input, plus anything its paint needs. */
export interface Measured {
  args: [GraphModel, SizeMap, LayoutOptions];
  [extra: string]: unknown;
}

/** The figure's parts the pipeline touches. */
export interface GraphParts {
  /** The scale box: sized and transformed by the fit. */
  box: HTMLElement;
  /** The measuring harness, hidden once drawn. */
  harness: Element;
  svg: SVGSVGElement;
  /** The element whose size is the stage (the fit's letterbox). */
  port: HTMLElement;
}

export interface GraphAdapter<M extends { shapes: { id: string }[] } = GraphModel> {
  /** Figures this chart draws. */
  selector: string;
  /** Every figure of this chart, drawn or not (observed for resizes, counted for position). */
  figure: string;
  /** The data-attribute and state prefix: 'fc' → data-fc-drawn, doc.__fcKernel. */
  attr: string;
  parts(fig: HTMLElement): GraphParts | null;
  /** Parse and SANITIZE the model (HARD RULE #22): the attribute is author-forgeable. */
  readModel(fig: HTMLElement): M | null;
  /** Inputs besides size and fonts that change the drawing (the model attribute, style reads). */
  signature(fig: HTMLElement, harness: Element): string[];
  measure(model: M, ctx: GraphContext): Measured;
  /** The painted children of the SVG, as markup. */
  paint(model: M, measured: Measured, geo: Geometry, ctx: GraphContext): string;
}

export type AdapterFactory<M extends { shapes: { id: string }[] } = GraphModel> = () => GraphAdapter<M>;

export interface PassOptions {
  /** Draw only figures that have never been drawn (the runtime's same-microtask pass). */
  onlyFresh?: boolean;
  /** Force live layout on, whatever the document says. */
  live?: boolean;
}

// Expando state lives on the document and on each figure, keyed by the adapter's prefix,
// so two charts on one page never share a kernel's cache, a worker queue or a fit memory.
// It is untyped bookkeeping by nature, hence `any` here and only here.
// biome-ignore lint/suspicious/noExplicitAny: expando state on host objects
type Bag = Record<string, any>;

export function installGraphPass<M extends { shapes: { id: string }[] }>(rootDoc: Document | null, kernelFactory: KernelFactory, adapterFactory: AdapterFactory<M>, opts?: PassOptions): void {
  const found = rootDoc || (typeof document !== 'undefined' ? document : null);
  if (!found || typeof kernelFactory !== 'function' || typeof adapterFactory !== 'function') return;
  const doc: Document = found;
  const A = adapterFactory();
  const D = doc as unknown as Bag;
  const P = A.attr;
  const key = (name: string) => `__${P}${name}`;
  const onlyFresh = Boolean(opts?.onlyFresh);
  // One kernel per document, kept across installs: a live preview calls this on every edit,
  // and a fresh kernel each time would throw away the layout cache between keystrokes
  // (an edit to a slide's title re-renders its figure with the same inputs).
  if (!D[key('Kernel')] || D[key('KernelFactory')] !== kernelFactory) {
    D[key('Kernel')] = kernelFactory();
    D[key('KernelFactory')] = kernelFactory;
  }
  const K = D[key('Kernel')];
  const HD = 1280;
  const MAX_SCALE = 1.25;
  // LIVE LAYOUT. In the preview an author types into (the host stamps
  // `data-lattice-live-layout` on <html>), a chart this document has drawn before is laid
  // out in a worker, so a keystroke never waits on dagre and the router: measured on a
  // 17-shape flowchart, a synchronous draw held every key 70-250 ms. The figure keeps its
  // last drawing meanwhile, and only the newest request for a chart is ever painted (a
  // worker cannot be interrupted, so at most one more waits behind the one in flight). The
  // first draw of a chart stays synchronous, and no export sets the flag, so nothing that
  // captures a page can capture a drawing still in flight. Without a Worker, or without
  // dagre's script URL to load into it, every draw stays synchronous.
  const live = Boolean(opts?.live) || Boolean(doc.documentElement?.hasAttribute?.('data-lattice-live-layout'));
  function liveWorker(): Bag | null {
    if (D[key('Worker')] !== undefined) return D[key('Worker')];
    D[key('Worker')] = null;
    try {
      const w = doc.defaultView as (Window & typeof globalThis) | null;
      if (!w || typeof w.Worker !== 'function' || typeof w.Blob !== 'function' || !w.URL?.createObjectURL) return null;
      let dagreSrc = '';
      for (const el of doc.querySelectorAll<HTMLScriptElement>('script[src]')) if (/lattice-dagre(\.min)?\.js(\?|#|$)/.test(el.src)) { dagreSrc = el.src; break; }
      if (!dagreSrc) return null;
      const src = `importScripts(${JSON.stringify(dagreSrc)});var K=(${kernelFactory.toString()})();` +
        'onmessage=function(e){var d=e.data,geo=null;try{geo=K.layout(d.model,d.sizes,d.opts,self.__latticeDagre)}catch(_x){}postMessage({id:d.id,geo:geo})};';
      const url = w.URL.createObjectURL(new w.Blob([src], { type: 'text/javascript' }));
      const worker = new w.Worker(url);
      w.URL.revokeObjectURL(url);
      const W: Bag = { worker, id: 0, jobs: new Map(), busy: new Set(), next: new Map() };
      // A worker that cannot start (a host that blocks blob: workers, dagre that will not
      // load) or stops answering falls back to drawing in place, for good.
      const fail = () => {
        if (D[key('Worker')] !== W) return;
        try { worker.terminate(); } catch (_e) { /* gone */ }
        D[key('Worker')] = null;
        for (const f of doc.querySelectorAll(A.figure)) { const F = f as unknown as Bag; F[key('PendingSig')] = null; f.removeAttribute(`data-${P}-pending`); F[key('Sig')] = null; }
        drawAll();
      };
      const DEADLINE = 3000;
      const send = (job: Bag) => {
        const id = ++W.id;
        W.jobs.set(id, job);
        W.busy.add(job.key);
        w.setTimeout(() => { if (W.jobs.has(id)) fail(); }, DEADLINE);
        worker.postMessage({ id, model: job.args[0], sizes: job.args[1], opts: job.args[2] });
      };
      W.post = (k: string, args: Measured['args'], cb: (geo: Geometry | null) => void) => {
        const job = { key: k, args, cb };
        if (W.busy.has(k)) W.next.set(k, job);
        else send(job);
      };
      worker.onmessage = (e: MessageEvent) => {
        const job = W.jobs.get(e.data?.id);
        if (!job) return;
        W.jobs.delete(e.data.id);
        W.busy.delete(job.key);
        const nx = W.next.get(job.key);
        if (nx) { W.next.delete(job.key); send(nx); }
        try { job.cb(e.data.geo); } catch (_e) { /* the next edit redraws */ }
      };
      worker.onerror = fail;
      D[key('Worker')] = W;
    } catch (_e) { D[key('Worker')] = null; }
    return D[key('Worker')];
  }

  let VIS = 1;
  function rectL(el: Element): RectLike {
    const r = el.getBoundingClientRect();
    if (VIS === 1) return r;
    return { left: r.left / VIS, top: r.top / VIS, right: r.right / VIS, bottom: r.bottom / VIS, width: r.width / VIS, height: r.height / VIS };
  }
  function readVis(sec: HTMLElement | null) {
    VIS = 1;
    if (sec && typeof sec.getBoundingClientRect === 'function' && sec.offsetWidth > 0) {
      const kr = sec.getBoundingClientRect().width / sec.offsetWidth;
      if (kr > 0 && kr < 100 && Math.abs(kr - 1) > 0.005) VIS = kr;
    }
  }
  function readTextMin(el: Element, fallback: number): number {
    let v = '';
    try { v = String(getComputedStyle(el).getPropertyValue('--chart-text-min') || '').trim(); } catch (_e) { return fallback; }
    const px = /^(-?[\d.]+)px$/.exec(v);
    if (px) return +px[1] > 0 ? +px[1] : fallback;
    const calc = /^calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)$/.exec(v);
    if (calc) { const n = +calc[1] * +calc[2]; return n > 0 ? n : fallback; }
    return fallback;
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const esc = (t: unknown) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** The lines the browser actually broke `el`'s text into, read with Range rects. */
  function textLines(el: Element): string[] {
    const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const node = el.firstChild;
    if (!node || node.nodeType !== 3 || typeof doc.createRange !== 'function') return [text];
    const raw = node.nodeValue || '';
    const range = doc.createRange();
    const lines: string[] = [];
    let top: number | null = null;
    let cur = '';
    const re = /\S+/g;
    for (let m = re.exec(raw); m; m = re.exec(raw)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rs = range.getClientRects();
      const t: number | null = rs.length ? Math.round(rs[0].top) : top;
      if (top !== null && t !== null && Math.abs(t - top) > 2) { lines.push(cur); cur = m[0]; } else cur = cur ? `${cur} ${m[0]}` : m[0];
      top = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  }

  /** The outline a shape word asks for, around the box (x, y, w, h). */
  function outline(kind: string, x: number, y: number, w: number, h: number, a: string, rim: string): string {
    const cx = x + w / 2, cy = y + h / 2;
    switch (kind) {
      case 'square': return `<rect${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"/>`;
      case 'pill': return `<rect${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}"/>`;
      case 'circle': return `<ellipse${a} cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"/>`;
      // A machine's entry and exit markers: a filled dot, and a ring around a dot (the inner
      // dot takes the rim attributes, so a chart can paint it apart from the ring).
      case 'start': return `<circle${a} cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.min(w, h) / 2)}"/>`;
      case 'end': return `<circle${a} cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.min(w, h) / 2)}"/>` +
        `<circle${rim} cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.min(w, h) * 0.28)}"/>`;
      case 'diamond': return `<path${a} d="M${r1(cx)} ${r1(y)}L${r1(x + w)} ${r1(cy)}L${r1(cx)} ${r1(y + h)}L${r1(x)} ${r1(cy)}Z"/>`;
      case 'io': { const s = Math.min(h * 0.35, w * 0.2); return `<path${a} d="M${r1(x + s)} ${r1(y)}L${r1(x + w)} ${r1(y)}L${r1(x + w - s)} ${r1(y + h)}L${r1(x)} ${r1(y + h)}Z"/>`; }
      case 'cylinder': {
        const ry = Math.min(h * 0.14, 8);
        return `<path${a} d="M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${r1(ry)} 0 0 1 ${r1(x + w)} ${r1(y + ry)}L${r1(x + w)} ${r1(y + h - ry)}A${r1(w / 2)} ${r1(ry)} 0 0 1 ${r1(x)} ${r1(y + h - ry)}Z"/>` +
          `<path${rim} d="M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${r1(ry)} 0 0 0 ${r1(x + w)} ${r1(y + ry)}"/>`;
      }
      case 'doc': {
        const wv = Math.min(h * 0.12, 6);
        return `<path${a} d="M${r1(x)} ${r1(y)}L${r1(x + w)} ${r1(y)}L${r1(x + w)} ${r1(y + h - wv)}C${r1(x + w * 0.75)} ${r1(y + h - 3 * wv)} ${r1(x + w * 0.25)} ${r1(y + h + wv)} ${r1(x)} ${r1(y + h - wv)}Z"/>`;
      }
      default: return `<rect${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="6"/>`;
    }
  }
  /** How much bigger than its text box each outline must be to hold the text. */
  function grow(kind: string, w: number, h: number): { w: number; h: number } {
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
   * Where a run arriving at a box along one axis meets the shape's OUTLINE. The kernel
   * ends every line at the bounding box; a diamond, circle, pill or slanted side sits
   * inside it, so the painter carries the end on to the outline itself.
   */
  function toOutline(end: Point, prev: Point, b: Box, kind: string | null): Point {
    const horiz = Math.abs(end.y - prev.y) < 0.05;
    const inward = horiz ? Math.sign(b.cx - end.x) : Math.sign(b.cy - end.y);
    const hw = b.w / 2, hh = b.h / 2;
    let depth = 0; // how far past the bounding box the outline sits, along the run
    if (horiz) {
      const t = Math.min(1, Math.abs(end.y - b.cy) / hh);
      if (kind === 'diamond') depth = hw * t;
      else if (kind === 'circle' || kind === 'start' || kind === 'end') depth = hw * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      else if (kind === 'pill') { const r = hh; const dy = Math.abs(end.y - b.cy); depth = r - Math.sqrt(Math.max(0, r * r - dy * dy)); }
      else if (kind === 'io') { const sl = Math.min(b.h * 0.35, b.w * 0.2); const f = (end.y - b.y) / b.h; depth = inward > 0 ? sl * (1 - f) : sl * f; }
      return { x: end.x + inward * depth, y: end.y };
    }
    const t = Math.min(1, Math.abs(end.x - b.cx) / hw);
    if (kind === 'diamond') depth = hh * t;
    else if (kind === 'circle' || kind === 'start' || kind === 'end') depth = hh * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
    else if (kind === 'cylinder' && inward > 0) { const ry = Math.min(b.h * 0.14, 8); depth = ry * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    return { x: end.x, y: end.y + inward * depth };
  }

  /** Split an orthogonal polyline where it passes under any of `boxes`. */
  function cut(pts: Point[], boxes: Rect[]): Point[][] {
    const runs: Point[][] = [];
    let cur: Point[] = [pts[0]];
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      const horiz = Math.abs(a.y - b.y) < 0.05;
      const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const gaps: [number, number][] = [];
      for (const bx of boxes) {
        const inCross = horiz ? a.y > bx.y && a.y < bx.y + bx.h : a.x > bx.x && a.x < bx.x + bx.w;
        if (!inCross) continue;
        const g0 = Math.max(lo, horiz ? bx.x : bx.y), g1 = Math.min(hi, horiz ? bx.x + bx.w : bx.y + bx.h);
        if (g1 > g0) gaps.push([g0, g1]);
      }
      if (!gaps.length) { cur.push(b); continue; }
      gaps.sort((u, v) => u[0] - v[0]);
      const fwd = horiz ? b.x >= a.x : b.y >= a.y;
      const at = (v: number): Point => (horiz ? { x: v, y: a.y } : { x: a.x, y: v });
      const ordered = fwd ? gaps : gaps.map(([g0, g1]): [number, number] => [g1, g0]).reverse();
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
  function rounded(pts: Point[], rad: number): string {
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
  function head(kind: string, tip: Point, dx: number, dy: number, size: number, cls: string): string {
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const at = (a: number, b: number) => `${r1(tip.x - ux * a + px * b)} ${r1(tip.y - uy * a + py * b)}`;
    if (kind === 'dot') return `<circle class="${cls}" data-head="dot" cx="${r1(tip.x - ux * size * 0.45)}" cy="${r1(tip.y - uy * size * 0.45)}" r="${r1(size * 0.4)}"/>`;
    if (kind === 'open') return `<path class="${cls}" data-head="open" d="M${at(size, size * 0.55)}L${at(0, 0)}L${at(size, -size * 0.55)}"/>`;
    if (kind === 'cross') return `<path class="${cls}" data-head="cross" d="M${at(size * 1.1, size * 0.5)}L${at(size * 0.1, -size * 0.5)}M${at(size * 1.1, -size * 0.5)}L${at(size * 0.1, size * 0.5)}"/>`;
    return `<path class="${cls}" data-head="arrow" d="M${at(0, 0)}L${at(size, size * 0.5)}L${at(size, -size * 0.5)}Z"/>`;
  }

  // The letterbox scale a drawing of natW by natH gets in `port`; null when unmeasurable.
  function fitOf(port: Element, natW: number, natH: number): number | null {
    const view = rectL(port);
    if (!(view.width > 0 && view.height > 0 && natW > 0 && natH > 0)) return null;
    return Math.min(MAX_SCALE, view.width / natW, view.height / natH);
  }
  // A chart's place in the document (its section, then its order there): what the fit
  // remembers across a live preview replacing the element on each edit.
  function chartKey(fig: Element, sec: Element | null): string {
    const secs = doc.querySelectorAll('section');
    let si = -1;
    for (let i = 0; i < secs.length; i++) if (secs[i] === sec) { si = i; break; }
    const figs = sec ? sec.querySelectorAll(A.figure) : [];
    let fi = 0;
    for (let i = 0; i < figs.length; i++) if (figs[i] === fig) { fi = i; break; }
    return `${si}:${fi}`;
  }
  function applyFit(fig: Element, box: HTMLElement, natW: number, natH: number): number | null {
    const k = fitOf(fig, natW, natH);
    if (k == null) return null;
    const fitted = Math.abs(k - 1) >= 0.005;
    box.style.transform = `translate(-50%, -50%)${fitted ? ` scale(${k.toFixed(4)})` : ''}`;
    if (fitted) box.setAttribute('data-fit-k', k.toFixed(4)); else box.removeAttribute('data-fit-k');
    // The type floor, counter-scaled: raise the DECLARED floor by 1/k so the transform
    // brings it back down to the floor the token asks for. Only ever upwards.
    if (k < 1) box.style.setProperty('--chart-text-min', `${(readTextMin(fig, 11) / k).toFixed(3)}px`);
    else box.style.removeProperty('--chart-text-min');
    return k;
  }

  function draw(fig: HTMLElement) {
    const F = fig as unknown as Bag;
    const dagre = (globalThis as unknown as Bag).__latticeDagre;
    const parts = A.parts(fig);
    if (!parts) return;
    const { box, harness, svg } = parts;
    if (!dagre) { fig.setAttribute(`data-${P}-nolayout`, '1'); return; }
    fig.removeAttribute(`data-${P}-nolayout`);
    // A figure mid-reveal (the docs Drawing Board tilts it) measures foreshortened.
    try { const t = getComputedStyle(fig).transform; if (t && t !== 'none') return; } catch (_e) { /* measure anyway */ }
    let read: M | null;
    try { read = A.readModel(fig); } catch (_e) { return; }
    if (!read?.shapes.length) return;
    const model = read;
    const sec = typeof fig.closest === 'function' ? fig.closest('section') : null;
    // A redraw with nothing changed (the resize observer's first call, fonts that were
    // already loaded, the DOMContentLoaded pass) would measure every label again, which
    // forces a page layout per read. Its inputs are cheap to read, so skip it when they
    // match the last completed draw.
    const port0 = parts.port;
    const sigNow = () => [...A.signature(fig, harness), sec ? sec.offsetWidth : 0, port0.clientWidth, port0.clientHeight, doc.fonts ? doc.fonts.status : ''].join('\u0001');
    const sig = sigNow();
    if (F[key('Sig')] === sig && fig.getAttribute(`data-${P}-drawn`)) return;
    // A live layout for exactly these inputs is already in flight.
    if (F[key('PendingSig')] === sig) return;
    // ...or it answered, with no layout for exactly these inputs.
    if (F[key('NoLayoutSig')] === sig) return;
    readVis(sec);
    const S = sec && sec.offsetWidth > 0 ? sec.offsetWidth / HD : 1;
    const ctx: GraphContext = { doc: doc, fig, harness, S, maxScale: MAX_SCALE, rectL, textLines, r1, esc, outline, grow, toOutline, cut, rounded, head };

    // Measure with the harness laid out and the box unscaled.
    const unlay = () => {
      fig.removeAttribute(`data-${P}-drawn`);
      box.style.transform = 'translate(-50%, -50%)';
      box.style.width = '';
      box.style.height = '';
    };
    // THE TYPE FLOOR AND THE FIT ARE ONE FIXED POINT. applyFit raises the declared type
    // floor by 1/k when the fit shrinks the chart, which grows the text this pass measures,
    // which changes the layout and so k. Solved across redraws, that loop cost a big chart
    // 4 to 7 full layouts per keystroke in the Studio, each a cache miss. So it is solved
    // here, in one draw: start from the scale this chart had last (kept per chart position,
    // since a live preview replaces the element on every edit), measure and lay out, and go
    // again only while the floor that scale implies moves by more than 1% (3 rounds at most).
    const floorFor = (k: number) => {
      if (k < 1) box.style.setProperty('--chart-text-min', `${(readTextMin(fig, 11) / k).toFixed(3)}px`);
      else box.style.removeProperty('--chart-text-min');
    };
    const lift = (k: number) => (k < 1 ? 1 / k : 1);
    const fitKey = chartKey(fig, sec);
    if (!D[key('Fit')]) D[key('Fit')] = new Map();
    let kGuess: number = D[key('Fit')].get(fitKey) ?? 1;
    const measure = (): Measured & { geo: Geometry | null } => ({ ...A.measure(model, ctx), geo: null });
    // Another round only while the floor the new fit implies moves by more than 1%.
    const settled = (geo: Geometry) => {
      const kNow = fitOf(port0, geo.width * S, geo.height * S);
      if (kNow == null || Math.abs(lift(kNow) - lift(kGuess)) / lift(kGuess) < 0.01) return true;
      kGuess = kNow;
      return false;
    };
    if (!D[key('Prev')]) D[key('Prev')] = new Map();
    const prev = D[key('Prev')].get(fitKey);
    // Live: an EDIT of the chart drawn here before. A live preview patches one section in
    // place as the author moves between slides, so position alone would hand a new slide's
    // chart the last slide's drawing to show meanwhile: all but two of the shapes must be the
    // same ones (a keystroke renames one). A figure outside a section has no position to key on.
    const ids = model.shapes.map((x) => x.id);
    const same = prev ? ids.filter((id) => prev.ids.includes(id)).length : 0;
    const W = live && sec && prev && same >= Math.max(ids.length, prev.ids.length) - 2 ? liveWorker() : null;
    if (W) {
      if (!D[key('Latest')]) D[key('Latest')] = new Map();
      const token = (D[key('Tokens')] = (D[key('Tokens')] || 0) + 1);
      D[key('Latest')].set(fitKey, token);
      const round = (r: number) => {
        readVis(sec);
        unlay();
        floorFor(kGuess);
        const m = measure();
        showPrev(prev);
        // The state the figure holds while this is in flight: a pass the runtime runs
        // meanwhile (it answers every attribute change above) finds it and skips.
        F[key('PendingSig')] = sigNow();
        W.post(fitKey, m.args, (geo: Geometry | null) => {
          if (D[key('Latest')].get(fitKey) !== token || !fig.isConnected) return;
          // No layout: the measuring tiles, as a synchronous draw leaves them, never the old
          // drawing standing in for a chart that no longer looks like it.
          if (!geo) { unlay(); fig.removeAttribute(`data-${P}-pending`); F[key('PendingSig')] = null; F[key('NoLayoutSig')] = sigNow(); return; }
          m.geo = geo;
          if (r < 2 && !settled(geo)) { round(r + 1); return; }
          finish(m as Measured & { geo: Geometry });
        });
      };
      round(0);
      return;
    }
    unlay();
    floorFor(kGuess);
    let m: (Measured & { geo: Geometry | null }) | null = null;
    for (let round = 0; round < 3; round++) {
      m = measure();
      m.geo = K.layout(m.args[0], m.args[1], m.args[2], dagre);
      if (!m.geo) return;
      if (settled(m.geo)) break;
      floorFor(kGuess);
    }
    finish(m as Measured & { geo: Geometry });

    function finish(m: Measured & { geo: Geometry }) {
      const geo = m.geo;
      const drawn = A.paint(model, m, geo, ctx);
      const vb = `0 0 ${r1(geo.width)} ${r1(geo.height)}`;
      writeSvg(drawn, vb);
      box.style.width = `${r1(geo.width * S)}px`;
      box.style.height = `${r1(geo.height * S)}px`;
      fig.setAttribute(`data-${P}-drawn`, '1');
      if (fig.getAttribute(`data-${P}-laid`) !== geo.dir) fig.setAttribute(`data-${P}-laid`, geo.dir);
      const kFit = applyFit(port0, box, geo.width * S, geo.height * S);
      if (kFit != null) D[key('Fit')].set(fitKey, kFit);
      // The signature of the state this draw LEFT (its own fit and type floor included), so
      // the resize observer and the next pass see nothing new and skip.
      F[key('Sig')] = sigNow();
      F[key('PendingSig')] = null;
      fig.removeAttribute(`data-${P}-pending`);
      D[key('Prev')].set(fitKey, { ids: model.shapes.map((x) => x.id), drawn, vb, w: box.style.width, h: box.style.height, transform: box.style.transform, k: box.getAttribute('data-fit-k'), floor: box.style.getPropertyValue('--chart-text-min'), dir: geo.dir });
    }

    // The painted children replace the old ones only when the markup changed; the SVG's own
    // <title>/<desc> stay, and every painted child is hidden from assistive tech.
    function writeSvg(drawn: string, vb: string) {
      const S2 = svg as unknown as Bag;
      const keep = (String(svg.innerHTML || '').match(/^\s*(?:<(?:title|desc)\b[\s\S]*?<\/(?:title|desc)>\s*)+/) || [''])[0];
      const paint = keep + drawn;
      if (S2[key('Paint')] !== paint) {
        svg.innerHTML = paint;
        S2[key('Paint')] = paint;
        for (const el of svg.children ? [...svg.children] : []) {
          const tag = String(el.tagName || '').toLowerCase();
          if (tag !== 'title' && tag !== 'desc') el.setAttribute('aria-hidden', 'true');
        }
      }
      if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
    }
    // While a live layout is in flight the figure shows the last drawing at this position,
    // fitted as it was, instead of its measuring tiles. `data-<prefix>-pending` says so.
    function showPrev(p: Bag) {
      writeSvg(p.drawn, p.vb);
      box.style.width = p.w;
      box.style.height = p.h;
      box.style.transform = p.transform;
      if (p.k) box.setAttribute('data-fit-k', p.k); else box.removeAttribute('data-fit-k');
      if (p.floor) box.style.setProperty('--chart-text-min', p.floor); else box.style.removeProperty('--chart-text-min');
      fig.setAttribute(`data-${P}-drawn`, '1');
      fig.setAttribute(`data-${P}-pending`, '1');
      if (fig.getAttribute(`data-${P}-laid`) !== p.dir) fig.setAttribute(`data-${P}-laid`, p.dir);
    }
  }

  let rafPending = 0;
  function scheduleDrawAll() {
    const w = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!w || typeof w.requestAnimationFrame !== 'function') { drawAll(); return; }
    if (rafPending) w.cancelAnimationFrame(rafPending);
    rafPending = w.requestAnimationFrame(() => { rafPending = 0; drawAll(); });
  }
  function drawAll(freshOnly?: boolean) {
    const figs = doc.querySelectorAll<HTMLElement>(A.selector);
    for (const f of figs) {
      if (freshOnly === true && f.getAttribute(`data-${P}-drawn`)) continue;
      try { draw(f); } catch (_e) { /* one figure must not strand the rest */ }
    }
  }
  function observeAll() {
    const ro = D[key('ResizeObserver')];
    if (!ro) return;
    for (const f of doc.querySelectorAll(A.figure)) ro.observe(f);
  }

  drawAll(onlyFresh);
  if (D[key('LayoutInstalled')]) { observeAll(); return; }
  D[key('LayoutInstalled')] = true;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => drawAll());
  if (doc.fonts?.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(() => drawAll());
  if (typeof ResizeObserver !== 'undefined') {
    D[key('ResizeObserver')] = new ResizeObserver(() => { scheduleDrawAll(); });
    observeAll();
  }
}
