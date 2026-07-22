// PARENT-HOSTED Anima scene hydration for the live Studio surfaces (Playground +
// Present). The slide preview is a same-origin, transform-scaled `srcdoc` iframe; rather
// than ship the Anima backends (Zdog/Vivus, docs-site deps) into the lean in-frame runtime
// bundle, we drive the host from the PARENT — the same pattern createChartInteract /
// createVideoOverlay use (2026-06-19-css-3d-charts-feasibility.md). This reaches into the
// frame's document and hands each `section.scene[data-scene-spec]` to the Anima host
// (docs/src/lib/anima/hydrate.ts), which mounts the backend + runs the loop.
//
// SECURITY (HARD RULE #22): the host validates the untrusted spec with `parseScene` and
// sanitizes an svg scene's source markup with the docs-site `sanitizeSlideHtml` (passed in
// — the host itself stays docs-independent). This module injects NO `<script>` into the
// frame and builds no preview document, so it is not a #22 preview builder.
//
// Export is untouched: the static poster bakes into the PDF/HTML; live motion is a
// preview-only enhancement here (standalone-HTML-export hydration is a separate follow-on).
// `rebind()` re-hydrates after every srcdoc rewrite / live-edit re-render.

import { hydrateScene } from '@/lib/anima/hydrate';
import { hydrateChart } from '@/lib/chart-anima-hydrate';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';
import { type DeckMotion, hasAnimatableChart, MOTION_OPT_IN_SEL, resolveMotion, SCENE_SEL, speedToDurationMs } from './anima-host-sel';

// The eligibility selectors + the deck-default/slide-override cascade live in a zero-dependency leaf
// (anima-host-sel.ts) so this host and the DeckPreview host-load gate share ONE definition and can't
// drift from what rebind() actually mounts.

export interface AnimaScenes {
  /** Re-sync the frame's scenes after a preview render. DIFF-based: an already-live scene
   *  whose section survived the render keeps running (no restart on a keystroke); a section
   *  that left the DOM (or lost its spec) is disposed; a newly-appeared scene is mounted. */
  rebind(): void;
  /** Tear down all mounted scenes (component unmount). */
  destroy(): void;
}

export interface AnimaScenesOptions {
  getFrame: () => HTMLIFrameElement | null;
  /** The deck-level motion defaults (the three `motion*` front-matter keys), read fresh each rebind
   *  so a live edit re-resolves every class-less chart. Play off/absent → only per-slide opt-ins run. */
  getDeckMotion?: () => DeckMotion;
}

