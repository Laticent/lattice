// DOES THE PREVIEW STAY IN SYNC WITH THE EDITOR WHILE TYPING?
//
// Reported symptom: "the editor and preview are out of sync while typing." The suspect is the
// deck-context gate (`needsDeckContext` in docs/src/lib/single-slide-render.ts), which turned the
// slice render from a rare misalignment fallback into the PRIMARY path for a deck that sets no
// `paginate` / running-global directive / divider / `glossary: auto` — i.e. the shipped shape.
//
// The assertion is the one a human makes: after typing settles, the text in the preview frame is the
// text in the editor. Both gate branches are covered, because a bug on one side only would otherwise
// hide behind whichever deck the test happened to use.
import { expect, gotoStudio, livePreview, railButtons, setEditorContent, test } from './studio-fixture';

function slides(n: number): string {
	return Array.from({ length: n }, (_, i) => `## Heading ${i + 1}\n\nBody text for slide ${i + 1}.`).join('\n\n---\n\n');
}
/** No deck-scoped state — the gate renders the SLICE. The shipped default shape. */
const DEFAULT_DECK = `---\ntheme: indaco\n---\n\n${slides(5)}\n`;
/** `paginate` on — the gate renders the DECK and narrows to one section. */
const PAGINATED_DECK = `---\ntheme: indaco\npaginate: true\n---\n\n${slides(5)}\n`;

/** The visible text of the one section the preview frame is showing. */
async function previewText(page: import('@playwright/test').Page): Promise<string> {
	return (await livePreview(page).locator('.lattice section').first().innerText()).replace(/\s+/g, ' ').trim();
}

for (const [kind, deck] of [
	['default (gate renders the slice)', DEFAULT_DECK],
	['paginated (gate renders the deck)', PAGINATED_DECK],
] as const) {
	test(`preview tracks the editor while typing — ${kind}`, async ({ page }) => {
		test.setTimeout(180_000);
		await gotoStudio(page);
		await setEditorContent(page, deck);
		await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(5);

		// Work on the LAST slide so `ControlOrMeta+End` is guaranteed to land inside it whatever the
		// deck's shape — counting ArrowDowns overshoots and would silently test the wrong slide.
		const last = (await railButtons(page).count()) - 1;
		await railButtons(page).nth(last).click();
		await expect.poll(previewText.bind(null, page), { timeout: 15_000 }).toContain('Heading 5');

		await page.getByLabel('Deck source').click();
		await page.keyboard.press('ControlOrMeta+End');

		// Type a distinctive marker one key at a time — the real interaction. After EVERY keystroke
		// the preview must converge on what the editor holds; a lag of one keystroke is exactly the
		// reported symptom, so each step is checked rather than only the end state.
		const marker = 'SYNCPROBE';
		const lagged: string[] = [];
		for (let i = 0; i < marker.length; i++) {
			await page.keyboard.type(marker[i]);
			const want = marker.slice(0, i + 1);
			try {
				await expect.poll(previewText.bind(null, page), { timeout: 6_000 }).toContain(want);
			} catch {
				lagged.push(`after "${want}": preview showed ${JSON.stringify((await previewText(page)).slice(-60))}`);
			}
		}
		expect(lagged, `preview fell behind the editor:\n${lagged.join('\n')}`).toEqual([]);

		// And the settled end state, which is what a user stares at.
		await expect.poll(previewText.bind(null, page), { timeout: 15_000 }).toContain(marker);
	});
}

// The gentle version above (one key, then poll) passes. A user does not type that way, so these are
// the hostile variants: a fast burst with no pause, a throttled CPU that widens every window, an edit
// that changes the SLIDE COUNT, and an edit that flips the gate's own verdict mid-typing. Any of them
// leaving the preview showing something the editor does not hold is the reported bug.

