import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDeckIndex, deckOutliner } from '@/lib/deck-outline';
import { createFocusHub } from '@/lib/fuoco/hub';

// The pool draws iframes; what is under test is the host: which units the rail lists, which one it
// calls focused, and what a pick or a step asks the shell for.
vi.mock('./preview-pool', () => ({
	PreviewPool: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	PooledThumbFace: (p: { slideIndex?: number; slideMarkdown?: string }) => <i data-live-face={p.slideIndex} data-md={p.slideMarkdown} />,
}));

import StudioMap from './StudioMap';

beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 148 });
	Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});
afterEach(cleanup);

// Four authored slides; the second heading-splits into two rendered slides: five parts.
const DECK = '---\ntheme: indaco\n---\n\n# One\n\n---\n\n# Two\n\n## Two B\n\n---\n\n# Three\n\n---\n\n# Four\n';

function setup(view?: number[]) {
	const hub = createFocusHub({ outliner: deckOutliner });
	hub.update(DECK);
	hub.flush();
	const index = buildDeckIndex(DECK);
	const onPick = vi.fn();
	const props = { hub, index, view: view ?? index.units.map((_, i) => i), onPick, options: { themeBase: '', runtimeUrl: '' }, sample: DECK, front: DECK.slice(0, index.bodyStart), aspect: 16 / 9, orientation: 'vertical' as const };
	return { hub, index, onPick, ui: <StudioMap {...props} /> };
}
const tiles = () => [...document.querySelectorAll<HTMLElement>('button[data-unit]')].map((b) => b.getAttribute('aria-label'));

describe('StudioMap', () => {
	it('lists one tile per rendered slide, a heading-split slide as several, named by its title', () => {
		render(setup().ui);
		expect(tiles()).toEqual(['Slide 1, One', 'Slide 2, Two', 'Slide 3, Two B', 'Slide 4, Three', 'Slide 5, Four']);
	});

	it('draws live tiles from the shell look with the part alone as the fallback', () => {
		render(setup().ui);
		const first = document.querySelector('[data-live-face="0"]');
		expect(first?.getAttribute('data-md')).toContain('theme: indaco');
		expect(first?.getAttribute('data-md')).toContain('# One');
	});

	it('picks through the shell: a tile asks for its chunk and heading section', () => {
		const { ui, onPick } = setup();
		render(ui);
		fireEvent.click(screen.getByRole('button', { name: 'Slide 3, Two B' }));
		expect(onPick).toHaveBeenCalledWith(1, 1, undefined);
	});

	it('follows the hub focus, and steps in parts through the same pick', () => {
		const { ui, hub, onPick } = setup();
		render(ui);
		act(() => hub.go('shell', { unitIndex: 2 }));
		expect(screen.getByRole('button', { name: 'Slide 4, Three' }).getAttribute('aria-current')).toBe('true');
		fireEvent.click(screen.getByRole('button', { name: 'Map, next slide' }));
		expect(onPick).toHaveBeenLastCalledWith(3, 0, undefined);
		fireEvent.click(screen.getByRole('button', { name: 'Map, previous slide' }));
		expect(onPick).toHaveBeenLastCalledWith(1, 1, undefined);
		fireEvent.click(screen.getByRole('button', { name: 'Map, first slide' }));
		expect(onPick).toHaveBeenLastCalledWith(0, 0, undefined);
		fireEvent.click(screen.getByRole('button', { name: 'Map, last slide' }));
		expect(onPick).toHaveBeenLastCalledWith(3, 0, undefined);
	});

	it('a focus the lens hides before every shown slide highlights none, and Next goes to the first shown', () => {
		const { ui, onPick } = setup([2, 3]);
		render(ui);
		expect(document.querySelector('button[aria-current="true"]')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Map, next slide' }));
		expect(onPick).toHaveBeenLastCalledWith(2, 0, undefined);
	});

	it('an arrow key picks quietly (via.key) and a click does not', () => {
		const { ui, onPick } = setup();
		render(ui);
		fireEvent.keyDown(screen.getByRole('button', { name: 'Slide 1, One' }), { key: 'ArrowDown' });
		expect(onPick).toHaveBeenLastCalledWith(1, 0, { key: true });
		fireEvent.click(screen.getByRole('button', { name: 'Slide 3, Two B' }));
		expect(onPick).toHaveBeenLastCalledWith(1, 1, undefined);
	});

	it('lists only the lens set, numbered within it, and a hidden focus sits on the nearest earlier slide', () => {
		const { ui, hub } = setup([0, 2]);
		render(ui);
		expect(tiles()).toEqual(['Slide 1, One', 'Slide 2, Three']);
		act(() => hub.go('shell', { unitIndex: 1 }));
		expect(screen.getByRole('button', { name: 'Slide 1, One' }).getAttribute('aria-current')).toBe('true');
	});
});
