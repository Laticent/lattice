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

/** The vestibular verbs — continuous sweeps/orbits a reduced-motion viewer should not be
 *  subjected to. `legible` suppresses these but keeps the meaning-bearing verbs (reveal/draw/
 *  fill/sequence/explode, and the svg slide/highlight). Classed in vocabulary.ts (spin/orbit =
 *  "explanatory 3D" sweeps). `slide` and `highlight` are deliberately NOT vestibular: both are
 *  one-shot, windowed, meaning-bearing moves (a directional entrance, a one-time emphasis) — the
 *  same class as draw/reveal — not the sustained oscillation `legible` exists to quiet. */
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

/** Read a section's declared motion tier from `data-scene-motion` (a bounded per-deck / per-slide
 *  policy, §0.75). Unknown / absent → `system` (resolves the viewer's prefers-reduced-motion). */
export function readDeclaredTier(section: Element): MotionTier {
  const raw = section.getAttribute('data-scene-motion');
  return raw === 'full' || raw === 'legible' || raw === 'still' || raw === 'system' ? raw : 'system';
}

/** Everything section-specific the host needs, resolved by a SOURCE adapter. The two sources — a
 *  baked `data-scene-spec` scene (resolveSpecSource) and a chart derived at view time (hydrateChart,
 *  outside the Anima boundary) — differ ONLY here; the whole lifecycle below is shared. */
export interface ResolvedScene {
  /** The validated scene to play. */
  scene: Scene;
  /** The declared motion tier (from `data-scene-motion`, or a source default). */
  declared: MotionTier;
  /** The figure the live stage + control mount into (gets the `.anima-live` host marker). */
  figure: Element;
  /** The static poster to hide on mount and restore on dispose (null → nothing to hide). */
  poster: Element | null;
  /** For an `svg` scene: the ALREADY-SANITIZED asset markup for the AssetMap (HARD RULE #22).
   *  The source adapter owns the sanitize call; null for a `built` scene. */
  assetMarkup: string | null;
}

/** Resolve a baked `section.scene[data-scene-spec]` into a ResolvedScene, or null if it has no
 *  usable spec / figure. The poster went through `sanitizeSlideHtml` when the frame was built; we
 *  sanitize AGAIN here to honour the AssetMap contract at the point of use (renderer.ts). */
function resolveSpecSource(section: Element, sanitize: (m: string) => string): ResolvedScene | null {
  const b64 = section.getAttribute('data-scene-spec');
  if (!b64) return null;
  const scene = decodeSpec(b64);
  if (!scene) return null;
  const figure = section.querySelector('.scene-figure');
  if (!figure) return null;
  const poster = figure.querySelector('svg');
  const assetMarkup = scene.source === 'svg' && poster ? sanitize(poster.outerHTML) : null;
  return { scene, declared: readDeclaredTier(section), figure, poster, assetMarkup };
}

/** Build the AssetMap for a playing scene from its resolved (pre-sanitized) markup. */
function assetsFor(scene: Scene, assetMarkup: string | null): AssetMap | undefined {
  if (scene.source !== 'svg' || assetMarkup == null) return undefined;
  return { [scene.asset]: assetMarkup };
}

/** The four faces of the single corner control (user pick, Stage 6b). */
type ControlMode = 'pause' | 'play' | 'replay' | 'optin';

const CONTROL_ARIA: Record<ControlMode, string> = {
  pause: 'Pause the animation',
  play: 'Play the animation',
  replay: 'Replay the animation',
  optin: 'Play the motion',
};

/** One adaptive playback control in the figure's corner: ⏸ while a scene plays, ▶ to resume
 *  a paused one, ↻ to replay a finished one, and a labelled "Play the motion" opt-in when
 *  `prefers-reduced-motion` has held a scene to its poster. The floor governs the DEFAULT and
 *  what the AUTHOR can force; it does not strip the VIEWER's agency to choose the motion (the
 *  opt-in never autoplays and is per-view). The glyph per mode lives in `scene.styles.css`. */
function makeControl(doc: Document, onClick: () => void): { el: HTMLButtonElement; set(mode: ControlMode): void } {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'scene-control';
  const label = doc.createElement('span');
  label.className = 'scene-control-label';
  btn.appendChild(label);
  btn.addEventListener('click', onClick);
  return {
    el: btn,
    set(mode: ControlMode): void {
      btn.dataset.mode = mode;
      btn.setAttribute('aria-label', CONTROL_ARIA[mode]);
      label.textContent = mode === 'optin' ? 'Play the motion' : '';
    },
  };
}

/** Hydrate ONE already-resolved scene. Returns a controller, or null if the scene should stay a
 *  static poster (`still` tier with nothing to opt into, or no backend advertises its needs). The
 *  scene/figure/asset/poster were resolved by a SOURCE adapter (spec or chart) — everything here is
 *  source-agnostic, so a chart animation gets the SAME controls, tiers, opt-in, and lazy-mount. */
