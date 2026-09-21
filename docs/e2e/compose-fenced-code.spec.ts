import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, test } from './studio-fixture';

// ── Fenced code in Compose, driven on the REAL Studio ──────────────────────────
//
// HARD RULE #23: every claim about this feature is a claim about a running editor —
// a caret in a contenteditable, a Tab that either indents or throws focus out of the
// pane, a popover that either anchors to a chip or floats in a corner. None of that
// is reachable from jsdom, and the unit tier next door (`code-commands.test.ts`,
// `fence-catalog.test.ts`) deliberately asserts only the pure half.
//
// So this spec asserts the four things only a browser can answer:
//
//   1. The PANEL. The bug this began as: a fence inherited the INLINE-code chip
//      style, and an inline box spanning lines fragments into one bordered box per
//      line. Asserted by measuring the `<code>`'s own boxes, not by looking at CSS.
//   2. The CHIP names the language, and picking a new one rewrites the SOURCE.
//   3. `Tab` indents instead of moving focus out of the editor.
//   4. The insert door writes a TAGGED fence, defaulted from the slide's layout.
//
// Design: engineering/decisions/2026-09-21-compose-fenced-code.md.

const COMPOSE = 'Compose — rich editor';

async function toCompose(page: Page): Promise<void> {
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

/**
 * The persisted deck source, JSON-DECODED.
 *
 * `persistedSource` returns the raw localStorage value, which is a JSON string —
 * so every newline in it is a literal backslash-n and a naive `toContain('```js\n…')`
 * fails against a deck that is perfectly correct. `compose-stress.spec.ts` decodes it
 * for the same reason; this is that decode, local to the assertions that need it.
 */
async function deckSource(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	if (!raw) return '';
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw; // already a bare string
	}
}

/**
 * How many fences in `source` open with no language tag.
 *
 * A line-walk, not a regex: a fence closes on a run of the SAME character at least as
 * long as its opener, so only a walk can tell an opener from a closer — and telling
 * them apart is the entire question here.
 */
function untaggedFenceCount(source: string): number {
	let open: { char: string; len: number } | null = null;
	let bare = 0;
	for (const line of source.split('\n')) {
		const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (!m) continue;
		const [, run, info] = m;
		if (!open) {
			open = { char: run[0], len: run.length };
			if (!info.trim()) bare++;
			continue;
		}
		if (run[0] === open.char && run.length >= open.len && !info.trim()) open = null;
	}
	return bare;
}

/** Replace the whole deck with `source`, through the REAL markdown editor. */
async function seedDeck(page: Page, source: string): Promise<void> {
	// At 390px the Studio shows ONE pane, so the markdown editor has to be selected
	// before it can be typed into — `getByLabel('Deck source')` simply times out
	// otherwise. The bottom bar's control is there at every width; `.first()` keeps it
	// off the desktop segmented control that carries the same name.
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	// `type` rather than `insertText`: the editor's own input handling (front-matter
	// parse, lint, the persist debounce) is part of what we are seeding through.
	await page.keyboard.type(source, { delay: 0 });
	await expect.poll(() => deckSource(page)).toContain('```');
}

const DECK = [
	'<!-- _class: content -->',
	'',
	'## A fence on a content slide',
	'',
	'```js',
	'const greeting = "hello";',
	'```',
	'',
	'Body prose after it.',
].join('\n');

test('a fence renders as ONE panel, not a bordered box per line', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	await toCompose(page);

	const pre = page.locator('.cs-host pre.cs-code').first();
	await expect(pre).toBeVisible();

	// THE ACTUAL BUG, measured rather than inspected. The inline-code chip rule
	// (`.cs-host code { border; background; padding }`) reaching inside a `<pre>`
	// fragments the inline box once per line — three lines of source, three boxes.
	// `getClientRects()` counts the fragments the browser actually laid out.
	const codeRects = await pre.locator('code').evaluate((el) => el.getClientRects().length);
	const codeBorder = await pre.locator('code').evaluate((el) => getComputedStyle(el).borderTopWidth);
	expect(codeBorder, 'the inner <code> must carry no border of its own').toBe('0px');

	// The PANEL is the thing with a border, and there is exactly one of it.
	const preBorder = await pre.evaluate((el) => getComputedStyle(el).borderTopWidth);
	expect(preBorder).not.toBe('0px');

	// A multi-line fence whose inner <code> is still inline would report one rect per
	// line. It is `display:block`, so it reports one whatever the line count.
	expect(codeRects, 'the inner <code> must lay out as ONE box').toBe(1);

	// And it is monospace, not the page's serif.
	const family = await pre.evaluate((el) => getComputedStyle(el).fontFamily);
	expect(family.toLowerCase()).toMatch(/mono/);
});

test('the chip names the language, and picking a new one rewrites the source', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	await toCompose(page);

	const chip = page.locator('.cs-code-chip').first();
	await expect(chip).toHaveText('js');

	await chip.click();
	// The picker is a real Radix popover over cmdk — so it has a search field, and
	// searching by the ALIAS is the spelling an author reaches for first.
	const search = page.getByPlaceholder('Language…');
	await expect(search).toBeVisible();
	await search.fill('py');
	await page.getByRole('option', { name: /python/i }).first().click();

	// The SOURCE is the deliverable: the tag changed and the body did not.
	await expect.poll(() => deckSource(page)).toContain('```python');
	const src = await deckSource(page);
	expect(src).toContain('const greeting = "hello";');
	expect(src).not.toContain('```js');
	await expect(chip).toHaveText('python');
});

