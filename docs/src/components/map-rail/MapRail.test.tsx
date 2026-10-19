import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

	it('asks for live pictures only up to the budget, nearest the view first, and the rest are sketches', () => {
		render(<MapRail {...props({ count: 40, live: (i) => <i data-live={i} />, liveBudget: 3 })} />);
		const t = tiers();
		expect(t.filter(([, tier]) => tier === 'live').length).toBe(3);
		expect(document.querySelectorAll('[data-live]').length).toBe(3);
		expect(t.some(([, tier]) => tier === 'wireframe')).toBe(true);
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
		fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
		fireEvent.click(screen.getByRole('button', { name: 'Last slide' }));
		expect(p.onStep).toHaveBeenNthCalledWith(1, 'next');
		expect(p.onStep).toHaveBeenNthCalledWith(2, 'last');
		expect((screen.getByRole('button', { name: 'First slide' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Previous slide' }) as HTMLButtonElement).disabled).toBe(true);
		cleanup();
		render(<MapRail {...props({ count: 20, focus: 19 })} />);
		expect((screen.getByRole('button', { name: 'Last slide' }) as HTMLButtonElement).disabled).toBe(true);
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

	it('has exactly one tab stop among its tiles: the focused one', () => {
		render(<MapRail {...props({ count: 30, focus: 4 })} />);
		const stops = [...document.querySelectorAll<HTMLElement>('button[data-unit]')].filter((b) => b.tabIndex === 0);
		expect(stops.map((b) => b.dataset.unit)).toEqual(['4']);
	});

	it('renders nothing for an empty deck and names itself for assistive tech', () => {
		render(<MapRail {...props({ count: 0 })} />);
		expect(tiers()).toEqual([]);
		expect(screen.getByRole('navigation', { name: 'Slide map' })).toBeTruthy();
	});
});
