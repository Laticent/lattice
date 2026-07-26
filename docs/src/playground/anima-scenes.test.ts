// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ANIMA_HOST_SEL, PREHIDE_CLASS, SCENE_SEL } from './anima-host-sel';
import { createAnimaScenes } from './anima-scenes';

/** A fake frame whose contentDocument is a supplied jsdom document. */
function frameOf(doc: Document): HTMLIFrameElement {
  return { contentDocument: doc } as unknown as HTMLIFrameElement;
}

function chartAnimaDoc(): Document {
  const doc = document.implementation.createHTMLDocument('t');
  const section = doc.createElement('section');
  section.className = 'funnel chart-anima'; // the opt-in class
  // NATIVE renderer output: roled marks (data-anima-role), NO ids (the ingest mints them).
  section.innerHTML =
    '<div class="funnel-figure"><svg class="funnel-svg" viewBox="0 0 320 180">' +
    '<polygon class="funnel-band" data-mark="0" data-anima-role="bar" data-value="10,000" points="85,16 235,16 184,46 136,46"/>' +
    '<polygon class="funnel-band" data-mark="1" data-anima-role="bar" data-value="3,200" points="136,58 184,58 168,88 152,88"/>' +
    '</svg></div>';
  doc.body.appendChild(section);
  return doc;
}

/** A FRESH opted-in funnel section — the shape a re-render produces (new node from source, not the
 *  mutated live DOM). `labels` vary the svg text so a "changed" chart gets a different signature. */
function funnelSection(doc: Document, bands = 2, label = 'Visitors'): HTMLElement {
  const s = doc.createElement('section');
  s.className = 'funnel chart-anima';
  const polys = Array.from(
    { length: bands },
    (_, i) => `<polygon class="funnel-band" data-mark="${i}" data-anima-role="bar" points="0,0 10,0 5,10"/>`,
  ).join('');
  s.innerHTML = `<div class="funnel-figure"><svg class="funnel-svg" viewBox="0 0 320 180">${polys}<text>${label}</text></svg></div>`;
  return s;
}

// The DeckPreview host-load gate (docs/src/components/DeckPreview.tsx) tests ANIMA_HOST_SEL to
// decide whether to lazily load the Anima host at all. It MUST match everything rebind() mounts,
// or a whole surface silently goes static: the original bug was a scene-only gate, so chart-anima
// charts animated in the Playground (host wired directly) but NOT the Studio / Present / thumbnails
// (which all mount through DeckPreview). This locks the union to both mounted kinds.
describe('ANIMA_HOST_SEL — the shared host-load gate', () => {
  const sectionWith = (setup: (s: HTMLElement) => void): HTMLElement => {
    const s = document.createElement('section');
    setup(s);
    return s;
  };

  it('matches a BAKED scene (a scene slide carrying a compiled spec)', () => {
    const s = sectionWith((el) => {
      el.className = 'scene';
      el.setAttribute('data-scene-spec', '{}');
    });
    expect(s.matches(SCENE_SEL)).toBe(true);
    expect(s.matches(ANIMA_HOST_SEL)).toBe(true);
  });

  it('matches a chart opted in by a Play token (`motion-on`, or the legacy chart-anima) — the case the Studio regressed on', () => {
    for (const cls of ['funnel motion-on', 'funnel chart-anima']) {
      const s = sectionWith((el) => {
        el.className = cls;
      });
      // The regression guard: the union — what DeckPreview actually gates on — must accept a chart.
      expect(s.matches(ANIMA_HOST_SEL), cls).toBe(true);
    }
  });

  it('does NOT match an inert section — nor a bare style/speed token (Play is the sole switch, no magic)', () => {
    const plain = sectionWith((el) => {
      el.className = 'content';
    });
    const bareScene = sectionWith((el) => {
      el.className = 'scene'; // a `scene` class WITHOUT a compiled spec is not yet live
    });
    const bareChart = sectionWith((el) => {
      el.className = 'funnel'; // a chart NOT opted in stays static everywhere
    });
    // A style/speed token is a PARAMETER, not an opt-in: with no Play token it never loads the host.
    // (A deck-level `motion: on` reaches these via DeckPreview's separate deck-wide gate, not this union.)
    const styleOnly = sectionWith((el) => {
      el.className = 'funnel motion-rise';
    });
    const speedOnly = sectionWith((el) => {
      el.className = 'funnel motion-fast';
    });
    expect(plain.matches(ANIMA_HOST_SEL)).toBe(false);
    expect(bareScene.matches(ANIMA_HOST_SEL)).toBe(false);
    expect(bareChart.matches(ANIMA_HOST_SEL)).toBe(false);
    expect(styleOnly.matches(ANIMA_HOST_SEL)).toBe(false);
    expect(speedOnly.matches(ANIMA_HOST_SEL)).toBe(false);
  });
});

