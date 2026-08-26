import { expect, test } from './studio-fixture';

// The kpi status pill, on the REAL Playground.
//
// #1846 changed the pill's ground from the palette's ALPHA `--{pass,warn}-bg` -- which
// inherited whatever tile the pill landed on -- to one opaque 8% mix into `--bg`. Every
// other surface in that change was verified by rendering a PDF, but the Playground paints
// the same CSS through a different path (a same-origin srcdoc frame, hydrated in the
// browser rather than exported), and nothing checked it. HARD RULE #23 is explicit that a
// PDF render is not evidence about a page, so this spec exists to make the claim checkable
// instead of asserted.
//
// It reads COMPUTED styles rather than pixels on purpose: the point is that the pill
// resolves the new component token on this path too, and a screenshot cannot say which
// declaration won. The ground is asserted OPAQUE, because the whole change is that it
// stopped depending on its tile -- an alpha value here would mean the old recipe came back.
//
// Seeding `lattice-docs-pg-source` is the suite's own idiom for putting a deck in front of
// the Playground (badge-transform-escape.spec.ts, mermaid-post-sanitize.spec.ts).

const SOURCE_KEY = 'lattice-docs-pg-source';

const deck = (theme: string, mode: string) => `---
marp: true
theme: ${theme}
color-mode: ${mode}
---

<!-- _class: kpi attention -->

## attention flags the tile that misses.

1. 1
   - tile flagged
   - the miss \`Attention\`
2. 3
   - tiles steady
   - for context \`On plan\`
`;

/** WCAG relative luminance, on the sRGB values getComputedStyle hands back. */
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

const CASES = [
	// theme, mode, and whether the PASS pill is expected to clear AA here.
	// carbone is the exception and it is not this component's fault: the palette has no
	// light canvas yet, so its light-arm trio is inks for a canvas that does not exist
	// (#1302). That pair is frozen in composed-contrast at 3.58 and reproduces here.
	{ theme: 'burgundy', mode: 'light', passClearsAA: true },
	{ theme: 'indaco', mode: 'dark', passClearsAA: true },
	{ theme: 'carbone', mode: 'light', passClearsAA: false },
];

for (const { theme, mode, passClearsAA } of CASES) {
	test(`playground: the kpi status pill paints its opaque ground — ${theme} ${mode}`, async ({ page }) => {
		await page.addInitScript(
			([k, s]) => {
				try {
					localStorage.setItem(k as string, s as string);
				} catch {
					/* a private-mode profile just gets the default deck; the assertions below then fail loudly */
				}
			},
			[SOURCE_KEY, deck(theme, mode)],
		);
		await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

		const preview = page.frameLocator('#preview');
		await expect(preview.locator('section.kpi').first()).toBeVisible({ timeout: 30_000 });

		const pills = await preview.locator('section.kpi code').evaluateAll((els) =>
			els.map((el) => {
				const s = getComputedStyle(el);
				return { text: (el.textContent || '').trim(), bg: s.backgroundColor, fg: s.color, border: s.borderTopColor };
			}),
		);
		expect(pills.length, 'the seeded deck did not reach the preview frame').toBeGreaterThanOrEqual(2);

		const parse = (c: string) => {
			const m = c.match(/-?[\d.]+/g)?.map(Number) ?? [];
			// `color(srgb r g b)` comes back 0-1; `rgb(r, g, b)` comes back 0-255.
			return c.startsWith('color(') ? m.slice(0, 3).map((v) => Math.round(v * 255)) : m.slice(0, 3);
		};

		for (const pill of pills) {
			// The ground is OPAQUE. An alpha channel here means the palette's `--*-bg`
			// tint is back and the pill is inheriting its tile again.
			expect(pill.bg, `${pill.text}: ground must be opaque`).not.toMatch(/rgba|\/\s*0?\.\d/);
			// The state hue still inks the label AND the border -- the border is what
			// carries the chip's edge now that the fill may match its tile (#1847).
			expect(parse(pill.fg), `${pill.text}: ink and border are the same state hue`).toEqual(parse(pill.border));
		}

		const warn = pills.find((p) => p.text === 'Attention');
		const pass = pills.find((p) => p.text === 'On plan');
		expect(warn && pass, 'both status pills painted').toBeTruthy();

		expect(ratio(parse(warn!.fg), parse(warn!.bg)), `${theme} ${mode}: warn pill`).toBeGreaterThanOrEqual(4.5);
		if (passClearsAA) {
			expect(ratio(parse(pass!.fg), parse(pass!.bg)), `${theme} ${mode}: pass pill`).toBeGreaterThanOrEqual(4.5);
		}
	});
}
