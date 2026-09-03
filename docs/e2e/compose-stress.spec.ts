import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, railButtons, slideCount, test } from './studio-fixture';

/**
 * COMPOSE — the stress tier.
 *
 * Compose is the Studio's gateway for authors who will never open the Markdown
 * pane, so a defect here is not a rough edge: it is the whole surface. This file
 * is the oracle set that a randomized fuzz walk over the real Studio turned up —
 * every `test` below started as a reproduction, not as a guess about what might
 * break.
 *
 * WHAT THE FUZZ WALK DID, and why these oracles are the ones worth keeping: it
 * drove eleven op families against the shipped Studio in random order (type,
 * boundary keys, collapse, insert table, delete via the divider, the rail's
 * add/duplicate/move/step, pick a slide, insert from the gallery, select +
 * copy/cut/paste, wheel-scroll, and Markdown↔Compose round trips), asserting four
 * invariants after every single op. Those four are the `structural invariants`
 * test at the bottom; the named tests above it pin the specific defects the walk
 * found, because a fuzz failure tells you a deck broke but not which keystroke
 * broke it.
 *
 * The four invariants, and what each one caught:
 *   1. Compose's slide count == the rail's.
 *   2. Compose's slide count == the persisted SOURCE's.
 *   3. Every slide in the source still carries a `_class` directive. This is the
 *      one that fired: copy/paste re-created slide nodes through the clipboard's
 *      DOM round trip, which did not carry the `directives` attr, so a paste
 *      flattened every slide it touched to an unstyled `content`.
 *   4. `aria-expanded` on each collapse cap agrees with the `cs-collapsed` class.
 *
 * WHERE THESE RUN, and why it is a split rather than all-or-nothing. The whole
 * file runs in the nightly E2E tier (`studio-e2e-nightly.yml`, 04:41 UTC, which
 * greps out only `@perf`): 14 tests on `desktop`, plus the `@parity` one on the
 * three touch projects, 17 runs in total. But a net that only fires at 04:41 lets
 * a regression sit on `main` for up to a day, and the three defects below are
 * SILENT DATA LOSS or the two things a human actually reported — so those three
 * carry `@smoke` and run on the PR gate (`studio-smoke` → `--project=desktop
 * --grep @smoke`). Cost, measured ON THE RUNNER rather than locally, because that is the
 * surface the claim is about: the tier went from 40 tests to 43, the three added 17.5s of
 * test time (5.4 + 4.2 + 7.9), and `studio-smoke` ran 358s end to end against a worst
 * observed 829s. Take the runner's number, not a local one — the same three measured 12.9s
 * on a 4-core sandbox, which would have understated the real cost by a third.
 *
 * The rest stay nightly on purpose. The 34-step fuzz walk is the expensive one and
 * its value is breadth over time, not per-PR latency; the remaining oracles pin
 * defects that fail loudly rather than silently. If you add an oracle for a defect
 * that loses an author's work without telling them, tag it `@smoke` too.
 */

const COMPOSE = 'Compose — rich editor';

