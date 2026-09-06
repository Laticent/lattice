import { expect, test } from './studio-fixture';

// RESERVED SLOTS — the two places the pre-paint shell cannot know its content, and the
// METAMORPHIC relation that keeps them from moving the row.
//
// WHY THIS SPEC EXISTS. The shell mirrors the app's chrome, and two things in that chrome are
// per-deck content it has no way to know before React runs: the deck pill's slide-count meta
// ("7 slides") and the preview bar's counter ("Slide 1 / 7"). Both used to be a skeleton bar
// whose pixel width was FITTED to the welcome deck's own string and measured once — `w-[53px]`
// against "7 slides", `w-12` against "Slide 1 / 7". A fitted width is correct for exactly one
// deck, and it was not even correct for that one: the app's real meta is 56px, so the pill and
// every control after it — the band rule and all three posture-dial buttons — sat 3px left of
// where the app was about to put them, and slid sideways the moment React took over.
//
// WHY NOTHING CAUGHT IT. `studio-shell-parity.spec.ts` measured that 3px and CONCEDED it: a
// `PILL_TOL = 6` for the pill plus a second exemption widening the dial's `left` to match,
// both commented as structural variance owed to "the reserved slide-count slot the shell must
// not draw". A guard widened to fit the defect it watches for reports only that the defect has
// not grown. Both exemptions are gone now, because the cause is.
//
// THE FIX, AND THEREFORE THE CONTRACT. Neither slot is measured any more. Both take a fixed,
// content-independent width from ONE shared constant per slot (`DECK_META_SLOT`,
// `SLIDE_COUNTER_SLOT` in `chrome-parts.tsx`), which the app's chrome and the shell's skeleton
// both spread. Parity then holds BY CONSTRUCTION for every deck instead of by re-measurement
// for one, and each slot is marked `data-shell-unknowable` on both surfaces so this spec can
// find them without knowing their markup.
//
// The three arms below are the three ways that contract can break, and only the third is a
// relation rather than a comparison:
//
//   1. the two surfaces disagree about the slot's width      (shell ↔ app)
//   2. the reservation is too small for the real text        (it would overflow, and grow)
//   3. changing the DECK CONTENT moves the layout            (the metamorphic one)
//
// Arm 3 is the one that generalises. It needs no oracle and no expected value: it changes an
// input the slot's content depends on — paging to another slide, switching to a deck with a
// different slide count — and demands the geometry come back identical. That is the property
// a reader actually experiences, and it is the property a fitted width can never have, because
// a fitted width is only ever right for the input it was fitted to.

// >= 1280, because the deck meta is `xl`-gated and one arm needs BOTH slots on screen. The
// phone tier is not sampled here on purpose: the metamorphic sweep this spec came from covers
// 22 widths from 320 up, and what it finds below 700 is `mobileBarH`'s frozen-constant band
// offset (#2070), which is not this contract and would fail this spec for the wrong reason.
const WIDE = { width: 1440, height: 900 };

type Slot = { key: string; box: [number, number, number, number]; fits: boolean };

const READ_SLOTS = (scope: string) => `(${((sel: string) => {
	const root = document.querySelector(sel);
	if (!root) return [];
	return [...root.querySelectorAll('[data-shell-unknowable]')].map((el) => {
		const b = el.getBoundingClientRect();
		return {
			key: el.getAttribute('data-shell-unknowable') as string,
			box: [Math.round(b.x * 100) / 100, Math.round(b.y * 100) / 100, Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100],
			// The reservation has to hold the real string. `scrollWidth > clientWidth` means it
			// does not, which is the same defect in the other direction: the slot grows, and the
			// row moves for that deck only.
			fits: el.scrollWidth <= el.clientWidth + 1,
		};
	});
}).toString()})(${JSON.stringify(scope)})`;

/**
 * Wait for the thing this spec measures to stop moving, rather than sleeping on a guess.
 *
 * The signal is the slot's OWN width across two consecutive frames. It used to have two
 * causes; under `font-display: optional` (fonts.css) it has one. Webfonts no longer swap in
 * mid-document, so they no longer move content-sized controls while a measurement is running —
 * what remains is the content transform below, which writes into the node and needs the next
 * layout before it reads a box back.
 * Both are "the geometry has settled", so both are polled on the geometry itself.
 */
async function settle(page: import('@playwright/test').Page) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForFunction(
		() =>
			new Promise<boolean>((resolve) => {
				const el = document.querySelector('[data-shell-unknowable]');
				if (!el) return resolve(true);
				const a = el.getBoundingClientRect().width;
				requestAnimationFrame(() => resolve(el.getBoundingClientRect().width === a));
			}),
		null,
		{ timeout: 10_000 },
	);
}

