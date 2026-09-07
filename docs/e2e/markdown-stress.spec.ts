import type { Page } from '@playwright/test';
import { stripFrontMatter } from '../src/components/studio/front-matter';
import { splitSlides, usedComponents } from '../src/components/studio/lint';
import { expect, gotoStudio, persistedSource, railButtons, test, waitForStudioPaint } from './studio-fixture';

/**
 * THE MARKDOWN PANE — the stress tier.
 *
 * Compose has one of these (`compose-stress.spec.ts`); this is the other half of the
 * Studio's authoring surface, and it had never been walked. Every `test` below started as
 * a REPRODUCTION found by a randomized walk over the real built Studio, not as a guess
 * about what might break.
 *
 * WHY THE UNIT TIER MISSED ALL OF IT — and the honest answer is not the one this file was
 * first written with. It used to say `Editor.tsx` degrades to a `<textarea>` because
 * CodeMirror cannot construct in jsdom, so that tier could only ever exercise the fallback.
 * **That is false, measured**: rendering this component under the docs vitest environment
 * gives `textarea: false, .cm-content: true` — `docs/vitest.setup.ts` stubs the rect APIs
 * CodeMirror measures with, precisely so it CAN construct.
 *
 * What is true is duller and more useful: 1822 studio unit tests were green over all of this
 * because none of them drove these paths, not because they could not. Most of it IS reachable
 * there — the engine renders in Node, so the rail-vs-engine differential runs in jsdom (this
 * change ships it, `lint.test.ts`), and so do the history and BOM defects. What genuinely is
 * not is a real clipboard `paste` event, and invariant 2 as an in-page assertion against the
 * preview iframe. Reach for THIS tier when the question is "what does a real browser do with
 * this input"; reach for that one for anything you can ask a component and the engine
 * directly. See the findings note §9.
 *
 * WHAT THE WALK DID. Eleven op families, and FIVE of them can decline to act: `dropSeparator`
 * needs a `---` in CodeMirror's viewport and `railPick` a non-empty rail, while `type`, `paste`
 * and `cutOrCopy` inherit the same shape from `caretIntoLine`, which returns silently when the
 * editor has rendered no line. The other six — `keys`, `undoRedo`, `selectAllReplace`,
 * `frontMatter`, `paneSwitch`, `scroll` — always act. A declining op still burns a step, so the
 * walk COUNTS how many times invariant 2 actually compared a source against a painted slide and
 * fails at ten or fewer: a run that only took its escapes would otherwise pass certifying nothing.
 *
 * A TWELFTH OP WAS REMOVED RATHER THAN FIXED, and the reason is the useful part. The lint
 * gutter's Quick fix was an op here through three revisions and, measured across seven seeds,
 * applied a fix ZERO times — the walk types into the middle of a line (`caretIntoLine` clicks
 * the line's centre), and a `_class` directive anywhere but column 0 produces no finding at
 * all, so the op almost never saw a marker to hover. Rather than keep adjusting a walk step to
 * make it reachable, the path it was supposed to cover — `findingsToDiagnostics`'s `onFix` —
 * now has a DETERMINISTIC oracle of its own below, which is what it needed all along. Counting
 * an op that never fires as coverage is the mistake this file made three times.
 *
 * It drove those families against the shipped Studio in random
 * order — type, paste (CRLF / BOM / a 900-column line / a whole slide / a table / math /
 * block HTML / `* * *`), cut, copy, undo, redo, select-all-and-replace, front-matter edits,
 * directive edits, deleting a `---` separator to merge two slides, the lint gutter's Quick
 * fix, rail picks, Markdown↔Compose round trips and wheel scrolling — asserting five
 * structural invariants after every single op. Six seeds and 60 steps each from a scratch
 * harness; what is COMMITTED is one seed at 34 steps as a regression net, plus a named
 * oracle per defect, because a fuzz failure tells you the deck broke and not which
 * keystroke broke it.
 *
 * THE FIVE INVARIANTS, and the rule they are chosen by: no two of them may be able to
 * agree while being jointly WRONG. That is finding 11 in the Compose note — `aria-expanded`
 * and the `cs-collapsed` class both read the same decoration set, so the pair certified
 * itself. Each of these reads a DIFFERENT producer — with ONE honest qualification, on
 * invariant 2, written out where that oracle lives: §2's fix put a shared directive grammar
 * under both of its sides, so what it still separates is the application, not the parse.
 *   1. The editor document equals the persisted source. CodeMirror's own `EditorState`
 *      against the shell's React state → debounce → `localStorage`. What survives a reload
 *      is what you typed.
 *   2. The rail's component label equals the class the ENGINE painted on the slide. A
 *      source-side scan in `lint.ts` against markdown-it's rendered `<section class>` inside
 *      the preview iframe. THIS IS THE ONE THAT FIRED, on a keystroke as ordinary as a stray
 *      `.`. Read the note at the rail-names oracle before trusting it too far: the two sides
 *      shared their directive GRAMMAR the moment §2's fix landed, so this pair is a
 *      differential over the APPLICATION only.
 *   3. The rail holds at least one slide and its current index is inside it.
 *   4. No page error.
 *   5. The document is canonical: no CR, no leading BOM.
 *
 * WHERE THESE RUN. The whole file runs in the nightly tier (`studio-e2e-nightly.yml`,
 * 04:41 UTC, which greps out only `@perf`) — a new spec is nightly from the day it lands,
 * with no workflow change. But a net that only fires at 04:41 lets a regression sit on
 * `main` for a day, so three oracles also carry `@smoke` and run on the PR gate
 * (`studio-smoke` → `--project=desktop --grep @smoke`). They are the three whose defect is
 * SILENT — nothing on screen says it happened:
 *   · the BOM, which corrupts the deck source durably and survives a reload;
 *   · undo, whose loss removes the author's only route back from a mistake;
 *   · the rail label, which is the map the author steers the deck by.
 * The rest stay nightly: the Fix-all gate fails in front of you (you press a button and
 * watch nothing happen), and the 34-step walk's value is breadth over time rather than
 * per-PR latency.
 *
 * WHERE THESE HOLD, measured rather than assumed — the file is routed to the `desktop`
 * project, and "desktop-only by design" was a claim nobody had run:
 *
 *   1440 Chromium            10/10    the shipped tier
 *   820  Chromium            10/10    pane and rail both on screen; nothing is width-coupled
 *   820  Chromium + touch    10/10    the Quick-fix oracle hovers, and hovers fine under touch
 *   1440 WebKit              10/10    no skips — see the note on the clipboard below
 *   1440 Firefox             10/10    same
 *   820  WebKit              10/10    same
 *   390  Chromium (± touch)   5/10    structural, and not a defect: see below
 *
 * The table quotes PASS COUNTS, so adding an oracle makes it stale in a way nothing checks.
 * This row set is a re-measure of all ten AFTER the Quick-fix oracle below landed — not the
 * earlier nine-oracle run with a number patched. Re-measuring costs about seven minutes and
 * needs no committed harness: a throwaway Playwright config that spreads `docs/playwright.
 * config.ts`, points `testDir` at this directory, `testMatch`es `/markdown-stress/`, and
 * declares one project per row above (820 and 390 Chromium with and without `hasTouch`,
 * `Desktop Safari` at 1440 and 820, `Desktop Firefox` at 1440). Keep it in `.scratch/`; if
 * you put it there, symlink `docs/node_modules` beside it or `@playwright/test` will not
 * resolve. The 1440 Chromium row is just the shipped `desktop` project.
 *
 * THE PHONE IS A DIFFERENT SURFACE, and this is the measurement rather than a guess. At 390
 * the Studio shows ONE PANE AT A TIME — probed directly: by default the rail is visible and
 * the editor is not; reveal the editor through its `Markdown source` toggle and the rail goes.
 * Five oracles pass there — CR/CRLF folding, undo across Compose, the Compose carry, the Quick
 * fix (it never leaves the editor) and the reload round trip. The five that do not are blocked
 * by three different things, which is worth
 * stating precisely because an earlier draft of this paragraph said "must type in the editor
 * and then read the rail" for all of them and that is not what the failures say:
 *
 *   · the two BOM oracles      the RAIL — `railClick` times out, the rail being toggled away
 *   · the rail-names oracle    the PREVIEW IS STALE — not unreachable. `paintedClasses` reads
 *                              fine; the hidden preview simply does not follow the editor, so
 *                              it keeps painting slide 1 (`Expected "kpi", Received ["title"]`)
 *   · the walk                 the same, through invariant 2 (`names [stats], painted [title]`)
 *   · Fix all is offered       the TOOLBAR — `fixAll.isEnabled()`, not the rail at all
 *
 * Running them here would mean toggling panes between every write and every read. That is a
 * different spec, not a missing assertion. `revealEditor` in the setup exists so this file
 * gives that answer instead of timing out on a hidden element. One caveat on the fourth
 * passer: the reload oracle's rail assertion counts DOM nodes, which the hidden rail still
 * satisfies — so it passes at 390 without really exercising the rail there.
 *
 * THE CLIPBOARD NEEDS NO ENGINE SKIP, and an earlier revision of this file wrongly added one.
 * WebKit rejects the `clipboard-write` permission NAME and Firefox rejects `clipboard-read`,
 * which is a Playwright API quirk — on both engines `navigator.clipboard.writeText` resolves
 * anyway, and the BOM oracle's own body passes there. Skipping on the failed grant cost the
 * change's top-severity oracle two of its three engines for no reason. What actually keeps a
 * silent clipboard failure honest is `pasteDeck` asserting that the paste DELIVERED: the
 * document is emptied first, so a no-op paste leaves it empty and the oracle goes red.
 *
 * TRAPS, all paid for once already:
 *   · `.click()` resolves before CodeMirror moves its selection. `caretIntoLine` clicks and
 *     then POLLS the view's own `selection.main.head` — the CodeMirror version of
 *     `compose-stress.spec.ts`'s `caretInto`, and for the same measured reason.
 *   · The persisted value is JSON-encoded. `persistedSource` returns the raw string; every
 *     comparison here goes through `persistedDeck`, which decodes it. Nothing else in the
 *     suite has had to notice, because every other caller asserts a SUBSTRING (`toContain`,
 *     one `toMatch`), and the JSON wrapper still contains it. Byte equality does not.
 *   · The preview repaints asynchronously, so invariant 2 is POLLED. Read once and it
 *     reports the previous slide as a defect.
 *   · The editor document is read from CodeMirror's own state, never from `innerText`:
 *     CodeMirror renders a viewport, so `innerText` is missing whatever is scrolled away.
 */

