// View-time SOURCE ADAPTER that animates an OPTED-IN chart in place — the model-free chart on-ramp
// of §0.75. It resolves the chart's own rendered svg into an Anima scene (via `chartToScene`, which
// reads the native `data-anima-role`) and hands it to the SHARED host primitive `hydrateResolved`
// (anima/hydrate.ts). So a chart animation gets the EXACT same lifecycle as a `data-scene-spec`
// scene — reduced-motion tiers + the viewer "Play the motion" opt-in (accessibility floor), lazy
// IntersectionObserver mount / off-screen pause (perf NFR), and the play/pause/replay control.
//
// This adapter lives OUTSIDE the Anima folder on purpose: it imports `chartToScene` (chart
// knowledge), which the spin-off-able Anima core must not (checkAnimaBoundary). The host it calls
// is inside the boundary and stays chart-agnostic. Export stays static — this is preview-only.
//
// SECURITY (HARD RULE #22): the chart markup is sanitized HERE (the adapter owns the sanitize call)
// before it enters either `chartToScene` (a detached parse) or the AssetMap that reaches the live
// frame. `hydrateResolved` consumes the already-sanitized markup verbatim.

import { type HydrateOptions, hydrateResolved, readDeclaredTier } from './anima/hydrate';
import { parseScene } from './anima/schema';
import { type ChartAnimaStyle, chartToScene } from './chart-anima';

export interface ChartSceneController {
  dispose(): void;
}

export interface ChartHydrateOptions extends HydrateOptions {
  /** The resolved motion STYLE for this section (the caller runs the Play/Style/Speed cascade —
   *  `resolveMotion` in anima-host-sel — and only calls when Play is on). Omitted → no motion. */
  style?: ChartAnimaStyle;
  /** The resolved total duration in ms (from the Speed axis via `speedToDurationMs`). */
  durationMs?: number;
}

/** The funnel's worst outgoing conversion → its band's `data-mark`, so the leak emphasizes. Reads
 *  `data-value` off the bands (the renderer emits it). Generic charts with no ordered values → none. */
export function worstMarks(svg: Element): number[] {
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
 * and delegates the whole lifecycle to the shared host. Returns a controller (dispose restores the
 * static chart), or null if the section has no animatable chart. Preview-only; export is untouched.
 */
export function hydrateChart(section: Element, opts: ChartHydrateOptions = {}): ChartSceneController | null {
  // The caller (anima-scenes.ts) runs the Play/Style/Speed cascade and passes the resolved style +
  // duration; no style means Play resolved off → stay static.
  const style = opts.style;
  if (!style) return null;

  const svg = section.querySelector('svg');
  if (!svg) return null;

  const sanitize = opts.sanitize ?? ((m: string) => m);
  const built = chartToScene(sanitize(svg.outerHTML), { style, duration: opts.durationMs, highlightMarks: worstMarks(svg) });
  if (!built) return null;
  const parsed = parseScene(built.scene);
  if (!parsed.ok) return null; // a malformed scene simply leaves the static chart standing

  // The chart derives its scene at view time (no baked `data-scene-spec`), so the source fields the
  // host needs are assembled here: the scene, the figure to mount into (the chart's own figure, so
  // the live copy inherits the `.funnel` ancestor chain → CSS band fills apply), the static svg to
  // hide/restore, and the sanitized, id-injected asset markup for the AssetMap.
  return hydrateResolved(
    section,
    {
      scene: parsed.scene,
      declared: readDeclaredTier(section),
      figure: svg.parentElement ?? section,
      poster: svg,
      assetMarkup: sanitize(built.asset),
    },
    // Charts get NO playback control — motion is a one-shot "play on enter" build, not a media player.
    { ...opts, chrome: false },
  );
}
