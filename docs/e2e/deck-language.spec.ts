import type { Page } from '@playwright/test';
import { deckEditorText, expect, gotoStudio, isPhone, setEditorContent, test } from './studio-fixture';

// THE DECK EDITOR'S TREE IS THE DECK MODEL'S (Segno P4b, docs/src/lib/deck-language/deck-language.ts), in the real Studio
// at the three widths the site is held to. The unit suite holds the tree to the model on the corpus; this drives what
// only a browser answers: the highlighting the tree feeds is painted, and the Enter keymap, which reads the tree by node
// name (ListItem under a BulletList, Blockquote), continues a list and a quote.

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

/** The highlighting the model's tree feeds is painted: the heading spine, the YAML keys, the directive comment. */
async function paints(page: Page): Promise<void> {
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
}

/** Enter continues a list and a quote: the keymap finds the model's ListItem and Blockquote nodes by name. */
async function continues(page: Page): Promise<void> {
	await openEditor(page);
	await caretAfter(page, '- two');
	await page.keyboard.press('Enter');
	await page.keyboard.type('three');
	await expect.poll(() => deckEditorText(page)).toContain('- two\n- three\n');
	await caretAfter(page, '> quoted');
	await page.keyboard.press('Enter');
	await page.keyboard.type('more');
	await expect.poll(() => deckEditorText(page)).toContain('> quoted\n> more\n');
}

/** The editor's parse state, read through the view: its tree, how far that tree is complete, and the document length. */
type ParseState = { treeLen: number; docLen: number };
const parseState = (page: Page): Promise<ParseState> =>
	page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: CodeMirror's language field, found by shape in the state's values.
		const handle = document.querySelector('[aria-label="Deck source"]') as any;
		const view = handle.cmTile?.root?.view ?? handle.cmView?.rootView?.view;
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		const field = view.state.values.find((v: any) => v?.context && typeof v.context.treeLen === 'number');
		return { treeLen: field.context.treeLen, docLen: view.state.doc.length };
	});

/**
 * A keystroke whose parse runs out of CodeMirror's 20 ms budget (deck-language.ts §ONE KEYSTROKE, ONE DECK UPDATE). A
 * `Date.now` that jumps 1 s per read, for one dispatch, spends the budget after the first step, so the transaction keeps
 * a tree cut at the front matter's YAML and the idle-time worker finishes it. The finished tree must be the one the deck
 * built for that keystroke, not a second assembly: its top node shares the cut tree's child list, which a rebuilt root
 * would not. And the editor still paints what the model's tree says.
 */
async function slicedKeystroke(page: Page): Promise<void> {
	await openEditor(page);
	await expect.poll(async () => { const s = await parseState(page); return s.treeLen === s.docLen; }).toBe(true);
	const cut = await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: as in parseState.
		const handle = document.querySelector('[aria-label="Deck source"]') as any;
		const view = handle.cmTile?.root?.view ?? handle.cmView?.rootView?.view;
		const at = view.state.doc.toString().indexOf('Area ') + 'Area '.length;
		const realNow = Date.now;
		let clock = realNow();
		Date.now = () => (clock += 1000);
		try {
			view.dispatch({ changes: { from: at, insert: 'x' } });
		} finally {
			Date.now = realNow;
		}
		// biome-ignore lint/suspicious/noExplicitAny: as in parseState.
		const cx = view.state.values.find((v: any) => v?.context && typeof v.context.treeLen === 'number').context;
		(window as unknown as { __cutChildren: unknown }).__cutChildren = cx.tree.children;
		return { treeLen: cx.treeLen, docLen: view.state.doc.length };
	});
	// The split happened: the transaction's tree stops short of the document.
	expect(cut.treeLen).toBeLessThan(cut.docLen);
	await expect.poll(async () => { const s = await parseState(page); return s.treeLen === s.docLen; }).toBe(true);
	const sameRoot = await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: as in parseState.
		const handle = document.querySelector('[aria-label="Deck source"]') as any;
		const view = handle.cmTile?.root?.view ?? handle.cmView?.rootView?.view;
		// biome-ignore lint/suspicious/noExplicitAny: as in parseState.
		const cx = view.state.values.find((v: any) => v?.context && typeof v.context.treeLen === 'number').context;
		return cx.tree.children === (window as unknown as { __cutChildren: unknown }).__cutChildren;
	});
	expect(sameRoot).toBe(true);
	await expect.poll(() => deckEditorText(page)).toContain('Area x$a*b*c$');
	expect(Number((await styleOf(page, 'The plan'))?.weight)).toBeGreaterThanOrEqual(600);
	expect((await styleOf(page, '_class: lead'))?.style).toBe('italic');
}

for (const [width, height] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test.describe(`at ${width}px`, () => {
		test.use({ viewport: { width, height } });
		test('the model’s tree paints the heading spine, the front matter’s YAML keys and the directive comment', ({ page }) => paints(page));
		test('Enter continues a list and a quote: the keymap reads the model’s ListItem and Blockquote', ({ page }) => continues(page));
		test('a keystroke whose parse runs out of time is finished from the tree the deck built, and still paints', ({ page }) => slicedKeystroke(page));
	});
}

// The other engines, each in its own project's device (iPhone 15 Pro, iPad landscape, Firefox): per-PR CI runs none.
test.describe('in WebKit and Gecko', () => {
	test('the model’s tree is painted @webkit-phone @webkit-tablet @gecko', ({ page }) => paints(page));
	test('Enter continues a list and a quote @webkit-phone @webkit-tablet @gecko', ({ page }) => continues(page));
	test('a keystroke whose parse runs out of time is finished from the tree the deck built @webkit-phone @webkit-tablet @gecko', ({ page }) => slicedKeystroke(page));
});