const EDITOR = '[aria-label="Deck source"]';
const BOM = '﻿';

/** The live document, from CodeMirror's own state — see the trap note above. `.cmTile` is
 *  how `EditorView.findFromDOM` reaches the view, and it is the only handle the page
 *  exposes. */
function editorDoc(page: Page): Promise<string> {
	// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror's view through its DOM handle.
	return page.evaluate(() => ((document.querySelector('.cm-content') as any)?.cmTile?.root?.view?.state?.doc?.toString() ?? ''));
}

/** The caret's document offset, and the 1-based line it sits on. */
function caretAt(page: Page): Promise<{ head: number; line: number }> {
	return page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		if (!v) return { head: -1, line: -1 };
		const head = v.state.selection.main.head;
		return { head, line: v.state.doc.lineAt(head).number };
	});
}

/** The persisted deck source, DECODED. The stored value is JSON; see the trap note. */
async function persistedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	if (!raw) return '';
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw; // already a bare string
	}
}

/** The rail: how many slides it holds, which one is current, and the component it names.
 *  The label is the tail of the button's accessible name (`Slide 3 — big-number`). */
function railState(page: Page): Promise<{ count: number; index: number; cls: string }> {
	return page.evaluate(() => {
		const bs = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Slide navigator"] button')];
		const index = bs.findIndex((b) => b.getAttribute('aria-current') === 'true');
		const name = bs[index]?.getAttribute('aria-label') ?? '';
		return { count: bs.length, index, cls: name.split('—').pop()?.trim() ?? '' };
	});
}

/** The classes the ENGINE put on the painted slide — its answer to "what component is
 *  this?", derived from markdown-it's own parse rather than from anything in `docs/src`. */
function paintedClasses(page: Page): Promise<string[]> {
	return page
		.frameLocator('[aria-label="Live deck preview"] iframe.live')
		.locator('.lattice section')
		.first()
		.evaluate((el) => [...el.classList])
		.catch(() => [] as string[]);
}

/** How many headings a chunk carries — ATX (`#`/`##`) plus setext underlines. A PROXY for
 *  "would the default `split: headings` register divide this into more than one engine
 *  slide?", used only to skip an assertion, never to make one. */
function headingsIn(chunk: string): number {
	const lines = chunk.split('\n');
	let n = 0;
	for (let i = 0; i < lines.length; i++) {
		if (/^ {0,3}#{1,2}[ \t]/.test(lines[i])) n++;
		else if (i > 0 && lines[i - 1].trim() && /^ {0,3}(={1,}|-{1,})[ \t]*$/.test(lines[i])) n++;
	}
	return n;
}

/** The painted slide's text, whitespace-normalized. */
function paintedText(page: Page): Promise<string> {
	return page
		.frameLocator('[aria-label="Live deck preview"] iframe.live')
		.locator('.lattice section')
		.first()
		.innerText()
		.then((t) => t.replace(/\s+/g, ' ').trim())
		.catch(() => '');
}

/** Put the caret on line `n` (0-based over the RENDERED lines) and WITNESS that it landed.
 *  `.click()` resolves once the click is dispatched, not once CodeMirror has moved its
 *  selection, so a keystroke on the next line can be delivered where the caret used to be. */
async function caretIntoLine(page: Page, n: number): Promise<void> {
	const lines = page.locator(`${EDITOR} .cm-line`);
	const total = await lines.count();
	if (!total) return;
	await lines.nth(n % total).click();
	await expect.poll(() => caretAt(page).then((c) => c.line), { message: `the caret never landed on rendered line ${n}` }).toBeGreaterThan(0);
}

/**
 * Focus the editor and WITNESS it before any keystroke.
 *
 * `.click()` resolves once the click has been dispatched, not once CodeMirror has taken
 * focus — so a `⌘A` on the next line can be delivered to the DOCUMENT instead, where it
 * selects the page, `Delete` does nothing, and the text that follows goes nowhere. The test
 * then fails several assertions later, blaming whatever it looked at first.
 *
 * Not hypothetical: this file failed exactly that way under enough concurrency, in the two
 * tests that reached the editor through an unwitnessed click, while passing every run in
 * isolation. That is the shape `2026-09-02-compose-fuzz-findings.md` §12 names — an oracle
 * whose passing depended on a condition nobody wrote down — so this is the ONE way this
 * file focuses the editor, including where the very next line would have caught it anyway.
 */
async function focusEditor(page: Page): Promise<void> {
	await page.locator(EDITOR).click();
	await expect
		.poll(() => page.evaluate(() => !!document.activeElement?.closest('.cm-editor')), { message: 'the editor never took focus' })
		.toBe(true);
}

/** Replace the whole deck, witnessing focus first. Same shape as the fixture's
 *  `setEditorContent` — `insertText` rather than per-key typing, because the editor's
 *  markdown auto-continuation rewrites a `---` typed inside a list — plus the witness. */
async function setDeck(page: Page, text: string): Promise<void> {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText(text);
	await expect.poll(() => editorDoc(page), { message: 'the document never became the deck under test' }).toBe(text);
}

/** Replace the deck through the CLIPBOARD — the door a BOM actually arrives through, and
 *  a different code path from `insertText`. */
async function pasteDeck(page: Page, text: string): Promise<void> {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await expect.poll(() => editorDoc(page), { message: 'the document never emptied before the paste' }).toBe('');
	// THE CLIPBOARD IS CLEARED FIRST, and that is not ceremony. A caller that pastes two
	// payloads in a row — the CRLF oracle does, and both of its payloads normalize to the SAME
	// 18 characters — would otherwise re-paste iteration 1's text on iteration 2 if the second
	// `writeText` silently failed, satisfying both the delivery check below and the oracle's own
	// `toBe(DECK)`. The lone-CR arm would then pass having never pasted a lone CR. Clearing
	// makes a failed write leave an EMPTY clipboard, which the check below catches.
	await page.evaluate(() => navigator.clipboard.writeText('').catch(() => {}));
	await page.evaluate((v) => navigator.clipboard.writeText(v).catch(() => {}), text);
	await page.keyboard.press('ControlOrMeta+v');
	// ASSERT THE PASTE DELIVERED, which is what makes a silent clipboard failure a RED test
	// rather than a hollow green one, and is why the paste oracles need no engine skip. An
	// earlier revision skipped them on WebKit and Firefox on the theory that `writeText` rejects
	// there. It does not — measured on both — and the skip cost the BOM oracle, the one guarding
	// durable source corruption, two of its three engines.
	await expect
		.poll(() => editorDoc(page).then((d) => d.length), { message: 'the paste never reached the document' })
		.toBeGreaterThanOrEqual(text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').length);
}


/** Create a new deck through ⌘K. Not the header switcher: that trigger is labelled by the
 *  DECK TITLE and carries no stable hook. Witnessed through the deck INDEX rather than the
 *  document, because this is called from both panes — and in Compose the editor is unmounted,
 *  so a document-based wait can never be satisfied. */
async function newDeck(page: Page): Promise<void> {
	const before = new Set(await deckIds(page));
	await page.keyboard.press('ControlOrMeta+k');
	await page.getByRole('option', { name: 'New deck' }).click();
	// A NEW ID, not a bigger count: the index is empty until the first deck op and then
	// materializes with the built-ins too, so the first call sees 0 -> 4 and a count-based
	// wait would be satisfied by that alone.
	await expect
		.poll(async () => (await deckIds(page)).some((id) => !before.has(id)), { message: 'the deck index never gained a new deck' })
		.toBe(true);
}

/** The ids in the persisted deck index. */
function deckIds(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		try {
			const v = JSON.parse(window.localStorage.getItem('lattice-studio-deck-index') ?? '[]');
			return Array.isArray(v) ? v.map((d) => String((d as { id?: unknown })?.id ?? '')) : [];
		} catch {
			return [];
		}
	});
}

