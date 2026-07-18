// Anima — the HOST (Stage 6). The pure core emits a timeline; a backend paints a
// SceneState; THIS module is the missing third piece — the host that owns the clock and
// the loop (README's "the clock is someone else's" is here). It scans a rendered deck
// for `section.scene[data-scene-spec]` slides and brings each poster to life on the live
// surfaces (Studio present · Playground · HTML export), while the PDF keeps the still.
//
// It is surface-agnostic: give it a root (a live document, or a same-origin preview
// frame's document) and it hydrates the scenes under it, returning a controller you
// dispose on teardown. Motion respects the three reduced-motion tiers (ADR §12.2) with
// the user's `prefers-reduced-motion` as an accessibility FLOOR the author can't override
// up. Lazy: a scene mounts only when it scrolls into view (IntersectionObserver) and
// pauses when it leaves — the perf NFR (2026-07-18-anima-motion-faculty-modes.md §8).
//
// SECURITY (HARD RULE #22): the spec in `data-scene-spec` is UNTRUSTED — it is validated
// by `parseScene` before it ever compiles. An `svg` scene's source markup is run through
// the caller-injected `sanitize` (the docs-site passes `sanitizeSlideHtml`) before it
// enters the backend's AssetMap (the renderer.ts contract); the Vivus backend also
// inert-parses + strips as defense-in-depth. The sanitizer is INJECTED, not imported, so
// this host stays inside the spin-off-able Anima boundary (checkAnimaBoundary) — it has no
// docs-site dependency. This module injects NO `<script>` and builds no preview frame, so
// it is not a #22 preview builder — it only mounts vetted geometry into an existing surface.

import { vivusRenderer } from './backends/vivus';
import { zdogRenderer } from './backends/zdog';
import type { BuiltElement, MotionVerb, Scene } from './index';
import { compile, negotiate, parseScene, usedVerbs } from './index';
import type { AssetMap, Renderer } from './renderer';

/** The reduced-motion tiers (ADR §12.2). `system` resolves the device's setting. */
export type MotionTier = 'full' | 'legible' | 'still' | 'system';

/** The vestibular verbs — sweeps/orbits a reduced-motion viewer should not be subjected
 *  to. `legible` suppresses these but keeps the meaning-bearing verbs (reveal/draw/fill/
 *  sequence/explode). Classed in vocabulary.ts (spin/orbit = "explanatory 3D" sweeps). */
const VESTIBULAR: ReadonlySet<MotionVerb> = new Set<MotionVerb>(['spin', 'orbit']);

// ── Pure helpers (exported for unit testing — no DOM) ────────────────────────

/** True when every motion a scene uses is vestibular — so `legible` would leave nothing
 *  moving and the scene should collapse to the poster instead. (A motionless scene also
 *  returns true: its live render equals its poster, so the still is the cheaper truth.)
 *  Uses the core `usedVerbs`, which recurses the built tree (motion often lives on a child). */
export function whollyVestibular(scene: Scene): boolean {
  return usedVerbs(scene).every((v) => VESTIBULAR.has(v));
}

/** Whether a scene has continuous (periodic) motion — it should LOOP; otherwise it plays
 *  once and holds the final frame (a `reveal`/`draw` shouldn't erase-and-redraw forever). */
export function hasContinuousMotion(scene: Scene): boolean {
  return usedVerbs(scene).some((v) => v === 'spin' || v === 'orbit');
}

/** Resolve the effective tier. The author declares one (default `system`); the viewer's
 *  `prefers-reduced-motion` is an accessibility FLOOR — it can only ever REDUCE motion,
 *  never raise it. Under reduced motion, a scene drops to `legible`, or to the poster
 *  (`still`) when nothing meaning-bearing would survive. */
export function effectiveTier(declared: MotionTier, prefersReduced: boolean, scene: Scene): 'full' | 'legible' | 'still' {
  if (declared === 'still') return 'still';
  if (!prefersReduced) return declared === 'system' ? 'full' : declared;
  return whollyVestibular(scene) ? 'still' : 'legible';
}

/** Return a copy of the scene with the vestibular verbs (spin/orbit) stripped — the
 *  `legible` projection. Deep, immutable: the input is untouched. */