function hydrateOne(section: Element, resolved: ResolvedScene, opts: HydrateOptions): SceneController | null {
  const doc = section.ownerDocument;
  if (!doc) return null;
  const { scene, declared, figure } = resolved;

  const reduced = prefersReducedMotion(opts);
  const tier = effectiveTier(declared, reduced, scene);

  // `still` splits two ways. The AUTHOR asking for a still (or a motionless scene that renders
  // identically to its poster) keeps the poster and returns null. But a scene the reduced-motion
  // FLOOR *alone* held to its poster — declared to move, held still only by the viewer's OS
  // setting — instead offers a "Play the motion" opt-in (mount deferred until asked), so the
  // viewer keeps agency. `usedVerbs > 0` excludes the motionless case (nothing to opt into).
  const floorSuppressed = tier === 'still' && declared !== 'still' && reduced && usedVerbs(scene).length > 0;
  if (tier === 'still' && !floorSuppressed) return null; // poster stands

  // A floor-suppressed opt-in plays the FULL author-intended motion (the viewer explicitly asked
  // to see it); an un-suppressed `legible` scene autoplays its safe, vestibular-stripped projection.
  const playScene = floorSuppressed ? scene : tier === 'legible' ? toLegible(scene) : scene;
  const maybeRenderer = rendererFor(playScene);
  if (!maybeRenderer) return null;
  const renderer: Renderer = maybeRenderer; // non-null for the closures below
  const timeline = compile(playScene);
  const loop = hasContinuousMotion(playScene);
  const assets = assetsFor(playScene, resolved.assetMarkup);
  const poster = resolved.poster as HTMLElement | SVGElement | null; // hidden on mount, restored on dispose

  const control = makeControl(doc, onControlClick);
  let stage: HTMLElement | null = null;
  let raf = 0;
  let startTs = 0; // timestamp the current play segment began (0 → set on next frame)
  let baseElapsed = 0; // ms elapsed before the current segment, so pause → play resumes seamlessly
  let lastElapsed = 0; // last elapsed drawn (freeze reads it so resume continues, not restarts)
  let mounted = false;
  let playing = false;
  let ended = false; // a one-shot has run to its final frame → offer ↻
  let userPaused = false; // the viewer paused (vs. an off-screen auto-pause) → don't auto-resume
  let autoPaused = false; // frozen because scrolled off-screen → resume on re-entry
  let optInPending = floorSuppressed; // show poster + opt-in until the viewer plays
  let disposed = false;

  function sync(): void {
    if (optInPending) control.set('optin');
    else if (playing) control.set('pause');
    else if (ended) control.set('replay');
    else control.set('play');
  }

  function tick(t: number): void {
    if (!startTs) startTs = t;
    let e = baseElapsed + (t - startTs);
    if (loop) e = timeline.durationMs > 0 ? e % timeline.durationMs : 0; // guard 0-length loop → NaN
    else if (e > timeline.durationMs) e = timeline.durationMs;
    lastElapsed = e;
    renderer.draw(timeline.at(e));
    if (playing && (loop || e < timeline.durationMs)) {
      raf = requestAnimationFrame(tick);
    } else {
      playing = false;
      if (!loop) ended = true; // one-shot finished: hold the final frame
      sync();
    }
  }

  function stopRaf(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function play(): void {
    if (playing || disposed) return;
    playing = true;
    ended = false;
    userPaused = false;
    autoPaused = false;
    startTs = 0;
    raf = requestAnimationFrame(tick);
    sync();
  }

  /** Freeze in place, remembering elapsed time so play() resumes rather than restarts. */
  function freeze(): void {
    if (!playing) return;
    playing = false;
    stopRaf();
    baseElapsed = lastElapsed;
    startTs = 0;
  }

  function pauseByUser(): void {
    freeze();
    userPaused = true;
    sync();
  }

  function replay(): void {
    baseElapsed = 0;
    lastElapsed = 0;
    ended = false;
    play();
  }

  function mount(): void {
    if (mounted || disposed) return; // a late IO callback after dispose can't start an orphan loop
    mounted = true;
    stage = doc.createElement('div');
    stage.className = 'scene-live';
    figure.appendChild(stage);
    if (poster) poster.style.display = 'none';
    renderer.mount(stage, playScene, assets);
    flashControls(); // a brief on-mount hint so the auto-hidden control is discoverable
  }

  function mountAndPlay(): void {
    mount();
    play();
  }

  function onControlClick(): void {
    if (optInPending) { optInPending = false; mountAndPlay(); return; }
    if (ended) { replay(); return; }
    if (playing) { pauseByUser(); return; }
    // Was user-paused → resume; or clicked ▶ before the lazy IntersectionObserver has mounted
    // it → mount then play. `mountAndPlay` no-ops the mount when already mounted, so resume
    // still continues from `baseElapsed` (never a phantom rAF that draws into nothing).
    mountAndPlay();
  }

  function unmount(): void {
    freeze();
    if (!mounted) return;
    mounted = false;
    renderer.dispose();
    stage?.remove();
    stage = null;
    if (poster) poster.style.display = '';
  }

  // The control is present from the start: a floor-suppressed scene shows the poster + opt-in
  // straight away; an ordinary scene gets ⏸ the moment it mounts. `.anima-live` is the HOST marker
  // the control + stage CSS keys off (scene.styles.css) — applied to WHATEVER figure we mount into
  // (a `.scene-figure` or a chart's `.funnel-figure`), so both surfaces share one control style.
  figure.classList.add('anima-live');
  figure.appendChild(control.el);
  sync();

  // Auto-hide: CSS reveals the control on hover/focus (desktop + keyboard); on a device with no
  // hover a tap on the scene flashes it in (then it fades after a beat), and mount() flashes it
  // once so it stays discoverable. `.scene-controls-shown` is the JS reveal hook (scene.styles.css).
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function flashControls(): void {
    if (optInPending) return; // the opt-in is always shown; nothing to flash
    figure.classList.add('scene-controls-shown');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => figure.classList.remove('scene-controls-shown'), 2500);
  }
  figure.addEventListener('pointerdown', flashControls);

  // Lazy by default: mount on first view, auto-pause off-screen (the perf NFR); resume on
  // re-entry unless the viewer paused. A floor-suppressed scene never AUTO-mounts (the opt-in
  // click is its only trigger) — but once opted in it still auto-pauses off-screen like any
  // other live scene, so the observer is created for it too and only the autoplay is gated.
  // `eager` (or no IntersectionObserver) mounts immediately; an eager opt-in scene waits for
  // the click and, being always on screen, needs no observer.
  let io: IntersectionObserver | null = null;
  if (!opts.eager && typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (optInPending) continue; // floor: never auto-mount a suppressed scene
            if (!mounted) mountAndPlay();
            else if (autoPaused && !userPaused && !ended) play();
          } else if (playing) {
            freeze();
            autoPaused = true;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(section);
  } else if (!optInPending) {
    mountAndPlay();
  }

  return {
    dispose() {
      disposed = true;
      io?.disconnect();
      figure.removeEventListener('pointerdown', flashControls);
      if (hideTimer) clearTimeout(hideTimer);
      unmount();
      control.el.remove();
      figure.classList.remove('anima-live');
    },
  };
}

