import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The ⌘K command palette: opens on the keyboard shortcut, and each command runs
// its action and closes the dialog.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('Meta/Control+K opens the command palette', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeHidden();
});

test('"Reshape for a reader" opens the Lenses panel', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Reshape');
	await page.getByRole('option', { name: 'Reshape for a reader' }).click();

	// The command opens the Lenses panel (its own first-class home for reader views).
	await expect(page.getByRole('button', { name: 'Toggle Reader views' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: /Add a reader view/ })).toBeVisible();
});

test('"Present" opens the present overlay', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Present');
	await page.getByRole('option', { name: 'Present', exact: true }).click();

	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
});

/**
 * THE DROPDOWN PAINTS OUTSIDE THE BAR — the invariant that took three attempts to land
 * (#1707) and shipped with no test at all.
 *
 * The card hangs from the header on plain CSS, so ANY ancestor that clips can make it
 * vanish, and the two that already did are still one careless edit away: the `Command`
 * root's own base-class `overflow-hidden` (neutralized in CommandPalette.tsx) and the
 * header's `overflow-x: auto` scroll valve, #1381, which computes `overflow-y: auto`
 * with it (lifted in StudioShell.tsx while the field is open). Clearing only one paints
 * nothing, which is what made the third attempt read as a dead end.
 *
 * This is also the test that lets the hand-rolled container keep its place against the
 * shared Radix `Popover` (HARD RULE #15): a Popover is `position: fixed` and would be
 * immune to both clips by construction, so the only thing it really bought over two
 * utility classes was never having to think about them again. Buy that here instead.
 *
 * Assertions are about PAINT, not existence, because "the element exists" is what a clipped
 * card also satisfies: the box is real, it starts at or below the header's bottom edge, it is
 * HIT-TESTABLE at its own top rows (a clipped card still reports a rect), and the widget above
 * it has not been scrolled — "the list draws inside the bar, scrolled" was the reported
 * symptom, and a root scrolled to 73px is what produced it.
 *
 * It then covers the keyboard-aware cap, for the same reason and in the same style: by value
 * and by response, never by shape. See the note at that assertion for why a shape check is
 * worse than no check here.
 */
test('the inline dropdown paints below the header, not clipped inside it', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeFocused();

	const geom = await page.evaluate(() => {
		const list = document.querySelector('[data-slot=command-list]');
		const card = list?.parentElement;
		const root = card?.parentElement; // the Command widget — the clip that hid this for three attempts
		const header = document.querySelector('header');
		if (!list || !card || !root || !header) return null;
		const c = card.getBoundingClientRect();
		const h = header.getBoundingClientRect();
		// What is actually on screen 24px into the card? A clipped card still has a rect.
		const hit = document.elementFromPoint(c.x + c.width / 2, c.y + 24);
		return {
			cardTop: Math.round(c.y), cardHeight: Math.round(c.height), cardWidth: Math.round(c.width),
			headerBottom: Math.round(h.bottom),
			hitIsInsideCard: !!hit && card.contains(hit),
			rootScrollTop: Math.round(root.scrollTop),
			listMaxHeight: getComputedStyle(list).maxHeight,
		};
	});

	expect(geom, 'the inline dropdown did not render at all').not.toBeNull();
	const g = geom as NonNullable<typeof geom>;
	expect(g.cardHeight, 'the dropdown collapsed — a clipping ancestor is back').toBeGreaterThan(100);
	expect(g.cardWidth, 'the dropdown must span the field it hangs from').toBeGreaterThan(200);
	expect(g.cardTop, 'the dropdown must clear the header, not draw inside the 54px bar').toBeGreaterThanOrEqual(g.headerBottom);
	expect(g.hitIsInsideCard, 'the dropdown has a box but nothing of it is painted there — it is being clipped').toBe(true);
	expect(g.rootScrollTop, 'the Command root has been scrolled to reveal the active item — it is clipping again').toBe(0);
	// THE KEYBOARD-AWARE CAP, asserted by VALUE and by RESPONSE — never by shape.
	//
	// The obvious test ("max-height is some px value") is worthless here, and it shipped that
	// way for one commit. `CommandList` carries its OWN `max-h-[300px]` base class
	// (components/ui/command.tsx), so a dropped declaration does not read as `none` — it
	// silently falls back to 300px. That is a visible 120px shrink at every desktop width
	// that a shape check waves straight through. Verified: with the cap class removed, the
	// old assertion passed on `max-height: 300px` and a 302px card.
	expect(
		parseFloat(g.listMaxHeight),
		`the cap resolved to ${g.listMaxHeight} — 300px means the declaration was dropped and CommandList's base class took over (check the calc() spacing)`,
	).toBeGreaterThan(400);

	// And the `--vvh` arm must actually be LIVE, not merely present in the class string: force
	// the visible band down to what a ~350pt iPad keyboard leaves and the cap must follow it.
	// This is the only assertion here that would notice the arm being edited out entirely —
	// verified against that exact mutant, which reports `got 420px`.
	const capped = await page.evaluate(() => {
		document.documentElement.style.setProperty('--vvh', '484px');
		const list = document.querySelector('[data-slot=command-list]') as HTMLElement;
		const v = getComputedStyle(list).maxHeight;
		document.documentElement.style.removeProperty('--vvh');
		return v;
	});
	expect(
		parseFloat(capped),
		`with the visible band at 484px the list must cap to 416px (484 - 54 header - 14 for the card's gap, borders and breathing), got ${capped}`,
	).toBeCloseTo(416, 0);
});

