import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, openSection, persistedByPrefix, persistedSource, setEditorContent, test, toastText } from './studio-fixture';

// The Deck inspector's front-matter controls, speaker notes, and version history.
// Front-matter writes are asserted both on the immediate outer-DOM signal
// (control label / aria-checked) and, where it matters, on the persisted source.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await openInspector(page);
});

test('@smoke size control writes the size front-matter', async ({ page }) => {
	await page.getByRole('button', { name: /Widescreen 16 . 9/ }).click();
	await page.getByRole('menuitem', { name: /Standard 4 . 3/ }).click();

	await expect(page.getByRole('button', { name: /Standard 4 . 3/ })).toBeVisible();
	await expect.poll(() => persistedSource(page)).toContain('size: standard');
});

// Header / Footer / Page numbers / Section rail live under the Inspector's
// "Chrome" tab (`deckSections`); the panel opens on "Look". Selecting the tab is part
// of the flow — these two specs were silently red for want of that one click.
// (The tab was called "Marks" until 2026-08-18; the slide Inspector had always
// called the same four controls Chrome, and one vocabulary won.)
async function openChromeTab(page: Page): Promise<void> {
	await openSection(page, CHROME.deckTab.chrome);
}

test('page-numbers toggle writes paginate front-matter', async ({ page }) => {
	await openChromeTab(page);
	const toggle = page.getByRole('switch', { name: 'Page numbers' });
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => persistedSource(page)).toContain('paginate: true');
});

test('the Header field declares running-header text into front-matter', async ({ page }) => {
	// Header is a text DECLARATION now (you state the copy), not a toggle.
	await openChromeTab(page);
	const header = page.getByRole('textbox', { name: 'Header' });
	await header.click();
	await header.fill('Acme — Q3');
	await header.blur();
	await expect.poll(() => persistedSource(page)).toContain('header:');
});

test('a speaker note is written into the slide source on blur', async ({ page }) => {
	// The speaker note lives in the Inspector's SLIDE scope, under the "Notes" tab.
	// Open Slide settings (which points the panel at slide scope), then the Notes tab.
	await page.getByRole('button', { name: 'Slide settings' }).click();
	await openSection(page, 'Notes');
	const note = page.getByRole('textbox', { name: 'Speaker note for this slide' });
	await note.click();
	await note.fill('Open with the headline number.');
	await note.blur();

	await expect.poll(() => persistedSource(page)).toContain('note: Open with the headline number.');
});

test('saving a version records a checkpoint', async ({ page }) => {
	// Version history moved out of the inspector into its own top-bar sheet.
	await page.getByRole('button', { name: 'Version history' }).click();
	await page.getByRole('button', { name: 'Save a version' }).click();
	await expect(toastText(page)).toContainText('Version saved');

	await expect.poll(async () => {
		const snaps = await persistedByPrefix(page, 'snap');
		return snaps ? JSON.parse(snaps).length : 0;
	}).toBeGreaterThan(0);
});

/**
 * THE DECK MOTION TAB — the register AND what it actually produces (HARD RULE #23).
 *
 * The Studio had ZERO coverage of what a deck's motion settings DO: the three controls were
 * asserted, the consequence never was. That is how the old Fabricate scene studio shipped an
 * engine badge naming a package deleted a week earlier — nothing on any tier looked.
 *
 * The deck below is deliberately NOT at the built-in defaults (`motion-style: rise`,
 * `motion-speed: slow`), which is what makes the register assertion meaningful: a deck sitting at
 * build/auto cannot tell a control that reads the deck from one that returns a constant.
 */
const MOTION_DECK = [
	'---',
	'theme: indaco',
	'motion: on',
	'motion-style: rise',
	'motion-speed: slow',
	'---',
	'',
	'<!-- _class: funnel motion-on -->',
	'',
	'## Where deals stall',
	'',
	'- Qualified 1240',
	'- Proposal 620',
	'- Negotiation 310',
	'- Closed won 118',
	'',
	'---',
	'',
	'<!-- _class: piechart -->',
	'',
	'## Revenue mix',
	'',
	'- Direct 42',
	'',
	'---',
	'',
	'<!-- _class: journey -->',
	'',
	'## Customer arc',
	'',
	'- Discover 3',
	'- Trial 4',
].join('\n');

