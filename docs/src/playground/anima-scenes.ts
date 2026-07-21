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

// Opt-in marker for animating a rendered chart in place (§0.75): a section class the author adds
// via Marp's existing directives — `<!-- _class: chart-anima -->` (slide override) or a deck-level
// `class: chart-anima` frontmatter (deck default). Any section carrying it that holds an animatable
// chart is hydrated; a non-chart section with it is a safe no-op (hydrateChart returns null).
const CHART_ANIMA_SEL = 'section.chart-anima';

export interface AnimaScenes {
  /** Re-sync the frame's scenes after a preview render. DIFF-based: an already-live scene
   *  whose section survived the render keeps running (no restart on a keystroke); a section
   *  that left the DOM (or lost its spec) is disposed; a newly-appeared scene is mounted. */
  rebind(): void;
  /** Tear down all mounted scenes (component unmount). */
  destroy(): void;
}

export function createAnimaScenes({ getFrame }: { getFrame: () => HTMLIFrameElement | null }): AnimaScenes {
  // Per-section controllers, so a re-render disturbs only the sections that actually changed.
  const live = new Map<Element, { dispose(): void }>();

  function frameDoc(): Document | null {
    try {
      return getFrame()?.contentDocument ?? null;
    } catch {
      return null; // frame detached / not ready
    }
  }

  function disposeAll(): void {
    for (const c of live.values()) c.dispose();
    live.clear();
  }

  // A section is an eligible live target if it is a baked scene OR an opted-in chart. Both kinds now
  // flow through ONE host (hydrateResolved) and share the `data-scene-live` marker, so the diff is
  // KIND-AGNOSTIC: a tracked section is disposed the moment it stops being either — whether it left
  // the DOM, a scene lost its spec, OR a chart lost its opt-in class on a reused node. That single
  // rule fixes the two forked-diff bugs: a `scene chart-anima` section no longer thrashes
  // (still eligible → kept), and an opted-out chart no longer leaks (no longer eligible → disposed).
  const isEligible = (s: Element): boolean => s.matches('section.scene[data-scene-spec]') || s.matches(CHART_ANIMA_SEL);

  function rebind(): void {
    const doc = frameDoc();
    if (!doc) {
      disposeAll();
      return;
    }
    for (const [section, ctrl] of Array.from(live)) {
      if (!doc.contains(section) || !isEligible(section)) {
        ctrl.dispose();
        live.delete(section);
      }
    }
    // Mount any target not already tracked. An unchanged section is the SAME node → still in `live`
    // → skipped (it keeps running). `eager` mounts immediately rather than via a parent-context
    // IntersectionObserver, which is unreliable across the transform-scaled child iframe; a typical
    // deck has a handful of targets, and diffing keeps them stable. SCENES scan FIRST so a baked
    // spec wins over the chart on-ramp on a both-classes section (the chart loop then skips it as
    // already live; hydrateResolved's marker is the belt-and-suspenders guard).
    for (const section of Array.from(doc.querySelectorAll('section.scene[data-scene-spec]'))) {
      if (live.has(section)) continue;
      const ctrl = hydrateScene(section, { eager: true, sanitize: sanitizeSlideHtml });
      if (ctrl) live.set(section, ctrl);
    }
    // Any opted-in chart (`section.chart-anima`) not already tracked — the model-free chart on-ramp.
    // hydrateChart derives the scene from the chart's own native-roled marks at view time, then goes
    // through the SAME host, so a chart gets the control, reduced-motion tiers + opt-in, and (off the
    // Playground, where IO is reliable) lazy mount. `eager` here for the same scaled-iframe reason.
    for (const section of Array.from(doc.querySelectorAll(CHART_ANIMA_SEL))) {
      if (live.has(section)) continue;
      const ctrl = hydrateChart(section, { eager: true, sanitize: sanitizeSlideHtml });
      if (ctrl) live.set(section, ctrl);
    }
  }

  function destroy(): void {
    disposeAll();
  }

  return { rebind, destroy };
}
