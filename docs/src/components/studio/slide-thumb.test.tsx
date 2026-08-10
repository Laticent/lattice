import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture what the face hands the renderer. The engine host is stubbed — these tests are
// about the WINDOW and about WHO gets the authoring alarms, not about rendering a slide.
let lastDeckPreviewProps: Record<string, unknown> | null = null;
vi.mock('@/components/DeckPreview', () => ({
	default: (props: Record<string, unknown>) => {
		lastDeckPreviewProps = props;
		return <figure data-testid="deck-preview" />;
	},
}));

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
	deliver(el, [isIntersecting]);
}

/**
 * Deliver a COALESCED BATCH — several entries for one target in a single callback, which is what
 * a real IntersectionObserver does when the update-observations step runs more than once before
 * its task is serviced. Measured on the real Studio: 4–10 such batches per flick-scroll of the
 * gallery, overwhelmingly the shape `[true, false]`.
 *
 * This is the delivery the first cut of the fix could not survive and this suite could not model:
 * it always sent exactly one entry, so the hook's `([e])` destructure looked correct. Every
 * assertion about the budget is only as good as this function.
 */
function deliver(el: Element, states: boolean[]) {
	act(() => {
		for (const o of observers) {
			if (!o.disconnected && o.targets.has(el)) o.cb(states.map((isIntersecting) => ({ target: el, isIntersecting })));
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

	// ── Coalesced batches ────────────────────────────────────────────────────────
	// A real observer delivers several entries for one target in one callback. Reading
	// only the first is permanent corruption here, because the hook keeps state keyed off
	// the read — these three cases are the shapes that broke it, all found by the
	// adversarial trio and all demonstrated on the real surface before being pinned here.

	it('a [in, out] batch claims no slot — the poison that made one immortal', () => {
		const { container, unmount } = render(<Grid n={4} />);
		// Tile 0 flicks into and straight back out of the band inside one delivery — the shape
		// measured 4–10 times per flick-scroll of the real gallery. The batch NETS to "out of
		// band", so the right outcome is that nothing mounts at all.
		//
		// Reading entries[0] instead mounted it AND marked it `inBand: true` while it was
		// actually out — and since the observer's own state was already "not intersecting" it
		// never reported again, so `enforcePreviewBudget` (which skips in-band slots) could
		// never reclaim that slot. Poison ~32 and the budget evicts nothing.
		deliver(container.querySelector('[data-testid="tile-0"]') as Element, [true, false]);
		expect(isLive(container, 0), 'an out-of-band tile was mounted').toBe(false);
		expect(livePreviewCount(), 'an out-of-band tile is holding a budget slot').toBe(0);
		unmount();
	});

	it('an [out, in] batch on an ON-SCREEN tile does not recycle it — the falsified invariant', () => {
		// This is the case that made "an in-band tile is never recycled" untrue. Tile 0 is on
		// screen the whole time; its last entry says so. Reading entries[0] marked it evictable
		// and the next tile needing a slot tore down something the user was looking at.
		const n = PREVIEW_BUDGET + 4;
		const { container, unmount } = render(<Grid n={n} />);
		const t0 = container.querySelector('[data-testid="tile-0"]') as Element;
		intersect(t0, true);
		for (let i = 1; i < n - 1; i++) {
			const el = container.querySelector(`[data-testid="tile-${i}"]`) as Element;
			intersect(el, true);
			intersect(el, false);
		}
		deliver(t0, [false, true]); // still on screen, reported in one coalesced batch
		intersect(container.querySelector(`[data-testid="tile-${n - 1}"]`) as Element, true);
		expect(isLive(container, 0), 'a tile the user can see was recycled').toBe(true);
		unmount();
	});

	it('an [out, in] batch on a cold tile MOUNTS it — no blank box on screen', () => {
		const { container, unmount } = render(<Grid n={4} />);
		deliver(container.querySelector('[data-testid="tile-0"]') as Element, [false, true]);
		expect(isLive(container, 0), 'an on-screen tile was left as a placeholder').toBe(true);
		unmount();
	});

	it('every delivery coalesced still holds the budget — #1463 must not return this way', () => {
		// The worst case the red team ran on the real surface: a scroll where every delivery is
		// a batch. With entries[0] this mounted all 96 tiles against a budget of 32.
		const n = 96;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < n; i++) {
			const el = container.querySelector(`[data-testid="tile-${i}"]`) as Element;
			deliver(el, [true, false]);
		}
		expect(livePreviewCount()).toBeLessThanOrEqual(PREVIEW_BUDGET);
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

describe('SlideThumbFace — who gets the authoring alarms (#1463)', () => {
	// The regression this pins: `specimen` used to be declared BY this face, so every grid
	// sharing it lost the engine's overflow ring and type-floor alarm — including Present's
	// slide overview and Reshape's variant tiles, which show the AUTHOR'S OWN slides. Being
	// small is not what makes a preview unworthy of the signal; not being yours is. The flag
	// is now per-caller, and these assert the default is to KEEP the signal.
	const opts = { themeBase: '', runtimeUrl: '', engineUrl: '' };
	beforeEach(() => {
		lastDeckPreviewProps = null;
	});

	it('does not mark a tile as a specimen unless the caller says so', () => {
		render(<SlideThumbFace options={opts} sample="# Hi" active className="aspect-video w-full" />);
		expect(lastDeckPreviewProps?.specimen, "a thumbnail of the author's own slide was silenced").toBeFalsy();
	});

	it('forwards the caller\'s specimen declaration through to the renderer', () => {
		render(<SlideThumbFace options={opts} sample="# Hi" active specimen className="aspect-video w-full" />);
		expect(lastDeckPreviewProps?.specimen, 'a catalog specimen was not silenced').toBe(true);
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