test('the picker leads with the Lattice fence languages, whatever the deck uses', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	await toCompose(page);

	await page.locator('.cs-code-chip').first().click();
	// Two thirds of the fences we ship are `mermaid`, and it is not a programming
	// language — so the engine's own three lead the list rather than sitting at
	// position 97 of an alphabetical 192.
	const groups = page.locator('[cmdk-group-heading]');
	await expect(groups.first()).toHaveText('Lattice');
	for (const tag of ['mermaid', 'anima', 'functionplot']) {
		await expect(page.getByRole('option', { name: new RegExp(tag) })).toBeVisible();
	}
});

test('Tab indents inside a fence instead of throwing focus out of the editor', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	await toCompose(page);

	// Caret at the start of the fence body.
	await page.locator('.cs-host pre.cs-code code').first().click({ position: { x: 2, y: 6 } });
	await page.keyboard.press('Home');
	await page.keyboard.press('Tab');

	await expect.poll(() => deckSource(page)).toContain('```js\n  const greeting');

	// THE TRAP THIS CLOSES: with no binding, Tab falls through to the browser and
	// moves focus off the editing surface entirely. Assert focus is still in it.
	const stillInEditor = await page.evaluate(() => !!document.activeElement?.closest('.cs-host .ProseMirror'));
	expect(stillInEditor, 'Tab must not move focus out of the editor').toBe(true);

	await page.keyboard.press('Shift+Tab');
	await expect.poll(() => deckSource(page)).toContain('```js\nconst greeting');
});

test('Enter on a blank last line leaves the fence — the only exit a phone can reach', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	await toCompose(page);

	// Click the LAST line of the fence body, so `End` lands at the end of the block.
	const code = page.locator('.cs-host pre.cs-code code').first();
	await code.click({ position: { x: 4, y: 6 } });
	// `End`, not `ControlOrMeta+End`: the latter is not a ProseMirror binding, so the
	// browser took it as "end of DOCUMENT" and the caret left the fence entirely —
	// after which the test typed into prose and asserted against an untouched deck.
	await page.keyboard.press('End');
	// Two Enters: the first opens a blank last line, the second takes the exit.
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
	await page.keyboard.type('after the fence');

	// POLL. The editor persists on a ~400ms debounce, so reading straight after typing
	// compares against the deck as it was before any of this — which is what made an
	// earlier version of this test fail while the behavior it asserts was correct.
	await expect.poll(() => deckSource(page)).toContain('after the fence');
	const src = await deckSource(page);
	// The typed text landed OUTSIDE the fence…
	expect(src).toMatch(/```\n\nafter the fence/);
	// …and the blank line the author used to get out is not left behind in the snippet.
	expect(src).toContain('const greeting = "hello";\n```');
});

test('the insert door writes a TAGGED fence, defaulted from the slide layout', async ({ page }) => {
	await gotoStudio(page);
	// A diagram slide: its own grammar skeleton opens a ```mermaid fence, so the door
	// must not ask a question the layout has already answered.
	await seedDeck(page, ['<!-- _class: diagram -->', '', '## How signals move', '', 'A caption line.'].join('\n').replace('A caption line.', 'A caption line.\n\n```text\nseed\n```'));
	await toCompose(page);

	// Caret in the prose, then the door.
	await page.locator('.cs-slide-content p').first().click();
	await page.getByRole('button', { name: 'Insert code', exact: true }).first().click();

	await expect.poll(() => deckSource(page)).toContain('```mermaid');
	// Never a BARE fence — `code.docs.md` says three times that an untagged one renders
	// as undifferentiated mono, so a door that produced one would produce a defect.
	//
	// WALK the fences rather than pattern-matching them. The first cut of this assertion
	// was `not.toMatch(/\n```\n(?![\s\S]*?```)/)`, which cannot fail: a bare OPENER is
	// always followed later by its own CLOSER, so the negative lookahead always succeeds.
	// It passed identically on a source with an untagged fence and one without.
	expect(untaggedFenceCount(await deckSource(page))).toBe(0);
});

test('the untagged-fence walker can actually fail', async () => {
	// The assertion above is only worth having if its instrument is falsifiable — the
	// one it replaced was not. Pin both directions on the shapes that matter.
	expect(untaggedFenceCount('# H\n\n```js\nx\n```\n')).toBe(0);
	expect(untaggedFenceCount('# H\n\n```\nx\n```\n')).toBe(1);
	expect(untaggedFenceCount('```\nx\n```\n\n```\ny\n```\n')).toBe(2);
	// A bare closer is not an opener, and ``` INSIDE a longer fence is content.
	expect(untaggedFenceCount('````js\n```\n````\n')).toBe(0);
});

test('@mobile the chip and the pill picker are both reachable at 390px', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	await toCompose(page);

	const chip = page.locator('.cs-code-chip').first();
	await expect(chip).toBeVisible();
	// A tap target, not just a label: the mobile rule lifts it to 24px.
	const box = await chip.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);

	// Putting the caret in the fence swaps the divider pill's Format group to the
	// language picker — the toolbar half of the control (design § Axis B).
	await page.locator('.cs-host pre.cs-code code').first().click();
	await expect(page.locator('.cs-codec-trigger')).toBeVisible();
	await expect(page.locator('.cs-codec-tag')).toHaveText('js');
});
