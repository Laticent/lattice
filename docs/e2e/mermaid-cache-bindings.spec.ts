import { expect, gotoStudio, LIVE_PREVIEW, test } from './studio-fixture';

// ── A diagram the preview hands back from its cache keeps its `click` behavior ────────────
//
// The runtime keeps every Mermaid SVG it draws and hands it back, instead of re-rendering,
// whenever a host rewrites a slide whose diagram source did not change: the Playground and
// the Studio do that on every keystroke. An SVG string carries Mermaid's markup but not the
// listeners `bindFunctions` attaches after the write, so until #2734 a hand-back lost them:
//   · a flowchart's `click A "url" "tooltip"` kept its link and lost its tooltip;
//   · a gantt's `click task href "url"`, which is a click listener and not a link, lost the
//     link outright, and with two gantts in one band the first chart never got its link at
//     all, even on a fresh render (Mermaid's gantt db is shared, and the second parse
//     emptied it before the first chart bound).
//
// test/integration/mermaid/mermaid-cache-bindings.test.js pins the same claims against
// node_modules' Mermaid with dispatched events. THIS file is the surface a person uses
// (HARD RULE #23): the real Playground and Studio, the REAL Mermaid from the CDN the preview
// names (`mermaid@11`, a newer 11.x than node_modules), and real keystrokes through the
// editor, on Chromium, WebKit and Gecko. On the Playground the hover and the clicks are a
// real pointer. The Studio's preview takes no pointer by design (see its SURFACES entry), so
// there the events are dispatched inside the real frame. On main's runtime both surfaces
// fail on all three engines.

const SOURCE_KEY = 'lattice-docs-pg-source';
const TIP = 'Opens the API reference';

const FLOWCHART_DECK = [
	'## Linked flow',
	'',
	'```mermaid',
	'flowchart LR',
	'  A["Web App"] -->|calls| B["API"]',
	`  click B "https://example.com/api" "${TIP}"`,
	'```',
	'',
	'Notes',
	'',
].join('\n');

const gantt = (name: string, task: string, url: string) => [
	'```mermaid',
	'gantt',
	'  dateFormat YYYY-MM-DD',
	`  title ${name}`,
	'  section S',
	`  ${task} :${task}, 2024-01-01, 3d`,
	`  click ${task} href "${url}"`,
	'```',
	'',
];
// Both gantts on ONE slide, so they render in one band: the case that dropped the first link.
const GANTT_DECK = ['## Two plans', '', ...gantt('One', 'ta', 'https://one.example/'), ...gantt('Two', 'tb', 'https://two.example/'), 'Notes', ''].join('\n');

type Page = import('@playwright/test').Page;

/**
 * The two surfaces that rewrite a slide on every keystroke. Both load the same preview
 * runtime into their frame; each opens a deck its own way and has its own editor.
 */
const SURFACES = [
	{
		name: 'Playground',
		frame: '#preview',
		async open(page: Page, deck: string) {
			await page.addInitScript(
				([key, src]) => {
					try {
						localStorage.setItem(key as string, src as string);
					} catch {
						/* a blocked store just means the draft does not seed */
					}
				},
				[SOURCE_KEY, deck],
			);
			await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
		},
		editor: (page: Page) => page.locator('.cm-content').first(),
		pointer: 'real',
	},
	{
		name: 'Studio',
		frame: LIVE_PREVIEW,
		async open(page: Page, deck: string) {
			await gotoStudio(page);
			// The bottom bar's source control exists at every width; at desktop the editor is
			// already showing and the control may be hidden.
			const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
			if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
			await page.getByLabel('Deck source').click();
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.press('Backspace');
			// `insertText`, not `type`: the deck is seeded, not authored, and typing would hand
			// every quote and bracket to the editor's auto-close.
			await page.keyboard.insertText(deck);
		},
		editor: (page: Page) => page.getByLabel('Deck source'),
		// The Studio's preview is non-interactive BY DESIGN: StudioShell makes the slide box
		// `pointer-events-none` so a swipe over the slide reaches the swipe container, and it
		// hit-tests only video posters, code-copy buttons and collage photos back into the frame.
		// No real pointer reaches a Mermaid node there, on main or here. So this surface proves
		// the HAND-BACK keeps the bindings with events dispatched inside the real Studio frame;
		// the Playground and the VS Code run prove them with real pointers.
		pointer: 'dispatched',
	},
] as const;
type Surface = (typeof SURFACES)[number];

