import { describe, expect, it } from 'vitest';
import { mayReferenceWebImage } from './web-image-hint';

// The cheap pre-check before the Studio renders a deck to count its web images. A miss hides the
// web-images strip, and with it the reader's only way to load the image, so each image-shaped
// context it must see is pinned here.
describe('mayReferenceWebImage', () => {
	it('sees a markdown image and a CSS url()', () => {
		expect(mayReferenceWebImage('![team](https://example.com/team.png)')).toBe(true);
		expect(mayReferenceWebImage('<div style="background:url(https://example.com/a.png)"></div>')).toBe(true);
	});

	it("sees a video slide's `poster` bullet", () => {
		expect(mayReferenceWebImage('<!-- _class: video -->\n\n## Tour\n\n- https://youtu.be/x\n- https://example.com/still.jpg `poster`\n')).toBe(true);
		expect(mayReferenceWebImage('- //cdn.example.com/still.jpg `poster`')).toBe(true);
	});

	it('does not wake for an ordinary link, a video URL alone, or a local poster', () => {
		expect(mayReferenceWebImage('See [the docs](https://example.com/docs).')).toBe(false);
		expect(mayReferenceWebImage('- https://youtu.be/x\n- Ree A., Head of Ops `caption`')).toBe(false);
		expect(mayReferenceWebImage('- assets/still.jpg `poster`')).toBe(false);
	});
});
