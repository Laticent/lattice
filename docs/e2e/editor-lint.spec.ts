import { appendToEditor, CHROME, expect, gotoStudio, openInspector, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

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
// The exact name: the issue-count button beside it now reads "1 issue: … Fix all swaps it for …",
// so a /Fix all/ pattern matches both and fails strict mode.
const fixAll = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Fix all issues', exact: true });

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
	// The two authoring aids sit under General's "Developer" heading. They were a collapsed
	// disclosure until 2026-09-26, when the Basic/Advanced tiers replaced the drawers.
	await openInspector(page);
	await openSection(page, CHROME.deckTab.general);
	await page.getByRole('switch', { name: 'Inline validation' }).click();
	await expect(fixAll(page)).toBeDisabled();
});

// "Fix all" runs lint-core's fixes through Squadra's fix driver (decision 2026-10-26-squadra-lint-library
// M1a): every non-overlapping fix in one pass, never an edit inside a code fence. This deck has a
// typo'd class, two card lines to nest, and a fenced copy of one of them ABOVE it, which a fix used to
// land on. Read back from the persisted source, the text the Studio saves. Not on a phone: the one-pane
// phone layout has no "Fix all" control, as the arm above assumes too.
const FIX_ALL_DECK = [
	'---', 'theme: indaco', '---', '', '# Title', '', '---', '', '<!-- @meta{layout=cards-grid} -->', '', '## Bets', '',
	'```md', '- **Speed.** ship weekly', '```', '', '- **Speed.** ship weekly', '- **Reach.** two markets', '',
	'---', '', '<!-- _class: kpii -->', '', '## Numbers', '',
].join('\n');

test('@webkit-tablet @gecko Fix all fixes every live line in one click and leaves a fenced example as written', async ({ page }) => {
	await setEditorContent(page, FIX_ALL_DECK);
	await expect(fixAll(page)).toBeEnabled();
	await fixAll(page).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- _class: kpi -->');
	// The Studio persists the source as a JSON string.
	const raw = await persistedSource(page);
	const src: string = raw.startsWith('"') ? JSON.parse(raw) : raw;
	expect(src).toContain('```md\n- **Speed.** ship weekly\n```');
	expect(src).toContain('- Speed\n  - ship weekly');
	expect(src).toContain('- Reach\n  - two markets');
	await expect(fixAll(page)).toBeDisabled();
});

// An LFM 1.x deck wrote its speaker notes as plain comments; under the four notes they reach nothing
// (engineering/decisions/2026-11-20-four-notes.md §5). Lint says so once (`plain-comment-notes`), and its fix
// runs the whole-deck migration, so "Fix all" turns the old notes into `@note{…}` in one click.
const OLD_NOTES_DECK = [
	'---', 'theme: indaco', '---', '', '# Title', '', '<!-- Open on the drop. -->', '', '---', '', '## Two', '',
	'<!-- Pause before the number. -->', '', '<!-- say: The pipeline holds. -->', '',
].join('\n');

test('@webkit-tablet @gecko Fix all migrates a deck whose speaker notes are plain comments', async ({ page }) => {
	await setEditorContent(page, OLD_NOTES_DECK);
	await expect(fixAll(page)).toBeEnabled();
	await fixAll(page).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- @note{Open on the drop.} -->');
	const raw = await persistedSource(page);
	const src: string = raw.startsWith('"') ? JSON.parse(raw) : raw;
	expect(src).toContain('<!-- @note{Pause before the number.} -->');
	expect(src).toContain('<!-- @say{The pipeline holds.} -->');
	expect(src).not.toContain('<!-- Open on the drop. -->');
	await expect(fixAll(page)).toBeDisabled();
});