/** Switch the edit pane to Compose and wait for the ProseMirror surface to mount. */
async function toCompose(page: Page): Promise<void> {
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

/** One `_class` name per slide, read from the persisted deck source. `∅` = the slide
 *  has no `_class` at all, which is the shape of a component assignment that got lost. */
async function slideClasses(page: Page): Promise<string[]> {
	const src = await persistedSource(page);
	if (!src) return [];
	// The persisted value is JSON; front-matter is stripped before the slide split so a
	// deck that opens with `---\n…\n---` does not read as an extra separator.
	let text = src;
	try {
		const v = JSON.parse(src);
		if (typeof v === 'string') text = v;
	} catch {
		/* already a bare string */
	}
	return text
		.replace(/^---\n[\s\S]*?\n---\n/, '')
		.split('\n\n---\n\n')
		.map((chunk) => chunk.match(/<!--\s*_class:\s*([\w-]+)/)?.[1] ?? '∅');
}

/** Force the first persist so `slideClasses` has something to read (nothing is written on load). */
async function seedPersistence(page: Page): Promise<void> {
	await caretInto(page, 0);
	await page.keyboard.type('.');
	await expect.poll(() => slideClasses(page)).not.toHaveLength(0);
}

function composeSlide(page: Page, i: number) {
	return page.locator('.cs-slide').nth(i);
}
function slideContent(page: Page, i: number) {
	return composeSlide(page, i).locator('.cs-slide-content').first();
}
function collapseCap(page: Page, i: number) {
	return composeSlide(page, i).locator('.cs-sc-cap').first();
}
/**
 * Copy the current selection and wait until THIS copy is on the clipboard.
 *
 * Three traps, all hit on this file. (1) Firing ⌘V straight after ⌘C pastes before the
 * system clipboard has the copy, so the deck is untouched and an oracle that only checks
 * "nothing was lost" passes vacuously. (2) Polling for a NON-EMPTY clipboard is satisfied by
 * the PREVIOUS test's contents — the clipboard is shared across the whole browser — so the
 * wait looks like a wait and is not one. (3) Polling for a marker read from `innerText`
 * compares the RENDERED text against the SOURCE text, and Compose upper-cases the eyebrow in
 * CSS: the clipboard held "Why Lattice" while the marker said "WHY LATTICE", and a correct
 * copy timed out.
 *
 * So: wait for the clipboard to CHANGE from what it held before this copy. Specific to this
 * copy, and blind to how the text is cased on screen.
 */
const CLIP_SENTINEL = '__lattice-e2e-cleared__';
async function copyAndSettle(page: Page): Promise<void> {
	// WAIT FOR A NON-EMPTY SELECTION FIRST. ⌘C on a collapsed caret copies nothing, the
	// sentinel below never clears, and the failure reads "the clipboard never took this copy"
	// — which blames the clipboard for a selection that had not landed yet. This is the
	// difference between an oracle that is usually right and one that always is, and a
	// nightly tier that goes red once in a while is the same disease as an oracle that is
	// green for the wrong reason: nobody trusts either.
	await expect
		.poll(() => page.evaluate(() => (getSelection()?.toString() ?? '').length), { message: 'the selection never became non-empty, so there was nothing to copy' })
		.toBeGreaterThan(0);
	// CLEAR SECOND, then copy, then wait for the sentinel to be gone. Comparing against
	// whatever the clipboard held before works until two tests copy the same text; clearing
	// makes "not the sentinel" mean "this copy" unconditionally.
	await page.evaluate((v) => navigator.clipboard.writeText(v).catch(() => {}), CLIP_SENTINEL);
	await page.keyboard.press('ControlOrMeta+c');
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText().catch(() => CLIP_SENTINEL)), { message: 'the clipboard never took this copy' })
		.not.toBe(CLIP_SENTINEL);
}

/** The indices of every folded slide, straight off the DOM. */
function collapsedIndices(page: Page): Promise<number[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('.cs-slide')].map((s, i) => (s.classList.contains('cs-collapsed') ? i : -1)).filter((i) => i >= 0),
	);
}
/** The rail's currently-selected slide — what the preview is showing. */
function railCurrent(page: Page): Promise<number> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Slide navigator"] button')].findIndex(
			(b) => b.getAttribute('aria-current') === 'true' || b.getAttribute('aria-pressed') === 'true' || b.dataset.active === 'true',
		),
	);
}

/** The index of the slide the caret is in (Compose lights it `cs-slide-active`). */
function activeSlide(page: Page): Promise<number> {
	return page.evaluate(() => [...document.querySelectorAll('.cs-slide')].findIndex((s) => s.classList.contains('cs-slide-active')));
}

