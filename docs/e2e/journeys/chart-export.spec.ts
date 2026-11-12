import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { PENDING_FIGURES } from '../../../lib/plugins/host-browser.mjs';
import { expect, gotoStudio, LIVE_PREVIEW, railButtons, setEditorContent, shareExport, test } from '../studio-fixture';

// Journey: chart deck → export. Stylesheet-styled chart SVGs (radar, donut) were the
// old rasterizer's blind spot: html-to-image copied computed styles onto HTML elements
// ONLY, so a nested SVG kept just its classes, its fills fell to SVG-default black and
// the CSS-sized root rescaled (the black-pentagon PDFs found on-device). A bake step,
// `flattenChartSvgs`, inlined the styles before each shot. The slide camera
// (lib/core/slide-camera.mjs) draws a slide WITH the page's stylesheet, so the bake was
// retired (2026-11-12, owner's D2 on #3148). The oracle is therefore the OUTCOME, read
// from the exported pictures themselves: each chart's own box is drawn, not black.
test.describe.configure({ timeout: 120_000 });

// The committed capture-sensitive coverage fixture (chart SVGs, Mermaid, ribbon
// chrome, dark bookend) — the SAME deck engineering/visual-review.md tells a
// human to eyeball through the real Share sheet on any export-pipeline change.
const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'test', 'fixtures', 'export-coverage-deck.md');
const DECK = fs.readFileSync(FIXTURE, 'utf8');
const SLIDES = (DECK.match(/<!-- _class:/g) || []).length; // every fixture slide declares a class
// Each slide's first heading, from the source: what tells one slide in the live preview from another.
const HEADINGS = DECK.replace(/^---\n[\s\S]*?\n---\n/, '')
	.split(/\n---\n/)
	.map((slide) => (slide.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? '').replace(/[*_`]/g, '').trim());

// One check, three engines: `@gecko` runs it on desktop Chromium and Firefox, `@webkit-tablet` in WebKit (where the
// retired bake cost most). Not `@crosswidth`: at phone width the editor this loads the deck through is folded away.
async function exportMatchesScreen({ page }: { page: Page }) {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(SLIDES);
	const { decode } = await import('fast-png');
	// A picture shrunk to 160x90 by averaging, in RGB: fine enough to see a chart lose its paint, its size or its
	// labels, coarse enough that the camera's scale and anti-aliasing do not count.
	const W = 160;
	const H = 90;
	const shrink = (png: Uint8Array) => {
		const img = decode(png);
		const ch = img.channels;
		const out = new Float64Array(W * H * 3);
		const n = new Float64Array(W * H);
		for (let y = 0; y < img.height; y++) {
			for (let x = 0; x < img.width; x++) {
				const o = (y * img.width + x) * ch;
				const c = Math.min(H - 1, Math.floor((y * H) / img.height)) * W + Math.min(W - 1, Math.floor((x * W) / img.width));
				for (let k = 0; k < 3; k++) out[c * 3 + k] += img.data[o + k];
				n[c]++;
			}
		}
		for (let c = 0; c < W * H; c++) for (let k = 0; k < 3; k++) out[c * 3 + k] /= n[c] || 1;
		return out;
	};
	const distance = (a: Float64Array, b: Float64Array) => {
		let d = 0;
		for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
		return d / a.length;
	};
	// Every slide as the reader sees it in the live preview (it shows the active slide).
	const live: Float64Array[] = [];
	for (let i = 0; i < SLIDES; i++) {
		await railButtons(page).nth(i).click();
		const sec = page.frameLocator(LIVE_PREVIEW).locator('.lattice section').first();
		// Wait for the preview to SHOW slide i (it switches after the click; a `silent` title slide carries no page
		// number, so its heading is the mark), then for its content to stop changing
		// (a diagram draws after the slide lands): first the engine's own signal, no figure still pending or hydrating
		// (PENDING_FIGURES, lib/plugins/host-browser.mjs, what the export itself waits on), then two equal reads in a row
		// for fonts and late layout. Polled, never a fixed sleep (#32).
		await expect(sec).toContainText(HEADINGS[i]);
		await expect(sec.locator(PENDING_FIGURES)).toHaveCount(0, { timeout: 60_000 });
		let last = '';
		await expect
			.poll(async () => {
				const now = await sec.evaluate((el) => `${el.innerHTML.length}:${el.querySelectorAll('svg *').length}:${document.fonts.status}`);
				const settled = now === last;
				last = now;
				return settled;
			}, { intervals: [250] })
			.toBe(true);
		live.push(shrink(new Uint8Array(await sec.screenshot({ animations: 'disabled' }))));
	}

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await shareExport(page, 'images');
	const zip = await (await import('jszip')).default.loadAsync(fs.readFileSync(await (await download).path()));
	const slidePng = (n: number) => Object.keys(zip.files).find((f) => new RegExp(`/slides/[^/]*-0*${n}\\.png$`).test(f));
	const exported: Float64Array[] = [];
	for (let n = 1; n <= SLIDES; n++) {
		const name = slidePng(n);
		expect(name, `slide ${n} is in the image set`).toBeTruthy();
		exported.push(shrink(await zip.files[name as string].async('uint8array')));
	}
	const report: string[] = [];
	for (let i = 0; i < SLIDES; i++) {
		const own = distance(exported[i], live[i]);
		const nearestOther = Math.min(...live.map((l, j) => (j === i ? Number.POSITIVE_INFINITY : distance(exported[i], l))));
		report.push(`slide ${i + 1}: ${own.toFixed(2)} from itself, ${nearestOther.toFixed(2)} from the nearest other slide`);
		// The picture is the slide on screen. At 160x90 this catches a chart drawn black, unpainted or missing (the old
		// bake's failure); it is too coarse to see a lost label or a font size, which it does not claim to.
		expect(own, report.join('\n')).toBeLessThan(6);
		// And the comparison can tell slides apart, so a pass above means something: the oracle's own arm.
		expect(nearestOther, report.join('\n')).toBeGreaterThan(own * 2);
	}
	test.info().annotations.push({ type: 'distances', description: report.join('; ') });
}
test('every exported slide picture looks like the same slide on screen @gecko', exportMatchesScreen);
test('every exported slide picture looks like the same slide on screen, in WebKit @webkit-tablet', exportMatchesScreen);

// The chart bake that remains: the standalone `.svg` files the image set extracts. The CLI path
// (`tools/export-chart-svg.js`) is measured on its own exported files, but the
// Studio reaches `flattenSvgStyles` from four other call sites and only some of
// them ask for token definitions — so the CLI's artifact says nothing about
// whether this one passes the flag. The oracle is the DOWNLOADED ZIP.
//
// What it pins: a standalone `.svg` in the image set carries its own `svg{…}`
// rule. The bake deliberately leaves a scheme-varying paint as `fill:var(--token)`
// so the exported player can re-theme it; a detached file has no host to define
// that token, the `var()` resolves to nothing, and `fill` falls to its SVG
// initial — BLACK. And the scratch attribute the two halves pass it on must not
// survive into the file, where it would publish the deck's resolved palette a
// second time.
test('a standalone chart SVG in the image set defines the tokens its paints reference', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(SLIDES);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	const download = page.waitForEvent('download', { timeout: 120_000 });
	await shareExport(page, 'images');
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.zip$/);

	const zipPath = await d.path();
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
	const svgNames = Object.keys(zip.files).filter((f) => f.endsWith('.svg'));
	expect(svgNames.length, 'the image set extracts standalone chart SVGs').toBeGreaterThan(0);

	let withTokenRule = 0;
	for (const name of svgNames) {
		const svg = await zip.files[name].async('string');
		// Never the scratch attribute — `finalizeStandaloneSvg` strips what it reads.
		expect(svg, `${name} must not ship the scratch attribute`).not.toContain('data-lattice-tokens');
		// A file that still names a token must define it.
		const named = new Set(Array.from(svg.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g), (m) => m[1]));
		if (!named.size) continue;
		// The selector is the file's OWN scope attribute, not a bare `svg` — a `<style>`
		// inside an SVG is document-scoped wherever the file ends up, so `svg{…}` would
		// repaint every other chart on a page that inlines this one. This assertion read
		// `/svg\{…\}/` and went stale the moment the scoping landed in the same commit
		// that wrote it; it was matching nothing and could not have failed.
		const rule = svg.match(/\[data-lattice-scope="[^"]+"\]\{([^}]*)\}/);
		expect(rule, `${name} references ${named.size} token(s) and must carry a scoped token rule`).not.toBeNull();
		const defined = new Set(Array.from((rule as RegExpMatchArray)[1].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g), (m) => m[1]));
		for (const t of named) expect(defined, `${name} leaves ${t} undefined — its paint falls to black`).toContain(t);
		withTokenRule++;
	}
	expect(withTokenRule, 'at least one extracted chart carries token references').toBeGreaterThan(0);
});
