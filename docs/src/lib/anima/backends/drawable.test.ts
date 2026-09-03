import { beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../compile';
import { parseScene } from '../schema';
import { drawableRenderer } from './drawable';

// ── The draw channel, in jsdom ────────────────────────────────────────────────────────
//
// These tests exist in a place the OLD backend's could not: Vivus needed `getTotalLength()`,
// which jsdom does not implement, so it threw in its constructor and the whole draw channel
// silently no-opped behind `ready = false`. Its own test file said so and tested around it.
// `createDrawable` normalizes via `pathLength` instead of measuring geometry, so the channel
// is exercisable here — that property IS the reason for the swap, so it is asserted directly
// rather than assumed.
//
// The other thing asserted here is the capability Vivus structurally could not offer:
// PER-ELEMENT draw windows. Vivus drove one progress scalar for the whole figure in DOM
// document order, so "b draws only after a finishes" was not expressible. Each element now
// owns its own paused animation that the frame model seeks.

const SCENE = {
  source: 'svg' as const,
  duration: 1000,
  hero: 0.5,
  asset: 'fig',
  elements: [
    { id: 'a', pathRef: 'a', color: 'var(--accent)', motion: [{ verb: 'draw' as const, at: 0, span: 0.5 }] },
    { id: 'b', pathRef: 'b', color: 'var(--accent)', motion: [{ verb: 'draw' as const, at: 0.5, span: 0.5 }] },
  ],
};

const MARKUP = '<svg viewBox="0 0 100 50"><path id="a" d="M0 0 L50 0"/><path id="b" d="M0 25 L50 25"/></svg>';

function mounted() {
  const parsed = parseScene(SCENE);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = drawableRenderer();
  r.mount(host, parsed.scene, { fig: MARKUP });
  return { host, renderer: r, timeline: compile(parsed.scene) };
}

const dashOf = (host: Element, id: string) => host.querySelector(`#${id}`)?.getAttribute('stroke-dasharray') ?? '';

describe('drawableRenderer', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('advertises the draw capability the marks backend does not', () => {
		expect(drawableRenderer().caps.draw).toBe(true);
		expect(drawableRenderer().caps.source).toContain('svg');
	});

	it('mounts the asset and normalizes each drawn path by pathLength, in jsdom', () => {
		const { host } = mounted();
		// The whole reason this backend is testable here: normalization, not measurement.
		expect(host.querySelector('#a')?.getAttribute('pathLength')).toBe('1000');
		expect(host.querySelector('#b')?.getAttribute('pathLength')).toBe('1000');
	});

	it('honors PER-ELEMENT draw windows — the thing one progress scalar could not do', () => {
		const { host, renderer, timeline } = mounted();
		// `a` draws over [0, 0.5] and `b` over [0.5, 1]. Under one whole-figure scalar the two
		// could only ever move together (in DOM document order), so the interesting frames are
		// the middle ones, where exactly one element is mid-stroke. Pinned as exact values
		// rather than "the two differ": a backend that drew both together, or one that froze
		// `b` forever, both satisfy a mere inequality at t=500.
		const seen = [0, 250, 500, 750, 1000].map((t) => {
			renderer.draw(timeline.at(t));
			return `${t}:${dashOf(host, 'a')}/${dashOf(host, 'b')}`;
		});
		expect(seen).toEqual([
			'0:0 1010/0 1010', // neither started
			'250:500 510/0 1010', // a half-drawn, b still closed
			'500:1000 0/0 1010', // a complete, b's window about to open
			'750:1000 0/500 510', // a holds finished, b half-drawn
			'1000:1000 0/1000 0', // both complete
		]);
	});

	it('is deterministic: the same frame from different journeys paints the same still', () => {
		const { host, renderer, timeline } = mounted();
		renderer.draw(timeline.at(300));
		const forward = dashOf(host, 'a');
		renderer.draw(timeline.at(1000));
		renderer.draw(timeline.at(300));
		expect(dashOf(host, 'a')).toBe(forward);
	});

	it('bakes the frame into the poster it serializes', () => {
		const { renderer, timeline } = mounted();
		const still = renderer.poster?.(timeline.at(1000));
		expect(still?.svg).toContain('<path');
		expect(still?.width).toBe(100);
		expect(still?.height).toBe(50);
	});

	it('does not REWRITE the untrusted asset the way the Pathformer did', () => {
		const { host } = mounted();
		// Vivus replaced rect/circle/line nodes with <path> clones in the caller's DOM. The
		// node identity and tag here must survive mounting untouched.
		expect(host.querySelectorAll('path')).toHaveLength(2);
		expect(host.querySelector('#a')?.tagName.toLowerCase()).toBe('path');
	});

	it('drops the asset on dispose', () => {
		const { host, renderer } = mounted();
		expect(host.querySelector('svg')).not.toBeNull();
		renderer.dispose();
		expect(host.querySelector('svg')).toBeNull();
	});
});