/** Put the caret in slide `i` and WITNESS that it landed before returning.
 *
 *  `.click()` resolves once the click has been dispatched, not once ProseMirror has moved
 *  its selection — so a keystroke sent on the next line can still be delivered to the
 *  PREVIOUSLY focused slide. That is not a theoretical gap: at 2 workers on 4 cores (the
 *  CI shape) the paste oracle below failed 3 runs out of 4, and the failure diff named the
 *  mechanism outright — it expected slide 4's text and received slide 0's, because the
 *  `⌘A` after the click had selected the slide the caret had not yet left. Serially it
 *  passed every time, which is exactly how a load-sensitive oracle earns the "flake" label
 *  and then gets ignored.
 *
 *  So this is the ONE way this file places a caret, including at the sites where nothing
 *  is typed afterwards. Uniformity is the point: a `.click()` with no witness is the shape
 *  that has to be absent for the next reader to trust the file, and where the caret does
 *  not matter the poll is already true and costs nothing. */
async function caretInto(page: Page, i: number): Promise<void> {
	await slideContent(page, i).click();
	await expect.poll(() => activeSlide(page), { message: `the caret never landed in slide ${i}` }).toBe(i);
}

test.beforeEach(async ({ page }) => {
	// Clipboard permission for EVERY test, not per-test. `copyAndSettle` polls
	// `navigator.clipboard.readText()`, which REJECTS without it — and the poll catches the
	// rejection to `''`, so an ungranted test does not error, it just never observes its own
	// copy and times out blaming the clipboard. Granting once here removes the whole class.
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await gotoStudio(page);
	await toCompose(page);
});

// ── Component assignment survives the clipboard ─────────────────────────────
// The worst thing the fuzz walk found, because it is silent, total, and two
// keystrokes an author reaches by habit. A slide's `_class` lives in the slide
// node's `directives` attr, and `toDOM`/`parseDOM` — the CLIPBOARD contract, since
// ProseMirror serializes a copied slice through the schema rather than the
// nodeView — did not carry it. So a paste re-created every slide it covered with
// `directives: []`: seven boardroom components flattened to seven unstyled
// `content` slides, with nothing on screen to say so. deck-doc.ts now bridges the
// attr through a `data-directives` attribute.
// SELF-WITNESSING, deliberately. An oracle that copies and pastes back-to-back and then
// asserts "nothing changed" passes just as happily when the paste never happened — and it
// did not, against the very build this test exists to catch: the ⌘V fired before the
// clipboard had the copy, the deck was untouched, and the assertion was vacuously true.
// So the deck is DELETED between the copy and the paste. The empty deck is the witness
// that the clipboard really carried something, and restoring it is what exercises the
// slide-node round trip this defect lived in.
test('@smoke copying the whole deck and pasting it back keeps every slide’s component', async ({ page }) => {
	await seedPersistence(page);
	const before = await slideClasses(page);
	expect(before.length).toBeGreaterThan(3); // the seed deck, not a degenerate one
	expect(before).not.toContain('∅');

	await caretInto(page, 2);
	await page.keyboard.press('ControlOrMeta+a'); // this slide
	await page.keyboard.press('ControlOrMeta+a'); // escalate to the whole deck
	await copyAndSettle(page);
	await page.keyboard.press('Delete');
	// Witness: the deck is gone. Compose keeps ONE empty slide (its schema is `slide+`, so
	// the document cannot be empty) while the rail shows none — an empty deck genuinely has
	// no slides, and the Markdown pane reaches the identical state on its own select-all +
	// Delete, so this is the shell's shape for "empty", not something Compose does.
	await expect(page.locator('.cs-slide')).toHaveCount(1);
	// `.cs-slide-content`, not `.cs-slide` — the latter includes the divider bar, whose
	// register buttons read as text ("H1H2❦—").
	await expect(slideContent(page, 0)).toHaveText('');

	await page.keyboard.press('ControlOrMeta+v');
	await expect(railButtons(page)).toHaveCount(before.length); // witness: the clipboard held it

	await expect.poll(() => slideClasses(page)).toEqual(before);
});

