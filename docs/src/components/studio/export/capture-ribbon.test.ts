// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { withCaptureFixups } from './deck-export.js';

// The spectrum ribbon is a gradient `border-image`. html-to-image mis-rendered it, so the raster export used to repaint
// it as a top background strip for the duration of the capture. The export now takes its picture with the shared slide
// camera (lib/core/slide-camera.mjs), which lays the slide out natively: the real border-image draws as it does on
// screen, and the CLI takes the same picture. So `withCaptureFixups` must leave the ribbon, and every background layer
// the slide owns, exactly as it is. (`ribbonCaptureStyle` itself still serves the slide map's poster capture.)
function ribbonSection() {
	const s = document.createElement('section');
	s.style.borderTop = '4px solid transparent';
	s.style.borderImageSource = 'linear-gradient(90deg, red, blue)';
	document.body.appendChild(s);
	return s;
}

describe('withCaptureFixups — the ribbon is left to the camera', () => {
	it('does not repaint the ribbon or touch the slide\'s own backgrounds during the capture', async () => {
		const s = ribbonSection();
		s.style.backgroundImage = 'url(photo.png)';
		s.style.backgroundOrigin = 'content-box';
		let during: Record<string, string> = {};
		await withCaptureFixups(s, async () => {
			during = { origin: s.style.backgroundOrigin, image: s.style.backgroundImage, border: s.style.borderImageSource };
			return null;
		});
		expect(during.origin).toBe('content-box');
		expect(during.image).toContain('photo.png');
		expect(during.image).not.toContain('linear-gradient');
		expect(during.border).toContain('linear-gradient');
	});

	it('leaves every property as it found it', async () => {
		const s = ribbonSection();
		await withCaptureFixups(s, async () => null);
		expect(s.style.backgroundOrigin).toBe('');
		expect(s.style.backgroundImage).toBe('');
		expect(s.style.borderImageSource).toContain('linear-gradient');
	});

	it('adds the export face only when asked, and removes it after', async () => {
		const s = ribbonSection();
		let screen = false;
		let exportFace = false;
		await withCaptureFixups(s, async () => { screen = s.classList.contains('lattice-exporting'); return null; }, undefined, undefined, 'screen');
		await withCaptureFixups(s, async () => { exportFace = s.classList.contains('lattice-exporting'); return null; });
		expect(screen).toBe(false);
		expect(exportFace).toBe(true);
		expect(s.classList.contains('lattice-exporting')).toBe(false);
	});
});