async function openDeckMotion(page: Page) {
	await setEditorContent(page, MOTION_DECK);
	// Wait for the SIGNAL the deck landed, not a guessed interval: the shell persists the source
	// on a debounce, so seeing the deck's own front matter in storage is the deck having arrived.
	await expect.poll(() => persistedSource(page)).toContain('motion-style: rise');
	// `beforeEach` already opened the Inspector — `openInspector` TOGGLES, so calling it again here
	// closes the panel and every later locator misses.
	await openSection(page, CHROME.deckTab.motion);
}

test('the deck Motion controls read the deck, not the built-in default', async ({ page }) => {
	await openDeckMotion(page);
	// The deck says rise/slow. A control showing Build/Auto here is reading a constant.
	await expect(page.getByRole('combobox', { name: 'Choose motion style' })).toContainText('Rise');
	await expect(page.getByRole('combobox', { name: 'Choose motion speed' })).toContainText('Slow');
});

test('the Motion tab names what the deck will actually animate', async ({ page }) => {
	await openDeckMotion(page);
	// Scoped to the Motion panel's own list — the heading also appears in the editor and preview.
	await expect(page.getByRole('button', { name: /Go to slide 1, Where deals stall/ })).toBeVisible();
	// Three targets: the funnel carries, the one-mark piechart moves but is flagged, and the
	// journey has Play on from the deck default yet emits no motion roles — so it is counted as
	// unreachable rather than inflating "will move". That last distinction is the point.
	await expect(page.getByText(/3 targets · 2 will move · 1 the engine cannot reach/)).toBeVisible();
});

test('the admission test flags motion that carries nothing, and offers the fix', async ({ page }) => {
	await openDeckMotion(page);
	// One mark cannot build — the "sequence" is a single fade, which is the still it already was.
	await expect(page.getByText(/reads as a fade, not a sequence/)).toBeVisible();
	await page.getByRole('button', { name: 'Turn it off' }).click();
	// It writes the Inspector's own token, so the two surfaces cannot drift.
	await expect.poll(() => persistedSource(page)).toContain('motion-off');
});

// ── Find + browse (ui/settings-view.tsx) ─────────────────────────────────────
// The unit tier covers the matcher and the wiring in jsdom; what only the real
// browser can answer is whether the two CSS rules that finish the job actually
// fire — a section with no matching row must COLLAPSE, and "collapse" is
// `display: none` from an unlayered `:has()` rule that jsdom does not evaluate
// (HARD RULE #23: a harness passing is not the surface passing).

test('search reaches a control in a tab that is not open, and collapses the rest', async ({ page }) => {
	// The panel opens on Look, so the Speech tab's Pace control is not in the DOM.
	await expect(page.getByLabel('Choose pace')).toHaveCount(0);

	await page.getByRole('button', { name: CHROME.settings.searchDeck }).click();
	await page.getByRole('textbox', { name: CHROME.settings.searchDeck }).fill('pace');

	await expect(page.getByLabel('Choose pace')).toBeVisible();
	// Look's own rows are gone, and so is the Look SECTION — the heading must not
	// stand over an empty section. `toBeVisible` is the assertion that needs a real
	// engine: the row is in the DOM, hidden by the rule its parent matched.
	await expect(page.getByLabel('Choose deck theme')).toBeHidden();
	await expect(page.getByRole('heading', { name: CHROME.deckTab.look })).toBeHidden();
});

test('a query that matches nothing says so, and the note goes when one matches', async ({ page }) => {
	await page.getByRole('button', { name: CHROME.settings.searchDeck }).click();
	const field = page.getByRole('textbox', { name: CHROME.settings.searchDeck });

	await field.fill('zzzznothing');
	await expect(page.getByText(/No setting matches/)).toBeVisible();

	// The note is hidden by CSS the moment the body holds one hit — not re-rendered.
	await field.fill('pace');
	await expect(page.getByText(/No setting matches/)).toBeHidden();
});