async function toCompose(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

/** Put the caret in a Compose slide and WITNESS it — the ProseMirror half of `focusEditor`,
 *  and the same hazard: a click that has been dispatched is not a caret that has moved. */
async function caretIntoComposeSlide(page: Page, i: number): Promise<void> {
	await page.locator('.cs-slide-content').nth(i).click();
	await expect
		.poll(() => page.evaluate((n) => [...document.querySelectorAll('.cs-slide')].findIndex((el) => el.classList.contains('cs-slide-active')) === n, i), {
			message: `the caret never landed in Compose slide ${i}`,
		})
		.toBe(true);
}
async function toMarkdown(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await page.locator(EDITOR).waitFor();
	await expect.poll(() => editorDoc(page)).not.toBe('');
}

test.beforeEach(async ({ page }) => {
	// Attempted for EVERY test, not per-test, because the paste helper writes through
	// `navigator.clipboard`.
	// BEST EFFORT, and deliberately not a gate. Chromium accepts these names; WebKit rejects
	// `clipboard-write` by name and Firefox rejects `clipboard-read`, and on BOTH of those
	// `navigator.clipboard.writeText` resolves anyway — measured, with the BOM oracle's own body
	// passing on each. So there is nothing here to skip on. What keeps a silent clipboard
	// failure honest is `pasteDeck`'s assertion that the paste actually delivered, not a
	// permission probe standing in for one.
	await page
		.context()
		.grantPermissions(['clipboard-read', 'clipboard-write'])
		.catch(() => {});
	await gotoStudio(page);
	await revealEditor(page);
});

/** Click a rail slide, scrolling it into view first. The rail is a HORIZONTALLY scrolling
 *  strip, and the scroll this needs is horizontal — measured on `railButtons.nth(3)`, which
 *  moves x=845.7 → 620.7 at 820px and x=468 → 217 at 390px, with y unchanged both times; at
 *  1440px it does not move at all. An earlier version of this comment said the button "sits at
 *  the bottom edge" and described a vertical scroll, which was the wrong mechanism read off the
 *  right symptom. Playwright's own `.click()` already scrolls, so this adds little that can
 *  fail — it is here to make the intent explicit rather than to rescue a click. */
async function railClick(page: Page, index: number): Promise<void> {
	const button = railButtons(page).nth(index);
	await button.scrollIntoViewIfNeeded();
	await button.click();
}

/** The markdown pane is on screen by default at desktop AND tablet widths, and not on a phone,
 *  where the Studio's body is a single swappable Edit/Preview pane and the source sits behind
 *  its toggle. A no-op wherever the pane is already visible, so it cannot change what the
 *  desktop project has always measured — it exists so this file can be RUN at a narrow width
 *  and give an answer instead of timing out on a hidden element. */
async function revealEditor(page: Page): Promise<void> {
	const editor = page.locator(EDITOR).first();
	if (await editor.isVisible().catch(() => false)) return;
	// NOT-YET-PAINTED IS NOT HIDDEN. This runs after a reload as well as after the first
	// navigation, and at desktop the pane is briefly absent while the island hydrates — read
	// too eagerly, that looks exactly like a narrow layout keeping it behind its toggle. Wait
	// for it before concluding anything; the guard below is about a pane that never arrives.
	// (Caught by the guard itself, on its first run: two reload-based oracles went red.)
	if (
		await editor
			.waitFor({ state: 'visible', timeout: 5_000 })
			.then(() => true)
			.catch(() => false)
	)
		return;
	// A HIDDEN PANE IS ONLY EXPECTED WHERE THE STUDIO ACTUALLY HIDES ONE. Anywhere else,
	// reaching this line means something hid the editor — and quietly clicking it back would
	// REPAIR a regression and let every oracle in this file pass over the top. That is the
	// hazard this whole helper introduces, so it fails loudly instead.
	//
	// THE THRESHOLD IS 700, NOT 1100, and getting that wrong is how this guard shipped inert
	// across its most important width. `use-breakpoint.ts` puts the single swappable pane at
	// `max-width: 699px`; 1100 is where the Architect and Inspector stop being docked columns,
	// which has nothing to do with the source pane. A checker measured the difference against a
	// genuinely hidden pane: at 1099 and at 820 the old guard was silent and the toggle simply
	// repaired it — 820 being exactly the width this file now claims 10/10 for.
	//
	// A LANDSCAPE PHONE is the other legitimate case, and it is not width-based: wide (667–932)
	// but short, where the Studio locks to a full-bleed preview with no editor at all so the
	// software keyboard has nowhere to bury the caret. Same triad `use-breakpoint.ts` uses.
	const width = page.viewportSize()?.width ?? 0;
	const landscapePhone = await page.evaluate(() =>
		window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches,
	);
	expect(
		width < 700 || landscapePhone,
		`the deck source is not on screen at ${width}px, a width where the Studio shows it`,
	).toBe(true);
	const toggle = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (!(await toggle.count())) return;
	await toggle.click();
	await editor.waitFor({ state: 'visible' });
}

// ── A pasted BOM never reaches the deck source ──────────────────────────────
// The worst thing the walk found, because it is silent, durable, and arrives through the
// most ordinary act there is: pasting a deck someone sent you. Notepad, PowerShell `>` and
// Visual Studio all put a U+FEFF at the head of a file, and it defeats the `^---`
// front-matter anchor — so the front matter stops being front matter and parses as a setext
// heading instead. Measured on the pre-fix build with the SAME deck pasted twice:
//
//   clean  slide 1 renders `One body`, and the deck's `paginate: true` paints its mark
//   BOM    slide 1 renders `theme: indaco paginate: true` — the YAML itself, set as the
//          slide — and no pagination mark, because `paginate:` was never read
//
// It then persisted and survived a reload, so this was durable corruption of the author's
// source rather than a transient paint. `docs/src/lib/normalize-source-text.ts` names this
// exact defect class (#1349/#1388) and lists the boundaries that guard against it; the
// Studio's file-open door was on that list and its PASTE door was not.
test('@smoke a pasted BOM never reaches the deck source', async ({ page }) => {
	const DECK = '---\ntheme: indaco\npaginate: true\n---\n\n# One\n\nbody\n\n---\n\n# Two\n';
	await pasteDeck(page, BOM + DECK);

	// 1. The document is canonical.
	await expect.poll(() => editorDoc(page)).toBe(DECK);
	// 2. The front matter is front matter again: two slides, not one, and the first one
	//    renders the author's heading rather than their YAML.
	await expect(railButtons(page)).toHaveCount(2);
	await railClick(page, 0);
	await expect.poll(() => paintedText(page)).toContain('One');
	expect(await paintedText(page), 'the front matter must not be set as the slide').not.toContain('theme:');
	// 3. And what persists — the thing a reload and every export read — is canonical too.
	await expect.poll(() => persistedDeck(page)).toBe(DECK);
	// 4. And ⌘Z cannot put it back. `undo` dispatches with `filter: false`, so no transaction
	//    filter ever sees it — which is why the strip rides in the SAME transaction as the
	//    paste (`sequential: true`) rather than as its own step: there is no state for an undo
	//    to return to in which the BOM exists alone. Stated honestly, this arm PASSES on a
	//    build that drops the outward guard too, because the paste path is already closed by
	//    the merge; the door a filter structurally cannot cover is `EditorState.create`, and
	//    that has its own oracle below.
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => persistedDeck(page), { message: 'an undo put the BOM back into the deck source' }).not.toContain(BOM);
});