export function toLegible(scene: Scene): Scene {
  const keep = (m: { verb: MotionVerb }) => !VESTIBULAR.has(m.verb);
  if (scene.source === 'svg') {
    return { ...scene, elements: scene.elements.map((el) => ({ ...el, motion: (el.motion ?? []).filter(keep) })) };
  }
  const mapEl = (el: BuiltElement): BuiltElement => ({
    ...el,
    motion: (el.motion ?? []).filter(keep),
    ...(el.children ? { children: el.children.map(mapEl) } : {}),
  });
  return { ...scene, elements: scene.elements.map(mapEl) };
}

/** A generous cap on the base64 spec length checked BEFORE decode — a real scene spec is a
 *  few KB; this bounds `atob`+`JSON.parse` cost on an untrusted (shared / AI-generated) deck
 *  whose `data-scene-spec` could otherwise be tens of MB (a client-side DoS on every rebind). */
export const MAX_SPEC_B64 = 256 * 1024;

/** Decode a base64 `data-scene-spec` and validate it. Returns the scene, or null on any
 *  fault (oversized, bad base64, non-JSON, or a scene that fails the closed-vocabulary
 *  validator) — a faulty spec simply leaves the authored poster standing. */
export function decodeSpec(b64: string): Scene | null {
  if (typeof b64 !== 'string' || b64.length > MAX_SPEC_B64) return null;
  try {
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    const parsed = parseScene(JSON.parse(json));
    return parsed.ok ? parsed.scene : null;
  } catch {
    return null;
  }
}

/** The backend for a scene's source model (built → Zdog, svg → Vivus), or null if none
 *  advertises the capabilities the scene needs. */
export function rendererFor(scene: Scene): Renderer | null {
  const candidate = scene.source === 'svg' ? vivusRenderer() : zdogRenderer({ zoom: 1.1 });
  return negotiate(scene, candidate.caps).length === 0 ? candidate : null;
}

// ── The DOM host ─────────────────────────────────────────────────────────────

export interface HydrateOptions {
  /** Force the reduced-motion decision (tests / a host that already knows the setting).
   *  Omitted → read `prefers-reduced-motion` from `matchMedia`. */
  reducedMotion?: boolean;
  /** Skip the IntersectionObserver and mount immediately (tests, or a single-slide surface
   *  that is always "on screen"). Default false → lazy mount on visibility. */
  eager?: boolean;
  /** Sanitize an `svg` scene's source markup before it enters the backend (the renderer.ts
   *  AssetMap contract). The docs-site passes `sanitizeSlideHtml`; omitted → identity (the
   *  poster is already frame-sanitized and Vivus inert-parses as a backstop). */
  sanitize?: (markup: string) => string;
}

interface SceneController {
  dispose(): void;
}

const RM_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(opts: HydrateOptions): boolean {
  if (typeof opts.reducedMotion === 'boolean') return opts.reducedMotion;
  return typeof matchMedia === 'function' ? matchMedia(RM_QUERY).matches : false;
}

/** Resolve an `svg` scene's asset markup from the poster already in the figure. The poster
 *  went through `sanitizeSlideHtml` when the frame was built; we sanitize AGAIN here to
 *  honour the AssetMap contract at the point of use (renderer.ts). */
function assetsFor(scene: Scene, figure: Element, sanitize: (m: string) => string): AssetMap | undefined {
  if (scene.source !== 'svg') return undefined;
  const poster = figure.querySelector('svg');
  if (!poster) return undefined;
  return { [scene.asset]: sanitize(poster.outerHTML) };
}

function makeReplayButton(doc: Document, onReplay: () => void): HTMLButtonElement {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'scene-replay';
  btn.setAttribute('aria-label', 'Replay the animation');
  btn.addEventListener('click', onReplay);
  return btn;
}

/** Hydrate ONE `section.scene[data-scene-spec]`. Returns a controller, or null if the
 *  scene should stay a static poster (bad spec, `still` tier, no backend, no figure). */
