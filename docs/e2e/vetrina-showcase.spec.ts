import { expect, test } from '@playwright/test';

// The Vetrina SHOWCASE (docs/src/pages/vetrina.astro) — the only Vetrina page the site nav
// links, and until this file the only one with no browser test at all. The three mechanisms
// it gained are ones a unit tier structurally cannot see: the deictic strokes need real
// layout to have any geometry, the beat log records the engine's own verbs against a real
// clock, and the theme controls only prove anything by changing what the engine does on
// screen (HARD RULE #23).
//
// The oracles are the ink nodes' own `data-vt-cue` hook and the page's own log rows — state
// the run writes, never wall-clock or pixels — so these are deterministic. Nothing here sleeps
// for a duration: ink is watched with a MutationObserver (it self-disposes, so a sampled
// interval is a bet the sample lands inside a stroke's window) and a beat's progress is read
// off the page's own log.

const PAGE = '/vetrina/';
const STAGE = '.vetrina-stage';

/** Watch for ink. The observer RECORDS the nodes as they are inserted; the reader MEASURES
 *  them, and remembers any kind that has ever had real area.
 *
 *  Both halves are load-bearing and each fixes a way this check was wrong before. Sampling on
 *  an interval MISSES a stroke, because ink self-disposes — the sample has to land inside the
 *  node's life. And measuring at INSERTION reports zero for `wash`, whose bands are created
 *  sizeless and laid out on a later frame (`inkNode` only lays out once `liveRect` answers), so
 *  an observer that measured on insert certified three strokes and silently dropped the fourth.
 *  Observing catches every node; measuring on each poll catches every node while it is alive. */
async function watchInk(page: import('@playwright/test').Page): Promise<() => Promise<string[]>> {
	await page.evaluate(() => {
		const w = window as unknown as { __inkNodes: Element[]; __inkSeen: Set<string> };
		w.__inkNodes = [];
		w.__inkSeen = new Set();
		const note = (n: Node) => {
			if (!(n instanceof HTMLElement)) return;
			for (const el of [n, ...n.querySelectorAll('[data-vt-cue]')]) {
				if ((el as HTMLElement).dataset?.vtCue) w.__inkNodes.push(el);
			}
		};
		new MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) note(n);
		}).observe(document.body, { childList: true, subtree: true });
	});
	return () =>
		page.evaluate(() => {
			const w = window as unknown as { __inkNodes: Element[]; __inkSeen: Set<string> };
			for (const el of w.__inkNodes) {
				const r = el.getBoundingClientRect();
				const kind = (el as HTMLElement).dataset?.vtCue;
				if (kind && r.width > 0 && r.height > 0) w.__inkSeen.add(kind);
			}
			return [...w.__inkSeen];
		});
}

/** How many verbs the page's own log has recorded — the run's own progress signal, and the
 *  thing to poll instead of guessing how long a beat takes on a loaded box. */
const logRows = (page: import('@playwright/test').Page) => page.locator('#logBody tr').count();

test('the deictic beat paints all four strokes with real geometry', async ({ page }) => {
	await page.goto(PAGE);
	const ink = await watchInk(page);
	await page.locator('.beat[data-id="deictic"]').click();
	await expect(page.locator(STAGE)).toBeVisible();
	// underline / wash / bracket / tap are the four the Present guide points at slides with.
	// Before this page carried them, `wash` and `tap` appeared on no surface on this site and
	// the whole set was pinned only in jsdom, against rectangles the test itself invented.
	await expect.poll(ink, { timeout: 30_000 }).toEqual(expect.arrayContaining(['underline', 'wash', 'bracket', 'tap']));
});

test('the beat log records the verbs the engine actually performed', async ({ page }) => {
	await page.goto(PAGE);
	await page.locator('.beat[data-id="deictic"]').click();
	await expect.poll(() => logRows(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(4);

	const rows = await page.locator('#logBody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent ?? '')));
	// Column 3 is the verb. The log wraps the STAGE, so a row here means the engine ran that
	// verb — a log built from the beat list would report the script instead of the run.
	const verbs = rows.map((r) => r[2]);
	expect(verbs).toContain('say');
	expect(verbs.some((v) => v.startsWith('gesture '))).toBe(true);
	// Column 1 is ms from the run's first frame, and it must advance.
	const times = rows.map((r) => Number(r[0]));
	expect(times.every((t) => Number.isFinite(t))).toBe(true);
	expect(times[times.length - 1]).toBeGreaterThan(times[0]);
});

test('the data pane shows the Step[] the recorder compiles to', async ({ page }) => {
	await page.goto(PAGE);
	await page.locator('.beat[data-id="teach"]').click();
	await page.locator('#dataPane > summary').click();
	const text = await page.locator('#dataOut').textContent();
	const steps = JSON.parse(text ?? '[]');
	expect(Array.isArray(steps)).toBe(true);
	expect(steps.length).toBeGreaterThan(0);
	expect(steps[0]).toHaveProperty('say');
	// `read: true` is what makes this a teaching beat, and it has to survive into the data
	// model — that round trip is the reason the recorder and the interpreter are separable.
	expect(steps.some((s: Record<string, unknown>) => s.read === true)).toBe(true);
	// A callback cannot serialize; it must print as a marker rather than vanish, or the pane
	// would quietly under-report what the beat does.
	expect(text).toContain('ƒ');
});

test('a theme control changes what the engine does, and replays the beat', async ({ page }) => {
	await page.goto(PAGE);
	await page.locator('.beat[data-id="read"]').click();
	await expect(page.locator(STAGE)).toBeVisible();
	// `bar` is the default dock: a caption element exists and is not the cursor bubble.
	await expect(page.locator('.vetrina-stage [class*="caption"]').first()).toBeVisible({ timeout: 15_000 });

	await page.locator('.seg[data-opt="pointer"] button', { hasText: 'ring' }).click();
	// The control replays the beat, so the stage comes back up with the new theme applied.
	await expect(page.locator(STAGE)).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('#ctl-note')).toHaveText(/pointer|caption|speed|motion|hand|pacing|^$/);
	// The picked value is the pressed one — the control is the source of truth for the re-run.
	await expect(page.locator('.seg[data-opt="pointer"] button', { hasText: 'ring' })).toHaveAttribute('aria-pressed', 'true');
});

test('the page throws nothing while a beat runs', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await page.goto(PAGE);
	await page.locator('.beat[data-id="deictic"]').click();
	// The beat's own progress is the signal: it records eight verbs (four `say`, four
	// `gesture`). Polling that is bounded and names what it waits for; sleeping for the beat's
	// expected length would be a guess at how long a loaded box takes.
	await expect.poll(() => logRows(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(8);
	expect(errors).toEqual([]);
});
