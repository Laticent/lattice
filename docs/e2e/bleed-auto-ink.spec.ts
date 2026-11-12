import { expect, gotoStudio, livePreview, persistedSource, test, typeDeck } from './studio-fixture';

// A `bleed` slide picks its words' ink from its photo (lib/core/bleed-ink.mjs), and in the Studio the runtime pass reads the
// photo in the preview (lib/transformers/bleed-ink.js). This drives the real Studio: type a deck, and the preview's slide takes
// the theme's `dark` mode (white words) over a dark photo, its `color-light` mode over a bright one, and keeps an author's own mode.
const DARK_PHOTO = '---\ntitle: Bleed\n---\n\n<!-- _class: content bleed -->\n\n## A dusk photo.\n\n![Dusk](sample:photo-wide.svg)\n';
const BRIGHT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAABsCAIAAACzYCrFAAAA1klEQVR42u3SMQ0AAAgEsfcvEwEMKMADYWxSBZfLdMFZJMBAGAgDYSAwEAbCQBgIDISBMBAGAgNhIAyEgcBAGAgDYSAMBAbCQBgIA4GBMBAGwkBgIAyEgTAQGAgDYSAMhIHAQBgIA2EgMBAGwkAYCAyEgTAQBgIDYSAMhIHAQBgIA2EgDAQGwkAYCAOBgTAQBsJAYCAMhIEwEBgIA2EgDISBwEAYCANhIDAQBsJAGAgMhIEwEAYCA2EgDISBMBAYCANhIAwEBsJAGAgDgYEwEAbCQGAgPi0bG28SdoIc2AAAAABJRU5ErkJggg==';
const BRIGHT_PHOTO = `---\ntitle: Bleed\n---\n\n<!-- _class: content bleed -->\n\n## A bright photo.\n\n![Day](${BRIGHT})\n`;
const AUTHOR_DARK = `---\ntitle: Bleed\n---\n\n<!-- _class: content bleed dark -->\n\n## The author chose.\n\n![Day](${BRIGHT})\n`;

for (const [name, deck, ink, mode] of [
	['a dark photo takes white words', DARK_PHOTO, 'light', 'dark'],
	['a bright photo keeps dark words', BRIGHT_PHOTO, 'dark', 'color-light'],
] as const) {
	test(`${name} in the Studio preview @webkit-tablet @gecko`, async ({ page }) => {
		await gotoStudio(page);
		await typeDeck(page, deck);
		await expect.poll(() => persistedSource(page)).toContain('content bleed');
		const slide = livePreview(page).locator('section.bleed').first();
		await expect(slide).toHaveAttribute('data-bleed-ink', ink, { timeout: 20_000 });
		await expect(slide).toHaveClass(new RegExp(`(^|\\s)${mode}(\\s|$)`));
	});
}

test('a slide whose own class names its mode keeps it in the Studio preview @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, AUTHOR_DARK);
	await expect.poll(() => persistedSource(page)).toContain('content bleed dark');
	const slide = livePreview(page).locator('section.bleed').first();
	await expect(slide).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 20_000 });
	await expect(slide).not.toHaveAttribute('data-bleed-ink', /./);
});
