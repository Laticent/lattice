// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartInteract } from './chart-interact.js';

// These exercise the REAL parent-hosted hit layer (not the mocked one in chart-detail-layer.test.tsx).
// Two independent guards, for two DIFFERENT fixes (see the decision note's "Present had TWO real
// blockers"):
//   1. FRAME-STYLE re-pin — the hit-surface must track the chart's geometry when the only change is the
//      FRAME's inline transform/opacity (the late "reveal" a loader host performs via scaleFrame, which
//      ResizeObserver can't see). jsdom stubs ResizeObserver to a no-op, so a re-pin here can ONLY be the
//      `watchFrame` MutationObserver. This is a geometry HARDENING, not the Present-tap root-cause fix.
//   2. FRAME-`load` self-heal — the actual Present-tap fix: `onSlide` re-runs on the iframe's `load`
//      event, so the hit-surface binds even when the host's first pin ran before the srcdoc parsed (the
//      parse race). The test reproduces the race and fails without the `load` re-bind.
//
// SCOPE: these prove the WIRING. Neither is a claim that Present's full runtime works — that needs a real
// browser (jsdom rects are all 0×0) and is checked on the deploy preview (HARD RULE #23).

const rect = (o: Partial<DOMRect>): DOMRect =>
  ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...o }) as DOMRect;

function buildFrame(svgBox: { width: number; height: number }) {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe); // gives it a contentDocument in jsdom
  const doc = iframe.contentDocument;
  if (!doc) throw new Error('no contentDocument');
  doc.body.innerHTML = `
    <div class="lattice"><section>
      <figure><svg class="funnel-svg">
        <rect data-mark="0" data-label="Visitors" data-value="12000"></rect>
        <rect data-mark="1" data-label="Signups" data-value="4800"></rect>
      </svg></figure>
      <div class="chart-details">
        <template class="chart-detail" data-mark="0"><li>top of funnel</li></template>
        <template class="chart-detail" data-mark="1"><li>landing test holds</li></template>
      </div>
    </section></div>`;
  const svg = doc.querySelector('svg.funnel-svg') as SVGElement & { getBoundingClientRect(): DOMRect };
  // The chart's own box (drives the hit-surface size). Mutable so a later re-pin reads a NEW value.
  svg.getBoundingClientRect = () => rect({ left: 10, top: 10, width: svgBox.width, height: svgBox.height });
  // Give each mark a box so markAnchor (the no-pointer fallback) can read a center. Stack them vertically.
  for (const m of doc.querySelectorAll<SVGElement & { getBoundingClientRect(): DOMRect }>('[data-mark]')) {
    const idx = Number(m.getAttribute('data-mark'));
    m.getBoundingClientRect = () => rect({ left: 20, top: 20 + idx * 40, width: 100, height: 30 });
  }
  // The frame's on-screen box. offsetWidth stays 0 in jsdom → scale S = 1 (a no-op bridge).
  const frameGBCR = vi.fn(() => rect({ left: 0, top: 0, width: 400, height: 300 }));
  iframe.getBoundingClientRect = frameGBCR;
  return { iframe, frameGBCR };
}