describe('createAnimaScenes — chart-anima wiring', () => {
  it('hydrates an opted-in chart section on rebind (mounts a live stage through the shared host)', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('section.chart-anima .scene-live')).not.toBeNull();
    expect(doc.querySelector('section.chart-anima')?.getAttribute('data-scene-live')).toBe('1');
    scenes.destroy();
    expect(doc.querySelector('.scene-live')).toBeNull(); // torn down on destroy
    expect(doc.querySelector('section.chart-anima')?.getAttribute('data-scene-live')).toBeNull();
  });

  it('keeps a live chart RUNNING across a second rebind — the SAME stage node, not a dispose+remount', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    const stageA = doc.querySelector('.scene-live'); // capture the mounted node's identity
    expect(stageA).not.toBeNull();
    scenes.rebind();
    const stageB = doc.querySelector('.scene-live');
    expect(doc.querySelectorAll('.scene-live')).toHaveLength(1); // not doubled
    expect(stageB).toBe(stageA); // IDENTICAL node → it kept running (a remount would be a new node)
    scenes.destroy();
  });

  it('disposes a chart whose section left the DOM', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    doc.querySelector('section.chart-anima')?.remove(); // a re-render dropped the section
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull();
    scenes.destroy();
  });

  it('disposes a chart that OPTED OUT on a reused node (lost the class) — no leak, poster restored', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    const section = doc.querySelector('section.funnel') as HTMLElement;
    section.classList.remove('chart-anima'); // the author removed the opt-in; same node survives
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull(); // disposed — not stranded live
    expect(section.getAttribute('data-scene-live')).toBeNull();
    expect((section.querySelector('.funnel-svg') as SVGElement).style.display).toBe(''); // static chart restored
    scenes.destroy();
  });

  it('ignores a chart section WITHOUT the opt-in class', () => {
    const doc = chartAnimaDoc();
    doc.querySelector('section')?.classList.remove('chart-anima'); // opt out
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull(); // not animated
    scenes.destroy();
  });

  // #1186: a chart whose spec validates but throws during compile/mount previously escaped
  // rebind() uncaught — with no error boundary anywhere in the docs-site (a separate fix), that
  // throw unmounted the WHOLE Studio island (React effect cleanups run through the same commit
  // phase). `hydrateScenes` (hydrate.ts) already guards its own per-section loop for exactly this
  // reason; this on-ramp calls the same per-section hydrate functions directly and needed the
  // identical guard. Mirrors the sibling "opted out" test above: a throw degrades to the SAME
  // outcome as a decline (pre-hide cleared, static poster shown), not a dead/hidden figure.
  it('a THROWING hydrate degrades to the static poster — rebind never propagates', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // `./anima-scenes` is already imported (and its dependency graph resolved) statically at the
    // top of this file, so mocking @/lib/chart-anima-hydrate now only takes effect on a FRESH
    // module graph — reset first, mock, THEN dynamically re-import both.
    vi.resetModules();
    vi.doMock('@/lib/chart-anima-hydrate', () => ({
      hydrateChart: () => {
        throw new Error('backend mount failed');
      },
    }));
    try {
      const { createAnimaScenes: createAnimaScenesFresh } = await import('./anima-scenes');
      const doc = chartAnimaDoc();
      const scenes = createAnimaScenesFresh({ getFrame: () => frameOf(doc) });
      expect(() => scenes.rebind()).not.toThrow();
      expect(doc.querySelector('.scene-live')).toBeNull(); // never mounted
      expect(doc.querySelector(`.${PREHIDE_CLASS}`)).toBeNull(); // pre-hide cleared — poster visible
      expect(doc.querySelector('section.chart-anima')?.getAttribute('data-scene-live')).toBeNull();
      expect(() => scenes.destroy()).not.toThrow();
      expect(spy).toHaveBeenCalled(); // the failure is logged, not swallowed silently
    } finally {
      vi.doUnmock('@/lib/chart-anima-hydrate');
      vi.resetModules();
      spy.mockRestore();
    }
  });
});

