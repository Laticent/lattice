import path from 'node:path';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

/**
 * A BRANCHING state chart must still branch in an EXPORTED artifact.
 *
 * WHAT THIS GUARDS. The dagre layout engine used to be inlined into
 * `lattice-runtime.min.js`, so any frame that loaded the runtime had
 * `globalThis.__latticeDagre` whether or not the host had thought about it —
 * every path was correct by default. Splitting it out (so a reader with no
 * state chart stops fetching 25.9 KiB of it) makes each path responsible for
 * tagging the engine itself, and one path did not: `createCaptureFrame` in
 * `docs/src/components/studio/export/deck-export.js` destructures the
 * `DeckRender` by name, `dagreUrl` was missing from that list, and it was
 * dropped silently. Every Studio export — .pdf, .pptx, the .png set and this
 * webpage — rendered a branching machine as a NUMBERED COLUMN while the
 * preview beside it showed the fan-out.
 *
 * WHY IT NEEDS AN EXPORT, not a source assertion. The unit tier guards this by
 * parsing that parameter list, which is a proxy: it proves the name is present,
 * not that the engine reaches the frame and lays the machine out. And the
 * failure is quiet in the worst way — nothing is blank or broken, the chart
 * simply draws a plausible WRONG layout into bytes handed to someone else. The
 * real Playground was driven when the split landed and did not catch it,
 * because the Playground renders the PREVIEW frame and the defect was in the
 * offscreen EXPORT frame. So this drives Share → Webpage end to end and reads
 * the geometry back out of the downloaded file (HARD RULE #23).
 *
 * THE ASSERTION IS A SHARED RANK, not a coordinate. dagre CENTERS nodes within
 * a rank, so their box origins differ by node width — comparing `x` finds no two
 * equal and reports a column that is not there (the false alarm recorded in §9.2
 * of `engineering/decisions/2026-09-06-state-chart-dagre-layout.md`). A
 * top-to-bottom machine puts every node of one rank at the same CENTER y.
 */

// Five states, three of them fanning out of Triage — no single column can show
// this, which is the whole point: laid out as a column the three targets sit at
// three different rows and the assertion below fails.
const BRANCHING_DECK = [
	'---',
	'marp: true',
	'theme: indaco',
	'---',
	'',
	'<!-- _class: state-chart -->',
	'',
	'`Fan-out`',
	'',
	'## Three ways out of one state.',
	'',
	'1. Intake `start`',
	'   - `triage => 2`',
	'2. Triage',
	'   - `fast => 3`',
	'   - `deep => 4`',
	'   - `hold => 5`',
	'3. Fast path',
	'4. Deep review',
	'5. Legal hold `end`',
	'',
].join('\n');

test('a branching state chart is re-ranked in the Studio webpage export', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	await gotoStudio(page);
	await setEditorContent(page, BRANCHING_DECK);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	// A real `.html` name: `download.path()` is an extension-less temp file that
	// `file://` will not parse as HTML, so nothing in it would run.
	const file = path.join(testInfo.outputDir, 'state-chart-export.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await page.context().newPage();
	await viewer.goto(`file://${file}`);
	const rows = await viewer
		.locator('.state-chart-figure .state-node-shape')
		.evaluateAll((els) =>
			els.map((el) => Math.round(
				Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2)));
	await viewer.close();

	// ANTI-VACUITY: the machine has to have been DRAWN at all. An export that
	// baked nothing would give an empty list, and "no two rows differ" would be
	// trivially true of it.
	expect(rows.length, 'the exported deck painted no state nodes at all').toBeGreaterThanOrEqual(5);

	const shared = rows.length - new Set(rows).size;
	expect(
		shared,
		`every state sits on its own row (${rows.join(', ')}) — the export laid a FAN-OUT out as a numbered column, which is what happens when the dagre engine never reached the export frame`,
	).toBeGreaterThanOrEqual(2);
});
