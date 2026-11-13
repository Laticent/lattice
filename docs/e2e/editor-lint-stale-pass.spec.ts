import { documentSettled, schedulerDrained } from './barriers';
import { appendToEditor, CHROME, expect, gotoStudio, openInspector, openSection, test } from './studio-fixture';

// A LINT PASS THAT OUTLIVES ITS CONFIGURATION NEVER LANDS (Editor.tsx `lintGenRef`, PR #3040).
//
// The deck editor keeps one CodeMirror view when the component list arrives or inline validation is
// switched, and reconfigures its linter in place. A pass started before the switch can still be waiting
// on the lint core, 256 KB that loads on first use. Before the generation guard, that pass resumed after
// validation went off and put back an underline and a lit "Fix all" that did nothing. jsdom pins the guard
// (`editor-known-rebuild.test.tsx`); this is the same race on the built Studio, with the lint core's real
// network load held back so the pass is still waiting when validation goes off.
//
// Its own file, not editor-lint.spec.ts: the hold must be in place before the Studio loads, and that
// file's beforeEach opens the Studio first. Desktop only: the toggle and "Fix all" are the desktop layout.

const UNKNOWN_SLIDE = '\n\n---\n\n<!-- _class: kpii -->\n\n# Stray slide\n';

test('@webkit-tablet @gecko a lint pass still loading when validation goes off never brings an underline back', async ({ page }) => {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requested = false;
	let lintCoreUrl = '';
	await page.route('**/esm/lint.js', async (route) => {
		requested = true;
		lintCoreUrl = route.request().url();
		await held;
		await route.continue();
	});

	// On Playwright's clock: both waits below were sleeps around @codemirror/lint's own timer (HARD RULE #32).
	await page.clock.install();
	await gotoStudio(page);
	// A typo'd class: once the lint core arrives, this pass would underline it and light "Fix all".
	await appendToEditor(page, UNKNOWN_SLIDE);
	await expect.poll(() => requested, { message: 'the lint pass asked for the lint core' }).toBe(true);

	await openInspector(page);
	await openSection(page, CHROME.deckTab.general);
	await page.getByRole('switch', { name: 'Inline validation' }).click();
	await expect(page.getByRole('switch', { name: 'Inline validation' })).toHaveAttribute('aria-checked', 'false');

	// Let the newer pass, the one validation-off started, answer first: @codemirror/lint runs it after its
	// 750 ms default delay, and with validation off it answers at once with nothing. The race is the OLDER
	// pass landing after it, so only then does the lint core arrive. The clock steps past that delay, so the
	// newer pass has run, on any runner.
	await page.clock.runFor(2000);
	await schedulerDrained(page);
	const loaded = page.waitForResponse('**/esm/lint.js');
	release();
	await loaded;
	// The held pass has had its chance to land. Its continuation was registered on the lint core's import BEFORE
	// this one, so when the page's own import of the same module resolves, that continuation has run; then a
	// second of clock for any timer it armed, React's scheduler, and two frames for the editor to paint.
	await page.evaluate(async (url) => {
		await import(url);
	}, lintCoreUrl);
	await page.clock.runFor(1000);
	await schedulerDrained(page);
	await documentSettled(page, '.cm-editor');
	await expect(page.locator('.cm-lintRange')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Fix all issues', exact: true })).toBeDisabled();
});