// THE DOOR A TRANSACTION FILTER CANNOT COVER. `EditorState.create` runs no filter, so a deck
// ALREADY STORED with a BOM — written before this landed, or by any path that reaches the
// store without passing through the editor — opened with the byte in place and rendered its
// front matter as the first slide, exactly as a paste did. Seeding the store and reloading is
// the only way to reach `create` with author text; the paste oracle above cannot get there,
// and this is the arm that fails without the seed-time strip.
test('a deck already STORED with a BOM opens canonical', async ({ page }) => {
	test.setTimeout(120_000); // two first paints
	const DECK = '---\ntheme: indaco\npaginate: true\n---\n\n# One\n\nbody\n\n---\n\n# Two\n';
	await setDeck(page, DECK);
	await expect.poll(() => persistedDeck(page)).toBe(DECK);

	// Put the BOM into the STORE, behind the editor's back, then reload into it.
	const wrote = await page.evaluate((bomDeck) => {
		const key = Object.keys(window.localStorage).find((k) => k.startsWith('lattice-studio-src-'));
		if (!key) return false;
		window.localStorage.setItem(key, JSON.stringify(bomDeck));
		return true;
	}, `${BOM}${DECK}`);
	expect(wrote, 'witness: the deck source key was there to seed').toBe(true);

	await page.reload();
	await revealEditor(page);
	await waitForStudioPaint(page);
	await page.locator(EDITOR).waitFor();

	await expect.poll(() => editorDoc(page), { message: 'a stored BOM survived into the open document' }).toBe(DECK);
	// …and the front matter is front matter again, rather than the deck's first slide.
	await expect(railButtons(page)).toHaveCount(2);
	await railClick(page, 0);
	// POLLED. The preview repaints asynchronously after a reload, so a single read here is a
	// race — and it read stale content once, which sent an earlier pass chasing a defect that
	// was not there.
	await expect.poll(() => paintedText(page), { message: 'the front matter was set as the slide' }).not.toContain('theme:');
});

// The other half of the same canonicalization contract, and it is a claim about a
// DEPENDENCY rather than about our code: CodeMirror folds CRLF *and* a lone classic-Mac CR
// at this same door, through `EditorState.lineSeparator`, so `Editor.tsx` does not repeat
// that half. Measured, not assumed — which is exactly why it is pinned here, and mutation 12
// in the findings note shows it can fail: pin `EditorState.lineSeparator.of('\n')` and this
// oracle goes red on its first arm with `CRLF reached the document`.
//
// WHAT BREAKS IF THE FOLD EVER STOPS is narrower than an earlier version of this comment
// claimed, and the difference is measured. It said a CR would make "the slide separator
// `\n-{3,}\n` stop matching, collapsing a deck to one slide". Neither half is true: this path
// has no such regex — `splitSlides` goes through `lib/core/slide-boundaries.mjs`, a markdown-it
// `hr` scan — and that scanner folds `\r\n|\r|\n` ITSELF, deliberately. Checked directly:
// `separatorRanges('# One\r\r---\r\r# Two\r')` and the LF spelling both return
// `[{index:7,length:4}]`, so the rail would still show two slides. The real damage is that the
// DOCUMENT and the persisted source stop being canonical — invariant 5, and the class
// `docs/src/lib/normalize-source-text.ts` exists to keep out, where a lone-CR deck does mis-split
// downstream through readers that anchor on `\r?\n`. So the `toHaveCount(2)` arm below witnesses
// that the deck is well formed; it is the `toBe(DECK)` arm that witnesses the fold.
test('CodeMirror folds CRLF and a lone CR at the same door', async ({ page }) => {
	const DECK = '# One\n\n---\n\n# Two\n';
	for (const [what, text] of [
		['CRLF', DECK.replace(/\n/g, '\r\n')],
		['a lone CR', DECK.replace(/\n/g, '\r')],
	] as const) {
		await pasteDeck(page, text);
		await expect.poll(() => editorDoc(page), { message: `${what} reached the document` }).toBe(DECK);
		await expect(railButtons(page)).toHaveCount(2);
	}
});

// ── The rail names the component the engine renders ─────────────────────────
// `lint.ts`'s `_class` regex was unanchored, so it matched a directive comment anywhere on
// any line — and the rail then labeled slides by a directive the render ignores. The walk
// reached it with one keystroke: a `.` typed at the end of the directive line, after which
// the rail went on saying `title` while the preview beside it painted `content`.
//
// This is a DIFFERENTIAL test and that is the point: the expected column is the ENGINE's
// answer, read off `render()`'s own `<section class>`, so the rail cannot drift away from
// the render again without this failing.
//
// HOW INDEPENDENT THE TWO SIDES ACTUALLY ARE — and this is weaker than an earlier version of
// this comment claimed, in a way the fix itself caused. It said "the rail's answer comes from a
// regex in `docs/src`, the preview's from markdown-it inside the iframe". That WAS true, and
// §2's fix is what ended it: deleting the hand-rolled regex means the rail now reads
// `lib/core/class-directive-scan.mjs`, which calls `readDirectiveComment` from
// `comment-directive.mjs` — and `lib/engine/slides.js:35` requires that same grammar through
// its CJS shim, saying so in its own comment ("a source-side reader … shares the parse instead
// of re-spelling it"). The two sides now share the GRAMMAR and differ only in the APPLICATION.
//
// So be precise about what this still catches. It catches application drift — which directive
// on a slide wins (row 6, the last, which is defect §3), which slice of the document the rail
// reads, propagation and container prefixes. It does NOT catch a grammar bug: if
// `readDirectiveComment` decided `<!-- _class: kpi -->.` were a directive, the rail and the
// engine would both say `kpi` and every row here would pass. That is HARD RULE #1's trade,
// taken deliberately — one parse means the rows 2–5 disagreement cannot RECUR rather than
// being detected — but a differential over a shared producer is the shape the Compose note's
// finding 11 warns about, and it is better written down here than rediscovered.
test('@smoke the rail names the component the engine actually renders', async ({ page }) => {
	const CASES: Array<[what: string, source: string, rail: string, painted: string]> = [
		['the plain shape', '<!-- _class: kpi -->\n\n# One\n', 'kpi', 'kpi'],
		// One stray character after the close. The engine stops seeing a directive; so must the rail.
		['one character after the close', '<!-- _class: kpi -->.\n\n# One\n', 'text', 'content'],
		['words after the close', '<!-- _class: kpi --> trailing\n\n# One\n', 'text', 'content'],
		['prose before the open', 'text <!-- _class: kpi -->\n\n# One\n', 'text', 'content'],
		// A deck that documents Lattice quotes a directive. That is a code sample, not an assignment.
		['a directive quoted in a fence', '```md\n<!-- _class: kpi -->\n```\n\n# One\n', 'text', 'content'],
		// Two directives on ONE slide — what deleting a `---` to merge two slides leaves
		// behind. The engine applies the LAST; the rail used to name the first, so it went on
		// naming the slide that had just been absorbed.
		['two directives on one slide', '<!-- _class: big-number -->\n\n- 0\n  - x\n\n<!-- _class: quote -->\n\ntext here\n', 'quote', 'quote'],
	];
	for (const [what, source, rail, painted] of CASES) {
		await setDeck(page, source);
		await expect.poll(() => railState(page).then((r) => r.cls), { message: `rail label — ${what}` }).toBe(rail);
		await expect.poll(() => paintedClasses(page), { message: `painted class — ${what}` }).toContain(painted);
	}
});

