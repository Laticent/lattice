import { expect, gotoStudio, readStorage, test, toastText } from './studio-fixture';

// The PHONE-NATIVE "Watch demo" walkthrough (@mobile — 390px single-pane project).
// The desktop demo choreographs a cursor across the side-by-side editor+preview; a
// phone has ONE pane, so this storyboard alternates: tap Edit → type a slide → tap
// Preview → reveal, per slide. The load-bearing risk is that the mobile pane is
// conditionally rendered — the editor UNMOUNTS on Preview and REMOUNTS on the swap
// back — so the real oracle is end-to-end: the four-slide phone deck must land in the
// persisted "My First Deck" IN ORDER, with no slide dropped or duplicated by a
// remount race. If per-slide alternation + typeTail-across-remount works, the source
// is exactly four `_class` slides ending in `closing`.
//
// Mechanics (mount/unmount, typing, pane-swap, render) are NOT iOS-specific, so this
// 390px Chromium run is valid verification of them (HARD RULE #23). What it can NOT
// stand in for — real touch, iOS sheet behavior, the nested transform-scaled iframe —
// is owed on a real iPhone and tracked in the decision doc.

test.describe.configure({ timeout: 180_000 });

const STAGE = '.vetrina-stage';
const FIRST_DECK = 'My First Deck';

/** The persisted source of the demo-built "My First Deck" (empty until it's typed). We
 *  read THIS deck's src key specifically (not the first `src-*` key) so the seeded deck
 *  can't masquerade as the result. Autosave debounces ~400ms — read via expect.poll. */
async function firstDeckSource(page: import('@playwright/test').Page): Promise<string> {
	const idxRaw = await readStorage(page, 'lattice-studio-deck-index');
	if (!idxRaw) return '';
	let id = '';
	try {
		const d = (JSON.parse(idxRaw) as { id: string; title?: string }[]).find((x) => x.title === FIRST_DECK);
		id = d?.id ?? '';
	} catch {
		return '';
	}
	if (!id) return '';
	return (await readStorage(page, `lattice-studio-src-${id}`)) ?? '';
}

/** The `_class` slide count in a source string (one per slide). */
const slideClasses = (src: string) => (src.match(/<!--\s*_class:/g) ?? []).length;

/** Launch a tour from the persistent phone entry — "Menu" opens the StudioDrawer
 *  (2026-07-26-studio-mobile-eight-cell-bar.md; a bottom Sheet, replacing the old inlined "···"
 *  DropdownMenu). As of the "Two Doors" rebuild the tour cards no longer sit on the drawer's
 *  index: they live one level in, behind the "Show me" DOOR, which pushes a second level into
 *  the SAME sheet. So the phone path to a tour is three taps, and this helper walks all three
 *  — which is also the point of asserting it here: the drawer is the ONLY mobile entry to a
 *  guided tour (`StudioShell.tsx`'s tour menu is gated `!mobile`), and there is no first-run
 *  banner any more (the posture dial replaced it). Defaults to the full walkthrough (4 slides:
 *  title · big-number · radar · close). */
async function startMobileDemo(page: import('@playwright/test').Page, tourId = 'walkthrough'): Promise<void> {
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Show me' }).click();
	await page.locator(`[data-tour="${tourId}"]`).first().click();
}

test('@mobile the phone demo types the 4-slide deck across pane-swaps and completes', async ({ page }) => {
	await gotoStudio(page);
	await startMobileDemo(page);

	// The stage mounts over the single pane.
	await expect(page.locator(STAGE)).toBeVisible();

	// It alternates Edit⇄Preview, typing each slide; the built "My First Deck" grows to
	// the FULL four-slide phone deck — title → big-number → radar → closing, in order —
	// proving typeTail survived every editor unmount/remount.
	await expect.poll(() => firstDeckSource(page), { timeout: 90_000 }).toContain('_class: closing');
	const src = await firstDeckSource(page);
	expect(slideClasses(src)).toBe(4); // no slide dropped, none duplicated by a remount race
	expect(src.indexOf('_class: title')).toBeLessThan(src.indexOf('_class: big-number'));
	expect(src.indexOf('_class: big-number')).toBeLessThan(src.indexOf('_class: radar'));
	expect(src.indexOf('_class: radar')).toBeLessThan(src.indexOf('_class: closing'));

	// It completes on its own: the stage detaches and the deck is LEFT BEHIND.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 120_000 });
	await expect(toastText(page)).toContainText(FIRST_DECK);
	// Still a single "My First Deck" (deduped fixture — a re-run never doubles it).
	expect(await firstDeckSource(page)).toContain('_class: closing');
});

test('@mobile under prefers-reduced-motion the demo still TYPES the full deck (legible tier, not a collapse)', async ({ page }) => {
	// The reduced-motion regression this guards: a reduced-motion device used to collapse the
	// whole run to instant placement, so the iPhone demo raced past unwatchably. Vetrina now
	// resolves reduced-motion to the `legible` tier — vestibular motion off, but the typing
	// reveal KEPT. Force the OS preference and prove the run still builds the four-slide deck
	// in order and completes (it neither no-ops nor hangs under reduce). The char-by-char
	// cadence itself is unit-covered (motion.test.ts: system+reduce → still=false); this is the
	// real-surface guard that the end-to-end run survives the preference. (Chromium exercises
	// the media query + flag wiring; iOS Safari specifics remain owed on-device per the doc.)
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await gotoStudio(page);
	await startMobileDemo(page);

	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckSource(page), { timeout: 90_000 }).toContain('_class: closing');
	const src = await firstDeckSource(page);
	expect(slideClasses(src)).toBe(4);
	expect(src.indexOf('_class: title')).toBeLessThan(src.indexOf('_class: big-number'));
	expect(src.indexOf('_class: radar')).toBeLessThan(src.indexOf('_class: closing'));
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 120_000 });
});

test('@mobile a real tap mid-run takes over — stage detaches, the deck is kept', async ({ page }) => {
	await gotoStudio(page);
	await startMobileDemo(page);
	await expect(page.locator(STAGE)).toBeVisible();

	// Let it type real content, then the viewer taps a real control (the deck switcher in
	// the top bar — always present, not demo chrome). The only real input during a run is
	// the viewer's, so this unambiguously means "take over". Poll for TYPED text ("Q4 Board
	// Update"), not `_class: title` — the fresh deck's seed template carries a `_class: title`
	// too, so that marker would race the blank-then-type and fire before real content lands.
	await expect.poll(() => firstDeckSource(page), { timeout: 60_000 }).toContain('Q4 Board Update');
	await page.locator('[data-demo="deck-switcher"]').click({ force: true });

	// The stage tears down and what was typed is left behind (not restored to a prior deck).
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 15_000 });
	expect(await firstDeckSource(page)).toContain('Q4 Board Update');
	// The launch affordance is back.
	await page.keyboard.press('Escape'); // close the deck menu the tap opened
	await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
});
