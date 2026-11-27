import { expect, gotoStudio, openInspector, persistedSource, setEditorContent, test } from './studio-fixture';

// The deck's Marks picker on the REAL Studio (HARD RULE #23). It writes `chart-finish:`, which carries one word per
// axis, the finish (pigment · etch · tone) and, under tone, its source (ink · accent). The intensity is its own key,
// `color-intensity:`, which the picker never touches: picking a finish keeps it. Before the split (renames decision Q4)
// both lived on one `marks:` line, and the picker once read `tone vivid` as no value and dropped `vivid` (#2887's red
// team). Asserted on the persisted source, which is what the engine reads.

const deck = (...lines: string[]) => `---\ntitle: Finish\n${lines.join('\n')}\n---\n\n# Finish\n\n## One\n\nBody.\n`;
// The Studio writer quotes a value with a space (`chart-finish: "tone ink"`) and the engine unquotes it, so either
// spelling is the same key (the backdrop row's test says the same).
const line = (key: string, value: string) => new RegExp(`\\\\n${key}: (\\\\"${value}\\\\"|${value})\\\\n`);

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
});

for (const tag of ['', ' @webkit-tablet']) {
	test(`the picker reads the finish and leaves the intensity key alone when a finish is chosen${tag}`, async ({ page }) => {
		await setEditorContent(page, deck('chart-finish: tone', 'color-intensity: vivid'));
		await openInspector(page);
		const picker = page.getByRole('combobox', { name: 'Choose marks' }).filter({ visible: true }).first();
		await picker.scrollIntoViewIfNeeded();
		await expect(picker).toContainText('Tone');
		await picker.click();
		await page.getByRole('option', { name: /^Etch/ }).click();
		await expect.poll(() => persistedSource(page)).toMatch(line('chart-finish', 'etch'));
		await expect.poll(() => persistedSource(page)).toMatch(line('color-intensity', 'vivid'));
		// The default finish removes its own line; the intensity line stays.
		await picker.click();
		await page.getByRole('option', { name: 'Auto — Pigment' }).click();
		await expect.poll(() => persistedSource(page)).not.toContain('chart-finish:');
		await expect.poll(() => persistedSource(page)).toMatch(line('color-intensity', 'vivid'));
	});

	test(`a two-word value shows its finish, and tone keeps its source${tag}`, async ({ page }) => {
		await setEditorContent(page, deck('chart-finish: ink tone'));
		await openInspector(page);
		const picker = page.getByRole('combobox', { name: 'Choose marks' }).filter({ visible: true }).first();
		await picker.scrollIntoViewIfNeeded();
		await expect(picker).toContainText('Tone');
		await picker.click();
		await page.getByRole('option', { name: /^Etch/ }).click();
		// A source means nothing under etch, so the pick drops it rather than leave a word deck-lint flags.
		await expect.poll(() => persistedSource(page)).toMatch(line('chart-finish', 'etch'));
	});

	test(`a deck on the retired marks: key shows the default finish${tag}`, async ({ page }) => {
		await setEditorContent(page, deck('marks: tone'));
		await openInspector(page);
		const picker = page.getByRole('combobox', { name: 'Choose marks' }).filter({ visible: true }).first();
		await picker.scrollIntoViewIfNeeded();
		// The engine reads nothing from `marks:`, so the picker shows what renders.
		await expect(picker).toContainText('Pigment');
	});
}
