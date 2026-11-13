import { parseColor, ratio, rgbOf } from './color-contrast';
import { expect, test } from './studio-fixture';

// The kpi status pill, on the REAL Playground.
//
// The pill is a status MARK (engineering/decisions/2026-10-24-status-is-one-system.md §kpi, and the THE STATUS PILL
// note in lib/components/evidence/kpi/kpi.styles.css): the deck's opaque status solid (`--state-X-hue`), its label and
// its drawn mark in the one ink `--on-mark`, a 1px border that carries the role (its own fill on pass, so it reads as
// no border; `--warn-signal-mark` on warn), and a 1px outer rim in the status ink, which is the chip's edge against
// the slide. The row's POSITION picks all of it; the engine never reads the label.
//
// This spec used to pin #1846's recipe, an 8% mix into `--bg` with the label inked in the state hue and "ink equals
// border". The status-mark decision replaced that recipe on purpose (one ink on a status solid reads in every theme
// and survives the office export), so the old "ink equals border" rule contradicts the shipped design and is gone.
// It also wrote its pills as bare backticks, which the pills plugin stopped reading when pills took the `{…}`
// notation: the spec then read the inline-code chips' tint and failed for a reason unrelated to the pill.
//
// The Playground paints the same CSS as the PDF through a different path (a same-origin srcdoc frame, hydrated in the
// browser rather than exported), and HARD RULE #23 says a PDF render is not evidence about a page. So this reads
// COMPUTED styles on the real page: a screenshot cannot say which declaration won.
//
// Seeding `lattice-docs-pg-source` is the suite's own idiom for putting a deck in front of the Playground
// (badge-transform-escape.spec.ts, mermaid-post-sanitize.spec.ts).

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
   - the miss \`{Attention}\`
2. 3
   - tiles steady
   - for context \`{On plan}\`
`;

// One light theme, one dark, and carbone, whose light arm has no light canvas of its own (#1302) and failed AA under
// the old tint recipe. Under the status mark every one clears both bars below (measured 2026-11-12: label on fill
// 4.64 to 10.05, rim against the slide 5.03 to 13.98).
const CASES = [
	{ theme: 'burgundy', mode: 'light' },
	{ theme: 'indaco', mode: 'dark' },
	{ theme: 'carbone', mode: 'light' },
];

for (const { theme, mode } of CASES) {
	test(`playground: the kpi status pill paints its status mark — ${theme} ${mode}`, async ({ page }) => {
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
		await expect(preview.locator('section.kpi .lat-pill')).toHaveCount(2, { timeout: 30_000 });

		const pills = await preview.locator('section.kpi .lat-pill').evaluateAll((els) =>
			els.map((el) => {
				const s = getComputedStyle(el);
				const mark = getComputedStyle(el, '::before');
				// What the rim stands against: the nearest ancestor that paints a ground.
				let ground = 'rgba(0, 0, 0, 0)';
				for (let n = el.parentElement; n; n = n.parentElement) {
					const bg = getComputedStyle(n).backgroundColor;
					if (!/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(bg)) {
						ground = bg;
						break;
					}
				}
				return {
					text: (el.textContent || '').trim(),
					bg: s.backgroundColor,
					fg: s.color,
					border: s.borderTopColor,
					borderWidth: s.borderTopWidth,
					rim: s.boxShadow,
					markDisplay: mark.display,
					markPaint: mark.backgroundColor,
					ground,
				};
			}),
		);
		const warn = pills.find((p) => p.text === 'Attention');
		const pass = pills.find((p) => p.text === 'On plan');
		expect(warn && pass, 'both status pills painted').toBeTruthy();

		for (const pill of [warn!, pass!]) {
			// The ground is an OPAQUE status solid. An alpha channel means a tint recipe came back and the pill inherits its tile again.
			expect(parseColor(pill.bg).alpha, `${pill.text}: the fill is opaque`).toBe(1);
			// The status is drawn, not left to hue alone: the mark box is on, painted in the label's own ink.
			expect(pill.markDisplay, `${pill.text}: the drawn mark leads the label`).toBe('inline-block');
			expect(rgbOf(pill.markPaint), `${pill.text}: the mark wears the label's ink`).toEqual(rgbOf(pill.fg));
			// The label clears AA on its fill.
			expect(ratio(rgbOf(pill.fg), rgbOf(pill.bg)), `${theme} ${mode}: ${pill.text} label on its fill`).toBeGreaterThanOrEqual(4.5);
			// The rim is one 1px outer ring in the status ink, and it is the chip's edge against the slide: 3:1 (WCAG 1.4.11).
			const rim = /^(rgba?\([^)]*\)) 0px 0px 0px 1px$/.exec(pill.rim);
			expect(rim, `${pill.text}: a 1px outer rim (got "${pill.rim}")`).not.toBeNull();
			expect(parseColor(pill.ground).alpha, `${pill.text}: found the ground behind the pill`).toBe(1);
			expect(ratio(rgbOf(rim![1]), rgbOf(pill.ground)), `${theme} ${mode}: ${pill.text} rim against the slide`).toBeGreaterThanOrEqual(3);
			expect(pill.borderWidth).toBe('1px');
		}

		// ONE ink on every status solid (`--on-mark`), so the status is the fill and the mark, never the label's color.
		expect(rgbOf(warn!.fg), 'both labels wear the one mark ink').toEqual(rgbOf(pass!.fg));
		// The fills differ: row position picks the status.
		expect(rgbOf(warn!.bg)).not.toEqual(rgbOf(pass!.bg));
		// The BORDER carries the role: on pass it is the pill's own fill (it reads as no border); on warn it is the signal, distinct from the fill.
		expect(rgbOf(pass!.border), 'pass: the border is the fill').toEqual(rgbOf(pass!.bg));
		expect(rgbOf(warn!.border), 'warn: the border is the signal, not the fill').not.toEqual(rgbOf(warn!.bg));
	});
}
