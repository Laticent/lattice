import { expect, test } from '@playwright/test';

// The Playground editor's SELECT-ALL band, on the real Playground.
//
// The Playground editor runs `drawSelection()`, so the selection is a stack of
// `.cm-selectionBackground` divs rather than the native highlight — and
// @codemirror/view's BASE theme paints those divs through a five-class selector
// (`&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`,
// `#d7d4f0`). `EditorView.theme()` compiled the editor's own key to three classes,
// so the base rule won on SPECIFICITY and select-all slabbed light lavender over
// every palette: measured at 1.21:1 against `--text-body` on cuoio-dark. The
// Studio's editor never had it — with no `drawSelection()` it keeps the native
// highlight, which `::selection` in styles/native-widgets.css owns.
//
// This spec pins the fix on the surface it broke on (HARD RULE #23): a unit test
// cannot say which declaration won a cascade. It reads COMPUTED color rather than
// pixels for the same reason the kpi-pill spec does — a screenshot shows the band
// is wrong but not why. Two arms, because the base theme has a light AND a dark
// literal and swapping which one applies is not a fix.

/** CodeMirror's own base-theme selection colors — the four values that mean our rule lost. */
const BASE_THEME_LITERALS = [
	[215, 212, 240], // &light.cm-focused > … #d7d4f0 — the one that shipped
	[217, 217, 217], // &light … #d9d9d9
	[34, 51, 51], //    &dark.cm-focused > … #233
	[34, 34, 34], //    &dark … #222
];

/** sRGB channels from either `rgb()/rgba()` or `color(srgb …)`, plus alpha. */
function parse(c: string): { rgb: number[]; alpha: number } {
	const n = c.match(/-?[\d.]+/g)?.map(Number) ?? [];
	const isColorFn = c.startsWith('color(');
	const rgb = isColorFn ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3);
	const alpha = n.length > 3 ? n[3] : 1;
	return { rgb, alpha };
}

/** `over` composited onto `under` at `alpha`. */
const composite = (over: number[], under: number[], alpha: number) => over.map((v, i) => v * alpha + under[i] * (1 - alpha));

/** WCAG relative luminance / contrast ratio, on 0-255 channels. */
function ratio(a: number[], b: number[]) {
	const lum = (c: number[]) => {
		const [r, g, bl] = c.map((v) => {
			const s = v / 255;
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

for (const scheme of ['dark', 'light'] as const) {
	test(`playground: select-all paints the themed band, not CodeMirror's base literal — ${scheme}`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

		const content = page.locator('.cm-content').first();
		await expect(content).toBeVisible({ timeout: 30_000 });
		await content.click();
		await page.keyboard.press('ControlOrMeta+a');

		const band = page.locator('.cm-selectionBackground').first();
		await expect(band, 'drawSelection() paints the selection as DOM').toBeVisible();

		const measured = await page.evaluate(() => {
			const el = document.querySelector('.cm-selectionBackground') as HTMLElement;
			const root = getComputedStyle(document.documentElement);
			return {
				fill: getComputedStyle(el).backgroundColor,
				edge: getComputedStyle(el).boxShadow,
				bg: root.getPropertyValue('--bg').trim(),
				textBody: root.getPropertyValue('--text-body').trim(),
				accent: root.getPropertyValue('--accent').trim(),
			};
		});

		const fill = parse(measured.fill);
		for (const literal of BASE_THEME_LITERALS) {
			expect(fill.rgb, `the band is CodeMirror's base color ${JSON.stringify(literal)} — the theme rule lost the cascade`).not.toEqual(literal);
		}

		// The band is a TINT of the PALETTE: `--cm-selection` is `color-mix(… var(--accent)
		// 22%, transparent)`, which keeps the accent's channels and only moves alpha. So the
		// fill's rgb IS the accent's — the tightest available statement that this rule, and
		// not some literal, painted the band.
		const hexToRgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
		for (const [i, ch] of hexToRgb(measured.accent).entries()) {
			expect(fill.rgb[i], `the band tracks --accent (${measured.accent})`).toBeGreaterThanOrEqual(ch - 1);
			expect(fill.rgb[i], `the band tracks --accent (${measured.accent})`).toBeLessThanOrEqual(ch + 1);
		}
		expect(fill.alpha, 'the selection band keeps its alpha (--cm-selection is a 22% mix)').toBeLessThan(1);
		// The defining hairline is the theme's too — it was the only half that ever
		// applied, so losing it means the whole rule stopped matching.
		expect(measured.edge, 'the themed inset edge is still painted').toContain('inset');

		// What the reader actually gets: body text over the composited band. The floor is
		// 4.3, not AA's 4.5, and the 0.2 is not slack — it is a MEASURED, pre-existing,
		// site-wide number. `--cm-selection` is the same 22% accent mix that
		// styles/native-widgets.css gives `::selection`, so prose, the Studio's editor and
		// this band all land on the same value: 7.52 on cuoio-dark, 4.34 on cuoio-light,
		// where the palette pairs a dark accent with low-contrast body ink. Raising it is a
		// change to that shared token across every surface, not to this rule (HARD RULE #18:
		// pre-existing and off this change's path — logged, not folded in). What this floor
		// still catches is the defect it was written for: the base-theme slab measured 1.21.
		const over = composite(fill.rgb, hexToRgb(measured.bg), fill.alpha);
		expect(ratio(hexToRgb(measured.textBody), over), `${scheme}: body text over the selection band`).toBeGreaterThanOrEqual(4.3);
	});
}
