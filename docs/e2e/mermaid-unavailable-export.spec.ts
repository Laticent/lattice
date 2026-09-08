import path from 'node:path';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

/**
 * THE TWO ARTIFACTS A FAILED DIAGRAM USED TO RUIN, ON THE REAL BUTTONS (#2092).
 *
 * `wrapFences` tags every ```mermaid fence `pending` at boot — before it can know whether
 * Mermaid will arrive — and `mermaid.css` hides a tagged fence in every state but `error`.
 * When Mermaid never arrived, nothing un-tagged it, so the author got an EMPTY SLOT where
 * their diagram belonged: in a file they had downloaded, permanently
 * (engineering/decisions/2026-09-05-diagram-fence-flash.md §7).
 *
 * WHY HERE AND NOT IN THE UNIT OR INTEGRATION TIER. The integration tier
 * (test/integration/mermaid/mermaid-unavailable.test.js) drives the runtime and the
 * shipped stylesheet against a document shaped like `buildSrcdoc`'s. It cannot see either
 * artifact this file is about, and both have their own machinery between the runtime and
 * what the author ends up holding:
 *   · the WEBPAGE export bakes the deck through an offscreen capture frame, waits on the
 *     runtime's own state machine, serializes the settled DOM, and then PRUNES the
 *     stylesheet to the selectors the baked markup uses — so a visibility rule that is
 *     correct in the engine can still be pruned out of the downloaded file;
 *   · the desktop PRINT document waits `load` + 450ms and nothing else. No diagram wait at
 *     all. A give-up that fired on the ten-second deadline would be far too late here, and
 *     no amount of unit coverage would say so.
 *
 * Mermaid is 404'd by aborting the request, which is the honest shape of the failure: the
 * document still carries its `<script src>`, the tag still fails, and the runtime learns
 * about it exactly the way it would on a CSP block or an offline machine.
 */

const SENTINEL = 'UNRENDERABLEFENCESENTINEL';
const F = String.fromCharCode(96, 96, 96);

const DECK = [
	'---', 'theme: indaco', '---', '',
	'# Cover', '',
	'---', '', '<!-- _class: diagram -->', '', '## The diagram', '',
	`${F}mermaid`, 'flowchart LR', `  A["${SENTINEL}"] --> B["Second"]`, F, '',
].join('\n');

/**
 * Walk the exported player to the diagram slide, and wait until it is really the live one.
 *
 * The player packs each slide in an `.lp-frame` and lays out only the active one, so a
 * `getBoundingClientRect()` taken on slide 1 reports 0x0 for a fence on slide 2 — a fence
 * that is present, correctly styled and simply not on screen. Measured that way once; it
 * looks exactly like the bug this file is about, which is the reason for the wait rather
 * than a press-and-hope.
 */
async function showDiagramSlide(viewer: import('@playwright/test').Page): Promise<void> {
	await viewer.keyboard.press('ArrowRight');
	await viewer.waitForFunction(() => {
		const pre = document.querySelector('pre[data-mermaid-state], marp-pre[data-mermaid-state]');
		const frame = pre ? pre.closest('.lp-frame') : null;
		// No frames at all (a flat document) is not a failure — nothing is paging anything.
		return frame ? frame.classList.contains('lp-active') : !!pre;
	}, { timeout: 30_000 });
}

/** Cut Mermaid off at the network, for every frame this page opens. */
async function breakMermaid(page: import('@playwright/test').Page): Promise<void> {
	await page.route('**/*mermaid*', (route) => route.abort());
}


/**
 * Let Mermaid ARRIVE and let the runtime TAG the fence — then make the drawing itself too slow.
 *
 * A different failure from the 404 above, and it took a wrong turn to find. Stalling the mermaid
 * SCRIPT does not reach it: the runtime never loads, so it never tags the fence, and an untagged
 * fence is not hidden by `mermaid.css` at all — it paints its own source already and there is
 * nothing to fix. The defect needs the runtime present and working: it tags the fence on its way
 * to drawing, `mermaid.css` therefore hides the source, and the export's bounded wait expires
 * before the drawing lands. The capture then took a hidden fence and an empty box, and the
 * author downloaded a BLANK REGION where the diagram belonged.
 *
 * So the delay goes on `mermaid.render` itself, installed through the same
 * `Object.defineProperty` hook the runtime's own load path trips. It NEVER RESOLVES, and that
 * is deliberate rather than lazy: the bake's two waits are SEQUENTIAL on one document (4000 in
 * the capture frame, which no longer releases, then 12000 in the bake), so the give-up is at
 * 16000 and any finite stall has to thread a 16000-20000 window against the runtime's own 20s
 * per-render cap. A held promise leaves the fence `rendering` when the export gives up — which
 * is exactly the state this fix has to handle — with no margin to lose on a slow CI box. The
 * export finishes at its own budget and the held promise simply dies with the page.
 */