// ── Undo survives a trip through Compose ────────────────────────────────────
// The Studio mounts EITHER the markdown editor or Compose, never both, so switching panes
// destroyed the `EditorView` and CodeMirror's history went with it. Type, switch to
// Compose, switch back, press ⌘Z — nothing happened, and nothing said why. Not a lost fold
// or a lost scroll offset: the author's only route back from a mistake, removed by a
// two-click detour they took for an unrelated reason. `Editor.tsx` now carries the state
// (history field included) across the unmount.
//
// SELF-WITNESSING. The edit is made, the round trip is taken, and the undo is judged
// against the EDITED document — so an oracle that never actually edited, or never actually
// switched, fails rather than passing vacuously on a deck nothing touched.
test('@smoke undo still works after a trip through Compose and back', async ({ page }) => {
	const before = await editorDoc(page);
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('UNDOMARK');
	const edited = await editorDoc(page);
	expect(edited, 'witness: the edit landed').toContain('UNDOMARK');
	expect(edited).not.toBe(before);

	await toCompose(page);
	await toMarkdown(page);
	// Witness: the round trip really happened and brought the edit back with it.
	expect(await editorDoc(page)).toBe(edited);

	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => editorDoc(page), { message: '⌘Z did nothing — the history did not survive the pane switch' }).not.toContain('UNDOMARK');
});

// The BOUNDARY of that carry, pinned so it cannot widen by accident. Editing in Compose
// changes the document, and those changes are not in this editor's history — offering ⌘Z
// over them would undo the wrong thing. So the carry is guarded on the document being
// byte-identical, and a Compose edit DISCARDS it. This test asserts the honest outcome:
// the Compose edit stands, and one ⌘Z does not silently rewrite it.
test('a Compose edit deliberately drops the carried history', async ({ page }) => {
	await toCompose(page);
	await caretIntoComposeSlide(page, 0);
	await page.keyboard.type('COMPOSEMARK');
	await toMarkdown(page);
	const afterCompose = await editorDoc(page);
	expect(afterCompose, 'witness: the Compose edit reached the source').toContain('COMPOSEMARK');

	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+z');
	await page.keyboard.press('ControlOrMeta+z');
	expect(await editorDoc(page), 'a stale history must not be replayed over a Compose edit').toContain('COMPOSEMARK');
});

// ── The carried history belongs to ONE deck (pinned OFF this tier, deliberately) ──
// The fix for the undo carry above had a defect of its own — it was guarded on the document
// alone, and every new deck holds byte-identical template bytes, so deck A's history could
// be restored into deck B. An independent checker reproduced it against the real CodeMirror.
//
// THE ORACLES FOR IT ARE BELOW, and an earlier revision of this comment said there were none.
// That was true when #2064 shipped: two e2e attempts had PASSED against the broken guard and
// nobody could say why, so the pin stayed at the predicate (`editor-carry.test.ts`) rather than
// resting on a test that passed for an unestablished reason. The reason is established now —
// focus, not keys; see the block above the deck oracles — so the end-to-end pins land here.

// ── The inline Quick fix repairs the directive it underlines ───────────────
// DETERMINISTIC, and it exists because the fuzz walk could not cover this. The Quick fix was a
// walk op through three revisions and applied a fix zero times across seven seeds; the path it
// was meant to exercise — `findingsToDiagnostics`'s `onFix`, the button hanging off the inline
// diagnostic — therefore had no oracle at all while reading as though it had one.
//
// TWO THINGS THIS PINS THAT NOTHING ELSE DOES. The popup opens on a TIMER (`@codemirror/lint`
// carries `hoverTime: 300`), so a test that reads the action straight after hovering finds
// nothing — measured: 0 actions at the hover and at +200ms, 1 from +400ms. And the fix that
// lands has to be the one the underline promised, which is the same `suggestFor` agreement
// `Fix all` is gated on below.
test('the inline Quick fix applies the repair its underline promised', async ({ page }) => {
	await setDeck(page, '<!-- _class: kpii -->\n\n# One\n');
	const marker = page.locator('.cm-lint-marker').first();
	await marker.waitFor();
	await marker.hover();
	const action = page.locator('.cm-diagnosticAction').first();
	await action.waitFor();
	expect(await action.textContent(), 'the action must name the component it will write').toContain('kpi');
	await action.click();
	await expect
		.poll(() => editorDoc(page), { message: 'the Quick fix did not repair the directive' })
		.toContain('<!-- _class: kpi -->');
	expect(await editorDoc(page), 'the typo must be gone, not merely joined by the fix').not.toContain('kpii');
});

// ── "Fix all issues" is offered exactly when something can be fixed ─────────
// The shell gated the button on its own `unknownComponents` count while the button runs
// lint-core's `applyAllFixes`, which repairs a DIFFERENT set. Wrong in both directions, and
// both were reproduced on the built Studio:
//   · an unknown component too far from any real name for a suggestion → the button was
//     ENABLED and pressing it did nothing, silently;
//   · a card-style `- **Title.** body` on a `cards-grid` slide, with no unknown component →
//     the button was DISABLED while the underline beside it offered that very Quick fix.
// The editor now reports what its own lint pass found, and the gate is the FIXABLE count —
// so the toolbar offers precisely the batch of fixes the author can already see underlined.
test('Fix all is offered exactly when something can be fixed, and then it fixes it', async ({ page }) => {
	const fixAll = page.getByRole('button', { name: 'Fix all issues' }).first();

	// A finding with a machine fix and NO unknown component: offered, and it lands.
	await setDeck(page, '<!-- _class: cards-grid -->\n\n# Cards\n\n- **Alpha.** the body text\n');
	await expect.poll(() => fixAll.isEnabled(), { message: 'a fixable finding must offer Fix all' }).toBe(true);
	await fixAll.click();
	await expect.poll(() => editorDoc(page)).toContain('- Alpha\n  - the body text');

	// An unknown component with no near candidate: nothing to apply, so nothing is offered.
	await setDeck(page, '<!-- _class: zzznotacomponent -->\n\n# Stray\n');
	// Witness that the deck really is flagged — otherwise "disabled" would be true for the
	// uninteresting reason that the linter never ran.
	await expect(page.locator('.cm-lint-marker')).toHaveCount(1);
	await expect.poll(() => fixAll.isEnabled(), { message: 'an unfixable finding must not offer a dead button' }).toBe(false);

	// A near typo IS fixable, and the batch fixes it — the same suggestion the inline
	// Quick fix promises (`Fix: use “kpi”`).
	await setDeck(page, '<!-- _class: kpii -->\n\n# One\n');
	await expect.poll(() => fixAll.isEnabled()).toBe(true);
	await fixAll.click();
	await expect.poll(() => editorDoc(page)).toContain('<!-- _class: kpi -->');
});

