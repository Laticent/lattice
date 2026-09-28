/**
 * The fit agent's STAGE gap: on a host that shows one slide at a time (`data-stage` on the
 * iframe), the gap between slides widens until a centered slide shows none of its neighbors
 * — and ONLY while the frame is one slide tall. A taller frame is a filmstrip, where the
 * host pins the slide to the top; widening there made a 300px empty band (found by a checker
 * at iPad-portrait geometry). Runs the real injected agent against a stubbed frame.
 */

import { describe, expect, it } from 'vitest';
import { buildSrcdoc } from './deck-preview.js';

/** The FIT agent's source, pulled out of a real srcdoc. */
function fitSource(): string {
	const doc = buildSrcdoc({ html: '<section></section>', css: '', mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '/r.js', gap: 16 });
	// Parsed, not matched: an HTML parser is the only honest way to find a script element.
	const parsed = new DOMParser().parseFromString(doc, 'text/html');
	const fit = [...parsed.querySelectorAll('script')].map((el) => el.textContent ?? '').find((s) => s.includes('window.__latticeFit=gatedFit'));
	if (!fit) throw new Error('no fit agent in the srcdoc');
	return fit;
}

/** Run the agent in a frame `width` wide and `height` tall; return the margin it gave slide 1. */
function marginAt(width: number, height: number, stage: boolean): number {
	const sections = [0, 1, 2].map(() => ({ style: {} as Record<string, string> }));
	const lattice = { clientWidth: width, style: { setProperty() {} } as Record<string, unknown>, querySelectorAll: () => sections };
	const win: Record<string, unknown> = {
		__SLIDE_W: 1280,
		__SLIDE_H: 720,
		innerHeight: height,
		frameElement: stage ? { hasAttribute: (n: string) => n === 'data-stage' } : null,
		addEventListener() {},
		__latticeFontsReady: new Promise(() => {}),
	};
	const doc = { querySelector: () => lattice, readyState: 'complete', addEventListener() {} };
	new Function('window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'setTimeout', fitSource())(win, doc, undefined, () => 0, () => 0);
	return Number.parseFloat(sections[0].style.marginBottom);
}

describe('fit agent — the stage gap', () => {
	// 1159px of slide in a 693px frame: 652px tall, (693 - 652) / 2 = 20.5 of margin each side.
	const W = 1159;
	const H = 693;
	const scaled = (720 * W) / 1280;
	/** The visible gap, from the margin the agent wrote: margin = SH*sc - SH + GAP. */
	const gapOf = (m: number, width = W) => m - ((720 * width) / 1280 - 720);

	it('a one-slide stage widens the gap past the centering margin', () => {
		expect(gapOf(marginAt(W, H, true))).toBeCloseTo(Math.ceil((H - scaled) / 2) + 8, 5);
		expect(gapOf(marginAt(W, H, true))).toBeGreaterThan((H - scaled) / 2);
	});

	it('without data-stage the gap is the host’s own', () => {
		expect(gapOf(marginAt(W, H, false))).toBeCloseTo(16, 5);
	});

	it('a frame much taller than a slide is a filmstrip: the gap stays put', () => {
		// iPad portrait above the tab breakpoint: 798px of slide (449px tall) in a 1050px frame.
		expect(gapOf(marginAt(798, 1050, true), 798)).toBeCloseTo(16, 5);
	});
});