// The clean break to `@meta` records (engineering/decisions/2026-10-17-meta-record.md §15): every old directive comment
// is a `legacy-directive-comment` warning whose fix is the whole-deck migration, and a bare `<!-- {…} -->` record is a
// `meta-bare-record` warning whose fix writes `@meta`. One press of "Fix all" converts the deck, the same text
// `lattice migrate meta` writes, and the slides render as before.
const LEGACY_DECK = [
	'---', 'theme: indaco', '---', '', '<!-- _class: title -->', '', '# Q3 review', '', '---', '',
	'<!-- _class: cards-grid -->', '<!-- _footer: Board, Q3 -->', '', '## Three bets', '', '- Reach', '  - two markets', '- Margin', '  - four points', '- Speed', '  - half the cycle', '',
	'---', '', '<!-- {layout=kpi} -->', '', '## Revenue', '', '- $4.2M', '  - up 12%', '',
].join('\n');

test('@webkit-tablet @gecko Fix all converts an old directive-comment deck to @meta records', async ({ page }, info) => {
	await setEditorContent(page, LEGACY_DECK);
	await expect(fixAll(page)).toBeEnabled();
	// The evidence shot: the deck before, with its warnings underlined.
	await page.screenshot({ path: info.outputPath('meta-fix-before.png') });
	await fixAll(page).click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- @meta{layout=cards-grid, footer=\\"Board, Q3\\"} -->');
	const raw = await persistedSource(page);
	const src: string = raw.startsWith('"') ? JSON.parse(raw) : raw;
	expect(src).toContain('<!-- @meta{layout=title} -->');
	expect(src).toContain('<!-- @meta{layout=kpi} -->');
	expect(src).not.toMatch(/<!-- _(class|footer):/);
	expect(src).not.toContain('<!-- {');
	// Every line keeps its place: the merged record leaves a blank line where the footer comment was.
	expect(src.split('\n')).toHaveLength(LEGACY_DECK.split('\n').length);
	await expect(fixAll(page)).toBeDisabled();
	await page.screenshot({ path: info.outputPath('meta-fix-after.png') });
});

// A refused fix keeps its underline, so "Fix all" has to say why (followups.d/2966-p2). The one refusal
// a real deck reaches: the driver's 500-pass cap. lint-core reports the card rule once per slide per
// lint, so 501 inline-title cards on one slide need 501 passes and the last is refused (`max-passes`).
// Run from the command palette, which every width offers (the phone layout has no "Fix all" button).
const REFUSED_DECK = [
	'---', 'theme: indaco', '---', '', '# Title', '', '---', '', '<!-- @meta{layout=cards-grid} -->', '', '## Bets', '',
	...Array.from({ length: 501 }, (_, i) => `- **Bet ${i}.** body ${i}`),
	'',
].join('\n');

async function runFixAllFromPalette(page: import('@playwright/test').Page): Promise<void> {
	const row = page.getByRole('option', { name: 'Fix all issues' });
	// The row is offered once lint has counted a fixable issue: 1.3 s after the 501-card deck is typed in Gecko, 7 s in
	// WebKit (measured). An open palette shows a row that arrives while it is open (studio-palette-late-row.spec.ts,
	// engineering/decisions/2026-11-03-security-findings-spine.md §The command palette's late row), so open it once and wait on the row itself, at every width (the phone has no button).
	await page.keyboard.press('ControlOrMeta+k');
	await page.getByPlaceholder('Search or run a command…').fill('Fix all');
	await expect(row).toBeVisible({ timeout: 90_000 });
	// The click IS the work: choosing the row runs Fix all inside the click handler, and Playwright 1.65.1's click returns
	// only once that handler has. Over REFUSED_DECK's 500 issues that took 6.6 s alone on WebKit and 16 to 22 s at four
	// workers, past the default 15 s action timeout. So the click gets the same budget as the result it produces.
	await row.click({ timeout: 60_000 });
}

/** The deck as stored, decoded. */
async function storedDeck(page: import('@playwright/test').Page): Promise<string> {
	const raw = await persistedSource(page);
	return raw.startsWith('"') ? JSON.parse(raw) : raw;
}