test('@smoke the shell and the app reserve the same slot, and the reservation holds the real text', async ({ page }) => {
	await page.setViewportSize(WIDE);
	// Hold the engine so the shell is measurable before the island replaces it — the same
	// device `studio-shell-parity` uses, for the same reason.
	await page.route('**/lattice-playground.js', async (route) => {
		await new Promise((r) => setTimeout(r, 2500));
		await route.continue();
	});
	await page.goto('/studio/', { waitUntil: 'commit' });
	await page.locator('#studio-ssr-shell .ssr-topbar').waitFor({ state: 'attached' });
	await settle(page);
	const shell = (await page.evaluate(READ_SLOTS('#studio-ssr-shell'))) as Slot[];
	expect(shell.length, 'the shell was dismissed before its slots could be measured').toBeGreaterThan(0);

	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
	await settle(page);
	const app = (await page.evaluate(READ_SLOTS('[data-studio-root]'))) as Slot[];

	// Arm 1 — the same slots, the same widths. Exact, not toleranced: both sides spread the
	// same class string, so any difference at all means they stopped doing that.
	expect(app.map((s) => s.key).sort(), 'the app and the shell disagree about which slots are unknowable').toEqual(shell.map((s) => s.key).sort());
	for (const a of app) {
		const s = shell.find((x) => x.key === a.key);
		expect(s, `slot "${a.key}" is in the app and not in the shell`).toBeTruthy();
		expect(s?.box[2], `slot "${a.key}" width: shell ${s?.box[2]} vs app ${a.box[2]} — the shared constant is no longer shared`).toBe(a.box[2]);
	}

	// Arm 2 — the reservation is big enough for what the app actually renders into it.
	for (const a of app) expect(a.fits, `slot "${a.key}" overflows its reservation — the real text no longer fits, so this deck's row is wider than every other deck's`).toBe(true);
});

test('paging to another slide does not move the counter or anything after it', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/studio/');
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await settle(page);

	const counter = page.locator('[data-shell-unknowable="slide-counter"]');
	const after = page.getByRole('button', { name: 'Next slide', exact: true });
	const before = { c: await counter.boundingBox(), a: await after.boundingBox(), text: await counter.textContent() };

	await after.click();
	await settle(page);
	const now = { c: await counter.boundingBox(), a: await after.boundingBox(), text: await counter.textContent() };

	// The INPUT changed — this is what makes the next two assertions a relation and not a
	// tautology. If the counter still reads the same slide the page did not navigate and the
	// geometry check below proves nothing.
	expect(now.text, 'the counter did not change, so this never exercised the relation').not.toBe(before.text);
	expect(now.c?.width, 'the slide counter resized when the slide number changed').toBeCloseTo(before.c?.width as number, 1);
	expect(now.a?.x, 'the control after the counter moved when the slide number changed').toBeCloseTo(before.a?.x as number, 1);
});

test('a slot does not resize when its content does — the relation, over the whole reserved range', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/studio/');
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await settle(page);

	// TWO transforms, because the cheap one is not sufficient and it took a mutation run to
	// show it. Switching decks is a REAL input change, but the shipped decks' counts are both
	// single-digit, so the meta text goes "7 slides" -> "9 slides" — identical width in a mono
	// face. That arm passed with the reservation deleted. It stays because a real input change
	// is worth exercising, but the assertion that carries the contract is the second one, which
	// walks the slot's content across the digit boundaries the reservation exists to absorb.
	const meta = page.locator('[data-shell-unknowable="deck-meta"]');
	const before = { text: await meta.textContent(), box: await meta.boundingBox() };
	await page.locator('[data-demo="deck-switcher"]').click();
	const others = page.getByRole('menuitem').filter({ hasNotText: /Rename|New deck|Import/ });
	if ((await others.count()) >= 2) {
		await others.nth(1).click();
		await settle(page);
		await expect(meta).not.toHaveText(before.text as string, { timeout: 15_000 });
		expect((await meta.boundingBox())?.width, 'the meta slot resized when the deck changed').toBeCloseTo(before.box?.width as number, 1);
	} else {
		await page.keyboard.press('Escape');
	}

	// The content transform. Each slot is driven across its whole reserved range — 1 slide to
	// 999, slide 1 of 7 to slide 100 of 999 — and its box must not move. No expected width is
	// written down anywhere here: the relation is that the width is the SAME for every input,
	// whatever that width happens to be, which is the one property a fitted number can never
	// have. Writing into the node is deliberate: it reaches widths the shipped decks do not,
	// and React re-renders from state, so the next paint restores the real text.
	for (const [key, samples] of [
		['deck-meta', ['1 slide', '7 slides', '12 slides', '999 slides']],
		['slide-counter', ['Slide 1 / 7', 'Slide 9 / 9', 'Slide 10 / 12', 'Slide 100 / 999']],
	] as const) {
		const slot = page.locator(`[data-shell-unknowable="${key}"]`);
		const widths: number[] = [];
		for (const text of samples) {
			await slot.evaluate((el, t) => { el.textContent = t; }, text);
			await settle(page);
			const b = await slot.boundingBox();
			widths.push(Math.round((b?.width ?? -1) * 100) / 100);
			expect(await slot.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `slot "${key}" overflows its reservation at "${text}"`).toBe(true);
		}
		expect(new Set(widths).size, `slot "${key}" changed width across its own reserved range: ${samples.map((t, i) => `${t}=${widths[i]}px`).join(' · ')} — every deck whose count lands in a different bucket draws a different row`).toBe(1);
	}
});