// The same defect at one-slide scale: ⌘A inside a slide, copy, then paste over
// another slide's ⌘A selection. The destination used to end up classless; it now
// takes the COPIED slide's class, which is the coherent reading — a full-slide
// slice replaces the slide node, so pasting a slide over a slide gives you that
// slide. What must never happen again is the third outcome: no class at all.
test('pasting one slide over another never leaves a slide without a component', async ({ page }) => {
	await seedPersistence(page);
	const before = await slideClasses(page);
	const copied = await slideContent(page, 4).innerText();

	await caretInto(page, 4);
	await page.keyboard.press('ControlOrMeta+a');
	await copyAndSettle(page);
	await caretInto(page, 1);
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+v');

	// Witness the paste by its TEXT before judging its class — see the note above.
	await expect.poll(() => slideContent(page, 1).innerText()).toBe(copied);
	await expect.poll(() => slideClasses(page)).not.toContain('∅');
	expect(await slideClasses(page)).toHaveLength(before.length); // and no slide was merged away
});

// ── A paste may GROW the deck ───────────────────────────────────────────────
// The structural guard reads the pre-transaction SELECTION to tell a deliberate
// cross-slide edit from an accidental Backspace-merge at a slide join. Sound for a
// keystroke, wrong for a paste: an author who put slides on the clipboard and
// pressed ⌘V has already declared intent, and judging that by the caret rejected
// every multi-slide paste there is. Measured before the fix: a seven-slide
// clipboard pasted at a caret, over one slide's selection, and into an emptied
// deck all left the deck exactly as it was, with no message. The guard now exempts
// a paste/drop — AFTER the locked-slide check, which a paste still may not bypass.
test('pasting a multi-slide clipboard over one slide grows the deck', async ({ page }) => {
	const n = await slideCount(page);

	await caretInto(page, 2);
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+a'); // the whole deck
	await copyAndSettle(page);

	await caretInto(page, 1);
	await page.keyboard.press('ControlOrMeta+a'); // this slide only
	await page.keyboard.press('ControlOrMeta+v');

	// n slides replaced 1, so the deck is n + (n - 1) long. The assertion that matters is
	// simply that it GREW: before the fix this stayed at n, silently.
	await expect(railButtons(page)).toHaveCount(n + n - 1);
	await expect.poll(() => slideClasses(page)).not.toContain('∅');
});

// ── The clipboard bridge does not trust foreign HTML ────────────────────────
// That property is pinned at the PARSER, in `docs/src/lib/compose/deck-doc.clipboard.test.ts`,
// which fails on the mutation (the beacon URL and a forged `<style>` reach the deck source)
// and passes on the fix.
//
// An earlier note here claimed an e2e version "could not be made to fail even with both gates
// removed". That was true of MY attempt and false as a general statement — the checker pass
// built a working one, injecting through a real `ClipboardItem({'text/html': …})` plus ⌘V, and
// measured it dirty on the pre-fix build and clean on the fix. The claim is corrected rather
// than the test added: the parser is the seam, a unit test there is deterministic where the
// system clipboard is not, and it is the pin that a future edit to `readDirectives` will trip.

// ── A drag is not a paste ───────────────────────────────────────────────────
// The guard exemption briefly covered `uiEvent: 'drop'` on the same "the author declared
// intent" reasoning. prosemirror-view's `handleDrop` puts a delete AND an insert in one
// transaction, so dragging a slide's whole selection into a neighbor emptied the source
// slide and ProseMirror removed the node: a 7-slide deck silently became 6 and the
// `big-number` slide's `_class` went with it — by an ordinary mouse gesture.
test('dragging a slide’s selection into another slide does not destroy a slide', async ({ page }) => {
	await seedPersistence(page);
	const before = await slideClasses(page);

	await caretInto(page, 2);
	await page.keyboard.press('ControlOrMeta+a');
	const from = await slideContent(page, 2).boundingBox();
	const to = await slideContent(page, 1).boundingBox();
	if (!from || !to) throw new Error('slide 1 or 2 is not laid out');
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
	await page.mouse.up();

	await expect(railButtons(page)).toHaveCount(before.length);
	await expect.poll(() => slideClasses(page)).toEqual(before);
});

