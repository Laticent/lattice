import type { Page } from '@playwright/test';
import { deckEditorText, expect, gotoStudio, isPhone, setEditorContent, test } from './studio-fixture';

// THE DECK EDITOR'S TREE IS THE DECK MODEL'S (Segno P4b, docs/src/lib/deck-language/deck-language.ts), in the real Studio
// at the three widths the site is held to. The unit suite holds the tree to the model on the corpus; this drives what
// only a browser answers: the highlighting the tree feeds is painted, and the Enter keymap, which reads the tree by node
// name (ListItem, ListMark, Blockquote, QuoteMark), continues a list and a quote.

const DECK = `---
theme: indaco
paginate: true
---

# The plan

- one
- two

> quoted

Area $a*b*c$ and ~~gone~~.

| a | b |
|---|---|
| 1 | 2 |

<!-- _class: lead -->
`;

const editor = (page: Page) => page.getByLabel('Deck source');

/** The Studio with the deck editor on screen (one pane at a time below 700px). */
async function openEditor(page: Page): Promise<void> {
	await gotoStudio(page);
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(editor(page)).toBeVisible();
	}
	await setEditorContent(page, DECK);
	await expect.poll(() => deckEditorText(page)).toContain('<!-- _class: lead -->');
}

/** The caret at the end of the first line equal to `line`, through the view the content node carries. */
async function caretAfter(page: Page, line: string): Promise<void> {
	await page.evaluate((text) => {
		// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle (as studio-fixture.ts does).
		const handle = document.querySelector('[aria-label="Deck source"]') as any;
		const view = handle.cmTile?.root?.view ?? handle.cmView?.rootView?.view;
		const doc: string = view.state.doc.toString();
		const at = doc.indexOf(`\n${text}\n`) + 1 + text.length;
		view.dispatch({ selection: { anchor: at } });
		view.focus();
	}, line);
}

/** The computed style of the innermost element holding `text` in the editor's content. */
function styleOf(page: Page, text: string): Promise<{ weight: string; color: string; style: string } | null> {
	return page.evaluate((t) => {
		const content = document.querySelector('[aria-label="Deck source"]');
		if (!content) return null;
		const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			if (n.textContent?.includes(t)) {
				const el = n.parentElement as HTMLElement;
				const s = getComputedStyle(el);
				return { weight: s.fontWeight, color: s.color, style: s.fontStyle };
			}
		}
		return null;
	}, text);
}

for (const [width, height] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test.describe(`at ${width}px`, () => {
		test.use({ viewport: { width, height } });

		test('the model’s tree paints the heading spine, the front matter’s YAML keys and the directive comment', async ({ page }) => {
			await openEditor(page);
			const body = await styleOf(page, 'Area ');
			const heading = await styleOf(page, 'The plan');
			const key = await styleOf(page, 'theme');
			const comment = await styleOf(page, '_class: lead');
			expect(body).not.toBeNull();
			expect(Number(heading?.weight)).toBeGreaterThanOrEqual(600);
			expect(Number(body?.weight)).toBeLessThan(600);
			expect(key?.color).not.toBe(body?.color);
			expect(comment?.style).toBe('italic');
		});

		test('Enter continues a list and a quote: the keymap reads the model’s ListMark and QuoteMark', async ({ page }) => {
			await openEditor(page);
			await caretAfter(page, '- two');
			await page.keyboard.press('Enter');
			await page.keyboard.type('three');
			await expect.poll(() => deckEditorText(page)).toContain('- two\n- three\n');
			await caretAfter(page, '> quoted');
			await page.keyboard.press('Enter');
			await page.keyboard.type('more');
			await expect.poll(() => deckEditorText(page)).toContain('> quoted\n> more\n');
		});
	});
}