/**
 * THE ROW KEEPS ITS RIGHT EDGE WHILE THE SEARCH IS OPEN (2026-08-18).
 *
 * Opening the field used to make the trailing cluster vanish outright, and on a real iPad
 * that read wrong: *"it looks really odd that it takes up all the space."* The width is
 * still reclaimed — the cluster now collapses into ONE hamburger carrying everything it
 * displaced, instead of into nothing.
 *
 * The assertion that matters most here is the third one, and it guards a trap this feature
 * walked straight into: the hamburger is a SIBLING of the Command widget, not a descendant,
 * so the field's capture-phase outside-click dismissal closed the search on the very
 * pointerdown that opens the menu — unmounting the trigger mid-press, so the menu never
 * appeared. `[data-inline-search-keep-open]` is the exception that fixes it, and nothing
 * else would notice if it were removed: the button still renders, still has its name, and
 * the only symptom is that pressing it does nothing.
 */
test('the open search collapses the row into one menu, and that menu can actually be opened', async ({ page }) => {
	// Closed: the tail is in the row, and the overflow menu closes it. The menu is
	// PERMANENT as of the width-ladder pass — it is the row's right edge at every width,
	// and the home for whatever the width has pushed out of the row. It used to appear
	// only while the search was open; asserting its absence here was encoding that.
	await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
	await expect(page.getByRole('button', { name: CHROME.searchOverflow })).toHaveCount(1);

	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeFocused();

	// Open: the tail has collapsed, and the hamburger stands where it was.
	const burger = page.getByRole('button', { name: CHROME.searchOverflow });
	await expect(burger, 'the open search must leave a control on the row’s right edge, not an empty bar').toBeVisible();
	await expect(page.getByRole('button', { name: 'Present' }), 'the tail should have collapsed INTO the menu').toHaveCount(0);

	// It must survive its own press. Without the dismissal exception the search closes on
	// pointerdown, the button unmounts, and this click opens nothing.
	await burger.click();
	await expect(page.getByRole('menuitem', { name: 'Present' }), 'the overflow menu did not open — the search dismissed itself on the press').toBeVisible();
	await expect(page.getByPlaceholder('Search or run a command…'), 'pressing the row’s own menu must not dismiss the field').toBeVisible();

	// And running something from it leaves the search behind rather than stranding it open.
	// The light/dark row on purpose: it opens NOTHING, so what is asserted afterwards is the
	// row restoring, not a modal covering it. (Workspace settings was the first choice and
	// made this test lie — its dialog marks the row inert, so "Present is not visible" said
	// nothing about whether the row came back.)
	await page.getByRole('menuitem', { name: /Switch to (light|dark) mode/ }).click();
	await expect(page.getByPlaceholder('Search or run a command…'), 'running a row must close the search, not strand it open behind the result').toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Present' }), 'closing the search must restore the row').toBeVisible();
	await expect(page.getByRole('button', { name: CHROME.searchOverflow }), 'the overflow menu is the row’s permanent right edge — it does not come and go').toHaveCount(1);
});

/**
 * FOCUS RETURNS TO THE PILL ON DISMISSAL (#1707).
 *
 * At desktop the palette is the header's own combobox, not a dialog, and that swap cost a
 * behavior Radix had been providing for free: a dialog restores focus to its trigger on
 * close, whereas an inline field that UNMOUNTS while focused drops focus to `<body>`.
 * Measured before the fix: after Escape, `document.activeElement` was BODY — so
 * Escape-then-Enter did nothing and a screen reader lost its place in the row. Tab only
 * appeared to work because Chromium resumes from the removed element's sequential-focus
 * position, which happens to be where the pill re-renders; that is luck, not behavior.
 *
 * The other half of the contract is that focus is reclaimed ONLY when it was orphaned. A
 * click into the editor moved focus deliberately, and yanking it back to the header would
 * fight the user — so that path is asserted too, in the opposite direction. Both cases run
 * against the real browser because focus is exactly the kind of thing jsdom models loosely.
 */
test('dismissing the inline search hands focus back to the pill — but never steals it', async ({ page }) => {
	const pill = page.getByRole('button', { name: 'Search or run a command' });
	const field = page.getByPlaceholder('Search or run a command…');

	// ESCAPE — focus was orphaned by the unmount, so the pill takes it back.
	await page.keyboard.press('ControlOrMeta+k');
	await expect(field).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(pill).toBeVisible();
	await expect(pill, 'Escape must return focus to the collapsed combobox (APG), not drop it on <body>').toBeFocused();

	// OUTSIDE CLICK — the user moved focus on purpose; leave it where they put it.
	await page.keyboard.press('ControlOrMeta+k');
	await expect(field).toBeFocused();
	await page.getByLabel('Deck source').click();
	await expect(pill).toBeVisible();
	await expect(pill, 'a click into the editor moved focus deliberately — the pill must not yank it back').not.toBeFocused();
});
