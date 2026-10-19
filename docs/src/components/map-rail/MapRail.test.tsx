import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PreviewPool } from '../studio/preview-pool';
import { geometryFor, MapRail, type MapRailProps } from './MapRail';
import type { Wire } from './wireframe';

// jsdom lays nothing out, so the rail's thickness and view length are stated here.
beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 148 });
	Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});
afterEach(cleanup);

const wire = (): Wire => ({ title: 'T', kind: '', blocks: ['text', 'list'] });
function props(over: Partial<MapRailProps> = {}): MapRailProps {
	return { count: 500, focus: 0, onPick: vi.fn(), onStep: vi.fn(), wire, label: (i) => `Slide ${i + 1}`, aspect: 16 / 9, orientation: 'vertical', ...over };
}
const tiers = () => [...document.querySelectorAll<HTMLElement>('button[data-unit]')].map((b) => [Number(b.dataset.unit), b.dataset.tier] as const);

describe('geometryFor', () => {
	it('scales a tile to the rail and keeps the slide shape', () => {
		const g = geometryFor(10, 148, 16 / 9, 'vertical');
		expect(g.cross).toBe(132);
		expect(g.main).toBeCloseTo(132 / (16 / 9));
		expect(g.total).toBeCloseTo(16 + 10 * g.pitch - 8);
	});
	it('turns the axes over in a strip', () => {
		const g = geometryFor(10, 112, 16 / 9, 'horizontal');
		expect(g.cross).toBe(96);
		expect(g.main).toBeCloseTo(96 * (16 / 9));
	});
	it('survives an empty list and a bad aspect', () => {
		expect(geometryFor(0, 100, 0, 'vertical').total).toBe(16);
	});
});

