import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Quick scroll — the jump-to-top / jump-to-bottom control (components/ui/quick-scroll.tsx, lib/quick-scroll.ts).
 *
 * What a reader would notice if it broke, one test each:
 *   - it never shows up, or a click does not reach the end (Playground preview, a frame's own document);
 *   - it shows up when the APP scrolls a pane, not the reader (the preview following the editor's caret);
 *   - on a mouse, the rail sits on a slide's delete button in Compose (a misclick next to a delete);
 *   - on a phone, the corner stack sits on the Studio's "New slide" button.
 * Every wait is on a state (a data attribute, a scroll position), never a duration (HARD RULE #32).
 */

const control = (page: Page, dir: 'top' | 'bottom') => page.locator(`[data-slot=quick-scroll][data-dir=${dir}]`);
const shown = (l: Locator) => expect(l).toHaveAttribute('data-state', 'shown');
const hidden = (l: Locator, timeout?: number) => expect(l).toHaveAttribute('data-state', 'hidden', timeout ? { timeout } : undefined);

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openPlayground(page: Page) {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await expect.poll(() => page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		return w.document.documentElement.scrollHeight > w.innerHeight * 2;
	})).toBe(true);
}

test('@gecko @crosswidth @webkit-tablet Playground preview: a wheel shows the rail, a click reaches the last slide, and it hides when idle', async ({ page }) => {
	await openPlayground(page);
	const box = await page.locator('#preview').boundingBox();
	if (!box) throw new Error('preview frame has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 600);

	const down = control(page, 'bottom');
	await shown(down);
	await expect(down).toHaveAttribute('data-layout', 'rail');
	await shown(control(page, 'top'));

	await down.click();
	await expect.poll(() => page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		return w.document.documentElement.scrollHeight - w.innerHeight - w.scrollY;
	})).toBeLessThanOrEqual(4);
	// At the end, the arrow for that end goes; then, with the pointer elsewhere, the whole control idles out.
	await hidden(down);
	await page.mouse.move(5, 5);
	await hidden(control(page, 'top'), 5000);
});

test('@gecko @crosswidth @webkit-tablet Playground preview: the app scrolling the preview does not show the control; the reader does', async ({ page }) => {
	await openPlayground(page);
	// Scroll it the way the editor's caret-follow does: from script, with no reader input on the frame. ONE read,
	// taken after the frame's scroll event and two frames, never a retrying "count is 0": that would pass once the
	// control idled out 1.5s later, which is how this test's first draft survived its own failing arm.
	const shownAfterAppScroll = await page.evaluate(() => new Promise<number>((done) => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		w.addEventListener('scroll', () => requestAnimationFrame(() => requestAnimationFrame(() =>
			done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length))), { once: true });
		w.scrollTo(0, 900);
	}));
	expect(shownAfterAppScroll).toBe(0);
	// The control is alive, so the 0 above was a decision: a reader's wheel on the same frame shows it.
	const box = await page.locator('#preview').boundingBox();
	if (!box) throw new Error('preview frame has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 300);
	await shown(control(page, 'top'));
});

test('Studio Compose: on a mouse the rail clears every slide delete button', async ({ page }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	const box = await host.boundingBox();
	if (!box) throw new Error('Compose has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 500);

	const up = control(page, 'top');
	await shown(up);
	const rail = await up.boundingBox();
	if (!rail) throw new Error('rail has no box');
	const deletes = await host.locator('.cs-sc-delete').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right).filter((r) => r > 0));
	expect(deletes.length).toBeGreaterThan(0);
	for (const right of deletes) expect(right).toBeLessThanOrEqual(rail.x - 4);
});

test('@webkit-phone Studio Compose: on a phone the stack sits above the New slide button', async ({ page }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: /^Compose/ }).first().click();
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	// A touch-drag, as the control hears it: the reader's touch on the pane, then the pane moving.
	await host.evaluate((el) => {
		el.dispatchEvent(new Event('touchstart', { bubbles: true }));
		el.scrollTop = el.scrollHeight / 3;
	});

	const up = control(page, 'top');
	const down = control(page, 'bottom');
	await shown(down);
	await expect(down).toHaveAttribute('data-layout', 'stack');
	const fab = await page.locator('[data-new-slide=fab]').boundingBox();
	const a = await up.boundingBox();
	const b = await down.boundingBox();
	if (!fab || !a || !b) throw new Error('missing a box');
	expect(b.width).toBeGreaterThanOrEqual(44);
	expect(overlaps(a, fab)).toBe(false);
	expect(overlaps(b, fab)).toBe(false);
	expect(b.y + b.height).toBeLessThanOrEqual(fab.y);
});

/** Wait until the pane holds still: its box and scrollTop unchanged across two animation frames. The Studio
 *  keeps laying out and scrolling for a moment after Compose appears (and after a click into it), and a test
 *  that reads a position or scrolls during that settling races it (seen 1 in 144: a `before` read mid-scroll;
 *  a pane resize dropping a just-shown control). A signal, not a sleep (HARD RULE #32). */
