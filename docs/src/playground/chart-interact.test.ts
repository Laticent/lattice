// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartInteract } from './chart-interact.js';

// These exercise the REAL parent-hosted hit layer (not the mocked one in chart-detail-layer.test.tsx),
// focused on the PINNED re-pin path: the hit-surface must track the chart's geometry even when the
// only thing that changed is the FRAME's inline transform/opacity — the late "reveal" a loader host
// (Present) performs (single-slide-render's scaleFrame), which ResizeObserver cannot see. jsdom stubs
// ResizeObserver to a no-op, so if the surface still re-pins here it can ONLY be the MutationObserver
// on the frame's `style` (watchFrame) doing it — which is exactly the Present-on-mobile fix.
//
// SCOPE: this proves the WIRING (a frame style mutation triggers a re-pin). It is NOT a claim that
// Present's real runtime works — that needs a real browser (jsdom rects are all 0×0), and is checked
// on the deploy preview (HARD RULE #23).

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
  // The frame's on-screen box. offsetWidth stays 0 in jsdom → scale S = 1 (a no-op bridge).
  const frameGBCR = vi.fn(() => rect({ left: 0, top: 0, width: 400, height: 300 }));
  iframe.getBoundingClientRect = frameGBCR;
  return { iframe, frameGBCR };
}

const tick = () => new Promise((r) => setTimeout(r, 0)); // flush the MutationObserver microtask, BEFORE onSlide's 80ms timer

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
});