test('@crosswidth @webkit-phone @webkit-tablet @gecko Fix all names a fix it refused, and why, then a second run finishes it', async ({ page }) => {
	test.setTimeout(240_000);
	await setEditorContent(page, REFUSED_DECK);
	// Frames the page paints, counted from here on. This deck needs the fix driver's 500 passes, which once ran inside
	// the click and froze the page until the last (8.4 s measured in WebKit; past Playwright's 15 s click deadline under
	// load). Now each pass is a task of its own (lint-core `fixAllDetailed` with a pause), so the click returns and the page
	// keeps painting while Fix all works. Counted, not timed (HARD RULE #32): at least one frame per ten passes. Measured
	// 2026-11-21: the run painted 128 to 525 frames (gecko the fewest, WebKit under 4 workers 479 to 503); with the passes
	// put back inside the click it painted 3 to 8, the frames before the freeze while the fix driver's chunk loaded.
	await page.evaluate(() => {
		const w = window as unknown as { __frames: number };
		w.__frames = 0;
		const tick = () => {
			w.__frames++;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
	await runFixAllFromPalette(page);
	const atClick = await frames();
	await expect(page.getByText('Fixed 500 issues. 1 fix was not applied.')).toBeVisible({ timeout: 60_000 });
	expect(await frames(), 'the page kept painting while Fix all ran').toBeGreaterThan(atClick + 50);
	await expect(page.getByText('Slide 2, card-style-inline-title: Fix all stopped before reaching it; press Fix all again.')).toBeVisible();
	await expect.poll(() => storedDeck(page)).toContain('- Bet 0\n  - body 0');
	const afterFirst = await storedDeck(page);
	expect(afterFirst).toContain('- **Bet 500.** body 500');
	// The refused fix is still there to run; the second run applies it and refuses nothing.
	await runFixAllFromPalette(page);
	await expect(page.getByText('Fixed 1 issue.')).toBeVisible({ timeout: 30_000 });
	await expect.poll(() => persistedSource(page)).toContain('Bet 500\\n  - body 500');
	const src = await storedDeck(page);
	expect(src).toContain('- Bet 500\n  - body 500');
	expect(src).not.toContain('**Bet');
	// Each Fix all is ONE undo step, waiting or not: one undo takes back the second run whole, and the first run's
	// 500 fixes stay. Filo takes the chord from any focus (filo-undo.spec.ts), the phone's shared pane included.
	const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
	await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
	await expect.poll(() => storedDeck(page)).toBe(afterFirst);
});

test('the Coach surfaces the inline-issue count', async ({ page }) => {
	await appendToEditor(page, UNKNOWN_SLIDE);
	// The count lives in the Architect Coach, which is collapsed by default.
	await page.getByRole('button', { name: 'Toggle Coach' }).click();
	await expect(page.getByText(/\d+ inline issue/)).toBeVisible();
});

// Fix all's passes run between keystrokes (lint-core `fixAllDetailed` with a pause), so the author can act while it works.
// Two guards decide whether it writes (Editor.tsx `fixAll`): a result computed from a text that has since changed is
// not written, and says so; and a second press while a run is going starts nothing. The 501-card deck makes the run
// long enough (hundreds of frames, measured above) for the test to act inside it.
const STALE = 'The deck changed while Fix all was running, so nothing was changed. Press Fix all again.';

test('@webkit-tablet @gecko typing while Fix all runs keeps the typing, writes no fixes, and says so', async ({ page }) => {
	test.setTimeout(240_000);
	await setEditorContent(page, REFUSED_DECK);
	await runFixAllFromPalette(page);
	// Type only once the run has read the deck: before that, the typing is part of what it fixes (the driver's chunk
	// loads first; 50 ms of margin in Chromium, measured). Editor.tsx, deck-lint.ts and editor.js mark the run.
	await expect(page.locator('html[data-fix-all-running]')).toBeAttached({ timeout: 30_000 });
	// The run is going: type at the end of the deck. The palette closed on the click.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('TYPED');
	await expect(page.getByText(STALE)).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => storedDeck(page)).toContain('TYPED');
	const src = await storedDeck(page);
	// Nothing from the run was written: every card still has its inline title.
	expect(src).toContain('- **Bet 0.** body 0');
	expect(src).toContain('- **Bet 499.** body 499');
	await expect(page.getByText(/^Fixed \d+ issue/)).toHaveCount(0);
});

test('@webkit-tablet @gecko a second press while Fix all runs starts nothing', async ({ page }) => {
	test.setTimeout(240_000);
	await setEditorContent(page, REFUSED_DECK);
	await runFixAllFromPalette(page);
	// Press again while the first run is going (the palette still offers the row: lint has not run since).
	await runFixAllFromPalette(page);
	await expect(page.getByText('Fixed 500 issues. 1 fix was not applied.')).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => storedDeck(page)).toContain('- Bet 0\n  - body 0');
	// An absence needs the work it would come from to have had its turn. A second run started with the first shares the
	// page with it pass by pass and so ends a few passes after it; 150 frames is more than a whole run paints at the
	// least measured (128, gecko). Counted in frames the page paints, not in milliseconds (HARD RULE #32).
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				let left = 150;
				const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
	);
	// One run, one notice. The status pill is rewritten in place (lib/notify.ts), so a second run racing the first would
	// replace the first run's notice with its own (a stale one, or "Fixed 1 issue." if it began after the first ended):
	// the first run's exact words must still be the one notice showing.
	await expect(page.getByText('Fixed 500 issues. 1 fix was not applied.')).toHaveCount(1);
	await expect(page.getByText(STALE)).toHaveCount(0);
});

