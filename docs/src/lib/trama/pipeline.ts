/**
 * Trama's browser pipeline: measure a figure, lay it out, fit it, paint it.
 *
 * `installGraphPass(doc, kernelFactory, adapterFactory, opts)` draws every figure an
 * adapter selects. The adapter is the chart: it reads and sanitizes its model, measures
 * its own harness, and paints its own markup. This file owns everything that is the same
 * for every graph chart:
 *   - the font wait: no layout while the page's fonts are loading (a 2 s deadline, and a
 *     `document.__latticeGraphFlush` hook a capturing host calls), so a chart is drawn
 *     once, in its own fonts;
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
  head(kind: string, tip: Point, dx: number, dy: number, size: number, cls: string, extra?: string): string;
  /** Every routed line as markup: ends on outlines, cut under labels and titles, rounded, with heads and labels. */
  lines(geo: Geometry, edges: LineEdge[], kindOf: (id: string) => string | null, o: LineOptions): string;
  /** The group boxes (`under`, before the lines) and their titles (`over`, after them). */
  groups(list: LineGroup[], geo: Geometry, titleFont: number, cls: { box: string; title: string }): { under: string; over: string };
}

/** A line as the `lines` painter reads it (the chart's model edge, or one it added). */
export interface LineEdge {
  dir?: string;
  label?: string;
  heavy?: boolean;
  back?: boolean;
  /** A note's tether: no head. */
  tether?: boolean;
  style?: { slot?: number | string; pattern?: string; head?: string; [extra: string]: unknown };
  [extra: string]: unknown;
}

/** How `lines` paints: the chart's class names, the corner radius and the label size. */
export interface LineOptions {
  cls: { group: string; path: string; head: string; label: string };
  radius: number;
  labelFont: number;
  /** Extra attributes on every path and every head, e.g. ` data-anima-role="bar"`. */
  pathAttrs?: string;
  headAttrs?: string;
}

