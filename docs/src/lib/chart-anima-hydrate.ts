// View-time host that animates an OPTED-IN chart in place — the model-free chart on-ramp of
// §0.75, composing the two shipped pieces: the chart renderer's native `data-anima-role`+ids
// (build time) and `chartToScene` + the svg backend (view time). This is where an ingest that
// needs a browser + DOM belongs: the Playground/Present host runs in the frame at view time.
//
// It stays SEPARATE from `hydrate.ts` (the `data-scene-spec` scene host): a chart derives its
// scene from its own rendered marks here, rather than carrying a baked spec. The two share the
// backend + compile; unifying the rAF/controls is a deliberate follow-up (kept apart now so this
// can't regress the trio-hardened scene hydration). Export stays static — this is preview-only.

import { vivusRenderer } from './anima/backends/vivus';
import { compile } from './anima/compile';
import { parseScene } from './anima/schema';
import { chartToScene } from './chart-anima';

export interface ChartSceneController {
  dispose(): void;
}

export interface HydrateChartOptions {
  /** Sanitize the chart's svg markup before it enters the backend (HARD RULE #22 / the AssetMap
   *  contract). The docs-site passes `sanitizeSlideHtml`; omitted → identity. */
  sanitize?: (markup: string) => string;
  /** Force reduced-motion (tests); omitted → read `prefers-reduced-motion`. */
  reducedMotion?: boolean;
}

/** The funnel's worst outgoing conversion → its band's `data-mark`, so the leak emphasizes. Reads
 *  `data-value` off the bands (the renderer emits it). Generic charts with no ordered values → none. */
function worstMarks(svg: Element): number[] {
  const bands = Array.from(svg.querySelectorAll('.funnel-band[data-value]'));
  if (bands.length < 2) return [];
  const nums = bands.map((b) => Number(String(b.getAttribute('data-value')).replace(/[^0-9.]/g, '')));
  let worst = 0;
  let worstConv = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nums.length - 1; i++) {
    const conv = nums[i] > 0 ? nums[i + 1] / nums[i] : 1;
    if (Number.isFinite(conv) && conv < worstConv) {
      worstConv = conv;
      worst = i;
    }
  }
  return [worst];
}

/**
 * Animate ONE opted-in chart section in place. Derives a scene from the chart's own rendered svg
 * (via `chartToScene`, which reads the native `data-anima-role`), mounts the svg backend over a
 * hidden copy of the chart, and runs a one-shot build. Returns a controller (dispose restores the
 * static chart), or null if the section has no animatable chart. Preview-only; export is untouched.
 */
export function hydrateChart(section: Element, opts: HydrateChartOptions = {}): ChartSceneController | null {
  const doc = section.ownerDocument;
  const svg = section.querySelector('svg');
  if (!doc || !svg) return null;

  const reduced = typeof opts.reducedMotion === 'boolean' ? opts.reducedMotion : typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  const sanitize = opts.sanitize ?? ((m: string) => m);
  const built = chartToScene(sanitize(svg.outerHTML), { highlightMarks: worstMarks(svg) });
  if (!built) return null;
  const parsed = parseScene(built.scene);
  if (!parsed.ok) return null; // a malformed scene simply leaves the static chart standing

  const timeline = compile(parsed.scene);
  const renderer = vivusRenderer();
  const figure = (svg.parentElement as Element | null) ?? section;

  const stage = doc.createElement('div');
  stage.className = 'chart-scene-live';
  figure.appendChild(stage);
  // Hide (not remove) the static chart so the poster stands if we dispose, and the animated copy
  // inherits the SAME ancestor chain (section.funnel / figure.chart-frame) → the CSS band fills apply.
  const prevVis = (svg as unknown as SVGElement).style.visibility;
  (svg as unknown as SVGElement).style.visibility = 'hidden';
  renderer.mount(stage, parsed.scene, { [built.assetKey]: sanitize(built.asset) });

  let raf = 0;
  let startTs = 0;
  let disposed = false;

  function restore(): void {
    (svg as unknown as SVGElement).style.visibility = prevVis;
  }

  if (reduced) {
    // Reduced motion: paint the final (fully-built) frame once, no loop — the information without the build.
    renderer.draw(timeline.poster());
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        renderer.dispose();
        stage.remove();
        restore();
      },
    };
  }

  function tick(t: number): void {
    if (disposed) return;
    if (!startTs) startTs = t;
    const e = Math.min(timeline.durationMs, t - startTs);
    renderer.draw(timeline.at(e));
    if (e < timeline.durationMs) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose();
      stage.remove();
      restore();
    },
  };
}