test('one trailing ✕ clears, then closes — and the panel comes back whole', async ({ page }) => {
	await page.getByRole('button', { name: CHROME.settings.searchDeck }).click();
	// Empty field: exactly one trailing button in the row, and its job is to leave.
	await expect(page.getByRole('button', { name: CHROME.settings.clearSearch })).toHaveCount(0);
	await expect(page.getByRole('button', { name: CHROME.settings.closeSearch })).toBeVisible();

	await page.getByRole('textbox', { name: CHROME.settings.searchDeck }).fill('pace');
	await expect(page.getByRole('tab', { name: CHROME.deckTab.look })).toHaveCount(0);
	// Text in the field: the SAME button empties it, and no second ✕ appears beside it.
	// Both counts matter — the defect this replaced was two ✕ drawn 19px apart.
	await expect(page.getByRole('button', { name: CHROME.settings.closeSearch })).toHaveCount(0);
	await expect(page.getByRole('button', { name: CHROME.settings.clearSearch })).toHaveCount(1);

	await page.getByRole('button', { name: CHROME.settings.clearSearch }).click();
	// Cleared, still open: the panel is whole again with the field ready for the next word.
	await expect(page.getByRole('textbox', { name: CHROME.settings.searchDeck })).toBeVisible();
	await expect(page.getByRole('tab', { name: CHROME.deckTab.look })).toBeVisible();
	await expect(page.getByLabel('Choose deck theme')).toBeVisible();
	await expect(page.getByLabel('Choose pace')).toHaveCount(0);

	await page.getByRole('button', { name: CHROME.settings.closeSearch }).click();
	await expect(page.getByRole('textbox', { name: CHROME.settings.searchDeck })).toHaveCount(0);
});

test('the list view drops the tabs and renders every section at once', async ({ page }) => {
	await page.getByRole('button', { name: CHROME.settings.list }).click();
	try {
		await expect(page.getByRole('tab', { name: CHROME.deckTab.look })).toHaveCount(0);
		// One control from each end of the tab strip, both on screen together.
		await expect(page.getByLabel('Choose deck theme')).toBeVisible();
		await expect(page.getByLabel('Choose pace')).toBeVisible();
		await expect(page.getByRole('heading', { name: CHROME.deckTab.speech })).toBeVisible();
	} finally {
		// The choice PERSISTS (localStorage), so put it back: a spec that leaves the
		// panel in list view would strand every tab-addressing spec sharing the profile.
		await page.getByRole('button', { name: CHROME.settings.grouped }).click();
	}
});

// ── The section strip's MEASURED overflow ────────────────────────────────────────────
//
// This tier, not the unit one, because the whole mechanism is a measurement: jsdom reports
// every width as 0 and has no `ResizeObserver`, so the unit tests can only prove the fitting
// POLICY (`visibleSectionTabs`, given widths) and the unmeasured fallback. Whether the strip
// actually reads its own row, and whether it stays on ONE line while doing it, is a question
// only a real engine answers.

/**
 * The pills on screen, whether the row wrapped, and whether the PANEL can be scrolled
 * sideways.
 *
 * That last one is not about the pills, and a first cut of this helper could not see it.
 * It measured `row.querySelectorAll('button')` — so the hidden measuring ghost, whose
 * children are `<span>`s, was invisible to the very assertion that claimed "zero overflow
 * at every width". The ghost is `absolute` and `w-max`, a `visibility: hidden` box still
 * contributes scrollable overflow, and the panel body is `overflow-y-auto` — which makes
 * the other axis `auto` too. Result: a 273px horizontal scroll region on the settings
 * panel, and one two-finger swipe scrolled every control away and left a blank column.
 *
 * So this asks the SCROLLER, not the buttons: can the panel body scroll sideways at all?
 */
async function strip(page: Page) {
	return page.evaluate(() => {
		const list = document.querySelector('[role="tablist"][aria-label*="sections"]');
		const row = list?.parentElement;
		if (!row) return { rowW: 0, pills: [] as string[], lines: 0, overflow: 0, panelScrollX: 0 };
		const buttons = [...row.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent);
		let scroller: HTMLElement | null = row;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
		return {
			rowW: Math.round(row.getBoundingClientRect().width),
			pills: [...row.querySelectorAll('[role="tab"]')].map((b) => (b.textContent ?? '').trim()),
			lines: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size,
			// How far the last control sticks out past the row it lives in.
			overflow: Math.max(0, ...buttons.map((b) => Math.round(b.getBoundingClientRect().right - row.getBoundingClientRect().right))),
			panelScrollX: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
		};
	});
}

/**
 * Drag the settings panel's divider by `dx` and let the strip settle.
 *
 * The PANEL width is the real lever, not the viewport: the docked panel is a fixed-width
 * dock, so its row measured 231px at a 1440 viewport and 236px at 2560. Dragging is also the
 * interaction the fixed-at-two strip was chosen to survive — "pick the third section, drag
 * the panel narrow" is the sentence in the decision note.
 */
