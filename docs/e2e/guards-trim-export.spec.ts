import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

/**
 * THE OVER-CUT POST-CONDITION, ON THE DELIVERED PDF.
 *
 * WHY THIS IS NOT COVERED BY `guards-trim-live.spec.ts`. That spec drives the real
 * preview; this defect does not live there. The Studio renders its export in an
 * OFFSCREEN capture frame (`docs/src/components/studio/export/deck-export.js`) whose
 * section scale is **0.94375**, not 1: the frame is sized to the geom box (1280) and
 * `buildSrcdoc` puts `padding: 18px` on BOTH `html` and `body`, so `.lattice` measures
 * 1208. The runtime measures, plans and clamps at that scale and `rasterizeSection`
 * then undoes it per slide — so a measurer that mixes visual and layout pixels bakes
 * the wrong LINE COUNT into bytes the author hands to someone else. Measured, with
 * `scaleOf` pinned to 1 and the site rebuilt: the exported PDF came back **sixteen
 * words short — a whole line of the author's copy — with the room it cut them from
 * left empty.** The preview spec, the unit tier, the corpus ratchet and the trim's own
 * verdict were all green for that build, because every one of them asks *does it still
 * overflow* and an over-cut satisfies all of them.
 *
 * THE ASSERTION IS A COMPARISON, NOT A COUNT. `strict` must not deliver LESS copy than
 * `loose`. `loose` clips at the box edge and the PDF's text layer carries only what is
 * visible (`pdf-text-extract.js` intersects every word against its clipping ancestors),
 * so the loose export is exactly "everything that fit". A correct clamp lands on that
 * same last fitting line, so the two come back EQUAL — that is the pass, and it is why
 * `strict` against `loose` is a floor rather than a difference to look for. An over-cut
 * clamps a line ABOVE it and the strict export comes back shorter. No magic number, and
 * nothing here has to know that this deck happens to fit twelve lines.
 *
 * ANTI-VACUITY AT BOTH ENDS, because this comparison has two ways to be trivially true:
 * an export that painted nothing makes `0 >= 0` pass, and a deck that does not overflow
 * makes both exports whole and the comparison meaningless. The loose count is therefore
 * pinned strictly inside `(0, 14)` — real copy, and genuinely cut.
 *
 * WHAT MAKES IT CHEAP. #2199 gave the exported PDF a real text layer, so the oracle is
 * `pdftotext` (already a dependency of the integration tier) instead of a pixel
 * signature. Before that, this arm cost a rasterize-and-compare harness.
 */

const SENTENCES = 14;
const BODY = Array.from(
	{ length: SENTENCES },
	(_, i) => `Sentence ${i + 1} runs on long enough to wrap the column and push this box past its limit.`,
).join(' ');

const deck = (guards: 'strict' | 'loose') =>
	`---\nmarp: true\ntheme: indaco\nguards: ${guards}\n---\n\n<!-- _class: content -->\n\n## Live preview trims\n\n${BODY}\n`;

/**
 * `pdftotext` (poppler-utils) is the oracle, and the nightly that runs this suite does
 * not install it — `studio-e2e-nightly.yml` provisions Node, the browsers and the site
 * and nothing else. Adding a step to a workflow is the repo owner's call (CLAUDE.md
 * § SECOND FILTER, row 2), so this arm declares the gap instead of quietly closing it:
 * it runs wherever poppler is present — every local run, and the nightly the moment one
 * `apt-get install -y poppler-utils` step is authorized — and skips with the reason
 * everywhere else. A skip here means THE EXPORT PATH IS UNCOVERED on that runner, not
 * that the claim is weaker.
 */
const HAS_PDFTOTEXT = (() => {
	try {
		execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

/** Each `Sentence N` label the reader can actually see in the delivered file. */
function visibleSentences(pdf: string): number {
	const text = execFileSync('pdftotext', ['-q', pdf, '-'], { encoding: 'utf8' });
	return (text.match(/\bSentence\b/g) || []).length;
}

/** The clamp `applyTrim` writes, read from the live frame. Also the settle signal:
 *  the sweep is debounced and observer-driven, so poll on the consequence rather
 *  than on a guessed interval. */
function clampedCount(page: Page): Promise<number> {
	return page
		.frameLocator('[aria-label="Live deck preview"] iframe.live')
		.locator('[data-lattice-trimmed]')
		.count();
}

/**
 * One deck, one export, from a fresh Studio. The reload is not ceremony: the Share
 * sheet stays open over the editor after a download, and the second deck's
 * `setEditorContent` then clicks into an overlay instead of the editor.
 */
async function exportDeck(
	page: Page,
	testInfo: TestInfo,
	guards: 'strict' | 'loose',
	expectClamps: boolean,
): Promise<string> {
	await gotoStudio(page);
	await setEditorContent(page, deck(guards));
	await expect
		.poll(() => clampedCount(page), {
			message: expectClamps
				? 'the guard must have fired for this deck in this build before the export means anything'
				: 'guards: loose is the untrimmed control — it must clamp nothing',
			timeout: 15_000,
		})
		[expectClamps ? 'toBeGreaterThan' : 'toBe'](0);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.pdf.row }).click();
	const download = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.pdf.confirm }).click();
	const file = path.join(testInfo.outputDir, `guards-${guards}.pdf`);
	await (await download).saveAs(file);
	return file;
}

test('a guards: strict export never delivers less copy than the untrimmed one', async ({ page }, testInfo) => {
	test.skip(
		!HAS_PDFTOTEXT,
		'pdftotext (poppler-utils) is not installed — the exported PDF cannot be read, so the guards: strict export path is UNCOVERED on this runner',
	);
	test.setTimeout(300_000);
	const strict = visibleSentences(await exportDeck(page, testInfo, 'strict', true));
	const loose = visibleSentences(await exportDeck(page, testInfo, 'loose', false));

	expect(loose, 'the control export painted no copy at all — the comparison below would be vacuous')
		.toBeGreaterThan(0);
	expect(loose, `the control fit all ${SENTENCES} sentences, so nothing is being cut and there is no over-cut to catch`)
		.toBeLessThan(SENTENCES);
	expect(
		strict,
		`the trim removed copy the clip was keeping: strict delivered ${strict} sentences and the untrimmed control delivered ${loose}. A clamp may never cut ABOVE the last line that fits — see the coordinate-space defect in engineering/decisions/2026-09-07-overflow-guards-trim.md §13.`,
	).toBeGreaterThanOrEqual(loose);
});