// ── The walk itself ─────────────────────────────────────────────────────────
// A deterministic random walk (fixed seed, so a failure is replayable) over the ops an
// author actually reaches in the source pane, asserting the five structural invariants
// after every op. Deliberately NOT a script of one scenario: the defects above were found
// by ORDERS nobody would think to write down — a paste, a rail pick, a mode switch, then a
// stray keystroke on a directive line.
test('a randomized walk over the markdown-pane ops holds the structural invariants', async ({ page }) => {
	// Fixed seed. Every op DRAWS unconditionally before deciding whether it can act, so the
	// stream never depends on live DOM state — which is what makes a failure replayable
	// rather than merely reproducible-if-you-are-lucky. Scope, honestly: one seed at 34
	// steps is a REGRESSION NET, not the sweep that found the defects above (six seeds x 60
	// ops from a scratch harness). This is the part worth committing.
	let s = 20260905 >>> 0;
	const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
	const int = (n: number) => Math.floor(rnd() * n);
	const pick = <T,>(a: T[]): T => a[int(a.length)];

	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
	// How many times invariant 2 actually COMPARED something — see the assertion after the
	// loop for why a walk that only ever takes its escapes is a walk that certifies nothing.
	let invariant2Ran = 0;
	// Counted at the hover and at the click — the points of ACTION — because a count taken at
	// the top of the op would be a constant of the seed and could never move for a product
	// reason. Reported rather than asserted; the reasoning is at the report below.


	// Payloads an author really pastes, plus the two that carry the ingest hazards.
	const PAYLOADS = [
		'hello\r\nworld\r\n',
		`${BOM}---\ntheme: cuoio\n---\n\n# Pasted deck\n`,
		`${'x'.repeat(900)}\n`,
		'\n\n---\n\n<!-- _class: statement -->\n\n# Pasted slide\n',
		'| a | b |\n|---|---|\n| 1 | 2 |\n',
		'~~struck~~ and $e^{i\\pi}$\n',
		'<div>block html</div>\n',
		'* * *\n',
	];

	const ops: Record<string, () => Promise<void>> = {
		async type() {
			const line = int(40);
			// `zzznope` is unknown and UNFIXABLE — too far from any component for a suggestion —
			// and `kpii` is unknown and FIXABLE, one character off `kpi`. Keeping BOTH walks the
			// linter's two branches: a finding with a machine fix and one without. (The pair was
			// originally added for the Quick-fix op, which no longer exists; the payloads earn
			// their place without it, which is why they stayed when the op went.)
			const text = pick([
				'abc',
				'# H',
				'- item',
				'1. one',
				'> quote',
				'**b**',
				'`c`',
				'---',
				'éè 🎉',
				'<!-- _class: zzznope -->',
				'<!-- _class: kpii -->',
			]);
			await caretIntoLine(page, line);
			await page.keyboard.type(text);
		},
		async paste() {
			const payload = pick(PAYLOADS);
			await caretIntoLine(page, int(40));
			await page.evaluate((v) => navigator.clipboard.writeText(v).catch(() => {}), payload);
			await page.keyboard.press('ControlOrMeta+v');
		},
		async keys() {
			await page.keyboard.press(pick(['Backspace', 'Delete', 'Enter', 'Tab', 'Home', 'End', 'ArrowUp', 'ArrowDown']));
		},
		async undoRedo() {
			await page.keyboard.press(pick(['ControlOrMeta+z', 'ControlOrMeta+Shift+z', 'ControlOrMeta+z']));
		},
		async cutOrCopy() {
			await caretIntoLine(page, int(40));
			await page.keyboard.press('Home');
			await page.keyboard.press('Shift+ArrowDown');
			await page.keyboard.press(pick(['ControlOrMeta+x', 'ControlOrMeta+c']));
		},
		async selectAllReplace() {
			// Destructive on purpose — it is the two keystrokes that take a finished deck to a
			// blank one — but the walk puts it back, so one draw does not make every later step
			// a walk over an empty document.
			await focusEditor(page);
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.type(pick(['# Only', 'x']));
			await page.keyboard.press('ControlOrMeta+z');
			await page.keyboard.press('ControlOrMeta+z');
		},
		async frontMatter() {
			await focusEditor(page);
			await page.keyboard.press('ControlOrMeta+Home');
			await page.keyboard.type(pick(['---\ntheme: cuoio\n---\n', 'paginate: true\n', '---\n']));
		},
		async dropSeparator() {
			// Delete a `---` line, merging two slides. The direction no spec covered: every
			// existing one GROWS the deck, and shrinking is where a shown index can outrun it.
			const line = await page.evaluate(() => {
				// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror's view through its DOM handle.
				const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
				if (!v) return -1;
				const hits = v.state.doc
					.toString()
					.split('\n')
					.map((l: string, i: number) => (/^\s{0,3}-{3,}\s*$/.test(l) ? i : -1))
					.filter((i: number) => i >= 0);
				return hits.length ? hits[hits.length >> 1] : -1;
			});
			const rendered = page.locator(`${EDITOR} .cm-line`);
			// The draw already happened above; only the ACTION is conditional. CodeMirror renders
			// a viewport, so a separator scrolled out of view has no line to click — skipping it
			// is the walk being correct about the surface, not avoiding a bug.
			if (line < 0 || line >= (await rendered.count())) return;
			await caretIntoLine(page, line);
			await page.keyboard.press('Home');
			await page.keyboard.press('Shift+End');
			await page.keyboard.press('Delete');
		},
		async railPick() {
			// DRAWN BEFORE THE GUARD, like every other op. The walk's replayability depends on
			// the random stream never branching on live DOM state, and this op used to return on
			// an empty rail BEFORE consuming its draw — which desynchronizes every later step, so
			// the "fixed seed" replays a different walk. `dropSeparator` gets this right; this was
			// the one exception.
			const n = await railButtons(page).count();
			const which = int(Math.max(n, 1));
			if (!n) return;
			await railClick(page, which);
		},
		async paneSwitch() {
			await toCompose(page);
			await toMarkdown(page);
		},
		async scroll() {
			await page.locator(EDITOR).hover();
			await page.mouse.wheel(0, pick([-600, -200, 200, 600, 1800]));
		},
	};
	const names = Object.keys(ops);

	// Force the first persist — nothing is written on load, so invariant 1 has nothing to
	// read until an edit has happened.
	await caretIntoLine(page, 0);
	await page.keyboard.type('.');
	await expect.poll(() => persistedDeck(page)).not.toBe('');

	for (let step = 0; step < 34; step++) {
		const op = pick(names);
		await ops[op]();
		const doc = await editorDoc(page);

		// 1: what survives a reload is what you typed. POLLED — the persist debounces ~400ms.
		await expect.poll(() => persistedDeck(page), { message: `after "${op}": the persisted source never caught up with the document` }).toBe(doc);

		// 5: the document is canonical. Cheap, and it is the invariant the BOM defect broke.
		expect(doc.includes('\r'), `after "${op}": a CR reached the document`).toBe(false);
		expect(doc.startsWith(BOM), `after "${op}": a BOM reached the document`).toBe(false);

		// 3: the rail is a well-formed slide list.
		const rail = await railState(page);
		if (doc.trim()) {
			expect(rail.count, `after "${op}": the rail holds no slides`).toBeGreaterThan(0);
			expect(rail.index, `after "${op}": the rail's current index ${rail.index} is outside 0..${rail.count - 1}`).toBeGreaterThanOrEqual(0);
			expect(rail.index).toBeLessThan(rail.count);
		}

		// 2: the class the ENGINE painted is one the CURRENT SLIDE actually names — the
		// source-side directive reading against markdown-it's, across the iframe boundary.
		// This is the invariant that fired: a `.` typed after a directive's `-->`, after which
		// the source side still named `title` and the engine painted `content`.
		//
		// TWO CONCESSIONS TO A DIVERGENCE THIS CHANGE DOES NOT FIX, and they are stated here
		// rather than buried because a reader has to know what this invariant no longer claims.
		// A chunk the shell calls ONE slide can hold SEVERAL engine slides: `split: headings`
		// (the default register) divides a deck on its outline, and `lib/core/slide-boundaries.mjs`
		// models only `hr`. Measured — `# One / a / # Two / b / # Three / c` renders as THREE
		// sections and the Studio shows ONE. See the findings note; it is pre-existing, it is
		// not this change's, and it needs its own pass.
		//   · MEMBERSHIP, not equality: the painted class must be one the chunk NAMES, so a
		//     chunk that renders as several sections still passes whichever one is painted.
		//     A directive the engine does not honor is in no section, so the defect above
		//     still fails this.
		//   · SKIPPED when the chunk holds more than one heading, because there the painted
		//     section is a sub-slice that may name nothing at all. `headingsIn` is a PROXY for
		//     "would `split: headings` divide this?", and deliberately a generous one — it errs
		//     toward skipping, since a false red in a nightly walk teaches people to ignore it.
		//
		// BOTH SIDES ARE READ INSIDE THE POLL, and that is not tidiness. Reading the rail once
		// and then polling only the preview compares a SNAPSHOT against a moving target: typing
		// moves the caret, the rail follows it, and the assertion then waits fifteen seconds for
		// the preview to paint a slide the rail has left. Measured — it failed exactly that way,
		// naming two slides that were each correct at the moment they were read.
		await expect
			.poll(
				async () => {
					const now = await railState(page);
					const chunk = splitSlides(stripFrontMatter(await editorDoc(page)))[now.index];
					if (chunk === undefined) return 'ok'; // the deck moved under us; the next step re-checks
					if (headingsIn(chunk) > 1) return 'ok'; // the chunk holds more than one engine slide — see above
					const names = usedComponents(chunk);
					// No honored directive → the engine's own default, which it spells `content`.
					const allowed = names.length ? names : ['content'];
					const painted = await paintedClasses(page);
					if (!painted.length) return 'ok'; // nothing painted yet
					invariant2Ran++;
					return allowed.some((n) => painted.includes(n))
						? 'ok'
						: `slide #${now.index}/${now.count} names [${allowed.join(' ')}], the engine painted [${painted.join(' ')}]`;
				},
				{ message: `after "${op}": the engine painted a component the slide does not name` },
			)
			.toBe('ok');

		expect(errors, `after "${op}"`).toEqual([]);
	}

	// The walk is only as good as the invariant that fired for it. Invariant 2 has three
	// legitimate escapes — a chunk that moved under the read, a chunk holding more than one
	// heading, and a frame that has not painted — and `paintedClasses` swallows an unreachable
	// frame to `[]`, so all 34 steps could take an escape and the walk would report success
	// having compared nothing. This is the assertion that the net was actually in the water.
	expect(invariant2Ran, 'invariant 2 never compared the source against a painted slide').toBeGreaterThan(10);
});