async function settled(host: Locator) {
	await expect
		.poll(() =>
			host.evaluate(
				(el) =>
					new Promise<boolean>((done) => {
						const sig = () => {
							const r = el.getBoundingClientRect();
							return `${r.width}x${r.height}@${el.scrollTop}`;
						};
						const a = sig();
						requestAnimationFrame(() => requestAnimationFrame(() => done(sig() === a)));
					}),
			),
		)
		.toBe(true);
}

async function openCompose(page: Page) {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	await settled(host);
	const box = await host.boundingBox();
	if (!box) throw new Error('Compose has no box');
	return { host, box };
}

test('@gecko Studio Compose: typing that scrolls the pane (spaces included) does not show the control', async ({ page }) => {
	const { host, box } = await openCompose(page);
	// The pointer rests on the pane, as it does while someone types: the hover path must still refuse a
	// scroll that typing caused. A click into the text is not reader scroll intent either. Click a paragraph
	// ALREADY in view: clicking the last one made Playwright scroll it into view under the hovering pointer
	// before the press (seen in Gecko, 6 of 20), a scroll no reader makes, which the hover path rightly counted.
	await host.locator('.ProseMirror p').first().click();
	await settled(host);
	await page.keyboard.press('ControlOrMeta+End');
	await settled(host);
	const before = await host.evaluate((el) => el.scrollTop);
	await page.keyboard.type('one two three ');
	for (let i = 0; i < 12; i++) await page.keyboard.press('Enter');
	await page.keyboard.type('four five ');
	// ONE read once the caret-follow scroll has moved the pane and two frames have passed (not a retrying count).
	await expect.poll(() => host.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
	const shownWhileTyping = await page.evaluate(() => new Promise<number>((done) =>
		requestAnimationFrame(() => requestAnimationFrame(() => done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length)))));
	expect(shownWhileTyping).toBe(0);
	// Alive, so the 0 was a decision: the reader's wheel on the same pane shows it.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -400);
	await shown(control(page, 'top'));
});

test('@gecko Studio Compose: a scroll with no DOM event, under a resting pointer, shows the control', async ({ page }) => {
	// The shape of a scrollbar drag in an engine that sends no event for the press: the pointer is over the
	// pane, nobody typed, and the pane moves.
	const { host, box } = await openCompose(page);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await host.evaluate((el) => {
		el.scrollTop = el.scrollHeight / 3;
	});
	await shown(control(page, 'top'));
});

test('Studio Compose: a wheel over a shown button scrolls the pane under it', async ({ page }) => {
	const { host, box } = await openCompose(page);
	// Aim at where the TOP rail button appears (lib/quick-scroll.ts: INSET 8, rail SIZE 28), so the wheel that
	// reveals it leaves the pointer on it. The precondition is a STATE, not a race against the 1.5s idle: the
	// button is shown, under the pointer and hovered, which holds it open. Under load the first draft lost that
	// race and wheeled the bare pane; its retry then wheeled DOWN onto the bottom button until the pane reached
	// the end, where that arrow hides by design. The top arrow stays wanted the whole way down.
	const gutter = await host.evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth);
	const x = box.x + box.width - gutter - 8 - 14;
	const y = box.y + 8 + 14;
	const up = control(page, 'top');
	await expect(async () => {
		await page.mouse.move(x - 1, y);
		await page.mouse.wheel(0, 120);
		await expect(up).toHaveAttribute('data-state', 'shown', { timeout: 2000 });
		await page.mouse.move(x, y);
		expect(await up.evaluate((el) => el.matches(':hover'))).toBe(true);
		await expect(up).toHaveAttribute('data-state', 'shown', { timeout: 500 });
	}).toPass();
	const before = await host.evaluate((el) => el.scrollTop);
	await page.mouse.wheel(0, 300);
	await expect.poll(() => host.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
});

test('Studio Compose: a resize while a button is hovered does not leave the control stuck on screen', async ({ page }) => {
	const { box } = await openCompose(page);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, 300);
	const up = control(page, 'top');
	await shown(up);
	await up.hover();
	await page.setViewportSize({ width: 1400, height: 900 });
	await expect(up).toHaveCount(0);
	const nb = await page.locator('.cs-host').boundingBox();
	if (!nb) throw new Error('Compose has no box');
	await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
	await page.mouse.wheel(0, 200);
	await shown(control(page, 'top'));
	// It must idle out again: before the fix the stale hover kept it shown indefinitely.
	await hidden(control(page, 'top'), 5000);
});