/** Every fence on the slide reads `rendered` and holds an SVG. */
async function waitForDiagrams(page: Page, surface: Surface, diagrams: number) {
	const preview = page.frameLocator(surface.frame);
	await expect(preview.locator('pre[data-lattice-hydrate="mermaid"][data-lattice-settle="rendered"]')).toHaveCount(diagrams, { timeout: 40_000 });
	await expect(preview.locator('.mermaid > svg')).toHaveCount(diagrams, { timeout: 40_000 });
}

/**
 * A keystroke OUTSIDE every fence, through the real editor: the host rewrites the slide, the
 * fences arrive new and unmarked, and the runtime hands each diagram back from its cache.
 * The `data-e2e-old` mark proves it: a mark set on the old SVG is gone from the new one.
 */
async function typeOutsideTheFences(page: Page, surface: Surface, diagrams: number) {
	const preview = page.frameLocator(surface.frame);
	await preview.locator('.mermaid > svg').evaluateAll((els) => {
		for (const el of els) el.setAttribute('data-e2e-old', '');
	});
	await surface.editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' x', { delay: 0 });
	await expect(preview.locator('.mermaid > svg[data-e2e-old]')).toHaveCount(0, { timeout: 20_000 });
	// Every fence `rendered` with an SVG: the cache's hand-backs, and any fence it missed after
	// the runtime's debounced re-render, so no fixed wait is needed.
	await waitForDiagrams(page, surface, diagrams);
}

// Tagged for the WebKit and Gecko projects too: hover and click dispatch, and the frame's
// event plumbing, are exactly where engines differ.
// Each test runs on three engines. `@gecko` runs on BOTH the desktop (Chromium) project and
// the gecko one; `@webkit-tablet` runs on WebKit only, because desktop's grepInvert drops a
// WebKit-tagged title unless it also carries `@crosswidth`, and `@crosswidth` would add the
// 390px project, where each surface shows one pane at a time and the preview is off screen
// while the editor types. Hover and click dispatch are exactly where engines differ.
for (const engine of ['@gecko', '@webkit-tablet'] as const)
for (const surface of SURFACES) {
	test(`${surface.name}: a flowchart tooltip survives the cache hand-back after a keystroke ${engine}`, async ({ page }) => {
		await surface.open(page, FLOWCHART_DECK);
		await waitForDiagrams(page, surface, 1);
		const preview = page.frameLocator(surface.frame);
		const hoverAndRead = async () => {
			await page.mouse.move(0, 0);
			await preview.locator('.mermaidTooltip').evaluateAll((els) => {
				for (const el of els) el.textContent = '';
			});
			const node = preview.locator('.mermaid > svg g.node[title]');
			if (surface.pointer === 'real') await node.hover();
			else await node.dispatchEvent('mouseover');
			return (await preview.locator('.mermaidTooltip').first().textContent()) || '';
		};

		expect(await hoverAndRead(), 'fresh render: hovering the node shows its tooltip').toBe(TIP);
		await typeOutsideTheFences(page, surface, 1);
		expect(await hoverAndRead(), 'after the keystroke: the cached diagram still shows its tooltip').toBe(TIP);
		await typeOutsideTheFences(page, surface, 1);
		expect(await hoverAndRead(), 'after a second keystroke').toBe(TIP);
	});

	test(`${surface.name}: two gantts on one slide each open their own link, fresh and after keystrokes ${engine}`, async ({ page }) => {
		await surface.open(page, GANTT_DECK);
		await waitForDiagrams(page, surface, 2);
		const preview = page.frameLocator(surface.frame);

		/** Real clicks on each task's bar and label; `window.open` is recorded, never followed. */
		const clickTasks = async () => {
			await preview.locator('body').evaluate((body) => {
				const w = body.ownerDocument.defaultView as Window & { __opens?: string[] };
				w.open = ((u: string) => {
					(w.__opens ||= []).push(u);
					return null;
				}) as typeof w.open;
			});
			const out: Record<string, string[]> = {};
			for (const key of ['ta', 'ta-text', 'tb', 'tb-text']) {
				await preview.locator('body').evaluate((body) => {
					(body.ownerDocument.defaultView as Window & { __opens?: string[] }).__opens = [];
				});
				const target = preview.locator(`.mermaid > svg [id$="-${key}"]`);
				if (surface.pointer === 'real') {
					// A real click at the element's center, mapped from the frame's own layout box.
					// Not `locator.click()` or `boundingBox()`: in WebKit both place a small SVG
					// `<text>` off its glyphs (measured: a mouse click at the center of the text's
					// getBoundingClientRect, scaled by the iframe's box, opens the link; the other two
					// do not).
					const [cx, cy, docWidth] = await target.evaluate((el) => {
						const r = el.getBoundingClientRect();
						return [r.left + r.width / 2, r.top + r.height / 2, el.ownerDocument.documentElement.clientWidth];
					});
					const frameBox = await page.locator(surface.frame).boundingBox();
					if (!frameBox) throw new Error('the preview frame has no box');
					const k = frameBox.width / docWidth;
					await page.mouse.click(frameBox.x + cx * k, frameBox.y + cy * k);
				} else {
					await target.dispatchEvent('click');
				}
				out[key] = await preview.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { __opens?: string[] }).__opens || []);
			}
			return out;
		};
		const own = { ta: ['https://one.example/'], 'ta-text': ['https://one.example/'], tb: ['https://two.example/'], 'tb-text': ['https://two.example/'] };

		expect(await clickTasks(), 'fresh render: each task opens its own link, once').toEqual(own);
		await typeOutsideTheFences(page, surface, 2);
		expect(await clickTasks(), 'after a keystroke: both cached gantts still open their own links').toEqual(own);
		await typeOutsideTheFences(page, surface, 2);
		expect(await clickTasks(), 'after a second keystroke').toEqual(own);
	});
}