function hydrateOne(section: Element, opts: HydrateOptions): SceneController | null {
  const doc = section.ownerDocument;
  const b64 = section.getAttribute('data-scene-spec');
  if (!doc || !b64) return null;
  const scene = decodeSpec(b64);
  if (!scene) return null;

  const rawMotion = section.getAttribute('data-scene-motion');
  const declared: MotionTier =
    rawMotion === 'full' || rawMotion === 'legible' || rawMotion === 'still' || rawMotion === 'system'
      ? rawMotion
      : 'system'; // unknown/absent → system (resolves prefers-reduced-motion)
  const tier = effectiveTier(declared, prefersReducedMotion(opts), scene);
  if (tier === 'still') return null; // poster stands

  const figureEl = section.querySelector('.scene-figure');
  if (!figureEl) return null;
  const figure: Element = figureEl; // non-null for the closures below

  const playScene = tier === 'legible' ? toLegible(scene) : scene;
  const maybeRenderer = rendererFor(playScene);
  if (!maybeRenderer) return null;
  const renderer: Renderer = maybeRenderer; // non-null for the closures below
  const timeline = compile(playScene);
  const loop = hasContinuousMotion(playScene);
  const assets = assetsFor(playScene, figure, opts.sanitize ?? ((m) => m));
  const poster = figure.querySelector('svg'); // SVGSVGElement | null

  let stage: HTMLElement | null = null;
  let replay: HTMLButtonElement | null = null;
  let raf = 0;
  let start = 0;
  let mounted = false;
  let playing = false;
  let disposed = false;

  function tick(t: number): void {
    if (start === 0) start = t;
    let e = t - start;
    if (loop) e = e % timeline.durationMs;
    else if (e > timeline.durationMs) e = timeline.durationMs;
    renderer.draw(timeline.at(e));
    if (playing && (loop || e < timeline.durationMs)) raf = requestAnimationFrame(tick);
    else playing = false; // one-shot finished: hold the final frame
  }

  function play(): void {
    if (playing) return;
    playing = true;
    start = 0;
    raf = requestAnimationFrame(tick);
  }

  function pause(): void {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function mount(): void {
    if (mounted || disposed) return; // a late IO callback after dispose can't start an orphan loop
    mounted = true;
    stage = doc.createElement('div');
    stage.className = 'scene-live';
    figure.appendChild(stage);
    if (poster) poster.style.display = 'none';
    renderer.mount(stage, playScene, assets);
    replay = makeReplayButton(doc, () => play());
    figure.appendChild(replay);
    play();
  }

  function unmount(): void {
    pause();
    if (!mounted) return;
    mounted = false;
    renderer.dispose();
    stage?.remove();
    replay?.remove();
    if (poster) poster.style.display = '';
  }

  // Lazy by default: mount on first view, pause off-screen (present-mode autoplay-on-enter
  // rides the same signal). `eager` (or no IntersectionObserver) mounts immediately.
  let io: IntersectionObserver | null = null;
  if (!opts.eager && typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) { mount(); play(); }
          else pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(section);
  } else {
    mount();
  }

  return {
    dispose() {
      disposed = true;
      io?.disconnect();
      unmount();
    },
  };
}

/** Hydrate ONE `section.scene[data-scene-spec]`. Returns a controller (whose `dispose`
 *  also clears the `data-scene-live` marker), or null if the scene should stay a static
 *  poster (bad spec / `still` tier / no backend / no figure) OR is already live. This is
 *  the per-section primitive a re-rendering surface diffs against so unchanged scenes keep
 *  running across a re-render (see docs/src/playground/anima-scenes.ts). */
export function hydrateScene(section: Element, opts: HydrateOptions = {}): { dispose(): void } | null {
  if (section.getAttribute('data-scene-live') === '1') return null; // already live
  const c = hydrateOne(section, opts);
  if (!c) return null;
  section.setAttribute('data-scene-live', '1');
  return {
    dispose() {
      c.dispose();
      section.removeAttribute('data-scene-live');
    },
  };
}

/** Hydrate every `section.scene[data-scene-spec]` under `root`. Idempotent (skips an
 *  already-live section). Returns one controller that disposes every scene it started.
 *  For an incrementally re-rendering surface, prefer per-section `hydrateScene` with your
 *  own add/remove diff so unchanged scenes DON'T restart (createAnimaScenes does this). */
export function hydrateScenes(root: ParentNode, opts: HydrateOptions = {}): { dispose(): void } {
  const controllers: Array<{ dispose(): void }> = [];
  for (const section of Array.from(root.querySelectorAll('section.scene[data-scene-spec]'))) {
    const c = hydrateScene(section, opts);
    if (c) controllers.push(c);
  }
  return {
    dispose() {
      for (const c of controllers) c.dispose();
    },
  };
}
