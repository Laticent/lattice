import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { livePreviewCount, PREVIEW_BUDGET, SlideThumbFace, useInView } from './slide-thumb';

// #1463 — the thumbnail window is TWO-WAY and budgeted. The old hook disconnected its
// observer on first intersection, so a tile that had ever been on screen kept its engine
// iframe forever and a full scroll of the gallery held every tile's document at once.
// These assert the three properties the fix rests on: a scrolled-past tile is recyclable,
// the mounted set never exceeds the budget, and an ON-SCREEN tile is never recycled.

// A controllable IntersectionObserver: jsdom has none, and the hook's no-IO fallback is
// "render eagerly", which would make every assertion here vacuous.
type Entry = { target: Element; isIntersecting: boolean };
let observers: { cb: (e: Entry[]) => void; targets: Set<Element>; disconnected: boolean }[] = [];

class FakeIO {
	cb: (e: Entry[]) => void;
	targets = new Set<Element>();
	disconnected = false;
	constructor(cb: (e: Entry[]) => void) {
		this.cb = cb;
		observers.push(this);
	}
	observe(el: Element) {
		this.targets.add(el);
	}
	unobserve(el: Element) {
		this.targets.delete(el);
	}
	disconnect() {
		this.disconnected = true;
		this.targets.clear();
	}
}

/** Drive the observer that is watching `el` with a given intersection state. */
function intersect(el: Element, isIntersecting: boolean) {
	act(() => {
		for (const o of observers) {
			if (!o.disconnected && o.targets.has(el)) o.cb([{ target: el, isIntersecting }]);
		}
	});
}

// A minimal tile: the same shape every real call site uses — the observed element is the
// WRAPPER (which never unmounts), and the face is what comes and goes.
function Tile({ id }: { id: number }) {
	const [ref, visible] = useInView<HTMLDivElement>();
	return (
		<div ref={ref} data-testid={`tile-${id}`}>
			<span data-live={visible ? 'yes' : 'no'} data-testid={`face-${id}`} />
		</div>
	);
}

function Grid({ n }: { n: number }) {
	return (
		<>
			{Array.from({ length: n }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length fake grid; the index IS the tile's identity.
				<Tile key={i} id={i} />
			))}
		</>
	);
}

const isLive = (c: HTMLElement, i: number) => c.querySelector(`[data-testid="face-${i}"]`)?.getAttribute('data-live') === 'yes';

beforeEach(() => {
	observers = [];
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
});
afterEach(() => {
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});

describe('useInView — the two-way, budgeted preview window (#1463)', () => {
	it('mounts a tile on scroll-in and keeps it while it is in band', () => {
		const { container, unmount } = render(<Grid n={3} />);
		expect(isLive(container, 0)).toBe(false);
		intersect(container.querySelector('[data-testid="tile-0"]') as Element, true);
		expect(isLive(container, 0)).toBe(true);
		expect(livePreviewCount()).toBe(1);
		unmount();
	});

	it('does NOT recycle a tile that merely scrolled out of band — that is the slack', () => {
		const { container, unmount } = render(<Grid n={3} />);
		const t0 = container.querySelector('[data-testid="tile-0"]') as Element;
		intersect(t0, true);
		intersect(t0, false);
		// Still mounted: it is evictable, but nothing needed the slot.
		expect(isLive(container, 0)).toBe(true);
		unmount();
	});

	it('holds the mounted set at the budget as a long grid is scrolled through', () => {
		const n = PREVIEW_BUDGET * 2;
		const { container, unmount } = render(<Grid n={n} />);
		// Walk a viewport down the grid: each tile enters the band, then leaves it.
		for (let i = 0; i < n; i++) {
			const el = container.querySelector(`[data-testid="tile-${i}"]`) as Element;
			intersect(el, true);
			expect(livePreviewCount()).toBeLessThanOrEqual(PREVIEW_BUDGET);
			intersect(el, false);
		}
		expect(livePreviewCount()).toBeLessThanOrEqual(PREVIEW_BUDGET);
		// The one-way window would have left all 64 mounted.
		const mounted = Array.from({ length: n }, (_, i) => isLive(container, i)).filter(Boolean).length;
		expect(mounted).toBeLessThanOrEqual(PREVIEW_BUDGET);
		// And the recycling is LRU — the tiles scrolled past longest ago are the ones gone.
		expect(isLive(container, 0)).toBe(false);
		expect(isLive(container, n - 1)).toBe(true);
		unmount();
	});

	it('never recycles an IN-BAND tile, even past the budget', () => {
		const n = PREVIEW_BUDGET + 6;
		const { container, unmount } = render(<Grid n={n} />);
		// Everything is on screen at once (a very tall viewport) — nothing leaves the band.
		for (let i = 0; i < n; i++) intersect(container.querySelector(`[data-testid="tile-${i}"]`) as Element, true);
		for (let i = 0; i < n; i++) expect(isLive(container, i)).toBe(true);
		expect(livePreviewCount()).toBe(n);
		unmount();
	});

	it('releases its budget slot on unmount', () => {
		const { container, unmount } = render(<Grid n={2} />);
		intersect(container.querySelector('[data-testid="tile-0"]') as Element, true);
		expect(livePreviewCount()).toBe(1);
		unmount();
		expect(livePreviewCount()).toBe(0);
	});

	it('renders eagerly where there is no IntersectionObserver (jsdom, old engines)', () => {
		(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
		const { container, unmount } = render(<Grid n={2} />);
		expect(isLive(container, 0)).toBe(true);
		expect(isLive(container, 1)).toBe(true);
		unmount();
	});
});

describe('SlideThumbFace — the windowed face', () => {
	it('renders a placeholder that keeps the tile box when inactive', () => {
		const { container } = render(
			<SlideThumbFace options={{ themeBase: '', runtimeUrl: '', engineUrl: '' }} sample="# Hi" active={false} className="pointer-events-none aspect-video w-full" />,
		);
		const el = container.firstElementChild as HTMLElement;
		expect(el.tagName).toBe('SPAN');
		// The caller's box classes survive, so the grid's scroll height does not jump.
		expect(el.className).toContain('aspect-video');
		expect(el.className).toContain('w-full');
		expect(el.getAttribute('aria-hidden')).toBe('true');
		// And no engine host is mounted.
		expect(container.querySelector('figure')).toBeNull();
	});
});