// ── Collapse is a state, not a flicker ──────────────────────────────────────
// Collapse rode a ProseMirror node decoration re-established by node IDENTITY,
// which carries it through an in-Compose `slideOp` and through nothing else.
// Every slide op that lives OUTSIDE Compose — the rail, the add-slide gallery —
// rewrites the deck source, and the resync that follows threw the whole
// EditorState away, unfolding everything. The unit tier only ever exercised the
// `slideOp` path, so it stayed green while the shipped behavior was "fold a slide
// away, do one ordinary thing, it is open again".
// Folding ADJACENT slides. `DecorationSet.find(from, to)` matches anything OVERLAPPING the
// range, and a slide's fold decoration ends exactly where the next slide's begins — so the
// old `find(pos, pos + 1)` matched the PREVIOUS slide and removed its fold instead of adding
// this one's. Two clicks on the shipped surface. Pinned as a unit test too
// (`compose-collapse.test.ts`), and here because that bug was only ever visible by clicking.
test('folding a slide next to a folded one keeps both folded', async ({ page }) => {
	await collapseCap(page, 0).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([0]);
	await collapseCap(page, 1).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([0, 1]);
	await collapseCap(page, 2).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([0, 1, 2]);
	// …and unfolding the middle one takes only that one.
	await collapseCap(page, 1).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([0, 2]);
});

test('@smoke a folded slide stays folded — and follows its slide — across a rail move', async ({ page }) => {
	await collapseCap(page, 3).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([3]);

	// The rail labels are 1-based, so "Slide 5" is index 4 — moving it earlier swaps it
	// with index 3, the folded one. The fold must FOLLOW its slide to index 4, which is
	// the whole point: this is matching on slide identity, not on a remembered index.
	await page.getByRole('button', { name: 'Slide 5 — split-compare' }).click();
	await page.getByRole('button', { name: 'Move slide earlier', exact: true }).click();

	await expect.poll(() => collapsedIndices(page)).toEqual([4]);
	// AND THE PREVIEW DID NOT SNAP. The restore dispatches a transaction on a fresh
	// EditorState whose selection sits at doc start, which edge-fired `onCursorSlide(0)`
	// and threw the shell's preview to slide 1 — but only when something was folded, i.e.
	// only in the state the restore exists to preserve. The fold assertion above cannot
	// see that; this can.
	expect(await railCurrent(page), 'the preview must not jump to slide 1 on a fold restore').not.toBe(0);
});

test('a folded slide stays folded across a gallery insert above it', async ({ page }) => {
	await collapseCap(page, 3).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([3]);

	await caretInto(page, 0);
	await composeSlide(page, 0).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();

	// One slide arrived above it, so it is now index 4 — still folded, and folded
	// because it is the SAME slide, not because index 3 happened to stay folded.
	await expect.poll(() => collapsedIndices(page)).toEqual([4]);
});

test('a folded slide stays folded across a rail duplicate', async ({ page }) => {
	// PUT THE CARET IN THE SLIDE FIRST. Collapsing does not move the shell's current
	// slide — `toggleCollapse` dispatches a meta-only transaction with no selection
	// change, so `onCursorSlide` never fires — and the rail's Duplicate acts on the
	// CURRENT slide. Without this click the rail duplicated slide 0 and the folded
	// slide shifted 5 → 6 for a reason that had nothing to do with the restore, which
	// is the assertion this test claims to make.
	await caretInto(page, 5);
	await collapseCap(page, 5).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([5]);

	await page.getByRole('button', { name: 'Duplicate slide', exact: true }).click();
	// Slide 5 is duplicated in place, so the copies are at 5 and 6. Exactly ONE stays
	// folded — the restore is greedy and one-for-one — and the count is what pins that:
	// a restore that folded both, or neither, fails here.
	await expect.poll(() => collapsedIndices(page)).toHaveLength(1);
	expect([5, 6]).toContain((await collapsedIndices(page))[0]);
});