async function dragPanel(page: Page, dx: number) {
	const handle = page.getByRole('separator', { name: CHROME.settings.resizeHandle });
	const box = await handle.boundingBox();
	if (!box) throw new Error('no panel resize handle');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
	await page.mouse.up();
	// Wait for the SIGNAL, not a guessed interval: the strip has settled when two consecutive
	// reads of its row agree. Polling "it changed" would be wrong — a drag into the panel's
	// min or max width legitimately changes nothing, and this has to work for those too.
	let last = Number.NaN;
	await expect
		.poll(async () => {
			const { rowW } = await strip(page);
			const settled = rowW === last;
			last = rowW;
			return settled;
		})
		.toBe(true);
}

test('the section strip fits itself to the panel, on one line, at every width', async ({ page }) => {
	const counts: number[] = [];
	for (const dx of [0, 120, 260, -260]) {
		if (dx) await dragPanel(page, dx);
		const { pills, lines, overflow, rowW, panelScrollX } = await strip(page);
		// ONE LINE, always. The fixed-at-two strip this replaced was chosen because six pills
		// wrapped to two rows and cost 74px of a panel with none to spare — so a wrap here is
		// the exact regression, and an overflow is the new way to get it wrong.
		expect(lines, `row ${rowW}px: strip on ${lines} lines`).toBe(1);
		expect(overflow, `row ${rowW}px: strip overflows by ${overflow}px`).toBeLessThanOrEqual(0);
		expect(pills.length, `row ${rowW}px`).toBeGreaterThanOrEqual(2);
		// And the hidden measuring ghost must not hand the panel a sideways scroll region.
		expect(panelScrollX, `row ${rowW}px: panel scrolls ${panelScrollX}px sideways`).toBe(0);
		counts.push(pills.length);
	}
	// A WIDER panel actually shows MORE — without this the test passes on a strip frozen at
	// two, which is the thing being replaced.
	expect(counts[2], `counts ${counts.join(',')}`).toBeGreaterThan(counts[0]);
	// …and dragging back returns the narrow shape rather than leaving the row overflowing.
	expect(counts[3]).toBeLessThan(counts[2]);
});

test('the active section stays ON SCREEN as a pill, however narrow the panel', async ({ page }) => {
	// The property a container query cannot express, and the reason the count was frozen at
	// two: hide the overflow in CSS and picking section six leaves the strip reading
	// "Look · Chrome · More" with nothing on screen saying where you are.
	await openSection(page, CHROME.deckTab.speech);
	const speech = page.getByRole('tab', { name: CHROME.deckTab.speech, exact: true });
	for (const dx of [200, -200, -80]) {
		await dragPanel(page, dx);
		await expect(speech).toBeVisible();
		await expect(speech).toHaveAttribute('aria-selected', 'true');
		expect((await strip(page)).lines).toBe(1);
	}
});

test('the settings panel cannot be scrolled sideways at all', async ({ page }) => {
	// The defect this replaced: the strip's hidden measuring ghost is `absolute` + `w-max`,
	// a `visibility: hidden` box still contributes scrollable overflow, and the panel body is
	// `overflow-y-auto` — which makes the OTHER axis `auto` too. The panel gained a 273px
	// horizontal scroll region and one two-finger swipe left a blank column.
	//
	// This ASSIGNS `scrollLeft` rather than driving a wheel, and that is deliberate. A wheel
	// arm was written first and it passed against the broken code — Playwright's synthesized
	// wheel did not reach this nested scroller, so the test asserted nothing at all. Asking
	// the element whether it will move is the property; the gesture was only ever the way a
	// person discovers it. Mark it: this must FAIL when `overflow-x-clip` comes off the row.
	const moved = await page.evaluate(() => {
		const list = document.querySelector('[role="tablist"][aria-label*="sections"]');
		let el: HTMLElement | null = list?.parentElement ?? null;
		while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
		if (!el) return -1;
		el.scrollLeft = 400;
		const after = el.scrollLeft;
		el.scrollLeft = 0;
		return after;
	});
	expect(moved, 'no settings scroller found').not.toBe(-1);
	expect(moved, `the settings panel scrolled ${moved}px sideways`).toBe(0);
});

test('the chevron still holds the WHOLE list, not the leftovers', async ({ page }) => {
	await page.setViewportSize({ width: 1800, height: 900 });
	await page.getByRole('button', { name: CHROME.settings.allSections }).click();
	for (const name of Object.values(CHROME.deckTab)) {
		await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
	}
});