// ── The persisted source is what a reload reads back ────────────────────────
// Invariant 1 of the walk, as a standalone oracle over a full round trip: nothing in the
// suite asserted that the deck source survives a reload BYTE-FOR-BYTE (every existing
// persistence assertion uses `toContain`), so a normalization applied on one side of the
// store and not the other would have gone unnoticed.
test('the deck source survives a reload byte for byte', async ({ page }) => {
	test.setTimeout(120_000); // two first paints
	const DECK = '---\ntheme: indaco\n---\n\n<!-- _class: kpi -->\n\n# One\n\n- 42\n  - answers\n\n---\n\n# Two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
	await setDeck(page, DECK);
	await expect.poll(() => persistedDeck(page)).toBe(DECK);
	await expect(railButtons(page)).toHaveCount(2);

	await page.reload();
	await revealEditor(page);
	await waitForStudioPaint(page);
	await page.locator(EDITOR).waitFor();
	await expect.poll(() => editorDoc(page)).toBe(DECK);
	await expect(railButtons(page)).toHaveCount(2);
});

// ── The undo history belongs to ONE deck ───────────────────────────────────
// The worst defect in this file's subject area, PRE-EXISTING, and reachable in one keystroke
// with no Compose detour: the editor used to survive a deck switch (its init effect was keyed
// on `[known]` alone), so the whole-document replace that swaps deck A's text for deck B's was
// just another history event. Measured before the fix — create a new deck, press ⌘Z once, and
// deck A's entire 1,933-character document is sitting in deck B, and `onChange` carries it
// into deck B's source from there. Each deck now gets its own editor, so its history is empty.
//
// THIS ORACLE FAILED ~1 RUN IN 10, and only in the full file at two workers — never in
// isolation. Two earlier fixes were declared green on that nothing. If it goes red again, the
// failure is the product's and the load is what exposed it: re-read the deck-history section of
// `2026-09-05-markdown-pane-fuzz-findings.md` before touching the test.
//
// REDO IS `Ctrl+Shift+Z`, and the two wrong answers that came before it are why every oracle
// below witnesses FOCUS before it presses anything. An earlier revision of this comment said
// redo is `Ctrl+Y` and that `Ctrl+Shift+Z` therefore performs a second UNDO, because the
// `linux: "Ctrl-Shift-z"` binding is "not active in a headless context". Measured, that is
// false: `navigator.platform` reads `Linux x86_64` in headless Chromium, the linux branch IS
// live, and typing then `Ctrl+Z` then `Ctrl+Shift+Z` restores the edit on Chromium, WebKit and
// Firefox alike. The revision before THAT said redo does not fire here at all. What actually
// makes a redo go nowhere is focus: after a Compose→Markdown switch `activeElement` is the
// `Markdown source` toggle BUTTON, so a bare chord reaches no editor. `focusEditor` is the fix
// and it is not optional — an oracle that omits it goes green against a broken guard.
test('@smoke a new deck does not inherit the previous deck’s undo history', async ({ page }) => {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('DECKALEAK');
	await expect.poll(() => editorDoc(page)).toContain('DECKALEAK');
	const deckA = await editorDoc(page);

	await newDeck(page);
	const deckB = await editorDoc(page);
	expect(deckB, 'witness: a different deck really opened').not.toBe(deckA);
	expect(deckB).not.toContain('DECKALEAK');

	// Undo repeatedly. Deck B's own history is empty, so every one of these is a no-op — and
	// before the fix the FIRST of them replaced deck B's document with deck A's.
	await focusEditor(page);
	for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+z');
	const after = await editorDoc(page);
	expect(after, 'an undo pulled the previous deck’s edit into this deck').not.toContain('DECKALEAK');
	expect(after, 'an undo replaced this deck’s document with the previous deck’s').toBe(deckB);

	// …and redo (the real binding) cannot bring it back either.
	// ONE press, not two, and this cost a vacuous oracle to learn. `Ctrl+Shift+Z` redoes while
	// there is something to redo; with the redo stack EMPTY the same chord falls through to the
	// base `Mod-z` and UNDOES. So a second press puts back exactly what the first replayed, and
	// the assertion below then reads a clean document and passes — measured against a build with
	// the guard removed: redo #1 took the document 82 → 91 chars with the leaked text in it,
	// redo #2 took it straight back to 82. That fallthrough is real; it is NOT, as an earlier
	// account had it, the reason a redo "does not fire" (see the block above the deck oracles).
	await page.keyboard.press('ControlOrMeta+Shift+z');
	expect(await editorDoc(page), 'a redo replayed the previous deck’s edit into this deck').not.toContain('DECKALEAK');
});

