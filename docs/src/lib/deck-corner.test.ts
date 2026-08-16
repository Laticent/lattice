import { describe, expect, it } from 'vitest';
import { cornerRadiusCss, type DeckCorner, SQUARE, sameCorner, slideCorner } from './deck-corner';

// The consumer half of the `corners:` register (#1649): the Studio's preview chrome reads
// the corner back off the live frame instead of imposing one of its own. Both of the bugs
// this module shipped with were in the parts a "does it round?" check cannot see — the
// UNMEASURABLE case and the PERCENTAGE conversion — so those are what these pin.

/** A frame host whose section reports `radius` at `w × h`, or no section at all. */
function host({ radius, w = 1280, h = 720, section = true }: { radius: string; w?: number; h?: number; section?: boolean }) {
	const sectionEl = {
		getBoundingClientRect: () => ({ width: w, height: h }),
	} as unknown as Element;
	const frame = {
		contentDocument: { querySelector: () => (section ? sectionEl : null) },
	} as unknown as HTMLIFrameElement;
	// jsdom does not lay out an iframe's srcdoc, so `getComputedStyle` is stubbed per-call
	// rather than mocked globally — the module reads exactly one property.
	const original = globalThis.getComputedStyle;
	globalThis.getComputedStyle = ((el: Element) =>
		el === sectionEl ? ({ borderTopLeftRadius: radius } as CSSStyleDeclaration) : original(el)) as typeof getComputedStyle;
	return {
		el: { querySelector: () => frame } as unknown as Element,
		restore: () => {
			globalThis.getComputedStyle = original;
		},
	};
}

describe('slideCorner', () => {
	it('reads a rounded slide as a fraction of its width, with the slide aspect', () => {
		const h = host({ radius: '19.2px' });
		const corner = slideCorner(h.el);
		h.restore();
		expect(corner).not.toBeNull();
		expect(corner?.fraction).toBeCloseTo(0.015, 6);
		expect(corner?.aspect).toBeCloseTo(16 / 9, 6);
	});

	it('reads a square slide as SQUARE — a real measurement, not a failure', () => {
		const h = host({ radius: '0px' });
		const corner = slideCorner(h.el);
		h.restore();
		expect(corner).toEqual(SQUARE);
	});

	it('returns NULL when the frame cannot be measured yet — the cold-load case', () => {
		// The distinction this module exists to preserve. On the write path the renderer
		// resolves before the browser parses the new srcdoc, so a commit-time measurement
		// finds no section. Reporting that as SQUARE and caching it latched a square box over
		// a rounded deck until the next keystroke, which is why a typing-driven check missed
		// it entirely. `null` means "ask again on reveal".
		const noSection = host({ radius: '19.2px', section: false });
		expect(slideCorner(noSection.el)).toBeNull();
		noSection.restore();
		// No frame at all (host not yet mounted) is the same answer.
		expect(slideCorner({ querySelector: () => null } as unknown as Element)).toBeNull();
		expect(slideCorner(null)).toBeNull();
		// A zero-width section has rendered but has no usable geometry — also "ask again",
		// never a fraction with a division by zero in it.
		const zero = host({ radius: '19.2px', w: 0, h: 0 });
		expect(slideCorner(zero.el)).toBeNull();
		zero.restore();
	});
});

describe('cornerRadiusCss', () => {
	it('emits a PERCENTAGE pair, so the corner is circular on a non-square slide', () => {
		// One percentage would be elliptical: CSS resolves the horizontal radius against
		// width and the vertical against height. Scaling the vertical half by the aspect makes
		// both radii the same absolute length.
		const css = cornerRadiusCss({ fraction: 0.015, aspect: 16 / 9 });
		const [horiz, vert] = css.split(' / ').map(Number.parseFloat);
		expect(horiz).toBeCloseTo(1.5, 4);
		expect(vert).toBeCloseTo(1.5 * (16 / 9), 4);
		// The same absolute length on a 1280×720 box: 1.5% of 1280 === 2.6667% of 720.
		expect((horiz / 100) * 1280).toBeCloseTo((vert / 100) * 720, 3);
	});

	it('is percentages rather than pixels, so an unmeasured host still gets the corner', () => {
		// The phone-layout bug: the Studio's preview box falls back to `width: 100%` when
		// `previewPaneSize` has not resolved, so a pixel value derived from a measured width
		// came out `0px` and the change-guard meant it never retried. A percentage resolves
		// against the host's own painted box, whatever that turns out to be.
		expect(cornerRadiusCss({ fraction: 0.015, aspect: 16 / 9 })).toMatch(/%/);
		expect(cornerRadiusCss({ fraction: 0.015, aspect: 16 / 9 })).not.toMatch(/px/);
	});

	it('a square corner is a hard 0px, not a 0% that could read as "unset"', () => {
		expect(cornerRadiusCss(SQUARE)).toBe('0px');
		expect(cornerRadiusCss({ fraction: 0, aspect: 16 / 9 })).toBe('0px');
	});
});

describe('sameCorner', () => {
	it('is the publish change-guard — equal measurements do not re-render the chrome', () => {
		const a: DeckCorner = { fraction: 0.015, aspect: 16 / 9 };
		expect(sameCorner(a, { ...a })).toBe(true);
		expect(sameCorner(a, { fraction: 0.02, aspect: 16 / 9 })).toBe(false);
		// The aspect matters as well as the radius: a deck that changes `size:` keeps its
		// fraction but needs a new vertical percentage, and guarding on fraction alone would
		// have left the corner elliptical after a resize.
		expect(sameCorner(a, { fraction: 0.015, aspect: 4 / 3 })).toBe(false);
	});
});
