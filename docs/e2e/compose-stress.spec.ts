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
 * These run in the nightly E2E tier, not on the PR gate.
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
	await slideContent(page, 0).click();
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
/** The indices of every folded slide, straight off the DOM. */
function collapsedIndices(page: Page): Promise<number[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('.cs-slide')].map((s, i) => (s.classList.contains('cs-collapsed') ? i : -1)).filter((i) => i >= 0),
	);
}
/** The index of the slide the caret is in (Compose lights it `cs-slide-active`). */
function activeSlide(page: Page): Promise<number> {
	return page.evaluate(() => [...document.querySelectorAll('.cs-slide')].findIndex((s) => s.classList.contains('cs-slide-active')));
}

test.beforeEach(async ({ page }) => {
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
test('copying the whole deck and pasting it back keeps every slide’s component', async ({ page }) => {
	await seedPersistence(page);
	const before = await slideClasses(page);
	expect(before.length).toBeGreaterThan(3); // the seed deck, not a degenerate one
	expect(before).not.toContain('∅');

	await slideContent(page, 2).click();
	await page.keyboard.press('ControlOrMeta+a'); // this slide
	await page.keyboard.press('ControlOrMeta+a'); // escalate to the whole deck
	await page.keyboard.press('ControlOrMeta+c');
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

	await slideContent(page, 4).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+c');
	await slideContent(page, 1).click();
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

	await slideContent(page, 2).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+a'); // the whole deck
	await page.keyboard.press('ControlOrMeta+c');

	await slideContent(page, 1).click();
	await page.keyboard.press('ControlOrMeta+a'); // this slide only
	await page.keyboard.press('ControlOrMeta+v');

	// n slides replaced 1, so the deck is n + (n - 1) long. The assertion that matters is
	// simply that it GREW: before the fix this stayed at n, silently.
	await expect(railButtons(page)).toHaveCount(n + n - 1);
	await expect.poll(() => slideClasses(page)).not.toContain('∅');
});

// ── Collapse is a state, not a flicker ──────────────────────────────────────
// Collapse rode a ProseMirror node decoration re-established by node IDENTITY,
// which carries it through an in-Compose `slideOp` and through nothing else.
// Every slide op that lives OUTSIDE Compose — the rail, the add-slide gallery —
// rewrites the deck source, and the resync that follows threw the whole
// EditorState away, unfolding everything. The unit tier only ever exercised the
// `slideOp` path, so it stayed green while the shipped behavior was "fold a slide
// away, do one ordinary thing, it is open again".
test('a folded slide stays folded — and follows its slide — across a rail move', async ({ page }) => {
	await collapseCap(page, 3).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([3]);

	// The rail labels are 1-based, so "Slide 5" is index 4 — moving it earlier swaps it
	// with index 3, the folded one. The fold must FOLLOW its slide to index 4, which is
	// the whole point: this is matching on slide identity, not on a remembered index.
	await page.getByRole('button', { name: 'Slide 5 — split-compare' }).click();
	await page.getByRole('button', { name: 'Move slide earlier', exact: true }).click();

	await expect.poll(() => collapsedIndices(page)).toEqual([4]);
});

test('a folded slide stays folded across a gallery insert above it', async ({ page }) => {
	await collapseCap(page, 3).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([3]);

	await slideContent(page, 0).click();
	await composeSlide(page, 0).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();

	// One slide arrived above it, so it is now index 4 — still folded, and folded
	// because it is the SAME slide, not because index 3 happened to stay folded.
	await expect.poll(() => collapsedIndices(page)).toEqual([4]);
});

test('a folded slide stays folded across a rail duplicate', async ({ page }) => {
	await collapseCap(page, 5).click();
	await expect.poll(() => collapsedIndices(page)).toEqual([5]);
	await page.getByRole('button', { name: 'Duplicate slide', exact: true }).click();
	// Exactly ONE of the two copies stays folded (the restore is one-for-one), and it
	// is the one that moved down by the inserted duplicate.
	await expect.poll(() => collapsedIndices(page)).toEqual([6]);
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

	await slideContent(page, 1).click();
	await expect.poll(() => activeSlide(page)).toBe(1);
	await composeSlide(page, 1).getByRole('button', { name: 'Delete slide' }).click();
	await page.getByRole('button', { name: 'Confirm delete slide' }).first().click();

	await expect(railButtons(page)).toHaveCount(n - 1);
	// The slide that slid into the deleted one's place — NOT `n - 2`, the end of the deck.
	await expect.poll(() => activeSlide(page)).toBe(1);
});

// ── "Insert table" only where a table renders ───────────────────────────────
// The control was offered on all 61 components and WORKED on all 61, writing an
// empty `|  |  |` grid into the source of a `title` or a `big-number`. The engine
// then drops it, so the author saw a table in Compose that never reached the
// slide and carried junk in their deck source. Measured across all seven classes
// of the shipped tour deck: seven inserts, seven silent drops. It is now gated on
// the manifest's own slot/skeleton contract — permissive for an unknown class.
test('the table door is offered only on a component that takes a table', async ({ page }) => {
	// Every class in the seed deck (title, big-number, stats, cards-grid,
	// split-compare, list-steps, closing) is table-less.
	const n = await slideCount(page);
	for (let i = 0; i < n; i++) {
		await slideContent(page, i).click();
		await expect(composeSlide(page, i).getByRole('button', { name: 'Insert table' })).toBeHidden();
	}

	// …and a component that DOES take one still gets the door. `compare-table` is
	// one of the four (with matrix-grid, obligation-matrix, roadmap).
	await slideContent(page, 0).click();
	await composeSlide(page, 0).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert compare-table/i }).first().click();
	await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
	await expect(composeSlide(page, 1).getByRole('button', { name: 'Insert table' })).toBeVisible();
});