export function createAnimaScenes({ getFrame, getDeckMotion }: AnimaScenesOptions): AnimaScenes {
  // Per-section controllers, tagged with a stable content+style SIGNATURE. The signature is what
  // makes an in-place live edit not restart the motion: the single-slide render path reassigns the
  // frame's innerHTML on every keystroke, so every `<section>` is a BRAND-NEW node — the old
  // node-identity diff therefore disposed + re-mounted (replayed from t=0) every render. Keying the
  // carry-over on a signature instead lets a re-parsed-but-identical section mount SETTLED.
  const live = new Map<Element, { ctrl: { dispose(): void }; sig: string }>();
  // Signatures that have ALREADY played their intro this session. A re-render mints new section
  // nodes (the single-slide path reassigns innerHTML), so a chart whose signature is here re-mounts
  // SETTLED — it does not replay from t=0 on every keystroke. Robust to any render path (a cheap
  // patch OR a full srcdoc rewrite, where the dispose and the re-mount land in SEPARATE rebinds),
  // because it never depends on the two happening in one rebind. Trade-off: an identical chart
  // re-entered later (e.g. Present) mounts settled rather than auto-restarting; the ↻ control replays
  // it. A CHANGED chart or a SWITCHED style is a new signature → it plays.
  const played = new Set<string>();

  function frameDoc(): Document | null {
    try {
      return getFrame()?.contentDocument ?? null;
    } catch {
      return null; // frame detached / not ready
    }
  }

  function disposeAll(): void {
    for (const { ctrl } of live.values()) ctrl.dispose();
    live.clear();
  }

  // A stable identity for a live target: unchanged across an in-place re-render of the SAME slide
  // (same content, same resolved style + speed), but different when the data or the chosen style/speed
  // changes — so an unrelated edit carries over settled, while a real change (or a config switch) plays.
  function sigOf(s: Element, deck: DeckMotion): string {
    if (s.matches(SCENE_SEL)) return `scene|${s.getAttribute('data-scene-spec') ?? ''}`;
    const svg = s.querySelector('svg');
    const text = (svg?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const marks = svg?.querySelectorAll('[data-mark]').length ?? 0;
    const cfg = resolveMotion(s, deck);
    return `chart|${cfg?.style ?? ''}|${cfg?.speed ?? ''}|${marks}|${text}`;
  }

  function rebind(): void {
    const doc = frameDoc();
    if (!doc) {
      disposeAll();
      return;
    }
    const deck: DeckMotion = getDeckMotion?.() ?? { play: null, style: null, speed: null };

    // A section is an eligible live target if it is a baked scene OR a chart whose Play/Style/Speed
    // cascade RESOLVES (Play on). The diff is KIND-AGNOSTIC: a tracked section is disposed the moment
    // it stops being either — it left the DOM, a scene lost its spec, a chart flipped to `motion-off`,
    // or the deck Play turned off.
    const isEligible = (s: Element): boolean => s.matches(SCENE_SEL) || (hasAnimatableChart(s) && resolveMotion(s, deck) !== null);

    // Phase 1 — dispose live entries whose node left the DOM or is no longer eligible.
    for (const [section, entry] of Array.from(live)) {
      if (!doc.contains(section) || !isEligible(section)) {
        entry.ctrl.dispose();
        live.delete(section);
      }
    }

    // Phase 2 — mount any target not already tracked. A node that SURVIVED the render is still in
    // `live` → skipped (it keeps running). A signature that has ALREADY played this session mounts
    // SETTLED (no replay on a keystroke); a first-seen signature plays once and is recorded. `eager`
    // mounts immediately rather than via a parent-context IntersectionObserver (unreliable across the
    // transform-scaled child iframe). SCENES scan FIRST so a baked spec wins over the chart on-ramp.
    const mount = (section: Element, sig: string, hydrate: (settled: boolean) => { dispose(): void } | null): void => {
      const ctrl = hydrate(played.has(sig));
      if (ctrl) {
        live.set(section, { ctrl, sig });
        played.add(sig);
      }
    };
    for (const section of Array.from(doc.querySelectorAll(SCENE_SEL))) {
      if (live.has(section)) continue;
      const sig = sigOf(section, deck);
      mount(section, sig, (settled) => hydrateScene(section, { eager: true, sanitize: sanitizeSlideHtml, startSettled: settled }));
    }
    // The chart on-ramp. Two ways a chart section qualifies: an EXPLICIT per-slide opt-in class
    // (`motion-*` / legacy `chart-anima`), OR — when the deck sets Play on — ANY chart section (a
    // front-matter default leaves no class to select, so we scan chart sections and let `resolveMotion`
    // decide). The resolved Style + Speed (→ duration) are passed to the chart adapter.
    const candidates = deck.play === 'on' ? Array.from(doc.querySelectorAll('section')).filter(hasAnimatableChart) : Array.from(doc.querySelectorAll(MOTION_OPT_IN_SEL));
    for (const section of candidates) {
      if (live.has(section)) continue;
      const cfg = resolveMotion(section, deck);
      if (!cfg) continue;
      const marks = section.querySelectorAll('svg [data-mark]').length;
      const durationMs = speedToDurationMs(cfg.speed, marks);
      const sig = sigOf(section, deck);
      mount(section, sig, (settled) => hydrateChart(section, { eager: true, sanitize: sanitizeSlideHtml, style: cfg.style, durationMs, startSettled: settled }));
    }
  }

  function destroy(): void {
    disposeAll();
  }

  return { rebind, destroy };
}