test('@gecko Playground: typing in the editor, with the pointer resting on the preview, does not show the preview control', async ({ page }) => {
	await openPlayground(page);
	await page.locator('.pg-mode button, .pg-mode [role=tab]').nth(1).click();
	const editor = page.locator('#editor-host .cm-content');
	await expect(editor).toBeVisible();
	await editor.click();
	// Rest the pointer on the preview, the way a reader watches it while typing.
	const box = await page.locator('#preview').boundingBox();
	if (!box) throw new Error('preview frame has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.keyboard.type(' typed');
	// The preview following the caret, done the way the app does it: a keystroke in the editor, then the preview
	// scrolled from script, in ONE task so no timing separates them. (The first draft waited for the app's own
	// follow, which did not always move the preview, and failed 8 times in 10.) The read comes after the
	// preview's scroll event and two frames, never a retrying count.
	const shownWhileTyping = await page.evaluate(
		() =>
			new Promise<number>((done) => {
				const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
				const typed = document.querySelector('#editor-host .cm-content') as HTMLElement;
				w.addEventListener(
					'scroll',
					() => requestAnimationFrame(() => requestAnimationFrame(() => done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length))),
					{ once: true },
				);
				typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
				w.scrollTo(0, w.scrollY + 600);
			}),
	);
	expect(shownWhileTyping).toBe(0);
	// Alive, so the 0 was a decision: the reader's wheel on the preview shows it.
	await page.mouse.wheel(0, 400);
	await shown(control(page, 'top'));
});

test('@gecko Playground preview: a typing key inside the preview frame is not reader scroll intent', async ({ page }) => {
	await openPlayground(page);
	// The key is built from the FRAME's own KeyboardEvent, as a real key in the frame is: an `instanceof` check
	// against the top page's constructors misread it as a paging key, so the next app scroll showed the control.
	const shownAfterFrameKey = await page.evaluate(
		() =>
			new Promise<number>((done) => {
				const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window & typeof globalThis;
				w.addEventListener(
					'scroll',
					() => requestAnimationFrame(() => requestAnimationFrame(() => done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length))),
					{ once: true },
				);
				w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
				w.scrollTo(0, w.scrollY + 600);
			}),
	);
	expect(shownAfterFrameKey).toBe(0);
	// A PAGING key inside the frame is reader intent, so the same app scroll after it shows the control.
	await page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window & typeof globalThis;
		w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
		w.scrollTo(0, w.scrollY + 600);
	});
	await shown(control(page, 'top'));
});

test('@gecko Studio Compose: a click into the text, then the app scrolling the pane, does not show the control', async ({ page }) => {
	const { host } = await openCompose(page);
	// Clicking into Compose makes the Studio scroll the active slide into view a moment later. The pointer then
	// rests on the pane, and nobody has typed, so that app scroll used to pass the hover path. Here the app's
	// scroll is made from script in the task right after the press, so the outcome never depends on its timing.
	const p = host.locator('.ProseMirror p').first();
	await p.click();
	const shownAfterClick = await host.evaluate(
		(el) =>
			new Promise<number>((done) => {
				el.addEventListener(
					'scroll',
					() => requestAnimationFrame(() => requestAnimationFrame(() => done(document.querySelectorAll('[data-slot=quick-scroll][data-state=shown]').length))),
					{ once: true },
				);
				el.scrollTop = el.scrollTop + 700;
			}),
	);
	expect(shownAfterClick).toBe(0);
});

test('@gecko Studio Compose: a press on an overlay scrollbar, then the drag, shows the control', async ({ page }) => {
	const { host } = await openCompose(page);
	// Headless browsers draw no scrollbar gutter, like an overlay bar (macOS by default): the press lands on the
	// scroller itself, inside its right edge. It must read as a press on the bar, not a click into content,
	// which would veto the hover path for the drag that follows (the card grader's final-round finding). The
	// pointer is never moved onto the pane, so only the press can make this scroll count.
	await host.evaluate((el) => {
		const r = el.getBoundingClientRect();
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.right - 6, clientY: r.top + r.height / 2 }));
		el.scrollTop = el.scrollTop + 700;
	});
	// A POSITIVE outcome waits for the state: a one-shot read two frames later raced React's render in Gecko
	// (1 in 120 under load) and read 0 for a control about to show.
	await shown(control(page, 'top'));
});

test('@gecko Studio Compose: a press on the overlay scrollbar of a bordered pane still counts as on the bar', async ({ page }) => {
	const { host } = await openCompose(page);
	// A border widens offsetWidth - clientWidth, which once read as a scrollbar gutter and switched the overlay
	// band off (card grader, final round). Give the pane a border, then press inside its right edge as the
	// overlay-bar test does.
	await host.evaluate((el) => {
		(el as HTMLElement).style.border = '3px solid transparent';
	});
	await settled(host);
	await host.evaluate((el) => {
		const r = el.getBoundingClientRect();
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.right - 9, clientY: r.top + r.height / 2 }));
		el.scrollTop = el.scrollTop + 700;
	});
	await shown(control(page, 'top'));
});