async function stallMermaidRender(page: import('@playwright/test').Page, holdMs?: number): Promise<void> {
	await page.addInitScript((ms) => {
		let held: Record<string, unknown> | undefined;
		Object.defineProperty(window, 'mermaid', {
			configurable: true,
			get: () => held,
			set: (v: Record<string, unknown> & { __stalled?: boolean }) => {
				held = v;
				if (!v || v.__stalled || typeof v.render !== 'function') return;
				const orig = v.render as (...a: unknown[]) => unknown;
				v.render = async function (this: unknown, ...args: unknown[]) {
					await new Promise((r) => { if (typeof ms === 'number') setTimeout(r, ms); });
					return orig.apply(this, args);
				};
				v.__stalled = true;
			},
		});
	}, holdMs);
}

/** What the fence looks like to someone opening the artifact. Read from a REAL layout. */
function fenceReadback() {
	const pre = document.querySelector('pre[data-mermaid-state], marp-pre[data-mermaid-state]');
	const code = pre ? pre.querySelector('code') : null;
	const box = pre ? pre.getBoundingClientRect() : null;
	const sib = pre?.nextElementSibling?.classList.contains('mermaid') ? pre.nextElementSibling : null;
	return {
		state: pre ? pre.getAttribute('data-mermaid-state') : null,
		display: pre ? getComputedStyle(pre).display : null,
		// The CODE's visibility, because the anti-flash rule withholds ink on the <code>
		// rather than collapsing the <pre>. A box measurement alone would pass on a fence
		// that is present, correctly sized, and painting absolutely nothing.
		codeVisibility: code ? getComputedStyle(code).visibility : null,
		width: box ? Math.round(box.width) : 0,
		height: box ? Math.round(box.height) : 0,
		text: (pre?.textContent || '').trim(),
		siblingDisplay: sib ? getComputedStyle(sib).display : null,
		svgTexts: [...document.querySelectorAll('svg text, svg foreignObject')].map((n) => n.textContent || '').join(' '),
		stamped: document.documentElement.hasAttribute('data-lattice-diagrams'),
	};
}

test('the Studio webpage export ships the author’s source when Mermaid never loads', async ({ page, context }, testInfo) => {
	test.setTimeout(180_000);
	await breakMermaid(page);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, 'mermaid-404.html');
	await (await downloadPromise).saveAs(file);

	// Open the artifact the way its recipient would, and let its own CSS lay it out.
	const viewer = await context.newPage();
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	await expect(viewer.locator('html')).toHaveClass(/\blp-js\b/);
	await showDiagramSlide(viewer);
	const r = await viewer.evaluate(fenceReadback);

	// ANCHOR FIRST: with no `<pre>` found every assertion below is vacuous, and a renamed
	// state value or a bake that dropped the fence outright would read as a pass.
	expect(r.state, 'the exported file carries the fence the runtime gave up on').toBe('unavailable');
	expect(r.text, 'and it carries the author’s own Mermaid source').toContain(SENTINEL);
	expect(r.display, 'the source is shown, not hidden by the pending rule').not.toBe('none');
	expect(r.codeVisibility, 'and it PAINTS — the prune kept the rule that shows it').toBe('visible');
	expect(r.width, 'with a real box').toBeGreaterThan(0);
	expect(r.height, 'with a real box').toBeGreaterThan(0);
	expect(r.siblingDisplay, 'the empty diagram slot collapses so the source has the full stage').toBe('none');
	expect(r.svgTexts, 'no diagram was drawn — that is the premise').not.toContain(SENTINEL);
	await viewer.close();
});

test('the Studio webpage export ships the author’s source when a diagram is too SLOW to draw', async ({ page, context }, testInfo) => {
	// THE REGRESSION THIS PINS, on the real surface. The wait guarding the capture is bounded —
	// it has to be, or a stalled diagram hangs the export for ever — and when it expired it used
	// to leave the fence tagged and hidden. `mermaid.css` hides a fence's source for every state
	// but `error` and `unavailable`, so the downloaded file carried an empty region, permanently,
	// in something the author may already have sent.
	//
	// The wait now releases anything still un-settled to `unavailable` on its way out — the same
	// state the 404 case above reaches by a different road — so the author gets their markdown
	// either way. Asserted on the DOWNLOADED artifact, laid out by its own CSS, because that is
	// the surface the defect lives on.
	test.setTimeout(240_000);
	await stallMermaidRender(page);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 200_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, 'mermaid-slow.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await context.newPage();
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	await showDiagramSlide(viewer);
	const seen = await viewer.evaluate(fenceReadback);
	await viewer.close();

	// The author's own source, visible and taking real room — not a blank.
	expect(seen.text).toContain(SENTINEL);
	expect(seen.display).not.toBe('none');
	expect(seen.codeVisibility).not.toBe('hidden');
	expect(seen.height).toBeGreaterThan(0);
	// And the empty drawing slot is collapsed rather than holding the space open.
	if (seen.siblingDisplay !== null) expect(seen.siblingDisplay).toBe('none');
});

