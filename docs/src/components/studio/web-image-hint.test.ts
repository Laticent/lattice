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

	it("sees a video record's `poster=` word", () => {
		expect(mayReferenceWebImage('<!-- _class: video -->\n\n## Tour\n\n`@video{"https://youtu.be/dQw4w9WgXcQ", poster="https://example.com/still.jpg"}`\n')).toBe(true);
		expect(mayReferenceWebImage('`@video{"https://youtu.be/dQw4w9WgXcQ", poster=//cdn.example.com/still.jpg}`')).toBe(true);
	});

	it("sees a Mermaid click link, which the scanner refuses like an image", () => {
		expect(mayReferenceWebImage('```mermaid\nflowchart LR\n  A --> B\n  click A href "https://example.com/report"\n```')).toBe(true);
		expect(mayReferenceWebImage('```mermaid\nflowchart LR\n  click A "//example.com/x" _blank\n```')).toBe(true);
		expect(mayReferenceWebImage('```mermaid\ngantt\n  click task1 href \'https://example.com\'\n```')).toBe(true);
		expect(mayReferenceWebImage('```mermaid\nflowchart LR\n  click A call go()\n```')).toBe(false);
	});

	it('does not wake for an ordinary link, a video URL alone, or a local poster', () => {
		expect(mayReferenceWebImage('See [the docs](https://example.com/docs).')).toBe(false);
		expect(mayReferenceWebImage('`@video{"https://youtu.be/dQw4w9WgXcQ", title="Ree A., Head of Ops"}`')).toBe(false);
		expect(mayReferenceWebImage('`@video{"https://youtu.be/dQw4w9WgXcQ", poster="assets/still.jpg"}`')).toBe(false);
	});
});
