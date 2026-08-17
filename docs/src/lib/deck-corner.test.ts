import { describe, expect, it } from 'vitest';
import { cornerRadiusCss, slideCornerFraction } from './deck-corner';

// The consumer half of the `corners:` register (#1649): Studio chrome that frames a slide
// agrees with the deck instead of imposing a corner of its own.
//
// Both defects this module shipped were in the parts a "does it round?" check cannot see —
// the UNMEASURABLE case and the unit of the value read back — so those are what these pin.
// The timing itself (a cold load, a `size:` switch) lives in DeckPreview's publish schedule
// and is only provable on a real browser; `docs/e2e` is its home, not here.

/** A frame host whose section reports `radius` at `w × h`, or no section at all. */
function host({ radius, w = 1280, section = true }: { radius: string; w?: number; section?: boolean }) {
	const sectionEl = { getBoundingClientRect: () => ({ width: w }) } as unknown as Element;
	const frame = { contentDocument: { querySelector: () => (section ? sectionEl : null) } } as unknown as HTMLIFrameElement;
	// jsdom does not lay out an iframe's srcdoc, so `getComputedStyle` is stubbed for the one
	// property the module reads. Restored in a `finally` by every caller — a failing
	// expectation must not leave the global patched for the rest of the file.
	const original = globalThis.getComputedStyle;
	globalThis.getComputedStyle = ((el: Element) =>
		el === sectionEl ? ({ borderTopLeftRadius: radius } as CSSStyleDeclaration) : original(el)) as typeof getComputedStyle;
	return { el: { querySelector: () => frame } as unknown as Element, restore: () => { globalThis.getComputedStyle = original; } };
}

/** Measure through a stubbed frame, always restoring the global. */
function measure(opts: Parameters<typeof host>[0]): number | null {
	const h = host(opts);
	try {
		return slideCornerFraction(h.el);
	} finally {
		h.restore();
	}
}

describe('slideCornerFraction', () => {
	it('reads a rounded slide as a fraction of its width', () => {
		// 19.2px on a 1280px slide is the engine's 1.5% — the same proportion at any size,
		// which is why a fraction is the honest unit and pixels are not.
		expect(measure({ radius: '19.2px' })).toBeCloseTo(0.015, 6);
		expect(measure({ radius: '57.6px', w: 3840 })).toBeCloseTo(0.015, 6);
	});

	it('reads a square slide as 0 — a real measurement, not a failure', () => {
		expect(measure({ radius: '0px' })).toBe(0);
	});

	it('returns NULL when the frame cannot be measured yet — the cold-load case', () => {
		// The distinction the module exists to preserve. On the write path the renderer
		// resolves before the browser parses the new srcdoc, so a measurement taken at the
		// commit finds no section. Reporting that as square and caching it latched a square
		// box over a rounded deck until the next keystroke — which is exactly why driving the
		// Studio by typing did not catch it. `null` means "ask again on the next tick".
		expect(measure({ radius: '19.2px', section: false })).toBeNull();
		expect(slideCornerFraction({ querySelector: () => null } as unknown as Element)).toBeNull();
		expect(slideCornerFraction(null)).toBeNull();
		// A section with no usable geometry has not laid out yet — also "ask again", and never
		// a fraction with a division by zero in it.
		expect(measure({ radius: '19.2px', w: 0 })).toBeNull();
	});

	it('DECLINES a percentage radius rather than converting it', () => {
		// A percentage `border-radius` is per-axis by definition — `50%` is half the width
		// horizontally AND half the height vertically, an ellipse that tracks the box — while
		// this function's contract is one fraction the host re-expands into a circle.
		// Converting would hand the host a circle where the slide has an ellipse: the exact
		// mismatch the module exists to prevent. The engine only emits px, so this is
		// reachable only from theme or author CSS, and there a square host is the honest
		// answer — it declines to claim a shape it cannot match.
		expect(measure({ radius: '50%' })).toBe(0);
		expect(measure({ radius: '1.5%' })).toBe(0);
	});

	it('reads the FIRST component of a pair, so a mixed-unit pair is not misread', () => {
		// Chromium can return `20px 10%` — a horizontal radius and a vertical one. Testing the
		// whole string for `%` took the percentage branch and read a 20px corner as 20%:
		// 12.8x too round. Only the horizontal component decides.
		expect(measure({ radius: '20px 10%' })).toBeCloseTo(20 / 1280, 6);
		expect(measure({ radius: '19.2px 19.2px' })).toBeCloseTo(0.015, 6);
		expect(measure({ radius: '10% 20px' })).toBe(0);
	});

	it('an unparseable or non-positive radius is square, never NaN', () => {
		expect(measure({ radius: 'auto' })).toBe(0);
		expect(measure({ radius: '' })).toBe(0);
		expect(measure({ radius: '-4px' })).toBe(0);
		// `calc()` survives into the computed value unresolved; unparseable is square, not NaN.
		expect(measure({ radius: 'calc(10% + 5px)' })).toBe(0);
	});
});

describe('cornerRadiusCss', () => {
	it('emits a PERCENTAGE pair, so the corner is circular on a non-square box', () => {
		// One percentage would be elliptical: CSS resolves the horizontal radius against width
		// and the vertical against height. Scaling the vertical half by the box's aspect makes
		// both radii the same absolute length.
		const [horiz, vert] = cornerRadiusCss(0.015, 16 / 9).split(' / ').map(Number.parseFloat);
		expect(horiz).toBeCloseTo(1.5, 4);
		expect(vert).toBeCloseTo(1.5 * (16 / 9), 4);
		// The same absolute length on a 1280×720 box: 1.5% of 1280 === 2.6667% of 720.
		expect((horiz / 100) * 1280).toBeCloseTo((vert / 100) * 720, 3);
	});

	it('takes the HOST box aspect, so a 4:3 host gets a 4:3 pair', () => {
		const [h, v] = cornerRadiusCss(0.015, 4 / 3).split(' / ').map(Number.parseFloat);
		expect((h / 100) * 960).toBeCloseTo((v / 100) * 720, 3);
	});

	it('is percentages rather than pixels, so an unmeasured host still gets the corner', () => {
		// The phone-layout bug: the Studio's preview box falls back to `width: 100%` when the
		// pane size has not resolved, so a pixel value derived from a measured width came out
		// `0px`. A percentage resolves against the host's own painted box, whatever it becomes.
		expect(cornerRadiusCss(0.015, 16 / 9)).toMatch(/%/);
		expect(cornerRadiusCss(0.015, 16 / 9)).not.toMatch(/px/);
	});

	it('a square deck is a hard 0px, and a degenerate aspect cannot emit NaN', () => {
		expect(cornerRadiusCss(0, 16 / 9)).toBe('0px');
		expect(cornerRadiusCss(0.015, 0)).toBe('0px');
		expect(cornerRadiusCss(0.015, Number.NaN)).toBe('0px');
	});
});
