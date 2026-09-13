import { appendToEditor, CHROME, expect, gotoStudio, openInspector, openSection, setEditorContent, test } from './studio-fixture';

// The editor's real grammar lint (shared lint-core). An unknown component makes
// Fix-all actionable and surfaces an inline-issue count in the Coach; turning
// inline validation off stands the linter down. The Fix-all enabled/disabled
// state is the reliable outer-DOM oracle (the Coach banner lives in the
// collapsed-by-default Architect panel).

// A NEAR-MISS TYPO, not `zzznotacomponent`. "Fix all" is gated on the count of FIXABLE
// findings as of #2064 — the batch the author can already see underlined — and a name too far
// from any real component gets a finding with no Quick fix, so the button correctly stays
// disabled over it. This constant used to be `zzznotacomponent`, which pinned the older gate
// (`unknownComponents`), where the button was offered and then did nothing. `kpii` is one
// character off `kpi`, so it carries a Quick fix and Fix-all has something to do.
const UNKNOWN_SLIDE = '\n\n---\n\n<!-- _class: kpii -->\n\n# Stray slide\n';
const fixAll = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Fix all/i });

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('an unknown component makes Fix-all actionable; validation-off clears it', async ({ page }) => {
	// With no issues, Fix-all is disabled.
	await expect(fixAll(page)).toBeDisabled();

	await appendToEditor(page, UNKNOWN_SLIDE);
	await expect(fixAll(page)).toBeEnabled();

	// Turning inline validation off makes nothing "unknown" → Fix-all disabled again.
	// The two authoring aids sit in a collapsed "Developer" disclosure (#1048), so the
	// switch is out of the a11y tree until it is opened. That disclosure moved INSIDE the
	// General tab on 2026-08-18 — it used to hang below the tab strip as a footer.
	await openInspector(page);
	await openSection(page, CHROME.deckTab.general);
	await page.getByText('Developer', { exact: true }).click();
	await page.getByRole('switch', { name: 'Inline validation' }).click();
	await expect(fixAll(page)).toBeDisabled();
});

test('the Coach surfaces the inline-issue count', async ({ page }) => {
	await appendToEditor(page, UNKNOWN_SLIDE);
	// The count lives in the Architect Coach, which is collapsed by default.
	await page.getByRole('button', { name: 'Toggle Coach' }).click();
	await expect(page.getByText(/\d+ inline issue/)).toBeVisible();
});

// ── The render-target squiggle lands on the OFFENDING line ─────────────────
// `bad-render-target-value` (lib/authoring/lint-core.js) is a DECK-level finding — it
// reports `slide: 0`, because the keys it judges live in front matter, which belongs to no
// slide. That number is also the editor's anchor: `findingsToDiagnostics`
// (docs/src/playground/editor-diagnostics.js) resolves slide 0 to the deck top and then
// searches that chunk for a line matching the finding's `line` STRING. So the underline is
// placed by a substring match, and every claim about where it lands is really a claim about
// that needle — which is why the rule refuses to synthesize one and quotes the source line
// verbatim, case and all.
//
// #2164 shipped this path UNVERIFIED (HARD RULE #23): the bundled
// `authoring-core.generated.js` was proven to EMIT the verbatim line, and nothing had driven
// the real editor to see where the squiggle actually appears. This is that oracle.
//
// The deck writes `FLUID:` in capitals on purpose. The kernel reads the key
// case-insensitively while the rule's line-capture regex once did not, so a lowercased
// `fluid: ture` was quoted back for a deck that contains no such line — a needle matching
// nothing, which sends the underline to line 1 rather than dropping it. A lowercase key
// would pass whether or not that drift is fixed; this one fails on it.
//
// The oracle is GEOMETRIC, not a DOM-tree walk: read the painted underline's box, ask the
// live CodeMirror view which document position sits under it, and report that line. A test
// that asked the DOM which line element contains the span would be asserting on the same
// structure it is trying to check.
const PLACEMENT_DECK = ['---', 'theme: indaco', 'FLUID: ture', '---', '', '# Placement', '', 'Body copy.', ''].join('\n');

/** Where the painted warning underline actually is, read back through the live view. */
function underlineLine(page: import('@playwright/test').Page): Promise<{ number: number; text: string } | null> {
	return page.evaluate(() => {
		const el = document.querySelector('.cm-lintRange-warning');
		// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror's view through its DOM handle.
		const view = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		if (!el || !view) return null;
		const r = el.getBoundingClientRect();
		const pos = view.posAtCoords({ x: r.left + 1, y: r.top + r.height / 2 });
		if (pos == null) return null;
		const line = view.state.doc.lineAt(pos);
		return { number: line.number, text: line.text };
	});
}

test('a bad render-target value underlines its own front-matter line, not the deck top', async ({ page }, testInfo) => {
	await setEditorContent(page, PLACEMENT_DECK);

	// The underline carries the offending line's text, and it is painted on line 3 — the
	// line the author wrote — rather than on line 1, the chunk-start fallback a needle that
	// matched nothing would land on.
	await expect
		.poll(() => underlineLine(page), { message: 'no warning underline ever appeared for `FLUID: ture`' })
		.toEqual({ number: 3, text: 'FLUID: ture' });

	// Two shots, because the hover tooltip covers the very line it is about: the underline
	// on its own, then the message an author reads.
	const underlineShot = testInfo.outputPath('render-target-squiggle.png');
	await page.locator('.cm-editor').first().screenshot({ path: underlineShot });
	await testInfo.attach('render-target-squiggle.png', { path: underlineShot, contentType: 'image/png' });

	// The tooltip is what the author reads, so it is part of the same claim — and hovering
	// it is also what makes the evidence screenshot show the finding rather than a bare
	// wavy line. `@codemirror/lint` opens the hover on a 300ms timer.
	//
	// It names the key in the CANONICAL lowercase (`fluid:`) even for this deck's `FLUID:`,
	// and that is the rule's own wording, not drift: the message and fix are about the KEY,
	// which the kernel reads case-insensitively, while the `line` needle above is about the
	// SOURCE. Only the needle has to be verbatim — it is the one the editor searches with.
	await page.locator('.cm-lintRange-warning').first().hover();
	const tooltip = page.locator('.cm-tooltip-lint');
	await expect(tooltip).toContainText("'ture' is not an on/off value for `fluid:`");
	await expect(tooltip).toContainText('Set `fluid:` to one of true / yes / on');

	// Evidence artifacts for HARD RULE #23, both from the running Studio.
	// Both PNGs are written to the run's output dir (not only into the report blob) so they
	// are files somebody can open straight from `test-results/`.
	const tooltipShot = testInfo.outputPath('render-target-tooltip.png');
	await page.locator('.cm-editor').first().screenshot({ path: tooltipShot });
	await testInfo.attach('render-target-tooltip.png', { path: tooltipShot, contentType: 'image/png' });
});
