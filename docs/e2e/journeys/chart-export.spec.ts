import fs from 'node:fs';
import path from 'node:path';
import { expect, gotoStudio, railButtons, setEditorContent, shareExport, test, toastText } from '../studio-fixture';

// Journey: chart deck → PDF. Stylesheet-styled chart SVGs (radar, donut) are the
// export rasterizer's blind spot: html-to-image inlines computed styles onto
// HTMLElements ONLY, so a nested SVGElement clone keeps just classes — fills
// fell to SVG-default black and the CSS-sized root rescaled (the black-pentagon
// PDFs found on-device, jargon-gallery export). flattenChartSvgs bakes computed
// paint/text inline in the capture frame before rasterization; this journey
// pins BOTH the outcome (a real download) and the mechanism (the capture
// frame's chart polygon carries a baked non-black inline fill).
test.describe.configure({ timeout: 120_000 });

// The committed capture-sensitive coverage fixture (chart SVGs, Mermaid, ribbon
// chrome, dark bookend) — the SAME deck engineering/visual-review.md tells a
// human to eyeball through the real Share sheet on any export-pipeline change.
const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'test', 'fixtures', 'export-coverage-deck.md');
const DECK = fs.readFileSync(FIXTURE, 'utf8');
const SLIDES = (DECK.match(/<!-- _class:/g) || []).length; // every fixture slide declares a class

test('a chart deck exports to PDF with styled (non-black) chart SVGs', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(SLIDES);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	// Probe the throwaway capture frame while the export runs. Discriminators
	// chosen to flip on the real regression (verified against the pre-fix
	// build): (a) flattened chart <text> carries a baked inline font-size —
	// unflattened text has none (its size lived in the stylesheet, which the
	// html-to-image clone drops); (b) no gradient <stop> may still carry a raw
	// var() in its inline stop-color — flatten resolves them to literal rgb.
	const flattenProbe = page.waitForFunction(() => {
		const f = document.querySelector('[data-lattice-export="capture"] iframe') as HTMLIFrameElement | null;
		const d = f?.contentDocument;
		const charts = d ? Array.from(d.querySelectorAll('section .radar-figure svg, section.piechart svg, section .chart-frame svg')) : [];
		const texts = charts.flatMap((c) => Array.from(c.querySelectorAll('text')));
		if (!texts.length) return null; // capture frame not up yet — keep polling
		const sizedTexts = texts.filter((t) => (t as SVGElement).style?.fontSize);
		const rawVarStops = charts.flatMap((c) => Array.from(c.querySelectorAll('stop')))
			.filter((st) => /var\(/.test((st as SVGElement).getAttribute('style') || ''));
		// Truthy ONLY once fully flattened — the probe may fire between frame
		// load and flattenChartSvgs, so an intermediate state keeps polling. On
		// regression (flatten never runs) this times out, failing the test.
		if (sizedTexts.length !== texts.length || rawVarStops.length) return null;
		return `sizedText=${sizedTexts.length}/${texts.length} rawVarStops=0`;
		// THREE-arg form on purpose. `waitForFunction(fn, options)` binds that object to `arg`,
		// not to options — so the 60s here was silently ignored and the probe ran on the 15s
		// `actionTimeout` while the export it watches is budgeted 60s. It was visible in a
		// mutation run as "waitForFunction: Timeout 15000ms exceeded"; a slow-but-correct
		// export would have flaked the same way.
	}, undefined, { timeout: 60_000 });

	const download = page.waitForEvent('download', { timeout: 60_000 });
	await shareExport(page, 'pdf');
	await flattenProbe; // resolves only when the capture frame's charts are baked
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
});

// The SAME bake, through the browser half of the export. The CLI path
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

