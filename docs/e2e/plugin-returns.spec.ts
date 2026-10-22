import JSZip from 'jszip';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── A zip plugin that RETURNS values, in the real Studio (owner decisions 11 and 12; threat-model note
//    2026-10-16 §6.1; HARD RULE #23: the approval strip and the disable alert driven on the real surface) ──
//
// A stranger's plugin owns the ```gantt fence and declares two return fields: `status` (one of ok, late) and
// `note` (plain text). Imported through the REAL Library, listed in the deck, approved from the notice above the
// preview, run in the real sandbox frame:
//
//   1. CONSENT      before approval, the notice's detail names every declared field, its bounds and the attribute
//                   it lands on: approving it is an informed choice
//   2. CLEAN        approved, the drawing lands and each value sits on the slide's own <section> as
//                   data-returned-<plugin>--<field>, escaped
//   3. VIOLATION    a value outside the declaration (a word not in the list) disables the plugin for the render:
//                   the strip says why, the block keeps its source with a note, and no value reaches the slide
//   4. RE-CONSENT   a widened declaration (a third word) is a different approval: the notice asks again

test.describe.configure({ timeout: 300_000 });

const PLUGIN = 'gantt-returns';
const RENDERER = `function render(fence) {
  var body = fence.body.trim();
  var status = body.indexOf("EVIL") >= 0 ? "evil" : "late";
  return { html: '<svg class="lp-${PLUGIN}-chart" viewBox="0 0 120 20" width="120"><rect width="80" height="16" fill="var(--accent)"></rect></svg>', data: { status: status, note: 'Q3 "plan" & co' } };
}
export { render as default };
`;

async function returnsZip(words: string[]): Promise<Buffer> {
	const zip = new JSZip();
	const contributes = { fences: { gantt: { body: 'text' } }, returns: { fields: { status: { type: 'word', values: words }, note: { type: 'text' } } } };
	zip.file(`${PLUGIN}/${PLUGIN}.manifest.json`, JSON.stringify({ name: PLUGIN, type: 'plugin', format: 1, api: 1, title: 'Gantt with returns (zip)', description: 'Draws a ```gantt fence and returns a status.', contributes }));
	zip.file(`${PLUGIN}/${PLUGIN}.docs.md`, '# Gantt with returns\n');
	zip.file(`${PLUGIN}/${PLUGIN}.fixtures.md`, '```gantt\nDesign 2\n```\n');
	zip.file(`${PLUGIN}/${PLUGIN}.render.js`, RENDERER);
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function importZip(page: Parameters<typeof gotoStudio>[0], buffer: Buffer) {
	const input = page.locator('[data-testid="library-import-input"]');
	// The Library button toggles, and the panel can still be open from the last import.
	// The Library button toggles, and the panel may be open from an earlier visit or still mounting. Look, click only when the input is absent,
	// then wait for it; a click that landed on a Library that was just opening closes it, so look again and click again (up to three tries).
	for (let attempt = 0; attempt < 3; attempt++) {
		if (await input.count()) break;
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		if (await input.waitFor({ state: 'attached', timeout: 6000 }).then(() => true, () => false)) break;
	}
	await input.setInputFiles({ name: `${PLUGIN}.zip`, mimeType: 'application/zip', buffer });
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: '1 plugin(s)' }).first()).toBeVisible();
	await page.keyboard.press('Escape');
}

const DECK = (body: string) => `---\nplugins: [${PLUGIN}]\n---\n\n## Plan\n\n\`\`\`gantt\n${body}\n\`\`\`\n`;

