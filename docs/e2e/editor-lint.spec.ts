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

/** The width at which `useBreakpoint` flips the Studio to a single swappable pane. */
const SINGLE_PANE_MAX_WIDTH = 699;

/**
 * Below 700px the Studio shows ONE PANE AT A TIME: the preview rail is up and the editor is
 * not mounted, so `setEditorContent`'s click on `Deck source` simply times out. The
 * `Markdown source` cell of the Eight-Cell Bar swaps the pane in
 * (`2026-07-26-studio-mobile-eight-cell-bar.md`); `responsive.spec.ts` pins that toggle's
 * own behavior, so this only has to ride it.
 *
 * Gated declaratively rather than on the control's presence: a `.isVisible()` probe would
 * silently no-op the day the toggle is renamed, and the whole point of running these arms
 * on a phone is that they fail loudly when the phone surface stops working.
 *
 * On the VIEWPORT WIDTH, though, not on the project NAME. The name check this replaces read
 * `=== 'mobile'`, which is the one project that was phone-sized when it was written — and it
 * silently stopped covering the case the moment these arms picked up `@webkit-phone`, because
 * `devices['iPhone 15 Pro']` is 393x659 and answers to neither name. Width is the actual
 * cause: `useBreakpoint` (docs/src/lib/use-breakpoint.ts) flips to the single-pane layout on
 * `(max-width: 699px)`, so reading that same number here tracks any phone project, present or
 * future, and needs no edit when one is added.
 *
 * Read from `page.viewportSize()` — the box the media query actually resolves against — not
 * from `testInfo.project.use.viewport`, which is only what the PROJECT declared. A spec can
 * set its own with a file-level `test.use({ viewport })` (`studio-shell-parity.spec.ts` does
 * exactly that), and the declared value would then disagree with the real one and pick the
 * wrong branch silently — the same failure this gate was rewritten to stop.
 */