// Flush the MutationObserver microtask AND the rAF that reflow is now coalesced through (observers
// schedule reflow via requestAnimationFrame). The nested rAF resolves only AFTER the reflow rAF (which
// the MO queues during the microtask drain) has run. Stays under onSlide's 80ms timer.
const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('createChartInteract — pinned re-pin on frame reveal', () => {
  it('re-pins the hit-surface when the frame style mutates (the ResizeObserver-blind late reveal)', async () => {
    const svgBox = { width: 200, height: 150 };
    const { iframe } = buildFrame(svgBox);
    const stage = document.createElement('div');
    document.body.appendChild(stage);

    const ci = createChartInteract({ stage, getFrame: () => iframe, hoverAny: false });
    ci.onSlide(0);

    const hit = stage.querySelector('.db-pp-charthit') as HTMLElement;
    expect(hit).toBeTruthy();
    // Pinned to the chart's initial box (S = 1, so width passes through).
    expect(hit.style.display).toBe('block');
    expect(hit.style.width).toBe('200px');

    // The chart moves/resizes UNDER the binding (the reveal scales the frame + the chart re-lays-out),
    // and the ONLY signal is the frame's inline style changing — the exact thing ResizeObserver misses.
    svgBox.width = 100;
    iframe.style.transform = 'scale(0.5)';
    await tick();

    // If watchFrame's MutationObserver didn't fire, the stubbed ResizeObserver would leave this at 200px.
    expect(hit.style.width).toBe('100px');
    ci.destroy();
  });

  it('re-targets its frame observer when getFrame() returns a new element', async () => {
    const svgBox = { width: 200, height: 150 };
    let current = buildFrame(svgBox);
    const stage = document.createElement('div');
    document.body.appendChild(stage);

    const ci = createChartInteract({ stage, getFrame: () => current.iframe, hoverAny: false });
    ci.onSlide(0);
    const hit = stage.querySelector('.db-pp-charthit') as HTMLElement;
    expect(hit.style.width).toBe('200px');

    // A srcdoc replacement swaps in a NEW iframe element; onSlide re-runs (Present re-pins each render)
    // and watchFrame must re-attach its observer to the NEW element.
    const nextBox = { width: 120, height: 90 };
    const next = buildFrame(nextBox);
    current = next;
    ci.onSlide(0); // synchronous reflow pins to the new frame's 120px
    expect(hit.style.width).toBe('120px');

    // Now the ONLY re-pin signal is a style mutation on the NEW frame. If watchFrame stayed bound to the
    // OLD element, this wouldn't fire and the surface would stay at 120px.
    nextBox.width = 80;
    next.iframe.style.opacity = '1';
    await tick();
    expect(hit.style.width).toBe('80px');
    ci.destroy();
  });

  it('number-key reveal with NO pointer anchors at the mark, not off-screen (-9999)', () => {
    const { iframe } = buildFrame({ width: 200, height: 150 });
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    const payloads: Array<{ x?: number; y?: number } | null> = [];

    const ci = createChartInteract({
      stage,
      getFrame: () => iframe,
      hoverAny: false,
      onDetail: (d) => payloads.push(d as { x?: number; y?: number } | null),
    });
    ci.onSlide(0); // bind, no pointer has moved

    // Number key '2' → mark index 1, with NO live pointer (the Present presenter-window / keyboard path).
    expect(ci.handleKey(new KeyboardEvent('keydown', { key: '2' }))).toBe(true);
    const opened = payloads.filter(Boolean).at(-1);
    expect(opened).toBeTruthy();
    // Fallback anchor = mark 1's center in parent coords (S=1): left 20 + 100/2 = 70, top (20+40) + 30/2 = 75.
    expect(Number.isFinite(opened?.x)).toBe(true);
    expect(Number.isFinite(opened?.y)).toBe(true);
    expect(opened?.x).toBe(70);
    expect(opened?.y).toBe(75);
    ci.destroy();
  });

  it('self-heals on frame `load`: binds the chart when onSlide ran BEFORE the srcdoc parsed (the Present race)', async () => {
    // Reproduce the Present entry-slide race: the host calls onSlide a microtask after render, but the
    // srcdoc parses on the next TASK — so onSlide sees an EMPTY document, finds no chart, and (pre-fix)
    // never retries. The fix: the frame's `load` event (fired when the srcdoc finishes parsing) re-runs
    // onSlide in pinned mode. Here we build an empty frame, onSlide (finds nothing), THEN populate + fire
    // `load`, and assert the hit-surface is now bound + pinned.
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    iframe.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 400, height: 300 });

    const ci = createChartInteract({ stage, getFrame: () => iframe, hoverAny: false });
    ci.onSlide(0); // document is EMPTY → no chart bound
    const hit = stage.querySelector('.db-pp-charthit') as HTMLElement;
    expect(hit.style.display === 'none' || hit.style.display === '').toBe(true); // not pinned

    // The srcdoc "finishes parsing": inject the chart, then fire the frame's load event.
    const doc = iframe.contentDocument as Document;
    doc.body.innerHTML = `
      <div class="lattice"><section>
        <figure><svg class="funnel-svg"><rect data-mark="0" data-label="A" data-value="1"></rect></svg></figure>
        <div class="chart-details"><template class="chart-detail" data-mark="0"><li>x</li></template></div>
      </section></div>`;
    (doc.querySelector('svg.funnel-svg') as SVGElement).getBoundingClientRect = () => rect({ left: 10, top: 10, width: 200, height: 150 });
    iframe.dispatchEvent(new Event('load'));
    await tick();

    expect(hit.style.display).toBe('block'); // NOW bound + pinned
    expect(hit.style.width).toBe('200px');
    ci.destroy();
  });

  it('anima coupling: binds the .scene-live clone (not the poster) and never writes lift/tilt onto its marks', () => {
    // Guards the two cross-file invariants the design leans on (a silent-break risk otherwise): (1)
    // chart-interact must bind the Anima CLONE inside `.scene-live`, NOT the original poster — and it must
    // do so even if the poster still has a box (the pre-`.scene-live`-preference landmine, where a poster
    // hidden by anything other than display:none would be picked); (2) on an anima chart the reveal is
    // popover-only — it must NOT stamp inline transform/opacity onto the clone's marks (those carry the
    // renderer's baked frame; overwriting them shifts the settled chart).
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument as Document;
    doc.body.innerHTML = `
      <div class="lattice"><section>
        <figure class="anima-live">
          <svg class="funnel-svg"><rect data-mark="0" data-label="Poster" data-value="1"></rect></svg>
          <div class="scene-live"><svg class="funnel-svg"><rect data-mark="0" data-label="Clone" data-value="1"></rect></svg></div>
        </figure>
        <div class="chart-details"><template class="chart-detail" data-mark="0"><li>clone detail</li></template></div>
      </section></div>`;
    const posterSvg = doc.querySelector('figure > svg.funnel-svg') as SVGElement & { getBoundingClientRect(): DOMRect };
    const cloneSvg = doc.querySelector('.scene-live svg.funnel-svg') as SVGElement & { getBoundingClientRect(): DOMRect };
    posterSvg.getBoundingClientRect = () => rect({ left: 10, top: 10, width: 200, height: 150 }); // poster HAS a box
    cloneSvg.getBoundingClientRect = () => rect({ left: 10, top: 10, width: 100, height: 90 });
    iframe.getBoundingClientRect = vi.fn(() => rect({ left: 0, top: 0, width: 400, height: 300 }));
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    const details: Array<{ label?: string } | null> = [];

    const ci = createChartInteract({ stage, getFrame: () => iframe, hoverAny: false, onDetail: (d) => details.push(d as { label?: string } | null) });
    ci.onSlide(0);
    // Pinned to the CLONE's 100px box, not the poster's 200px → `.scene-live` preference defused the landmine.
    const hit = stage.querySelector('.db-pp-charthit') as HTMLElement;
    expect(hit.style.width).toBe('100px');

    ci.reveal(0);
    expect(details.at(-1)?.label).toBe('Clone'); // read the clone's detail, not the poster's
    const cloneMark = cloneSvg.querySelector('[data-mark="0"]') as HTMLElement;
    expect(cloneMark.style.transform).toBe(''); // reveal never touched the clone mark's baked frame
    expect(cloneMark.style.opacity).toBe('');
    ci.destroy();
  });

  it('VANILLA popover (no onDetail): keyboard reveal positions the card, does not bail unplaced', async () => {
    // Regression guard: markAnchor made anchorPt a zero-SIZE rect, which (pre-fix) tripped placePop's
    // `!ptr && !r.width` bail so the vanilla popover rendered unplaced instead of falling to the chart.
    // With the guard now `!ptr && !anchorPt && …`, a keyboard anchor IS usable → the card gets positioned.
    const { iframe } = buildFrame({ width: 200, height: 150 });
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    const ci = createChartInteract({ stage, getFrame: () => iframe, hoverAny: false }); // no onDetail = vanilla path
    ci.onSlide(0);
    const pop = stage.querySelector('.db-pp-chartpop') as HTMLElement;
    expect(pop).toBeTruthy();

    ci.handleKey(new KeyboardEvent('keydown', { key: '2' })); // number-key reveal, no pointer
    expect(pop.classList.contains('show')).toBe(true);
    // placePop → computePosition resolves on a microtask; give it a beat, then assert it WAS placed.
    await new Promise((r) => setTimeout(r, 0));
    expect(pop.style.left).not.toBe('');
    expect(pop.style.top).not.toBe('');
    ci.destroy();
  });
});
