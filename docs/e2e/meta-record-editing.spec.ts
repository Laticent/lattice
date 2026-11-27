import type { Page } from '@playwright/test';
import { acceptCompletion, appendToEditor, CHROME, expect, gotoStudio, isPhone, openSection, openSlideSettings, persistedSource, setEditorContent, test, typeDeck, watchMenuOpen } from './studio-fixture';

// Editing a slide-metadata RECORD (`<!-- @meta{layout=kpi, footer="Q3"} -->`) in the real Studio (record note step 3,
// engineering/decisions/2026-10-17-meta-record.md §9). The drawer and Compose are driven by
// class-editor-folded-comment.spec.ts and compose-panes.spec.ts; this spec drives the other two surfaces step 3 changed (meta-record-studio.spec.ts is step 2's render proof):
// completion inside a record in the real CodeMirror editor, and the four note editors on a record slide, which write
// their own `@name{…}` comments and never touch the record. Asserted on the persisted source, which is what the engine
// reads (a JSON string, so quotes are `\"`).

async function openSlideSection(page: Page, name: string): Promise<void> {
	await openSlideSettings(page);
	await openSection(page, name);
}

const editorText = (page: Page) => page.getByLabel('Deck source');

test('completion: `<!-- @m` offers the record, inside it its fields, then a register’s values @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	// Below 700px the Studio shows one pane at a time: the `Markdown source` cell swaps the editor in.
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(editorText(page)).toBeVisible();
	}
	await setEditorContent(page, '---\ntitle: Record\n---\n\n');
	await watchMenuOpen(page);
	// `@meta` is the one spelling (owner, 2026-11-22): `<!-- @m` offers it, and picking it writes both braces with the
	// caret between them and opens the fields at once.
	await appendToEditor(page, '<!-- @m');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu.getByRole('option', { name: /^@meta\{/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- @meta{}');
	await expect(menu.getByRole('option', { name: /^layout/ })).toBeVisible();
	await page.keyboard.type('headl');
	await expect(menu.getByRole('option', { name: /^headline/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- @meta{headline=}');
	// After `=`, the register's own words: `l` narrows to `left`.
	await page.keyboard.type('l');
	await expect(menu.getByRole('option', { name: /^left/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- @meta{headline=left}');
});

test('completion: the retired bare `<!-- {` offers no record fields @crosswidth @gecko', async ({ page }) => {
	await gotoStudio(page);
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(editorText(page)).toBeVisible();
	}
	await setEditorContent(page, '---\ntitle: Record\n---\n\n<!-- {headl');
	await page.keyboard.press('Control+Space');
	// Whatever answers (the "nothing here" note, or another source's menu), it is never the record's fields.
	await expect(page.locator('.cm-completion-empty, .cm-tooltip-autocomplete').first()).toBeVisible();
	await expect(page.locator('.cm-tooltip-autocomplete').getByRole('option', { name: /^headline/ })).toHaveCount(0);
});

test('on a record slide, each note editor writes its own @note and leaves the record as it was @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	// A record holds settings only (engineering/decisions/2026-11-20-four-notes.md): the four notes are their own
	// comments, so writing one never edits the record, and the record's settings survive every write.
	await gotoStudio(page);
	await typeDeck(page, '---\ntitle: Record\n---\n\n<!-- {layout=kpi, footer=Q3} -->\n\n## Revenue\n');
	// The deck is saved before the panel is edited: a save landing after the fill re-renders the field over it (HARD RULE #32,
	// wait for the signal, not a duration).
	await expect.poll(() => persistedSource(page)).toContain('footer=Q3');
	await openSlideSection(page, CHROME.slideTab.notes);
	const fields: [string, string, string][] = [
		['Speaker notes for this slide', 'Lead with Q3.', '<!-- @note{Lead with Q3.} -->'],
		['Say (voice and captions) for this slide', 'Revenue grew a third.', '<!-- @say{Revenue grew a third.} -->'],
		['Alt text for this slide', 'Revenue grew in Q3', '<!-- @alt{Revenue grew in Q3} -->'],
		['Handout for this slide', 'Measured over 30 days.', '<!-- @handout{Measured over 30 days.} -->'],
	];
	for (const [name, text, written] of fields) {
		const box = page.getByRole('textbox', { name }).filter({ visible: true }).first();
		await box.fill(text);
		await box.blur();
		await expect.poll(() => persistedSource(page)).toContain(written);
	}
	expect(await persistedSource(page)).toContain('<!-- {layout=kpi, footer=Q3} -->');
});
