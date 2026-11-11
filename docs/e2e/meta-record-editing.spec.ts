import type { Page } from '@playwright/test';
import { acceptCompletion, appendToEditor, CHROME, expect, gotoStudio, isPhone, openSection, persistedSource, setEditorContent, test, typeDeck, watchMenuOpen } from './studio-fixture';

// Editing a slide-metadata RECORD (`<!-- {layout=kpi, note="…"} -->`) in the real Studio (record note step 3,
// engineering/decisions/2026-10-17-meta-record.md §9). The drawer and Compose are driven by
// class-editor-folded-comment.spec.ts and compose-panes.spec.ts; this spec drives the other two surfaces step 3 changed (meta-record-studio.spec.ts is step 2's render proof):
// completion inside a record in the real CodeMirror editor, and the speaker-note and description editors on a record
// slide, which read the record's own field and write it back there (never as a second comment, never deleting the
// record). Asserted on the persisted source, which is what the engine reads (a JSON string, so quotes are `\"`).

async function openSlideSection(page: Page, name: string): Promise<void> {
	// At 390px the bottom bar's Settings opens both scopes behind a Slide | Deck switch.
	const slideButton = page.getByRole('button', { name: CHROME.slideSettings }).filter({ visible: true });
	if (await slideButton.count()) await slideButton.first().click();
	else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
		await page.getByRole('button', { name: 'Slide scope', exact: true }).filter({ visible: true }).first().click();
	}
	await openSection(page, name);
}

const editorText = (page: Page) => page.getByLabel('Deck source');

test('completion inside a record offers its fields, then a register’s values @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	// Below 700px the Studio shows one pane at a time: the `Markdown source` cell swaps the editor in.
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(editorText(page)).toBeVisible();
	}
	await setEditorContent(page, '---\ntitle: Record\n---\n\n');
	await watchMenuOpen(page);
	await appendToEditor(page, '<!-- {headl');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu.getByRole('option', { name: /^headline/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- {headline=');
	// After `=`, the register's own words: `l` narrows to `left`.
	await page.keyboard.type('l');
	await expect(menu.getByRole('option', { name: /^left/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editorText(page)).toContainText('<!-- {headline=left');
});

test('the speaker-note editor reads a record’s note and writes it back into the record @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, '---\ntitle: Record\n---\n\n<!-- {layout=kpi, note="Open cold."} -->\n\n## Revenue\n');
	// The deck is saved before the panel is edited: a save landing after the fill re-renders the field over it (HARD RULE #32,
	// wait for the signal, not a duration).
	await expect.poll(() => persistedSource(page)).toContain('Open cold.');
	await openSlideSection(page, CHROME.slideTab.notes);
	const note = page.getByRole('textbox', { name: 'Speaker note for this slide' }).filter({ visible: true }).first();
	await expect(note).toHaveValue('Open cold.');
	await note.fill('Lead with Q3.');
	await note.blur();
	await expect.poll(() => persistedSource(page)).toContain('<!-- {layout=kpi, note=Lead with Q3.} -->');
	expect(await persistedSource(page)).not.toContain('<!-- note:');
});

test('the description editor reads a record’s describe field and writes it back into the record @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, '---\ntitle: Record\n---\n\n<!-- {layout=kpi, describe="Revenue up"} -->\n\n## Revenue\n');
	await expect.poll(() => persistedSource(page)).toContain('Revenue up');
	await openSlideSection(page, CHROME.slideTab.notes);
	const box = page.getByRole('textbox', { name: 'Accessibility description for this slide' }).filter({ visible: true }).first();
	await expect(box).toHaveValue('Revenue up');
	await box.fill('Revenue grew in Q3');
	await box.blur();
	await expect.poll(() => persistedSource(page)).toContain('<!-- {layout=kpi, describe=Revenue grew in Q3} -->');
	expect(await persistedSource(page)).not.toContain('<!-- describe:');
});

test('the say-line editor reads a record’s say field and writes it back into the record @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, '---\ntitle: Record\n---\n\n<!-- {layout=kpi, say="Revenue is up."} -->\n\n## Revenue\n');
	await expect.poll(() => persistedSource(page)).toContain('Revenue is up.');
	await openSlideSection(page, CHROME.slideTab.notes);
	const box = page.getByRole('textbox', { name: 'What this slide says aloud' }).filter({ visible: true }).first();
	await expect(box).toHaveValue('Revenue is up.');
	await box.fill('Revenue grew a third.');
	await box.blur();
	await expect.poll(() => persistedSource(page)).toContain('<!-- {layout=kpi, say=Revenue grew a third.} -->');
	expect(await persistedSource(page)).not.toContain('<!-- say:');
});