describe('MapRail', () => {
	it('mounts a window of a 500-slide deck, not the deck, and always the focused tile', () => {
		render(<MapRail {...props({ focus: 250 })} />);
		const units = tiers().map(([i]) => i);
		expect(units.length).toBeGreaterThan(3);
		expect(units.length).toBeLessThan(40);
		expect(units).toContain(250);
		expect(screen.getByRole('button', { name: 'Slide 251' }).getAttribute('aria-current')).toBe('true');
	});

	it('makes the tiles in view live and the overscan tiles sketches', () => {
		render(<MapRail {...props({ count: 40, live: (i) => <i data-live={i} />, liveBudget: 3 })} />);
		const t = tiers();
		const liveCount = t.filter(([, tier]) => tier === 'live').length;
		expect(liveCount).toBeGreaterThanOrEqual(3);
		expect(t.some(([, tier]) => tier === 'wireframe')).toBe(true);
	});

	// A pool that reports its capacity, the way PreviewPool's `onSettle` does, from a layout effect.
	function Pool({ capacity, report, children }: { capacity: number; report: (p: { capacity: number }) => void; children: React.ReactNode }) {
		React.useLayoutEffect(() => report({ capacity }), [capacity, report]);
		return <>{children}</>;
	}
	const liveTiles = () => tiers().filter(([, tier]) => tier === 'live').length;

	it('never asks a pool for more live tiles than the capacity it reported', () => {
		// 600 px of rail shows 8 tiles, so the rail wants 9 live; a pool that holds 3 must get 3, not 9.
		const { rerender } = render(<MapRail {...props({ count: 100, live: (i) => <i data-live={i} />, wrap: (tiles, report) => <Pool capacity={3} report={report}>{tiles}</Pool> })} />);
		expect(liveTiles(), 'the rail asked past the capacity the pool reported').toBe(3);
		// The capacity is what settle holds, not a ceiling fixed in the rail: a pool that grows is used.
		rerender(<MapRail {...props({ count: 100, live: (i) => <i data-live={i} />, wrap: (tiles, report) => <Pool capacity={12} report={report}>{tiles}</Pool> })} />);
		expect(liveTiles()).toBeGreaterThan(3);
		expect(liveTiles()).toBeLessThanOrEqual(12);
		// And one that shrinks is re-asked at once, not left over-asked until the next scroll.
		rerender(<MapRail {...props({ count: 100, live: (i) => <i data-live={i} />, wrap: (tiles, report) => <Pool capacity={2} report={report}>{tiles}</Pool> })} />);
		expect(liveTiles()).toBe(2);
	});

	it('charges a priced stage to the same live budget and still gives the pool its full capacity', () => {
		// The stage costs 2; the page's cap is the pool's 3 plus the stage's 2, so the tiles keep all 3.
		render(<MapRail {...props({ count: 100, live: (i) => <i data-live={i} />, stage: { cost: 2 }, wrap: (tiles, report) => <Pool capacity={3} report={report}>{tiles}</Pool> })} />);
		expect(liveTiles()).toBe(3);
	});

	it('a real PreviewPool with a lowered ceiling caps the rail through settle', () => {
		render(<MapRail {...props({ count: 100, live: (i) => <i data-live={i} />, wrap: (tiles, report) => <PreviewPool maxSlots={4} onSettle={report}>{tiles}</PreviewPool> })} />);
		expect(liveTiles()).toBe(4);
	});

	it('a host with no pictures gets no live tiles whatever its pool reports', () => {
		render(<MapRail {...props({ count: 100, wrap: (tiles, report) => <Pool capacity={20} report={report}>{tiles}</Pool> })} />);
		expect(liveTiles()).toBe(0);
	});

	it('draws every tile as a sketch when the host has no pictures', () => {
		render(<MapRail {...props({ count: 40 })} />);
		expect(tiers().every(([, tier]) => tier === 'wireframe')).toBe(true);
	});

	it('reports a pick and each step, and disables the ends', () => {
		const p = props({ count: 20, focus: 0 });
		render(<MapRail {...p} />);
		fireEvent.click(screen.getByRole('button', { name: 'Slide 3' }));
		expect(p.onPick).toHaveBeenCalledWith(2);
		fireEvent.click(screen.getByRole('button', { name: 'Map, next slide' }));
		fireEvent.click(screen.getByRole('button', { name: 'Map, last slide' }));
		expect(p.onStep).toHaveBeenNthCalledWith(1, 'next');
		expect(p.onStep).toHaveBeenNthCalledWith(2, 'last');
		expect((screen.getByRole('button', { name: 'Map, first slide' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Map, previous slide' }) as HTMLButtonElement).disabled).toBe(true);
		cleanup();
		render(<MapRail {...props({ count: 20, focus: 19 })} />);
		expect((screen.getByRole('button', { name: 'Map, last slide' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('moves by the arrow keys the orientation names, and Home and End', () => {
		const p = props({ count: 20, focus: 5 });
		render(<MapRail {...p} />);
		const tile = screen.getByRole('button', { name: 'Slide 6' });
		fireEvent.keyDown(tile, { key: 'ArrowDown' });
		fireEvent.keyDown(tile, { key: 'ArrowUp' });
		fireEvent.keyDown(tile, { key: 'Home' });
		fireEvent.keyDown(tile, { key: 'End' });
		expect((p.onStep as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['next', 'prev', 'first', 'last']);
	});

	it('End on a long rail leaves keyboard focus on the new last tile once it mounts', () => {
		const p = props({ count: 200, focus: 0 });
		const { rerender } = render(<MapRail {...p} />);
		const tile = screen.getByRole('button', { name: 'Slide 1' });
		tile.focus();
		fireEvent.keyDown(tile, { key: 'End' });
		rerender(<MapRail {...p} focus={199} />);
		expect(document.activeElement?.getAttribute('data-unit')).toBe('199');
	});

	it('a key that moves nothing cannot take keyboard focus later', () => {
		vi.useFakeTimers();
		try {
			const p = props({ count: 5, focus: 4 });
			const { rerender } = render(<MapRail {...p} />);
			const field = document.createElement('textarea');
			document.body.appendChild(field);
			fireEvent.keyDown(screen.getByRole('button', { name: 'Slide 5' }), { key: 'ArrowDown' });
			field.focus();
			act(() => vi.advanceTimersByTime(1500));
			rerender(<MapRail {...p} focus={1} />);
			expect(document.activeElement).toBe(field);
			field.remove();
		} finally {
			vi.useRealTimers();
		}
	});

	it('has exactly one tab stop among its tiles: the focused one', () => {
		render(<MapRail {...props({ count: 30, focus: 4 })} />);
		const stops = [...document.querySelectorAll<HTMLElement>('button[data-unit]')].filter((b) => b.tabIndex === 0);
		expect(stops.map((b) => b.dataset.unit)).toEqual(['4']);
	});

	it('keeps a tab stop when a hand scroll has taken the focused tile out of the window', () => {
		render(<MapRail {...props({ count: 500, focus: 250 })} />);
		const scroller = document.querySelector('[data-map-rail] > div:last-child') as HTMLElement;
		Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0, writable: true });
		act(() => {
			scroller.scrollTop = 0;
			fireEvent.scroll(scroller);
		});
		const stops = [...document.querySelectorAll<HTMLElement>('button[data-unit]')].filter((b) => b.tabIndex === 0);
		expect(stops.length).toBe(1);
	});

	it('asks for enough live tiles to cover what is on screen, above the base budget', () => {
		render(<MapRail {...props({ count: 100, live: (i) => <i data-live={i} />, liveBudget: 2 })} />);
		// 600 px of rail at about 82 px a tile shows 8 tiles: a budget of 2 would leave six sketches in view.
		expect(document.querySelectorAll('[data-live]').length).toBeGreaterThanOrEqual(8);
	});

	it('renders nothing for an empty deck and names itself for assistive tech', () => {
		render(<MapRail {...props({ count: 0 })} />);
		expect(tiers()).toEqual([]);
		expect(screen.getByRole('navigation', { name: 'Slide map' })).toBeTruthy();
	});
});