test('@webkit-tablet @gecko switching to Compose while Fix all runs writes nothing and says so', async ({ page }) => {
	test.setTimeout(240_000);
	await setEditorContent(page, REFUSED_DECK);
	await runFixAllFromPalette(page);
	// Compose unmounts the Source editor (Editor.tsx's teardown destroys its view). A destroyed view keeps its old text
	// and takes a dispatch without a word, so the run must count as stale rather than announce fixes it never wrote.
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await expect(page.getByText(STALE)).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/^Fixed \d+ issue/)).toHaveCount(0);
	expect(await storedDeck(page)).toContain('- **Bet 0.** body 0');
});

// ── The render-target squiggle lands on the OFFENDING line ─────────────────
// `bad-render-target-value` (lib/authoring/lint-core.js) is a DECK-level finding — it
// reports `slide: 0`, because the keys it judges live in front matter, which belongs to no
// slide. That number is also the editor's anchor: `findingsToDiagnostics`
// (docs/src/lib/editor-diagnostics.js) resolves slide 0 to the deck top and then
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
	await expect(tooltip).toContainText("'ture' isn't on or off, so the export treats `fluid:` as off");
	await expect(tooltip).toContainText('Set `fluid:` to true/yes/on or false/no/off');

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
	await expect(tooltip).toContainText('`fluid:` is indented, but the export still reads it as the deck setting');
	await expect(tooltip).toContainText('Move it to the left margin');

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
	await expect(tooltip).toContainText("`guards:` has been renamed to `fit:`, and 'strcit' isn't a valid value");
	// The fix names the new key, `fit:`, and its values — `guards:` is the old spelling.
	await expect(tooltip).toContainText('report, heal, trim');

	// The whole page, not the editor box: the tooltip opens above line 3 and an editor-box
	// crop cuts the message off at its first line.
	const shot = testInfo.outputPath('register-guards-tooltip.png');
	await page.screenshot({ path: shot });
	await testInfo.attach('register-guards-tooltip.png', { path: shot, contentType: 'image/png' });
});