// ── Deleting the slide you are in ───────────────────────────────────────────
// `commit()` re-anchors the caret to its own slide node across the full-doc
// rebuild — but when that node is the one being deleted there was nothing to
// anchor to, and `replaceWith` mapped the selection to the END of the document.
// So deleting slide 2 of 7 threw the caret AND the preview (which follows it) to
// slide 7: clearing a few slides in a row walked you to the back of the deck.
test('deleting the slide you are editing lands on its neighbor, not the last slide', async ({ page }) => {
	const n = await slideCount(page);
	expect(n).toBeGreaterThan(3);

	await caretInto(page, 1);
	await composeSlide(page, 1).getByRole('button', { name: 'Delete slide' }).click();
	await page.getByRole('button', { name: 'Confirm delete slide' }).first().click();

	await expect(railButtons(page)).toHaveCount(n - 1);
	// The slide that slid into the deleted one's place — NOT `n - 2`, the end of the deck.
	await expect.poll(() => activeSlide(page)).toBe(1);
});

// ── The table door: offered where a table belongs, withheld where it does not ──
// The reported symptom was "slides that don't support tables allow the adding of a table",
// and the first fix here was wrong in an instructive way. It withheld the control on 57 of
// 61 components on the premise that the engine DROPS a table without a table slot. It does
// not — `lib/base/base.elements.css` § UNIVERSAL TABLE renders a plain pipe table at the
// boardroom bar on almost any layout, deliberately, and rendering one proved it.
//
// But refuting that premise settled a RENDERING question, not the EDITORIAL one that was
// actually asked. A table on a title slide renders beautifully and is still the wrong slide.
// So the door is withheld on a curated list of layouts whose whole anatomy is one statement,
// one number, or one picture — and kept everywhere else, `content` very much included.
// Typing or pasting a table still works: the control stands down, the capability does not.
test('@smoke the table door is withheld on a title slide and offered on content', async ({ page }) => {
	// `title` — a bookend. Withheld.
	await caretInto(page, 0);
	await expect(composeSlide(page, 0).getByRole('button', { name: 'Insert table' })).toBeHidden();

	// `content` — the catch-all body layout. This is the case the derived gate got wrong, and
	// getting it wrong removed the only in-Compose route to a table on the default slide.
	await composeSlide(page, 0).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert content/i }).first().click();
	await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
	await caretInto(page, 1);
	await expect(composeSlide(page, 1).getByRole('button', { name: 'Insert table' })).toBeVisible();
});

// And when it IS offered, what it inserts must be visible. The starter table was built with
// empty cells, which serializes to `|  |  |` and renders as two hairlines — invisible on a
// dark slide, and indistinguishable from a button that did nothing. That was the real defect
// behind the report.
test('inserting a table puts a visible table on the slide', async ({ page }) => {
	await caretInto(page, 0);
	await composeSlide(page, 0).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert content/i }).first().click();
	await page.locator('[role="dialog"]').waitFor({ state: 'detached' });

	await caretInto(page, 1);
	await composeSlide(page, 1).getByRole('button', { name: 'Insert table' }).click();

	const table = composeSlide(page, 1).locator('table');
	await expect(table).toHaveCount(1);
	await expect(table).toContainText('Column');

	// …and it reaches the deck source as a real GFM table with a non-empty header, which is
	// what makes it visible once the engine renders it.
	await expect
		.poll(async () => {
			const src = await persistedSource(page);
			let text = src ?? '';
			try {
				const v = JSON.parse(text);
				if (typeof v === 'string') text = v;
			} catch {
				/* already a bare string */
			}
			return /\|\s*Column\s*\|/.test(text);
		})
		.toBe(true);
});

