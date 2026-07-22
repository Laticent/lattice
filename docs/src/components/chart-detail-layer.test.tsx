// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the parent-hosted hit layer so we can assert the plumbing (mode, lazy mount, ref API) without
// a live iframe. Capture the last options passed to createChartInteract.
const calls: Array<Record<string, unknown>> = [];
let lastOnDetail: ((d: unknown) => void) | null = null;
const rebind = vi.fn();
const onSlide = vi.fn();
const handleKey = vi.fn(() => true);
const destroy = vi.fn();
vi.mock('@/playground/chart-interact.js', () => ({
  createChartInteract: (opts: Record<string, unknown>) => {
    calls.push(opts);
    lastOnDetail = opts.onDetail as (d: unknown) => void;
    return { rebind, onSlide, handleKey, destroy, reflow() {}, reveal() {}, clear() {}, interactive: () => true };
  },
}));

import { type ChartDetailHandle, ChartDetailLayer } from './chart-detail-layer';

afterEach(() => {
  calls.length = 0;
  lastOnDetail = null;
  vi.clearAllMocks();
});

const frame = () => ({}) as HTMLIFrameElement;
const stage = () => document.createElement('div');

describe('ChartDetailLayer', () => {
  it('renders nothing and never mounts the hit layer when disabled', () => {
    const ref = React.createRef<ChartDetailHandle>();
    const { container } = render(<ChartDetailLayer ref={ref} getFrame={frame} getStage={stage} enabled={false} />);
    expect(container.firstChild).toBeNull();
    ref.current?.rebind();
    expect(calls).toHaveLength(0);
  });

  it('lazily mounts on the first rebind() once frame + stage exist — hoverAny (preview) mode', () => {
    const ref = React.createRef<ChartDetailHandle>();
    render(<ChartDetailLayer ref={ref} getFrame={frame} getStage={stage} hoverAny />);
    // Eager mount already fired in the effect (frame present at mount).
    expect(calls).toHaveLength(1);
    expect(calls[0].hoverAny).toBe(true);
    ref.current?.rebind();
    expect(rebind).toHaveBeenCalled();
    // No second construct — it mounts ONCE.
    expect(calls).toHaveLength(1);
  });

  it('defaults to pinned mode (hoverAny false) and forwards onSlide / handleKey', () => {
    const ref = React.createRef<ChartDetailHandle>();
    render(<ChartDetailLayer ref={ref} getFrame={frame} getStage={stage} />);
    expect(calls[0].hoverAny).toBe(false);
    ref.current?.onSlide(0);
    expect(onSlide).toHaveBeenCalledWith(0);
    const handled = ref.current?.handleKey(new KeyboardEvent('keydown', { key: '1' }));
    expect(handled).toBe(true);
    expect(handleKey).toHaveBeenCalled();
  });

  it('does not mount until BOTH frame and stage are available (lazy on a null frame)', () => {
    const ref = React.createRef<ChartDetailHandle>();
    render(<ChartDetailLayer ref={ref} getFrame={() => null} getStage={stage} />);
    expect(calls).toHaveLength(0); // frame missing at mount → no construct
    ref.current?.onSlide(0); // still no frame → still no construct, and no throw
    expect(calls).toHaveLength(0);
    expect(onSlide).not.toHaveBeenCalled();
  });

  it('renders the detail popover content when the layer reports a detail', async () => {
    render(<ChartDetailLayer getFrame={frame} getStage={stage} hoverAny />);
    expect(lastOnDetail).toBeTypeOf('function');
    // onDetail is the host render hook; drive it inside act() so the state update flushes.
    act(() => lastOnDetail?.({ label: 'Cloud', value: '46%', body: 'Mostly AWS reserved instances.', x: 10, y: 10 }));
    // Radix Popover portals its content to document.body when open.
    await waitFor(() => {
      expect(document.body.textContent).toContain('Cloud');
      expect(document.body.textContent).toContain('Mostly AWS reserved instances.');
    });
  });
});