// The RASTERIZER half of the same bake — the path a user's PDF and PPTX actually
// come down. The journey above pins the `.svg` FILE exporter, and the two are not
// the same claim: the file path calls `finalizeStandaloneSvg`, which writes the
// definitions into a `<style>` rule. Nothing finalizes on the rasterizer path,
// because there is no file — so for as long as it passed no options at all, every
// paint the bake left as `var(--token)` reached html-to-image undefined.
//
// Why undefined there and not in the live frame: html-to-image deep-clones an
// `<svg>` root (`cloneSingleNode` → `node.cloneNode(isSVGElement(node))`) and then
// `cloneChildren` returns early on it, so not one descendant ever gets a
// computed-style copy. Descendants arrive carrying exactly the inline style the bake
// wrote, into a detached document with no deck stylesheet. `var()` resolves to
// nothing, `fill` falls to its SVG initial, and the initial is BLACK — 47 of 62
// paints on a flattened heatmap (#2210).
//
// The oracle is the CAPTURE FRAME rather than the downloaded PDF: the defect is
// exactly "a descendant names a token its root does not define", which is a DOM fact
// available before rasterization and an ink-color fact afterwards. Reading it here
// names the token that would have gone black instead of reporting a dark pixel and
// leaving the reader to guess which chart it came from. The downloaded file is still
// asserted — an export that never completes must not pass this.
test('a flattened chart defines, on its own root, every token its paints still name', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(SLIDES);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	// TWO QUESTIONS, and conflating them is a race. "Has the bake finished?" is what
	// the poll waits on; "did it define what it referenced?" is what the assertion
	// reads. An earlier cut polled on the SECOND — resolve only when no token is
	// undefined — which passed, but could only ever fail as a bare timeout with the
	// token names it had computed thrown away. Inverting it to resolve immediately
	// then caught `flattenChartSvgs` mid-walk, reporting charts it had not reached
	// yet: it replaces roots one at a time, so "no definitions" and "not baked yet"
	// look identical from outside.
	//
	// The discriminator is POSITIVE and per-root: `flattenChartSvgs` pins an inline
	// `width` on every clone it swaps in (it has to — the style-less serialization
	// would otherwise rescale the viewBox). A root without one has not been through
	// the bake. So the poll waits for every candidate to carry one, and only the
	// complete state is ever read as a verdict.
	const tokenProbe = page.waitForFunction(() => {
		const f = document.querySelector('[data-lattice-export="capture"] iframe') as HTMLIFrameElement | null;
		const d = f?.contentDocument;
		if (!d) return null;
		// Only the roots this bake actually touches: self-styled SVGs (Mermaid,
		// function-plot) are skipped by flattenChartSvgs and carry their own <style>.
		const roots = Array.from(d.querySelectorAll('section svg')).filter((sv) => !sv.querySelector('style'));
		if (!roots.length) return null; // capture frame not up yet — keep polling
		if (!roots.every((r) => (r as SVGElement).style?.width)) return null; // mid-bake
		let referencing = 0;
		const undefinedOn: string[] = [];
		for (const root of roots) {
			const named = new Set<string>();
			for (const el of Array.from(root.querySelectorAll('[style]'))) {
				for (const m of ((el as SVGElement).getAttribute('style') || '').matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) named.add(m[1]);
			}
			if (!named.size) continue;
			referencing++;
			const own = (root as SVGElement).getAttribute('style') || '';
			for (const t of named) if (!own.includes(`${t}:`)) undefinedOn.push(t);
		}
		if (!referencing) return null;
		return { roots: roots.length, referencing, undefinedOn };
	}, undefined, { timeout: 60_000 });

	const download = page.waitForEvent('download', { timeout: 60_000 });
	await shareExport(page, 'pdf');
	// `waitForFunction` only ever resolves on a truthy value, so the object above is
	// always present here; the cast is for the checker, not for the runtime.
	const verdict = (await (await tokenProbe).jsonValue()) as { roots: number; referencing: number; undefinedOn: string[] };
	expect(verdict.undefinedOn,
		`flattened charts reference tokens their own root does not define — each of these paints black in the export: ${verdict.undefinedOn.join(', ')}`)
		.toEqual([]);
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});