// ── On a phone: real WebKit, the iPhone 15 Pro descriptor, real taps ──────────────────────
//
// At phone width the Playground shows ONE pane: Edit is the editor alone (the preview frame is
// laid out at zero size), and Explore is the same `#preview` frame, full width. So the author's
// loop is tap in Explore, type in Edit, come back to Explore, and a gantt link is opened by a
// TAP. A flowchart tooltip is hover-only and its node is a link, so the tooltip has no phone
// form to test; the gantt links do.
test('Playground on a phone: a gantt link opens from a tap, fresh and after typing @webkit-phone', async ({ page }) => {
	const surface = SURFACES[0];
	await surface.open(page, GANTT_DECK);
	const preview = page.frameLocator(surface.frame);
	const explore = async () => {
		await page.getByRole('tab', { name: 'Explore' }).click();
		await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
		await expect(preview.locator('pre[data-lattice-hydrate="mermaid"][data-lattice-settle="rendered"]')).toHaveCount(2, { timeout: 40_000 });
		await expect(preview.locator('.mermaid > svg')).toHaveCount(2, { timeout: 40_000 });
	};
	const tapTasks = async () => {
		await preview.locator('body').evaluate((body) => {
			const w = body.ownerDocument.defaultView as Window & { __opens?: string[] };
			w.open = ((u: string) => {
				(w.__opens ||= []).push(u);
				return null;
			}) as typeof w.open;
		});
		const out: Record<string, string[]> = {};
		for (const key of ['ta', 'tb']) {
			const target = preview.locator(`.mermaid > svg [id$="-${key}"]`);
			await target.scrollIntoViewIfNeeded();
			await preview.locator('body').evaluate((body) => {
				(body.ownerDocument.defaultView as Window & { __opens?: string[] }).__opens = [];
			});
			// The same frame-box mapping as the desktop clicks, for the same WebKit reason.
			const [cx, cy, docWidth] = await target.evaluate((el) => {
				const r = el.getBoundingClientRect();
				return [r.left + r.width / 2, r.top + r.height / 2, el.ownerDocument.documentElement.clientWidth];
			});
			const frameBox = await page.locator(surface.frame).boundingBox();
			if (!frameBox) throw new Error('the preview frame has no box');
			const k = frameBox.width / docWidth;
			await page.touchscreen.tap(frameBox.x + cx * k, frameBox.y + cy * k);
			await expect
				.poll(() => preview.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { __opens?: string[] }).__opens || []), { timeout: 3_000 })
				.not.toEqual([]);
			out[key] = await preview.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { __opens?: string[] }).__opens || []);
		}
		return out;
	};
	const own = { ta: ['https://one.example/'], tb: ['https://two.example/'] };

	await explore();
	expect(await tapTasks(), 'fresh render: each task opens its own link from a tap').toEqual(own);
	for (let i = 1; i <= 2; i++) {
		await preview.locator('.mermaid > svg').evaluateAll((els) => {
			for (const el of els) el.setAttribute('data-e2e-old', '');
		});
		await page.getByRole('tab', { name: 'Edit' }).click();
		await surface.editor(page).click();
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.type(' x', { delay: 0 });
		await explore();
		await expect(preview.locator('.mermaid > svg[data-e2e-old]')).toHaveCount(0, { timeout: 20_000 });
		expect(await tapTasks(), `after typing ${i}: both cached gantts still open their own links from a tap`).toEqual(own);
	}
});