describe('createAnimaScenes — no replay on an in-place re-render (the "always plays" fix)', () => {
  // The single-slide render path reassigns the frame's innerHTML on every keystroke, so every
  // <section> is a NEW node. A node-identity diff would dispose+remount → replay from t=0 on every
  // edit ("always plays"). The signature-keyed carry-over mounts an identical twin SETTLED instead.
  // Charts carry no corner control now; the play state is reflected on the figure instead.
  const state = (doc: Document) => doc.querySelector('.funnel-figure')?.getAttribute('data-anima-state');

  it('a re-render that swaps the node for an IDENTICAL twin carries over SETTLED — does not replay', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.appendChild(funnelSection(doc));
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).not.toBeNull();
    expect(state(doc)).toBe('playing'); // first mount PLAYS (⏸ shown)

    // Simulate the render: replace the (now-mutated) section with a fresh identical node.
    doc.body.replaceChild(funnelSection(doc), doc.body.firstChild as Node);
    scenes.rebind();
    expect(doc.querySelectorAll('.scene-live')).toHaveLength(1); // still exactly one, not doubled
    expect(state(doc)).toBe('settled'); // SETTLED at the final frame — it did NOT replay
    scenes.destroy();
  });

  it('honors prefers-reduced-motion: a chart mounts SETTLED (final frame, no intro motion)', () => {
    // Charts carry no pause/stop control (chrome:false), so under `reduce` the host mounts them at the
    // settled end-frame rather than animating — the a11y answer (WCAG 2.2.2). Stub matchMedia to reduce.
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q) })) as unknown as typeof window.matchMedia;
    try {
      const doc = document.implementation.createHTMLDocument('t');
      doc.body.appendChild(funnelSection(doc));
      const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
      scenes.rebind();
      expect(doc.querySelector('.scene-live')).not.toBeNull(); // it still mounts…
      expect(state(doc)).toBe('settled'); // …but static at the final frame — no motion under reduce
      scenes.destroy();
    } finally {
      window.matchMedia = orig;
    }
  });

  it('a re-render whose chart CHANGED replays (a different signature)', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.appendChild(funnelSection(doc, 2));
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(state(doc)).toBe('playing');
    doc.body.replaceChild(funnelSection(doc, 3), doc.body.firstChild as Node); // 3 bands → new sig
    scenes.rebind();
    expect(state(doc)).toBe('playing'); // replayed — the chart's content actually changed
    scenes.destroy();
  });

  it('a switched STYLE replays even on identical data (style is part of the signature)', () => {
    const doc = document.implementation.createHTMLDocument('t');
    const a = funnelSection(doc);
    a.classList.remove('chart-anima');
    a.classList.add('motion-on', 'motion-build'); // Play on + explicit style
    doc.body.appendChild(a);
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(state(doc)).toBe('playing');
    const b = funnelSection(doc); // same data…
    b.classList.remove('chart-anima');
    b.classList.add('motion-on', 'motion-together'); // …different style → different sig → replay
    doc.body.replaceChild(b, doc.body.firstChild as Node);
    scenes.rebind();
    expect(state(doc)).toBe('playing');
    scenes.destroy();
  });

  it('a re-mount across SEPARATE rebinds (full srcdoc rewrite / re-entry) still lands SETTLED — the fix is render-path-agnostic', () => {
    // The persistent played-set is what makes this robust: a full srcdoc rewrite disposes on reload
    // and re-mounts on `load` in a DIFFERENT rebind than the dispose, yet the twin still lands
    // settled (a per-rebind carry would have replayed here — the incomplete first fix). An identical
    // chart re-entered in Present likewise mounts settled; the ↻ control replays on demand.
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.appendChild(funnelSection(doc));
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(state(doc)).toBe('playing'); // first play
    doc.body.removeChild(doc.body.firstChild as Node);
    scenes.rebind(); // dispose in one rebind…
    expect(doc.querySelector('.scene-live')).toBeNull();
    doc.body.appendChild(funnelSection(doc)); // …re-mount in a LATER rebind
    scenes.rebind();
    expect(state(doc)).toBe('settled'); // SETTLED — no replay across the reload
    scenes.destroy();
  });

  it('a fresh host session replays (played-set is per host, cleared on destroy/unmount)', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.appendChild(funnelSection(doc));
    const first = createAnimaScenes({ getFrame: () => frameOf(doc) });
    first.rebind();
    first.destroy();
    // a brand-new host (e.g. the component remounted) knows nothing of prior plays → plays again
    doc.body.replaceChild(funnelSection(doc), doc.body.firstChild as Node);
    const second = createAnimaScenes({ getFrame: () => frameOf(doc) });
    second.rebind();
    expect(state(doc)).toBe('playing');
    second.destroy();
  });
});

describe('createAnimaScenes — deck-level Play (front-matter `motion: on`)', () => {
  const ON = { play: 'on' as const, style: null, speed: null };
  it('animates a CLASS-LESS chart section when the deck Play is on', () => {
    const doc = chartAnimaDoc();
    doc.querySelector('section')?.classList.remove('chart-anima'); // no per-slide opt-in at all
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc), getDeckMotion: () => ON });
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).not.toBeNull(); // the deck default reached the bare chart
    scenes.destroy();
  });

  it('a slide `motion-off` suppresses the chart even under deck Play on', () => {
    const doc = chartAnimaDoc();
    const section = doc.querySelector('section') as HTMLElement;
    section.classList.remove('chart-anima');
    section.classList.add('motion-off'); // explicit per-slide opt-out
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc), getDeckMotion: () => ON });
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull(); // opt-out beats the deck default
    scenes.destroy();
  });

  it('disposes a running chart when deck Play flips off', () => {
    const doc = chartAnimaDoc();
    doc.querySelector('section')?.classList.remove('chart-anima');
    let deck = ON as { play: 'on' | 'off'; style: null; speed: null };
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc), getDeckMotion: () => deck });
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).not.toBeNull();
    deck = { play: 'off', style: null, speed: null }; // the author turned Play off
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull(); // no longer eligible → disposed
    scenes.destroy();
  });
});
