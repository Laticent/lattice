import { expect, gotoStudio, openInspector, persistedSource, setEditorContent, test } from './studio-fixture';

// The deck's Chart finish picker on the REAL Studio (HARD RULE #23). `chart-finish:` carries one word per axis,
// the finish (pigment · etch · tone) and the intensity (muted · vivid), so the picker reads the finish word out of a
// two-word value and, when an author picks a finish, keeps the deck's intensity. It once read `tone vivid` as no
// value (showing Pigment) and wrote only the finish, dropping `vivid` (#2887's red team). Asserted on the persisted
// source, which is what the engine reads.

const deck = (value: string) => `---\ntitle: Finish\nchart-finish: ${value}\n---\n\n# Finish\n\n## One\n\nBody.\n`;
// The Studio writer quotes a value with a space (`chart-finish: "etch vivid"`) and the engine unquotes it, so either
// spelling is the same register (the backdrop row's test says the same).
const line = (value: string) => new RegExp(`\\\\nchart-finish: (\\\\"${value}\\\\"|${value})\\\\n`);

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
});

for (const tag of ['', ' @webkit-tablet']) {
	test(`the picker reads a two-word value and keeps its intensity when a finish is chosen${tag}`, async ({ page }) => {
		await setEditorContent(page, deck('tone vivid'));
		await openInspector(page);
		const picker = page.getByRole('combobox', { name: 'Choose chart finish' }).filter({ visible: true }).first();
		await picker.scrollIntoViewIfNeeded();
		await expect(picker).toContainText('Tone');
		await picker.click();
		await page.getByRole('option', { name: /^Etch/ }).click();
		await expect.poll(() => persistedSource(page)).toMatch(line('etch vivid'));
		// The default finish on a vivid deck still has to say vivid, so the line stays.
		await picker.click();
		await page.getByRole('option', { name: /^Pigment/ }).click();
		await expect.poll(() => persistedSource(page)).toMatch(line('pigment vivid'));
	});

	test(`on a muted deck the default finish removes the line${tag}`, async ({ page }) => {
		await setEditorContent(page, deck('tone'));
		await openInspector(page);
		const picker = page.getByRole('combobox', { name: 'Choose chart finish' }).filter({ visible: true }).first();
		await picker.scrollIntoViewIfNeeded();
		await expect(picker).toContainText('Tone');
		await picker.click();
		await page.getByRole('option', { name: /^Pigment/ }).click();
		await expect.poll(() => persistedSource(page)).not.toContain('chart-finish:');
	});
}
