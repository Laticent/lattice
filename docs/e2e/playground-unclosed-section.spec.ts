import { expect, test } from './studio-fixture';

// ── A section that never closes does not blank the Playground preview ──────────────────────
//
// The Playground splits the engine's render into one string per slide
// (`splitSections`, src/playground/preview-virtual.js) and patches the iframe from that list.
// When the splitter moved onto the engine's depth-aware walker, a `<section>` that never
// closes (an author half-way through typing `<section class="x">`) sent everything from it
// to the walker's trailing gap, so the list came back EMPTY and the preview painted no slide
// at all. A browser runs an unclosed section to the end of the document, and the splitter now
// does the same, so the slides before it paint as usual and the rest paint inside it.

const SOURCE_KEY = 'lattice-docs-pg-source';

// Seeded clean, so the FIRST render is an ordinary full write. The trap arrives as an EDIT:
// only an edit takes the patch path that paints from the split list, and a full write paints
// from the whole render, which is why a seeded trap alone passes on the defective splitter.
const CLEAN = `---
marp: true
---

## Slide one

The first slide is ordinary.

---

## Slide two

The second slide is ordinary too.
`;

const TRAP = `---
marp: true
---

## Slide one

The first slide is ordinary.

---

## Slide two

<section class="x">

The raw section above is still being typed and never closes.

---

## Slide three

The last slide follows it.
`;

test('a section that never closes, typed in as an edit, still paints every slide in the Playground', async ({ page }) => {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, CLEAN],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice > section', { hasText: 'The second slide is ordinary too.' })).toBeAttached({ timeout: 40_000 });

	await page.locator('.cm-content').first().click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.insertText(TRAP);

	// ANTI-VACUITY: the edit reached the preview.
	await expect(preview.locator('.lattice section', { hasText: 'The last slide follows it.' }).first()).toBeAttached({ timeout: 30_000 });
	for (const text of ['The first slide is ordinary.', 'never closes']) {
		await expect(preview.locator('.lattice section', { hasText: text }).first(), text).toBeAttached();
	}
	// The first slide is still its own top-level section, not swallowed by the open one.
	await expect(preview.locator('.lattice > section').first()).toContainText('Slide one');
});