/** A group as the `groups` painter reads it. */
export interface LineGroup {
  id: string;
  name: string;
  parent?: string | null;
  slot?: number | string;
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
  // worker cannot be interrupted, so at most one more waits behind the one in flight). No
  // export sets the flag, so no capture waits on a worker. A first draw can still wait for
  // the page's fonts (FONT_DEADLINE below), so a capturing host calls `__latticeGraphFlush`
  // first. Without a Worker, or without dagre's script URL to load into it, every draw
  // stays synchronous.
  const live = Boolean(opts?.live) || Boolean(doc.documentElement?.hasAttribute?.('data-lattice-live-layout'));
  // SLOT: 'Worker' lays out every keystroke. 'Search' runs only the pause search (sticky wrap,
  // below), so a key typed while that search runs never queues behind it: a worker cannot be
  // interrupted, and a search that a newer key made stale is dropped by its token anyway.
  function liveWorker(slot: 'Worker' | 'Search' = 'Worker'): Bag | null {
    if (D[key(slot)] !== undefined) return D[key(slot)];
    D[key(slot)] = null;
    try {
      const w = doc.defaultView as (Window & typeof globalThis) | null;
      if (!w || typeof w.Worker !== 'function' || typeof w.Blob !== 'function' || !w.URL?.createObjectURL) return null;
      let dagreSrc = '';
      for (const el of doc.querySelectorAll<HTMLScriptElement>('script[src]')) if (/lattice-dagre(-min)?\.js(\?|#|$)/.test(el.src)) { dagreSrc = el.src; break; }
      // No dagre tag YET is not a verdict: a host adds it once a chart appears (the Studio's
      // `ensureDagre`), and a pass can run first. Ask again next time, rather than caching a
      // null that would keep every later layout on the editor's thread for the frame's life.
      if (!dagreSrc) { D[key(slot)] = undefined; return null; }
      const src = `importScripts(${JSON.stringify(dagreSrc)});var K=(${kernelFactory.toString()})();` +
        'onmessage=function(e){var d=e.data,geo=null;try{geo=K.layout(d.model,d.sizes,d.opts,self.__latticeDagre)}catch(_x){}postMessage({id:d.id,geo:geo})};';
      const url = w.URL.createObjectURL(new w.Blob([src], { type: 'text/javascript' }));
      const worker = new w.Worker(url);
      w.URL.revokeObjectURL(url);
      const W: Bag = { worker, id: 0, jobs: new Map(), busy: new Set(), next: new Map() };
      // A worker that cannot start (a host that blocks blob: workers, dagre that will not
      // load) or stops answering falls back to drawing in place, for good.
      const fail = () => {
        if (D[key(slot)] !== W) return;
        try { worker.terminate(); } catch (_e) { /* gone */ }
        D[key(slot)] = null;
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
      D[key(slot)] = W;
    } catch (_e) { D[key(slot)] = null; }
    return D[key(slot)];
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
  function head(kind: string, tip: Point, dx: number, dy: number, size: number, cls: string, extra = ''): string {
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const at = (a: number, b: number) => `${r1(tip.x - ux * a + px * b)} ${r1(tip.y - uy * a + py * b)}`;
    if (kind === 'dot') return `<circle class="${cls}"${extra} data-head="dot" cx="${r1(tip.x - ux * size * 0.45)}" cy="${r1(tip.y - uy * size * 0.45)}" r="${r1(size * 0.4)}"/>`;
    if (kind === 'open') return `<path class="${cls}"${extra} data-head="open" d="M${at(size, size * 0.55)}L${at(0, 0)}L${at(size, -size * 0.55)}"/>`;
    if (kind === 'cross') return `<path class="${cls}"${extra} data-head="cross" d="M${at(size * 1.1, size * 0.5)}L${at(size * 0.1, -size * 0.5)}M${at(size * 1.1, -size * 0.5)}L${at(size * 0.1, size * 0.5)}"/>`;
    return `<path class="${cls}"${extra} data-head="arrow" d="M${at(0, 0)}L${at(size, size * 0.5)}L${at(size, -size * 0.5)}Z"/>`;
  }

  /**
   * Every routed line as markup, the way both graph charts draw them: each end carried on
   * to its shape's outline, the stroke backed off a head's tip, the path cut where it
   * passes under a label or a group title (so a label sits ON its line), corners rounded
   * by `o.radius`, and the label centered in its seat. The class names come from the chart.
   */
  function lines(geo: Geometry, edges: LineEdge[], kindOf: (id: string) => string | null, o: LineOptions): string {
    const parts: string[] = [];
    const holes: Rect[] = [];
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
      const nb = (id: string) => geo.nodes[id];
      if (nb(r.from) && P.length > 1) P[0] = toOutline(P[0], P[1], nb(r.from), kindOf(r.from));
      if (nb(r.to) && P.length > 1) P[P.length - 1] = toOutline(P[P.length - 1], P[P.length - 2], nb(r.to), kindOf(r.to));
      // Back the stroke off the tip so it never pokes through the head.
      const pts = P.map((p) => ({ ...p }));
      const back = (i: number, j: number, by: number) => { const a = pts[i], b = pts[j]; const L = Math.hypot(a.x - b.x, a.y - b.y); if (L > by + 1) { a.x -= ((a.x - b.x) / L) * by; a.y -= ((a.y - b.y) / L) * by; } };
      const n = pts.length;
      if (endHead === 'arrow') back(n - 1, n - 2, HEAD * 0.8);
      if (startHead === 'arrow') back(0, 1, HEAD * 0.8);
      const attrs = `${e.heavy ? ' data-heavy="1"' : ''}${st.pattern ? ` data-pattern="${esc(st.pattern)}"` : ''}${st.slot ? ` data-slot="${esc(st.slot)}"` : ''}${e.back ? ' data-back="1"' : ''}${e.tether ? ' data-tether="1"' : ''}`;
      const runs = cut(pts, holes);
      let g = `<g class="${o.cls.group}" data-edge="${r.index}"${attrs}>`;
      const pa = o.pathAttrs || '';
      for (const run of runs) g += `<path class="${o.cls.path}"${pa} d="${rounded(run, o.radius)}"/>`;
      const ha = o.headAttrs || '';
      if (endHead) g += head(endHead, P[P.length - 1], P[P.length - 1].x - P[P.length - 2].x, P[P.length - 1].y - P[P.length - 2].y, HEAD * (e.heavy ? 1.25 : 1), o.cls.head, ha);
      if (startHead) g += head(startHead, P[0], P[0].x - P[1].x, P[0].y - P[1].y, HEAD * (e.heavy ? 1.25 : 1), o.cls.head, ha);
      if (r.labelAt && e.label) g += `<text class="${o.cls.label}" x="${r1(r.labelAt.x)}" y="${r1(r.labelAt.y)}" font-size="${r1(o.labelFont)}" text-anchor="middle" dominant-baseline="central">${esc(e.label)}</text>`;
      parts.push(`${g}</g>`);
    }
    return parts.join('');
  }

  /**
   * The groups as markup: a box per group, outer ones first (`under`, painted before the
   * lines), and each group's title in the seat the kernel kept for it (`over`, painted
   * after them). The class names come from the chart.
   */
  function groups(list: LineGroup[], geo: Geometry, titleFont: number, cls: { box: string; title: string }): { under: string; over: string } {
    const all = list || [];
    const depth = (gid: string) => { let d = 0; let p = all.find((g) => g.id === gid)?.parent; while (p) { d++; const q: string | null | undefined = p; p = all.find((g) => g.id === q)?.parent; } return d; };
    const sorted = all.slice().sort((a, b) => depth(a.id) - depth(b.id));
    let under = '';
    let over = '';
    for (const g of sorted) {
      const b = geo.groups[g.id];
      if (!b) continue;
      under += `<rect class="${cls.box}" data-group="${esc(g.id)}"${g.slot ? ` data-slot="${esc(g.slot)}"` : ''} data-depth="${depth(g.id)}" x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="10"/>`;
    }
    for (const g of sorted) {
      const t = geo.titles?.[g.id];
      if (!t) continue;
      over += `<text class="${cls.title}" data-group="${esc(g.id)}"${g.slot ? ` data-slot="${esc(g.slot)}"` : ''} x="${r1(t.x)}" y="${r1(t.y + t.h / 2)}" font-size="${r1(titleFont)}" dominant-baseline="central">${esc(g.name)}</text>`;
    }
    return { under, over };
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
    // No dagre is not the end: a chart that wraps (the state chart's chain) lays out on the
    // kernel's reading-order grid without it. Whatever still needs dagre comes back null
    // below and keeps its measuring tiles, marked `data-<prefix>-nolayout`.
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
    const sigNow = () => [...A.signature(fig, harness), sec ? sec.offsetWidth : 0, port0.clientWidth, port0.clientHeight, doc.fonts ? doc.fonts.status : '', dagre ? 1 : 0].join('\u0001');
    const sig = sigNow();
    if (F[key('Sig')] === sig && fig.getAttribute(`data-${P}-drawn`)) return;
    // A live layout for exactly these inputs is already in flight.
    if (F[key('PendingSig')] === sig) return;
    // ...or it answered, with no layout for exactly these inputs.
    if (F[key('NoLayoutSig')] === sig) return;
    // A viewport laid out with a width but no height (a stage collapsed at a narrow
    // viewport) has nothing to fit into: a layout into a zero-height stage tries every
    // candidate for nothing (52 s on a dense machine). The resize observer draws it once it
    // has a height. (A document that lays nothing out, jsdom, reads 0 for both and draws.)
    if (port0.clientWidth > 0 && !(port0.clientHeight > 0)) return;
    readVis(sec);
    const S = sec && sec.offsetWidth > 0 ? sec.offsetWidth / HD : 1;
    const ctx: GraphContext = { doc: doc, fig, harness, S, maxScale: MAX_SCALE, rectL, textLines, r1, esc, outline, grow, toOutline, cut, rounded, head, lines, groups };

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
    // again only while the floor that scale implies moves by more than 1% (ROUNDS at most).
    //
    // THE FIRST DRAW has no scale to start from, so it starts at 1, and a chart the fit
    // shrinks hard converges slowly from there: the typing deck's 17-shape chart asks for a
    // floor lift of 1, 1.63, 1.90, 2.05, 2.13 ... 2.25, each step ~0.57 of the last. Stopped
    // at the third round, it painted text measured at a 2.05 lift under a 2.21 fit, 10.2px
    // against the 11px floor. So from the third round on the guess is the SECANT step: the
    // lift is close to affine in itself (the chart's text-driven share grows with it, the rest
    // does not), so two rounds give its slope and the point where the line meets itself.
    // The first two rounds are unchanged, so a chart that settles in two draws the same bytes.
    const ROUNDS = 4;
    const floorFor = (k: number) => {
      if (k < 1) box.style.setProperty('--chart-text-min', `${(readTextMin(fig, 11) / k).toFixed(3)}px`);
      else box.style.removeProperty('--chart-text-min');
    };
    const lift = (k: number) => (k < 1 ? 1 / k : 1);
    const fitKey = chartKey(fig, sec);
    if (!D[key('Fit')]) D[key('Fit')] = new Map();
    // STICKY WRAP. What a full search chose for this chart, kept per chart position like the
    // fit: a grid (its line count and direction) or dagre's layout (its direction). Laying out
    // that one choice directly gives the same drawing as the search that picked it (every
    // recorded call is byte-identical pinned: 28 grid picks, 11 dagre picks), without the
    // search: no bounds passes, no dagre ceiling, no second routing. So a live keystroke lays
    // out the pinned choice and the chart's rows hold mid-edit; the full search runs once the
    // pinned drawing has stood REWRAP_AFTER, in its own worker so a key never waits behind it.
    if (!D[key('Wrap')]) D[key('Wrap')] = new Map();
    let kGuess: number = D[key('Fit')].get(fitKey) ?? 1;
    const measure = (): Measured & { geo: Geometry | null } => ({ ...A.measure(model, ctx), geo: null });
    // The last round's [lift guessed, lift it came out at], for the secant step.
    let last: [number, number] | null = null;
    // Another round only while the floor the new fit implies moves by more than 1%.
    // A CHART UNDER HALF SIZE STOPS ONLY WHEN IT CANNOT SETTLE. Lifting the floor by 1/k grows
    // the text, which grows the layout and lowers k again. When the text drives the size
    // faster than the lift (slope 1 or more), there is no fixed point: a 36-state machine went
    // k 0.10, 0.04, 0.01 over three rounds of 7-13 s each, and every round only made it
    // smaller. A contracting chart under half size DOES settle, and the secant step lands it
    // (a chart at k 0.45 whose floor must reach 35 px gets there in three rounds). Two rounds
    // give the slope, so an over-budget chart stops at the second round when that slope is
    // 0.9 or more (where the secant step gives up) or negative; the TYPE FLOOR report says so.
    const OVER_BUDGET = 0.5;
    const settled = (geo: Geometry) => {
      const kNow = fitOf(port0, geo.width * S, geo.height * S);
      if (kNow == null || Math.abs(lift(kNow) - lift(kGuess)) / lift(kGuess) < 0.01) return true;
      const lg = lift(kGuess), ln = lift(kNow);
      let next = kNow;
      if (last && lg !== last[0]) {
        // The slope of lift-out against lift-in. Only a contracting, same-direction step is
        // extrapolated (0 to 0.9, so at most 9 steps' worth); anything else iterates plainly.
        const b = (ln - last[1]) / (lg - last[0]);
        if (b >= 0 && b <= 0.9) { const L = (ln - b * lg) / (1 - b); next = L > 1 ? 1 / L : 1; }
        else if (kNow < OVER_BUDGET) return true;
      }
      last = [lg, ln];
      kGuess = next;
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
    const sameChart = Boolean(prev && same >= Math.max(ids.length, prev.ids.length) - 2);
    // Only the chart drawn here before starts from its remembered fit. Another chart at this
    // position (the next slide's, in a live preview) fits from a cold start, as an export does.
    if (!sameChart) kGuess = 1;
    const W = live && sec && sameChart ? liveWorker() : null;
    if (W) {
      if (!D[key('Latest')]) D[key('Latest')] = new Map();
      const token = (D[key('Tokens')] = (D[key('Tokens')] || 0) + 1);
      D[key('Latest')].set(fitKey, token);
      const REWRAP_AFTER = 300;
      // SETTLE: the chain that runs once the drawing has stood REWRAP_AFTER. It searches, and it
      // fits from a cold start (k 1, as a paste or an export does) with its rounds hidden, so the
      // drawing at rest is a function of the text and the stage alone, never of the path typed.
      const round = (r: number, search: boolean, via: Bag = W, settle = false) => {
        readVis(sec);
        unlay();
        floorFor(kGuess);
        const m = measure();
        const opts = m.args[2];
        // A pin holds only for the direction the chart asked for when the search chose it: an
        // author who changes the direction gets a search at once, not at the pause.
        const held = search || !opts.wrap ? undefined : (D[key('Wrap')].get(fitKey) as { lines: number; dir: 'lr' | 'tb'; asked: unknown } | undefined);
        const pin = held && held.asked === opts.dir ? held : undefined;
        if (pin) m.pinned = true;
        // A pinned grid lays out that grid; a pinned dagre pick (lines 0) lays out dagre's layout
        // in that direction. Each is byte-identical to the search's pick (every recorded call).
        const args: typeof m.args = pin
          ? [m.args[0], m.args[1], pin.lines ? { ...opts, wrap: false, dir: pin.dir, grid: pin.lines, grow: false } : { ...opts, wrap: false, dir: pin.dir }]
          : m.args;
        // The newest drawing stands in while this round is in flight: the last keystroke's,
        // or this keystroke's own earlier round once it has painted (below).
        showPrev(D[key('Prev')].get(fitKey) || prev);
        // The state the figure holds while this is in flight: a pass the runtime runs
        // meanwhile (it answers every attribute change above) finds it and skips.
        F[key('PendingSig')] = sigNow();
        via.post(fitKey, args, (geo: Geometry | null) => {
          if (D[key('Latest')].get(fitKey) !== token || !fig.isConnected) return;
          // The pinned grid cannot hold the shapes (a line would drop under two): search.
          if (!geo && pin) { D[key('Wrap')].delete(fitKey); last = null; round(r, true, via, settle); return; }
          // No layout: the measuring tiles, as a synchronous draw leaves them, never the old
          // drawing standing in for a chart that no longer looks like it.
          if (!geo) { unlay(); fig.removeAttribute(`data-${P}-pending`); F[key('PendingSig')] = null; F[key('NoLayoutSig')] = sigNow(); return; }
          m.geo = geo;
          // PAINT EVERY ROUND. The fit's fixed point can take up to ROUNDS layouts, and a mid-size
          // machine spends ~400 ms on each, so waiting for the last one froze the drawing for
          // the whole burst (measured: 1.3 s from a key to anything visible on an 11-state
          // chart). A round's drawing is already this keystroke's text, laid out; only its
          // type floor may still move a little, and the next round repaints it. The drawing
          // that remains is the last round's, the same as before.
          // A settling chain paints only its last round: its early rounds start from a cold fit and
          // would flash a chart drawn at the wrong type floor.
          if (r < ROUNDS - 1 && !settled(geo)) { if (!settle) finish(m as Measured & { geo: Geometry }); round(r + 1, search, via, settle); return; }
          finish(m as Measured & { geo: Geometry });
          if (settle) return;
          // The author paused: settle once, so the drawing at rest is the one every export makes
          // (the search's wrap, the cold fit's scale). When it matches the drawing up, the
          // painted markup is only replaced when it changed.
          setTimeout(() => {
            // A worker dropped meanwhile (an error, or another chart's deadline) already had the
            // chart redrawn synchronously; posting to it would leave the figure pending.
            if (D[key('Latest')].get(fitKey) !== token || !fig.isConnected || D[key('Worker')] !== W) return;
            kGuess = 1;
            last = null;
            round(0, true, liveWorker('Search') || W, true);
          }, REWRAP_AFTER);
        });
      };
      round(0, false);
      return;
    }
    unlay();
    floorFor(kGuess);
    let m: (Measured & { geo: Geometry | null }) | null = null;
    for (let round = 0; round < ROUNDS; round++) {
      m = measure();
      m.geo = K.layout(m.args[0], m.args[1], m.args[2], dagre);
      if (!m.geo) { if (!dagre) fig.setAttribute(`data-${P}-nolayout`, '1'); F[key('NoLayoutSig')] = sig; return; }
      if (settled(m.geo)) break;
      floorFor(kGuess);
    }
    finish(m as Measured & { geo: Geometry });

    function finish(m: Measured & { geo: Geometry }) {
      const geo = m.geo;
      fig.removeAttribute(`data-${P}-nolayout`);
      const drawn = A.paint(model, m, geo, ctx);
      const vb = `0 0 ${r1(geo.width)} ${r1(geo.height)}`;
      writeSvg(drawn, vb);
      box.style.width = `${r1(geo.width * S)}px`;
      box.style.height = `${r1(geo.height * S)}px`;
      fig.setAttribute(`data-${P}-drawn`, '1');
      if (fig.getAttribute(`data-${P}-laid`) !== geo.dir) fig.setAttribute(`data-${P}-laid`, geo.dir);
      const kFit = applyFit(port0, box, geo.width * S, geo.height * S);
      if (kFit != null) D[key('Fit')].set(fitKey, kFit);
      // A full search's choice is the pin: a grid (its lines and direction), or dagre's layout
      // (lines 0) in its direction. Half-typed text often parses as a chart whose search picks
      // dagre, and without a pin every key of it searched again: 3-4 rounds of 100-400 ms.
      if (!m.pinned && m.args[2].wrap) D[key('Wrap')].set(fitKey, { lines: geo.lines ?? 0, dir: geo.dir, asked: m.args[2].dir });
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
  // WAIT FOR THE FONTS. A chart is measured in its own fonts, so a draw while the page's
  // faces are still loading measures fallback metrics and is thrown away when they land:
  // on a cold load of a 7-chart deck that was 2 of every 3 layouts (32 layouts, 21 paints,
  // ~720 ms). So while `document.fonts.status` is `loading` a pass draws nothing; the
  // harness tiles show, and one waiter per document draws when the faces are in. A face
  // that never loads must not strand a chart, so the waiter also draws at FONT_DEADLINE
  // (the same 2 s bound settleFonts gives the runtime's boot sweep), and again once the
  // faces do land, since the status then changes the redraw signature.
  const FONT_DEADLINE = 2000;
  function fontsLoading(): boolean {
    const fonts = doc.fonts;
    if (!fonts || typeof fonts.status !== 'string') return false;
    // A face is requested only when text using it is first laid out, so before any layout
    // the status reads `loaded` with nothing in flight. The draw forces this layout anyway.
    try { void doc.documentElement?.offsetHeight; } catch (_e) { /* read the status as is */ }
    return fonts.status === 'loading';
  }
  function waitForFonts(): Bag | null {
    if (D[key('FontWait')]) return D[key('FontWait')];
    const fonts = doc.fonts;
    const w = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    // Nothing to wait on, or no clock to bound the wait with: draw now.
    if (!fonts?.ready || typeof fonts.ready.then !== 'function' || !w || typeof w.setTimeout !== 'function') return null;
    const wait: Bag = { timer: 0, expired: false };
    D[key('FontWait')] = wait;
    wait.timer = w.setTimeout(() => {
      if (D[key('FontWait')] !== wait) return;
      wait.timer = 0;
      wait.expired = true;
      drawAll(false, true);
    }, FONT_DEADLINE);
    // `ready` settles when the faces in flight do, but a face requested meanwhile starts a
    // new round with a new promise; follow it until the status really leaves `loading`.
    const onReady = () => {
      if (D[key('FontWait')] !== wait) return;
      if (fonts.status === 'loading') { fonts.ready.then(onReady, onReady); return; }
      if (wait.timer) w.clearTimeout(wait.timer);
      D[key('FontWait')] = null;
      drawAll();
    };
    fonts.ready.then(onReady, onReady);
    return wait;
  }
  // `force` draws whatever the fonts are doing: the deadline, and a host about to capture
  // the page (the CLI export calls `document.__latticeGraphFlush` before it measures and
  // prints, so no capture can take a chart still waiting on its fonts).
  function drawAll(freshOnly?: boolean, force?: boolean) {
    // Past the deadline a pass draws in whatever fonts there are (a figure patched in
    // meanwhile included); the waiter still redraws when the faces land.
    const figs = doc.querySelectorAll<HTMLElement>(A.selector);
    // No chart, no fonts question: reading the status forces a layout, which a document
    // with nothing to draw should not pay on every transform pass.
    if (!figs.length) return;
    if (!force && fontsLoading()) { const wait = waitForFonts(); if (wait && !wait.expired) return; }
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

  // The capture hook, one entry per chart kind: draw now, fonts or not.
  const flush = ((D.__latticeGraphFlush as Bag | undefined) || (D.__latticeGraphFlush = {})) as Bag;
  flush[P] = () => drawAll(false, true);
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