test('a diagram that draws INSIDE the bake window still exports as a drawing', async ({ page, context }, testInfo) => {
	// THE REGRESSION ARM. The bake's two waits are sequential on one document — 4000 in the
	// capture frame, then 12000 in the bake — so a diagram has 16000 before the give-up. When
	// the frame's wait also RELEASED, that sum collapsed to the frame's 4000: the release is
	// terminal, so the bake saw a settled fence and returned at once, and a diagram landing
	// anywhere past 4s shipped as source text instead of the drawing it was about to become.
	//
	// 8s sits inside the restored window and outside the frame's own budget, which is exactly
	// the band that regressed. Asserted on the DOWNLOADED artifact: the drawing is there and
	// the source is hidden — the opposite of the give-up arm above, from the same code path.
	test.setTimeout(240_000);
	await stallMermaidRender(page, 8_000);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 200_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, 'mermaid-late-but-drawn.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await context.newPage();
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	await showDiagramSlide(viewer);
	const drawn = await viewer.evaluate(() => {
		const pre = document.querySelector('pre[data-mermaid-state], marp-pre[data-mermaid-state]');
		const box = pre?.nextElementSibling;
		return {
			state: pre?.getAttribute('data-mermaid-state') ?? null,
			final: pre?.hasAttribute('data-mermaid-final') ?? null,
			svg: !!box?.querySelector('svg'),
			preDisplay: pre ? getComputedStyle(pre).display : null,
		};
	});
	await viewer.close();

	// It drew, it was never released, and the source is hidden behind the drawing.
	expect(drawn.state).toBe('rendered');
	expect(drawn.final).toBe(false);
	expect(drawn.svg).toBe(true);
	expect(drawn.preDisplay).toBe('none');
});

test('the same export is unchanged when Mermaid loads', async ({ page, context }, testInfo) => {
	test.setTimeout(180_000);
	// The control arm, and the reason it is here rather than assumed: everything above is
	// satisfied by an export that has simply stopped baking diagrams. One variable — the
	// route — separates "the failure path is honest" from "the happy path broke".
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, 'mermaid-ok.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await context.newPage();
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	await expect(viewer.locator('html')).toHaveClass(/\blp-js\b/);
	await showDiagramSlide(viewer);
	const r = await viewer.evaluate(fenceReadback);
	expect(r.svgTexts, 'the diagram baked, labels and all').toContain(SENTINEL);
	expect(r.state, 'the fence is spent, not handed back').toBe('rendered');
	expect(r.display, 'and the spent source stays hidden').toBe('none');
	await viewer.close();
});

test('the Studio desktop print document shows the source when Mermaid never loads', async ({ page }) => {
	test.setTimeout(180_000);
	// `print()` blocks on a modal dialog Playwright cannot dismiss, so stub it in EVERY
	// frame — including the offscreen srcdoc the panel is about to mount. Everything up to
	// that call is the real path: the real panel, the real `buildSrcdoc`, the real 450ms
	// beat. What we read afterwards is the exact document the dialog would have captured.
	await page.addInitScript(() => { window.print = () => {}; });
	await breakMermaid(page);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await dialog.getByRole('button', { name: 'Print', exact: true }).click();

	// The offscreen print frame, identified by the off-screen offset the panel gives it —
	// the print PREVIEW cells are ordinary on-screen frames and must not be read instead.
	const handle = page.locator('iframe[style*="-10000px"]');
	await expect(handle).toBeAttached({ timeout: 60_000 });
	// READ AFTER THE FIT AGENT REVEALS. `buildSrcdoc` holds the whole deck
	// `visibility:hidden` until then, so a measurement taken earlier reports `hidden` for a
	// document where nothing is wrong — a first attempt at exactly this measurement did.
	await expect(handle.contentFrame().locator('.lattice')).toBeVisible({ timeout: 60_000 });
	const el = await handle.elementHandle();
	const doc = el ? await el.contentFrame() : null;
	expect(doc, 'the offscreen print document is reachable').not.toBeNull();
	const r = await doc!.evaluate(fenceReadback);

	expect(r.state, 'the print document gave up on the fence rather than leaving it pending').toBe('unavailable');
	expect(r.display, 'so the page carries the source instead of an empty slot').not.toBe('none');
	expect(r.codeVisibility, 'and the source paints').toBe('visible');
	expect(r.width, 'with a real box').toBeGreaterThan(0);
	expect(r.text, 'the author’s own Mermaid source is what gets printed').toContain(SENTINEL);
	// This path already passed `diagrams: false`, so the stamp was never here to drop.
	expect(r.stamped, 'the print document never claims diagrams').toBe(false);
});