// ── A DECK SWITCH LEAVES NO CONTROL POINTING AT THE DECK YOU LEFT ──────────
// The second defect the per-deck rebuild introduced, and the first one's twin: the editor's
// latest-refs belong to the COMPONENT, not the view, so a rebuild left them holding the OLD
// view's answers — and the update listener only emits on a CHANGE, so nothing corrected them.
// Select text in one deck, create another, and "Refine" is still offered over a deck with
// nothing selected; pressing it answers "Select some text in the editor to refine first."
// Exactly the shape of the Fix-all gate this same PR fixed, so shipping it would have been
// the same defect walking back in through the fix for another one.
test('a deck switch withdraws a control that pointed at the deck you left', async ({ page }) => {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+a');
	const refine = page.getByRole('button', { name: /Refine/i });
	await expect(refine, 'witness: Refine is offered when there IS a selection').toBeVisible();

	await newDeck(page);
	expect(
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
			return ((document.querySelector('.cm-content') as any)?.cmTile?.root?.view?.state?.selection?.main?.empty ?? null);
		}),
		'witness: the new deck really has an empty selection',
	).toBe(true);
	await expect(refine, 'Refine is offered over a deck with nothing selected').toBeHidden();
});

// AND BACK AGAIN — the return leg, which is where withdrawing on the way out inverted the
// defect it was fixing. A Compose round trip REMOUNTS the editor and the carry restores its
// state, selection included; the teardown had just told the shell there was none, and nothing
// put it back. Measured on the built Studio before this pair was separated: the view held
// selection 0–1924 and the toolbar had no Refine button at all — the same dead control as the
// case above, wearing the opposite sign. The two legs have to be asserted together or a fix for
// one silently becomes the other.
test('coming back from Compose restores the control its selection gates', async ({ page }) => {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+a');
	const refine = page.getByRole('button', { name: /Refine/i });
	await expect(refine, 'witness: Refine is offered when there IS a selection').toBeVisible();

	await toCompose(page);
	await toMarkdown(page);

	const restored = await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
		const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		return v ? v.state.selection.main.empty : null;
	});
	expect(restored, 'witness: the carry really brought a live selection back').toBe(false);
	await expect(refine, 'the editor holds a selection and its control is gone').toBeVisible();
});

// The same control through the OTHER door. `Refine` lives in the toolbar band ABOVE both
// editors, so it stays on screen when the markdown pane is swapped for Compose — and the shell's
// `hasSelection` is fed only by the editor that just went away. Pre-existing rather than caused
// by this PR, but it is the same control, the same channel and the same dead-button symptom as
// the case above, so it is fixed here rather than filed (#18, on-path). The teardown now
// withdraws the selection the way it already withdrew the lint counts.
test('leaving the markdown pane withdraws the control its selection was gating', async ({ page }) => {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+a');
	const refine = page.getByRole('button', { name: /Refine/i });
	await expect(refine, 'witness: Refine is offered when there IS a selection').toBeVisible();

	await toCompose(page);
	expect(await page.locator(EDITOR).count(), 'witness: the markdown editor really is gone').toBe(0);
	await expect(refine, 'Refine is offered over an editor that no longer exists').toBeHidden();
});

// THE SAME INVARIANT WITH NO COMPOSE DETOUR, and this one exists because the fix above had a
// defect of its own that neither of the other two deck oracles could see. Making a deck switch
// rebuild the view also makes it run the teardown that saves the editor state for a Compose
// round trip — and that teardown used to stamp the deck id from the CURRENT render, which by
// then is the deck being switched TO. Key half satisfied by construction, document half
// satisfied because two fresh decks hold byte-identical template bytes, so deck A's whole
// history was restored into deck B and one redo put text typed in A into B's saved source,
// surviving a reload. A checker found it; the `@smoke` oracle above misses it because the tour
// deck's bytes never match a template, and the Compose oracle below misses it because going
// through Compose is what makes the two ids agree again.
test('an undo history does not cross decks WITHOUT a Compose detour', async ({ page }) => {
	await newDeck(page); // deck A, holding the new-deck template
	const template = await editorDoc(page);

	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('CARRYLEAK');
	await expect.poll(() => editorDoc(page)).toContain('CARRYLEAK');
	await page.keyboard.press('ControlOrMeta+z');
	// Witness: the edit sits in the REDO branch and the document is back to the template, which
	// is what makes deck A's bytes match deck B's and any document-only guard fire.
	await expect.poll(() => editorDoc(page)).toBe(template);

	await newDeck(page); // deck B — same bytes, different deck, and NO Compose in between
	// TWO witnesses, because the bytes alone cannot tell deck B apart from deck A undone back to
	// the template — which is the whole premise of this case. The deck INDEX says a new deck
	// exists (`newDeck` polls for that); the caret says the editor has caught up. Note what the
	// second one does and does not prove: a caret at 0 does NOT distinguish "rebuilt" from
	// "value-synced" — the pre-fix path also dispatched `selection: { anchor: 0 }` — but it does
	// exclude the state this case would otherwise pass in for the wrong reason, deck A's own view
	// still sitting at the document end after the ⌘End / type / undo above.
	expect(await editorDoc(page), 'witness: deck B holds the same bytes deck A did').toBe(template);
	expect(
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
			const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
			return v ? v.state.selection.main.head : -1;
		}),
		'witness: a rebuilt editor, its caret at the top of the new deck',
	).toBe(0);

	await focusEditor(page);
	// ONE press, not two, and this cost a vacuous oracle to learn. `Ctrl+Shift+Z` redoes while
	// there is something to redo; with the redo stack EMPTY the same chord falls through to the
	// base `Mod-z` and UNDOES. So a second press puts back exactly what the first replayed, and
	// the assertion below then reads a clean document and passes — measured against a build with
	// the guard removed: redo #1 took the document 82 → 91 chars with the leaked text in it,
	// redo #2 took it straight back to 82. That fallthrough is real; it is NOT, as an earlier
	// account had it, the reason a redo "does not fire" (see the block above the deck oracles).
	await page.keyboard.press('ControlOrMeta+Shift+z');
	expect(await editorDoc(page), 'a redo replayed another deck’s edit into this one').not.toContain('CARRYLEAK');
	// …and it did not reach the autosave either, which is the durable half of the harm.
	await expect
		.poll(() => persistedDeck(page), { message: 'another deck’s edit reached this deck’s saved source' })
		.not.toContain('CARRYLEAK');
});

// The same invariant across the OTHER route — the Compose round trip, where the editor
// unmounts and its state is carried by hand. Two new decks, because the carry is guarded on
// the document and `newDeckSource()` is deterministic, so this is the one shape where two
// different decks hold identical bytes.
test('the carried history does not cross decks either', async ({ page }) => {
	await newDeck(page); // deck A, holding the new-deck template
	const template = await editorDoc(page);

	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('CARRYLEAK');
	await expect.poll(() => editorDoc(page)).toContain('CARRYLEAK');
	await page.keyboard.press('ControlOrMeta+z');
	// Witness: the edit is in the REDO branch, and the document is back to the template —
	// which is what makes deck A's bytes match deck B's and the carry's guard fire.
	await expect.poll(() => editorDoc(page)).toBe(template);

	await toCompose(page); // unmounts the editor; the carry is taken here
	await newDeck(page); // deck B — same bytes, different deck
	await toMarkdown(page);
	expect(await editorDoc(page), 'witness: deck B holds the same bytes deck A did').toBe(template);

	await focusEditor(page);
	// ONE press, not two, and this cost a vacuous oracle to learn. `Ctrl+Shift+Z` redoes while
	// there is something to redo; with the redo stack EMPTY the same chord falls through to the
	// base `Mod-z` and UNDOES. So a second press puts back exactly what the first replayed, and
	// the assertion below then reads a clean document and passes — measured against a build with
	// the guard removed: redo #1 took the document 82 → 91 chars with the leaked text in it,
	// redo #2 took it straight back to 82. That fallthrough is real; it is NOT, as an earlier
	// account had it, the reason a redo "does not fire" (see the block above the deck oracles).
	await page.keyboard.press('ControlOrMeta+Shift+z');
	expect(await editorDoc(page), 'a redo replayed another deck’s edit into this one').not.toContain('CARRYLEAK');
});
