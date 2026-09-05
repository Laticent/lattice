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
 * WHY THE UNIT TIER COULD NOT SEE ANY OF IT, stated plainly because it is the same class
 * of blind spot that let eight Compose defects through: `Editor.tsx` degrades to a plain
 * `<textarea>` when CodeMirror cannot construct, and CodeMirror cannot construct in jsdom.
 * So every jsdom test that "exercises the editor" exercises the FALLBACK. It has no
 * linter, no history, no transaction filters and no `EditorView` — which is to say none of
 * the four defects below is reachable from that tier at all. 1825 studio unit tests were
 * green over every one of them.
 *
 * WHAT THE WALK DID. It drove twelve op families against the shipped Studio in random
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
 * itself. Each of these reads a DIFFERENT producer:
 *   1. The editor document equals the persisted source. CodeMirror's own `EditorState`
 *      against the shell's React state → debounce → `localStorage`. What survives a reload
 *      is what you typed.
 *   2. The rail's component label equals the class the ENGINE painted on the slide. A
 *      regex in `lint.ts` against markdown-it's directive parse inside the preview iframe.
 *      THIS IS THE ONE THAT FIRED, on a keystroke as ordinary as a stray `.`.
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
 * TRAPS, all paid for once already:
 *   · `.click()` resolves before CodeMirror moves its selection. `caretIntoLine` clicks and
 *     then POLLS the view's own `selection.main.head` — the CodeMirror version of
 *     `compose-stress.spec.ts`'s `caretInto`, and for the same measured reason.
 *   · The persisted value is JSON-encoded. `persistedSource` returns the raw string; every
 *     comparison here goes through `persistedDeck`, which decodes it. Nothing else in the
 *     suite has had to notice, because every other caller uses `toContain`.
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
	await page.evaluate((v) => navigator.clipboard.writeText(v).catch(() => {}), text);
	await page.keyboard.press('ControlOrMeta+v');
	await expect.poll(() => editorDoc(page), { message: 'the paste never reached the document' }).not.toBe('');
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
	// Granted for EVERY test, not per-test: the paste helper writes the clipboard through
	// `navigator.clipboard`, which REJECTS without the permission — and the catch swallows
	// it, so an ungranted test does not error, it silently pastes nothing.
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await gotoStudio(page);
});

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
	await railButtons(page).nth(0).click();
	await expect.poll(() => paintedText(page)).toContain('One');
	expect(await paintedText(page), 'the front matter must not be set as the slide').not.toContain('theme:');
	// 3. And what persists — the thing a reload and every export read — is canonical too.
	await expect.poll(() => persistedDeck(page)).toBe(DECK);
});

// The other half of the same canonicalization contract, and it is a claim about a
// DEPENDENCY rather than about our code: CodeMirror folds CRLF *and* a lone classic-Mac CR
// at this same door, through `EditorState.lineSeparator`, so `Editor.tsx` does not repeat
// that half. Measured, not assumed — which is exactly why it is pinned here. If a
// CodeMirror upgrade ever stopped folding, a CR would reach the deck source and the slide
// separator `\n-{3,}\n` would stop matching, collapsing a deck to one slide; this goes red
// rather than the comment in `Editor.tsx` going quietly stale.
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
// any line — and the rail then labelled slides by a directive the render ignores. The walk
// reached it with one keystroke: a `.` typed at the end of the directive line, after which
// the rail went on saying `title` while the preview beside it painted `content`.
//
// This is a DIFFERENTIAL test and that is the point: the expected column is the ENGINE's
// answer, read off `render()`'s own `<section class>`, so the rail cannot drift away from
// the render again without this failing. The independence is real — the rail's answer comes
// from a regex in `docs/src`, the preview's from markdown-it inside the iframe.
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
			const text = pick(['abc', '# H', '- item', '1. one', '> quote', '**b**', '`c`', '---', 'éè 🎉', '<!-- _class: zzznope -->']);
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
		async quickFix() {
			const marker = page.locator('.cm-lint-marker').first();
			if (!(await marker.count())) return;
			await marker.hover();
			const action = page.locator('.cm-diagnosticAction').first();
			if (await action.count()) await action.click();
		},
		async railPick() {
			const n = await railButtons(page).count();
			if (!n) return;
			await railButtons(page).nth(int(n)).click();
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
					return allowed.some((n) => painted.includes(n))
						? 'ok'
						: `slide #${now.index}/${now.count} names [${allowed.join(' ')}], the engine painted [${painted.join(' ')}]`;
				},
				{ message: `after "${op}": the engine painted a component the slide does not name` },
			)
			.toBe('ok');

		expect(errors, `after "${op}"`).toEqual([]);
	}
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
	await waitForStudioPaint(page);
	await page.locator(EDITOR).waitFor();
	await expect.poll(() => editorDoc(page)).toBe(DECK);
	await expect(railButtons(page)).toHaveCount(2);
});