// All three engines, as code-packages.spec.ts runs them: `@gecko` runs on the desktop (Chromium) project and the gecko
// one; the `@webkit-tablet` twin runs on WebKit (the desktop project skips a title naming @webkit).
for (const tag of [' @gecko', ' @webkit-tablet']) {
test(`a plugin's returned values: consent names them, clean ones land on the slide, a bad one disables it @smoke${tag}`, async ({ page }) => {
	const evidence = process.env.LATTICE_EVIDENCE_DIR;
	const shot = async (name: string) => {
		if (evidence) await page.screenshot({ path: `${evidence}/plugin-returns-${name}-${test.info().project.name}.png` });
	};
	await gotoStudio(page);
	await importZip(page, await returnsZip(['ok', 'late']));
	const preview = livePreview(page);
	const notice = page.locator('[data-slot="code-packages"]');

	// 1. CONSENT: the detail names the fields before anything runs.
	await setEditorContent(page, DECK('Design 2'));
	await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
	await notice.getByRole('button', { name: 'What it is' }).click();
	const detail = page.locator('[data-slot="code-packages-detail"]');
	await expect(detail).toContainText('It may also return note (plain text, up to 256 characters); status (one of ok, late).');
	await expect(detail).toContainText(`data-returned-${PLUGIN}--<field>`);
	await expect(detail).toContainText('a value outside this list stops the plugin for the render');
	await shot('consent');
	// The Studio ships at three widths: the detail, which now carries the returns line, fits each one.
	for (const [width, height] of [[820, 1180], [390, 844]]) {
		await page.setViewportSize({ width, height });
		// A narrower layout can mount its own strip, closed, while the wider one's stays in the DOM, hidden.
		const shown = page.locator('[data-slot="code-packages-detail"]:visible');
		if (!(await shown.count())) await page.locator('[data-slot="code-packages"]:visible').getByRole('button', { name: 'What it is' }).click();
		await expect(shown).toContainText('status (one of ok, late)');
		const box = await shown.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= width + 1, `the consent detail fits ${width}px`).toBe(true);
		if (evidence) await page.screenshot({ path: `${evidence}/plugin-returns-consent-${width}.png` });
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	// 2. CLEAN: approved, the drawing lands and the values sit on the slide's <section>, escaped.
	await notice.getByRole('button', { name: `Run the code of ${PLUGIN}` }).click();
	await expect(preview.locator(`[data-lattice-plugin="${PLUGIN}"] svg.lp-${PLUGIN}-chart`)).toHaveCount(1, { timeout: 30_000 });
	const slide = preview.locator(`section[data-returned-${PLUGIN}--status]`).first();
	await expect(slide).toHaveAttribute(`data-returned-${PLUGIN}--status`, 'late');
	await expect(slide).toHaveAttribute(`data-returned-${PLUGIN}--note`, 'Q3 "plan" & co');
	await shot('clean');

	// 3. VIOLATION: a word the declaration does not list disables the plugin for the render.
	await setEditorContent(page, DECK('EVIL 2'));
	await expect(notice).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
	await expect(notice).toContainText('the plugin is disabled for this render, because its status is not one of the words it declared');
	// The strip is one line cut to the width; its title carries the whole reason.
	await expect(notice.locator('[title]')).toHaveAttribute('title', /because its status is not one of the words it declared; nothing it drew or returned is on the page$/);
	await expect(preview.locator(`[data-package-error="${PLUGIN}"]`)).toContainText('the plugin was disabled for this render');
	await expect(preview.locator(`[data-lattice-plugin="${PLUGIN}"]`)).toHaveCount(0);
	await expect(preview.locator(`section[data-returned-${PLUGIN}--status]`)).toHaveCount(0);
	await shot('violation');

	// 4. RE-CONSENT: a widened declaration is a new approval, so the notice asks again.
	// Same session, no reload: the new zip replaces the plugin of that name and the Studio picks up its declaration.
	await importZip(page, await returnsZip(['ok', 'late', 'lost']));
	await setEditorContent(page, DECK('Design 3'));
	await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
	// The detail may still be open from step 1.
	if (!(await page.locator('[data-slot="code-packages-detail"]').count())) await notice.getByRole('button', { name: 'What it is' }).click();
	await expect(page.locator('[data-slot="code-packages-detail"]')).toContainText('status (one of ok, late, lost)');
	await expect(preview.locator(`section[data-returned-${PLUGIN}--status]`)).toHaveCount(0);
	await shot('reconsent');
});
}