// ── The slide you just added is the slide you are in ────────────────────────
// The rail moved to the new slide and the preview painted it, but the caret
// stayed put — so the next thing typed went into the OLD slide, and filling in
// the skeleton you had just chosen meant finding it and clicking into it first.
test('inserting from the gallery puts the caret in the new slide', async ({ page }) => {
	const n = await slideCount(page);
	await slideContent(page, 1).click();
	await composeSlide(page, 1).getByRole('button', { name: 'Add slide below' }).click();
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();

	await expect(railButtons(page)).toHaveCount(n + 1);
	await expect.poll(() => activeSlide(page)).toBe(2); // directly below the one we asked from
});

// ── The fuzz walk itself ────────────────────────────────────────────────────
// A deterministic random walk (fixed seed, so a failure is replayable) over the
// op families a non-technical author actually reaches, asserting the four
// structural invariants after every op. It is deliberately NOT a script of one
// scenario: the defects above were found by ORDERS nobody would think to write
// down — a cut, then a rail move, then a mode switch, then a paste.
test('a randomized walk over the compose ops holds the structural invariants', async ({ page }) => {
	let s = 20260902 >>> 0; // fixed, so a failure is replayable
	const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
	const int = (n: number) => Math.floor(rnd() * n);
	const pick = <T>(a: T[]): T => a[int(a.length)];

	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
	// So the copy/paste op can WAIT on the clipboard rather than racing it (see below).
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

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
			if (n <= 2) return;
			const i = int(n);
			await slideContent(page, i).click();
			await composeSlide(page, i).getByRole('button', { name: 'Delete slide' }).click();
			await page.getByRole('button', { name: 'Confirm delete slide' }).first().click();
		},
		async rail() {
			// The move controls are legitimately DISABLED at the ends of the deck (earlier on
			// the first slide, later on the last). Skipping a disabled one is the walk being
			// correct about the app, not the walk avoiding a bug — a disabled control that the
			// walk insisted on clicking would report a 15s timeout as if it were a defect.
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
			await slideContent(page, src).click();
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.press(pick(['ControlOrMeta+c', 'ControlOrMeta+x']));
			// WAIT FOR THE CLIPBOARD TO ACTUALLY HOLD THE COPY. Back-to-back ⌘C ⌘V fires the
			// paste against an empty clipboard, and this op then degrades silently into
			// "select and copy" — which is how a walk like this one stayed green over the very
			// class-wipe defect the named tests above pin. `grantPermissions` in the test body
			// is what makes `readText()` a real observable here rather than a caught throw.
			await expect.poll(() => page.evaluate(() => navigator.clipboard.readText().then((t) => t.length))).toBeGreaterThan(0);
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