async function revealEditor(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	// `viewportSize()` is null only for a `viewport: null` project, which means the real browser
	// window — desktop-shaped headless. Take the desktop branch there rather than guessing, and
	// let the `Deck source` click time out loudly if that is ever wrong.
	const width = page.viewportSize()?.width;
	if (width !== undefined && width <= SINGLE_PANE_MAX_WIDTH) await revealEditor(page);
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

/** The warning underline covering `needle` — never `.first()`, which follows whichever
 *  finding sorted earliest the moment a second rule fires on the deck. */
const warningCovering = (page: import('@playwright/test').Page, needle: string) =>
	page.locator('.cm-lintRange-warning').filter({ hasText: needle }).first();

/**
 * Where the painted warning underline actually is, read back through the live view.
 *
 * `needle` picks the underline among any others on the page by the text it covers — a bare
 * `.first()` would silently follow whichever finding sorted earliest.
 *
 * WHY THE TWO ARMS BELOW ALSO CARRY `@webkit-phone`, and not just `@crosswidth`: this
 * oracle is GEOMETRY, and geometry is the class `webkit-phone` exists for. It reads a
 * painted box (`getBoundingClientRect`) and hands the coordinates back to CodeMirror
 * (`posAtCoords`) to ask which document line sits under them — a round trip through the
 * engine's own text layout, on a surface where `editor-theme.ts` raises `.cm-content` to
 * 16px for coarse pointers and re-wraps every line. A Chromium pass at 390px does not
 * predict that; it is the same reason #1227 gave for not trusting one. `@crosswidth` keeps
 * the desktop and 390px Chromium runs; this adds the one real WebKit phone.
 */
function underlineLine(page: import('@playwright/test').Page, needle: string): Promise<{ number: number; text: string } | null> {
	return page.evaluate((want) => {
		const el = [...document.querySelectorAll('.cm-lintRange-warning')].find((n) => (n.textContent || '').includes(want));
		// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror's view through its DOM handle.
		const view = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		if (!el || !view) return null;
		const r = el.getBoundingClientRect();
		const pos = view.posAtCoords({ x: r.left + 1, y: r.top + r.height / 2 });
		if (pos == null) return null;
		const line = view.state.doc.lineAt(pos);
		return { number: line.number, text: line.text };
	}, needle);
}

test('@crosswidth @webkit-phone a bad render-target value underlines its own front-matter line, not the deck top', async ({ page }, testInfo) => {
	await setEditorContent(page, PLACEMENT_DECK);

	// The underline carries the offending line's text, and it is painted on line 3 — the
	// line the author wrote — rather than on line 1, the chunk-start fallback a needle that
	// matched nothing would land on.
	await expect
		.poll(() => underlineLine(page, 'FLUID: ture'), { message: 'no warning underline ever appeared for `FLUID: ture`' })
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
	await warningCovering(page, 'FLUID: ture').hover();
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


// ── A NESTED render-target key warns, on the nested line ───────────────────
// The kernel reads an indented `fluid:` as the deck's own register — the union reader's one
// false-ON — and says in its own docblock that the remedy is a warning, not a narrower
// reader (narrowing re-breaks six measured parity rows and turns off decks in the field).
// `nested-render-target-key` is that warning, and this is the surface it exists for: an
// author writing the deck, before the wrong artifact is exported.
//
// The deck below is the kernel's own example, with `export:` standing in for its `nest:`.
// YAML shows `fluid` nested under that key;
// the export reads it as the register and ships the fluid viewer, outvoting the top-level
// `fluid: false` two lines down.
const NESTED_DECK = ['---', 'theme: indaco', 'export:', '  fluid: "true"', 'fluid: false', '---', '', '# Nested', '', 'Body copy.', ''].join('\n');

test('@crosswidth @webkit-phone a nested render-target key warns on the nested line', async ({ page }, testInfo) => {
	await setEditorContent(page, NESTED_DECK);

	await expect
		.poll(() => underlineLine(page, 'fluid: "true"'), { message: 'no warning underline ever appeared for the nested `fluid:`' })
		.toEqual({ number: 4, text: '  fluid: "true"' });

	await warningCovering(page, 'fluid: "true"').hover();
	const tooltip = page.locator('.cm-tooltip-lint');
	await expect(tooltip).toContainText("the export reads it as the deck's own `fluid:`");
	await expect(tooltip).toContainText('Move `fluid:` to the left margin');

	const shot = testInfo.outputPath('nested-render-target-key.png');
	await page.locator('.cm-editor').first().screenshot({ path: shot });
	await testInfo.attach('nested-render-target-key.png', { path: shot, contentType: 'image/png' });
});

// ── A mistyped deck REGISTER value warns in the Studio, as `lint:deck` does ─
// Each `*Names` list in the lint vocab turns on one `findUnknown*` rule. `buildVocabSets`
// once forwarded six of the twenty-one, so `guards: strcit` drew a warning from
// `npm run lint:deck` and nothing in the Studio, while the editor autocompleted `strict`.
// The unit test in editor-diagnostics.test.ts proves every register's rule fires through the
// builder; this arm proves the running Studio paints one — the surface an author sees.
const REGISTER_DECK = ['---', 'theme: indaco', 'guards: strcit', '---', '', '# Guards', '', 'Body copy.', ''].join('\n');

test('a mistyped register value (`guards: strcit`) underlines its front-matter line', async ({ page }, testInfo) => {
	await setEditorContent(page, REGISTER_DECK);

	await expect
		.poll(() => underlineLine(page, 'guards: strcit'), { message: 'no warning underline ever appeared for `guards: strcit`' })
		.toEqual({ number: 3, text: 'guards: strcit' });

	await warningCovering(page, 'guards: strcit').hover();
	const tooltip = page.locator('.cm-tooltip-lint');
	await expect(tooltip).toContainText("'strcit' is not a known guards value");
	await expect(tooltip).toContainText('loose, strict');

	// The whole page, not the editor box: the tooltip opens above line 3 and an editor-box
	// crop cuts the message off at its first line.
	const shot = testInfo.outputPath('register-guards-tooltip.png');
	await page.screenshot({ path: shot });
	await testInfo.attach('register-guards-tooltip.png', { path: shot, contentType: 'image/png' });
});