test('preview converges after a FAST typing burst — no pause between keys', async ({ page }) => {
	test.setTimeout(180_000);
	await gotoStudio(page);
	await setEditorContent(page, DEFAULT_DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(5);
	const last = (await railButtons(page).count()) - 1;
	await railButtons(page).nth(last).click();
	await expect.poll(previewText.bind(null, page), { timeout: 15_000 }).toContain('Heading 5');
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	// 40 keys as fast as the driver will send them — many land inside one debounce window, so the
	// scheduler's backpressure and the memo are both under real contention.
	await page.keyboard.type('FASTBURSTabcdefghijklmnopqrstuvwxyz0123', { delay: 0 });
	await expect.poll(previewText.bind(null, page), { timeout: 20_000 }).toContain('FASTBURSTabcdefghijklmnopqrstuvwxyz0123');
});

test('preview converges while THROTTLED 4x — the mid-range-phone window', async ({ page, context }) => {
	test.setTimeout(240_000);
	await gotoStudio(page);
	await setEditorContent(page, DEFAULT_DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(5);
	const last = (await railButtons(page).count()) - 1;
	await railButtons(page).nth(last).click();
	await expect.poll(previewText.bind(null, page), { timeout: 15_000 }).toContain('Heading 5');
	const cdp = await context.newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('THROTTLEDBURST0123456789', { delay: 0 });
	await expect.poll(previewText.bind(null, page), { timeout: 40_000 }).toContain('THROTTLEDBURST0123456789');
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('preview tracks an edit that CHANGES THE SLIDE COUNT', async ({ page }) => {
	// Typing a separator re-splits the deck under the shown index. `slideCount` and `slideIndex` both
	// move, and `narrowToSlide` fails closed on any disagreement — so this is where an index could
	// name the wrong slide.
	test.setTimeout(180_000);
	await gotoStudio(page);
	await setEditorContent(page, PAGINATED_DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(5);
	const last = (await railButtons(page).count()) - 1;
	await railButtons(page).nth(last).click();
	await expect.poll(previewText.bind(null, page), { timeout: 15_000 }).toContain('Heading 5');
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\n---\n\n## Heading 6\n\nSIXTHSLIDE', { delay: 15 });
	await expect.poll(() => railButtons(page).count(), { timeout: 20_000 }).toBe(6);
	// Whatever the shell decides to show, the preview must show a slide that EXISTS in the editor and
	// must not be stuck on stale content.
	await expect.poll(previewText.bind(null, page), { timeout: 20_000 }).toMatch(/Heading 5|SIXTHSLIDE/);
});

test('preview tracks an edit that FLIPS the deck-context gate', async ({ page }) => {
	// Start on the slice path, then type a running-global directive comment — which makes
	// `needsDeckContext` true, so the very next render switches to the deck path. The render SOURCE
	// changes kind mid-typing; the frame it patches into was written for the other shape.
	test.setTimeout(180_000);
	await gotoStudio(page);
	await setEditorContent(page, DEFAULT_DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(5);
	const last = (await railButtons(page).count()) - 1;
	await railButtons(page).nth(last).click();
	await expect.poll(previewText.bind(null, page), { timeout: 15_000 }).toContain('Heading 5');
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nGATEFLIP <!-- footer: flipped -->', { delay: 15 });
	await expect.poll(previewText.bind(null, page), { timeout: 20_000 }).toContain('GATEFLIP');
});

// "Out of sync" can also mean the preview shows the WRONG SLIDE rather than stale text — the failure
// `narrowToSlide` fails closed against, and the one the whole-deck memo could cause if its key were
// incomplete. Walk every slide on both gate branches and assert the preview shows THAT slide.
for (const [kind, deck] of [
	['default (slice path)', DEFAULT_DECK],
	['paginated (deck path)', PAGINATED_DECK],
] as const) {
	test(`every slide shows ITS OWN content — ${kind}`, async ({ page }) => {
		test.setTimeout(180_000);
		await gotoStudio(page);
		await setEditorContent(page, deck);
		await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(5);
		const wrong: string[] = [];
		// Forward, then BACKWARD: a memo keyed without the shown index would serve the previous
		// slide, and a forward-only walk can mask that.
		for (const i of [0, 1, 2, 3, 4, 3, 2, 1, 0, 4]) {
			await railButtons(page).nth(i).click();
			try {
				await expect.poll(previewText.bind(null, page), { timeout: 8_000 }).toContain(`Heading ${i + 1}`);
			} catch {
				wrong.push(`slide ${i + 1}: showed ${JSON.stringify((await previewText(page)).slice(0, 60))}`);
			}
		}
		expect(wrong, `preview showed the wrong slide:\n${wrong.join('\n')}`).toEqual([]);
	});
}

// THE SHIPPED POSTURE. Every test above runs through `gotoStudio`, which seeds `posture: 'build'`
// before hydration so the full surface exists. A human opens the Studio in the calmer default, and
// `editorSlotVisible` (StudioShell) can PARK the editor preview — iframe kept warm, per-keystroke
// renders deferred — which is indistinguishable from "the preview is out of sync while typing". So
// this case deliberately does NOT seed the posture: it opens the Studio exactly as shipped and reaches
// the editor the way the UI makes you.
test('shipped default posture: typing still reaches the preview', async ({ page }) => {
	test.setTimeout(240_000);
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await expect(livePreview(page).locator('.lattice section').first()).toBeVisible({ timeout: 60_000 });

	// Reach the source editor however the shipped surface exposes it. In the calm posture it may sit
	// behind a control rather than being on screen, so this fails LOUDLY with what it saw instead of
	// silently typing into nothing (the failure mode that produced "typing is unmeasurable" earlier).
	const editor = page.getByLabel('Deck source');
	if (!(await editor.isVisible().catch(() => false))) {
		for (const name of [/Markdown source/i, /^Source$/i, /Edit this slide/i, /Compose/i]) {
			const b = page.getByRole('button', { name }).first();
			if (await b.isVisible().catch(() => false)) {
				await b.click();
				break;
			}
		}
	}
	await expect(editor, 'could not reach the source editor from the shipped posture').toBeVisible({ timeout: 30_000 });

	const before = await livePreview(page).locator('.lattice section').first().innerText();
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nPOSTUREPROBE', { delay: 20 });
	// The shown slide may not be the one holding the caret in this posture; either the preview picks up
	// the text, or it must at least have CHANGED. Standing still is the bug.
	await expect
		.poll(async () => livePreview(page).locator('.lattice section').first().innerText(), { timeout: 30_000 })
		.not.toBe(before);
});