/** Hydrate ONE already-resolved scene on `section`. The SHARED host primitive both surfaces go
 *  through — the `data-scene-spec` scene path (hydrateScene) and the chart path (hydrateChart, in
 *  chart-anima-hydrate.ts, which resolves via chartToScene OUTSIDE the Anima boundary). Owns the
 *  single `data-scene-live` liveness marker (so a re-rendering surface can diff either kind), and
 *  returns a controller whose `dispose` clears it. Returns null if already live or the scene stays
 *  a poster. This is the per-section primitive createAnimaScenes diffs against so unchanged scenes
 *  keep running across a re-render. */
export function hydrateResolved(section: Element, resolved: ResolvedScene, opts: HydrateOptions = {}): { dispose(): void } | null {
  if (section.getAttribute('data-scene-live') === '1') return null; // already live
  const c = hydrateOne(section, resolved, opts);
  if (!c) return null;
  section.setAttribute('data-scene-live', '1');
  return {
    dispose() {
      c.dispose();
      section.removeAttribute('data-scene-live');
    },
  };
}

/** Hydrate ONE `section.scene[data-scene-spec]`. Resolves the baked spec source, then delegates
 *  to the shared `hydrateResolved`. Returns a controller or null (bad spec / `still` / no backend /
 *  no figure / already live). */
export function hydrateScene(section: Element, opts: HydrateOptions = {}): { dispose(): void } | null {
  const resolved = resolveSpecSource(section, opts.sanitize ?? ((m) => m));
  if (!resolved) return null;
  return hydrateResolved(section, resolved, opts);
}

/** Hydrate every `section.scene[data-scene-spec]` under `root`. Idempotent (skips an
 *  already-live section). Returns one controller that disposes every scene it started.
 *  For an incrementally re-rendering surface, prefer per-section `hydrateScene` with your
 *  own add/remove diff so unchanged scenes DON'T restart (createAnimaScenes does this). */
export function hydrateScenes(root: ParentNode, opts: HydrateOptions = {}): { dispose(): void } {
  const controllers: Array<{ dispose(): void }> = [];
  for (const section of Array.from(root.querySelectorAll('section.scene[data-scene-spec]'))) {
    // Isolate each scene: a spec that validates but throws in compile/mount must not stop the
    // rest of the deck's scenes from hydrating — the poster stands for the faulty one.
    try {
      const c = hydrateScene(section, opts);
      if (c) controllers.push(c);
    } catch {
      /* one bad scene, poster stands */
    }
  }
  return {
    dispose() {
      for (const c of controllers) c.dispose();
    },
  };
}