// ── The slide you just added is the slide you are in ────────────────────────
// The rail moved to the new slide and the preview painted it, but the caret
// stayed put — so the next thing typed went into the OLD slide, and filling in
// the skeleton you had just chosen meant finding it and clicking into it first.
test('inserting from the gallery puts the caret in the new slide', async ({ page }) => {
	const n = await slideCount(page);
	await caretInto(page, 1);
	await composeSlide(page, 1).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();

	await expect(railButtons(page)).toHaveCount(n + 1);
	await expect.poll(() => activeSlide(page)).toBe(2); // directly below the one we asked from
});

// ── Both pointer states of the insert reveal (@parity) ──────────────────────
// `onInsertComponent` reveals the new slide with `focus: hasFinePointer()`, and that
// ternary had never been driven on its FALSE side. It is not cosmetic: focusing the editor
// on a touch device raises the software keyboard, which on a tablet covers half the screen
// and has to be dismissed by hand — on every single insert. So on a coarse pointer the
// reveal must still MOVE (rail and caret land on the new slide) while declining focus, and
// on a fine pointer it must take the caret so the next keystroke edits what you just chose.
//
// ONE oracle, asserting whichever half applies, because `@parity` runs in BOTH pointer
// states by design (see playwright.config.ts) — `desktop` picks these up too, since its
// grepInvert only excludes @mobile and @webkit. A test that hard-coded the touch answer
// passed on `desktop-touch` and FAILED on `desktop`, which is the tag working as intended
// and the test not. Reading the branch's own input and asserting the matching outcome pins
// the ternary in both directions at once.
test('@parity inserting from the gallery reveals the new slide, taking focus only on a fine pointer', async ({ page }) => {
	const finePointer = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
	const n = await slideCount(page);
	await caretInto(page, 1);
	await composeSlide(page, 1).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();

	await expect(railButtons(page)).toHaveCount(n + 1);
	// The reveal itself is unconditional — the new slide is where you are, either way.
	await expect.poll(() => activeSlide(page)).toBe(2);

	const focused = await page.evaluate(() => !!document.querySelector('.cs-host .ProseMirror')?.contains(document.activeElement));
	expect(focused, finePointer ? 'a fine pointer should land the caret in the new slide' : 'a coarse pointer must not grab focus (it raises the keyboard)').toBe(finePointer);
});

