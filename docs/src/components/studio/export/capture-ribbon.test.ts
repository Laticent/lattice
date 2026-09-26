// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { withCaptureFixups } from './deck-export.js';

// The spectrum ribbon is a gradient `border-image`, which html-to-image mis-renders, so the
// raster export repaints it as a top background strip for the duration of the capture. The
// strip must sit in the BORDER band, where the real ribbon is: from the default padding box it
// lay just inside the border, under the finish's `.backdrop` (a padding-box child), and a
// backdrop mask or veil erased it — `backdrop: clear` blanked the ribbon wherever the
// clearance ellipse reached the top edge, and a finish's own wash already hid it on most
// finishes (#2388, measured on the Studio Images export).
function ribbonSection() {
	const s = document.createElement('section');
	s.style.borderTop = '4px solid transparent';
	s.style.borderImageSource = 'linear-gradient(90deg, red, blue)';
	document.body.appendChild(s);
	return s;
}

describe('withCaptureFixups — the ribbon strip', () => {
	it('anchors the strip to the border box during the capture', async () => {
		const s = ribbonSection();
		let during: Record<string, string> = {};
		await withCaptureFixups(s, async () => {
			during = { origin: s.style.backgroundOrigin, size: s.style.backgroundSize, image: s.style.backgroundImage, border: s.style.borderImageSource };
			return null;
		});
		expect(during.origin).toBe('border-box');
		expect(during.size).toBe('100% 4px');
		expect(during.image).toContain('linear-gradient');
		expect(during.border).toBe('none');
	});

	it('restores every property it touched', async () => {
		const s = ribbonSection();
		await withCaptureFixups(s, async () => null);
		expect(s.style.backgroundOrigin).toBe('');
		expect(s.style.backgroundImage).toBe('');
		expect(s.style.borderImageSource).toContain('linear-gradient');
	});
});