// ── The fuzz walk itself ────────────────────────────────────────────────────
// A deterministic random walk (fixed seed, so a failure is replayable) over the
// op families a non-technical author actually reaches, asserting the four
// structural invariants after every op. It is deliberately NOT a script of one
// scenario: the defects above were found by ORDERS nobody would think to write
// down — a cut, then a rail move, then a mode switch, then a paste.
test('a randomized walk over the compose ops holds the structural invariants', async ({ page }) => {
	// Fixed seed. Every op DRAWS unconditionally (see `deleteSlide`) so the stream does
	// not depend on live DOM state, which is what makes a failure replayable rather than
	// merely reproducible-if-you-are-lucky. Be clear about the scope, though: one seed at
	// 34 steps is a REGRESSION NET, not the sweep that found these defects — that was six
	// seeds x 60 ops driven from a scratch harness. This is the part worth committing.
	let s = 20260902 >>> 0;
	const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
	const int = (n: number) => Math.floor(rnd() * n);
	const pick = <T>(a: T[]): T => a[int(a.length)];

	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

	const ops: Record<string, () => Promise<void>> = {
		async type() {
			const n = await page.locator('.cs-slide').count();
			await slideContent(page, int(n)).click();
			await page.keyboard.type(pick(['abc', '# ', '- ', '1. ', '> ', '**b**', '`c`', '---', 'éè 🎉']));
		},
		async key() {
			await page.keyboard.press(pick(['Backspace', 'Delete', 'Enter', 'Tab', 'Home', 'End', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z', 'ControlOrMeta+b']));
		},
		async collapse() {
			const n = await page.locator('.cs-slide').count();
			await collapseCap(page, int(n)).click();
		},
		async deleteSlide() {
			const n = await page.locator('.cs-slide').count();
			// DRAW FIRST, then decide. An early return that skips the draw makes the RNG
			// stream depend on the live slide count, so every op after it shifts and the
			// "fixed seed, so a failure is replayable" claim below stops being true. Draw
			// unconditionally; only the ACTION is conditional.
			const i = int(n);
			if (n <= 2) return;
			await slideContent(page, i).click();
			await composeSlide(page, i).getByRole('button', { name: 'Delete slide' }).click();
			await page.getByRole('button', { name: 'Confirm delete slide' }).first().click();
		},
		async rail() {
			// The move controls are legitimately DISABLED at the ends of the deck (earlier on
			// the first slide, later on the last). Skipping a disabled one is the walk being
			// correct about the app, not the walk avoiding a bug — a disabled control that the
			// walk insisted on clicking would report a 15s timeout as if it were a defect.
			// The draw happens before the enabled check, for the determinism reason above.
			const name = pick(['Duplicate slide', 'Move slide earlier', 'Move slide later', 'Previous slide', 'Next slide']);
			const btn = page.getByRole('button', { name, exact: true }).first();
			if (await btn.isEnabled()) await btn.click();
		},
		async railPick() {
			const n = await railButtons(page).count();
			await railButtons(page).nth(int(n)).click();
		},
		async copyPaste() {
			const n = await page.locator('.cs-slide').count();
			const src = int(n);
			const clipBefore = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
			await slideContent(page, src).click();
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.press(pick(['ControlOrMeta+c', 'ControlOrMeta+x']));
			// WAIT FOR THE CLIPBOARD TO ACTUALLY HOLD THE COPY. Back-to-back ⌘C ⌘V fires the
			// paste against an empty clipboard, and this op then degrades silently into
			// "select and copy" — which is how a walk like this one stayed green over the very
			// class-wipe defect the named tests above pin. A non-empty check is not enough in
			// the named tests (a previous test's contents satisfy it); here the walk has no
			// stable marker to poll for, so it waits for the clipboard to CHANGE instead.
			await expect.poll(() => page.evaluate(() => navigator.clipboard.readText().catch(() => ''))).not.toBe(clipBefore);
			await slideContent(page, int(n)).click();
			await page.keyboard.press('ControlOrMeta+v');
		},
		async scroll() {
			await page.locator('.cs-host').hover();
			await page.mouse.wheel(0, pick([-900, -300, 300, 900, 2400]));
		},
	};
	const names = Object.keys(ops);

	await seedPersistence(page);
	// 34 steps, not a round number: measured against the pre-fix build, this seed first
	// reaches a class-losing paste at step 31, and a walk that stops before its own defect
	// is a walk that certifies nothing.
	for (let step = 0; step < 34; step++) {
		const op = pick(names);
		await ops[op]();

		// 1 + 2: Compose, the rail, and the persisted source agree on the slide count.
		const composeCount = await page.locator('.cs-slide').count();
		expect(composeCount, `after "${op}": compose vs rail`).toBe(await railButtons(page).count());
		await expect
			.poll(async () => (await slideClasses(page)).length, { message: `after "${op}": compose vs source` })
			.toBe(composeCount);

		// 3: no slide lost its component assignment.
		expect(await slideClasses(page), `after "${op}": a slide lost its _class`).not.toContain('∅');

		// 4: the disclosure state a screen reader hears matches the one a sighted user sees.
		const folded = await collapsedIndices(page);
		const aria = await page.evaluate(() => [...document.querySelectorAll('.cs-slide')].map((s) => s.querySelector('.cs-sc-cap')?.getAttribute('aria-expanded')));
		expect(aria, `after "${op}": aria-expanded disagrees with the fold`).toEqual(aria.map((_, i) => (folded.includes(i) ? 'false' : 'true')));

		expect(errors, `after "${op}"`).toEqual([]);
	}
});
