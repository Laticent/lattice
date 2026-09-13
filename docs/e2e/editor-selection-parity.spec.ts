import { expect, test } from '@playwright/test';

// Both deck editors select text the SAME way, on the real surfaces.
//
// They did not. The Playground installed `drawSelection()`, which replaces the
// browser's native highlight with `.cm-selectionBackground` divs; the Studio's
// editor never did. That one extension is what made the two diverge, and it is what
// this spec now pins against:
//
//   · the Playground drew a 1px accent hairline around a selection that the Studio
//     rendered flat — two editors of one product selecting differently;
//   · the drawn band could not read `::selection`, so it needed its own
//     `--cm-selection` token — a second copy of a measured number, with a third,
//     unreachable copy sitting in the Studio's theme;
//   · and @codemirror/view's BASE theme paints those divs through a five-class
//     selector, which out-specified the Playground's own key and slabbed light
//     lavender over every palette at 1.21:1 (#2139).
//
// Nothing needed the extension — no multiple selections, no rectangular selection,
// no search multi-cursor on either surface. Dropping it collapses all three
// problems: the selection is native, and `::selection` in styles/native-widgets.css
// is the ONE owner for the whole site.
//
// This runs on the real pages (HARD RULE #23) because none of it is visible to a
// unit test: the sibling `src/playground/editor-selection.test.ts` can read the
// source and say no local wash is declared, but only a browser can say which rule
// won and what the reader actually gets.

type Reading = {
	activeLineBg: string;
	gutterLineHeight: string;
	contentLineHeight: string;
	drawnBands: number;
	nativeSelectionLength: number;
	selectionBg: string;
	caretColor: string;
	bg: string;
	accent: string;
	textBody: string;
};

const SURFACES = [
	{ name: 'playground', url: '/playground/?view=edit' },
	{ name: 'studio', url: '/studio/' },
] as const;

const hexToRgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
function parse(c: string): { rgb: number[]; alpha: number } {
	const n = c.match(/-?[\d.]+/g)?.map(Number) ?? [];
	const isColorFn = c.startsWith('color(');
	const rgb = isColorFn ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3);
	return { rgb, alpha: n.length > 3 ? n[3] : 1 };
}
const composite = (over: number[], under: number[], a: number) => over.map((v, i) => v * a + under[i] * (1 - a));
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

async function readSurface(page: import('@playwright/test').Page, url: string): Promise<Reading> {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	const content = page.locator('.cm-content').first();
	await expect(content).toBeVisible({ timeout: 40_000 });
	await content.click();
	await page.keyboard.press('ControlOrMeta+a');
	return page.evaluate(() => {
		const el = document.querySelector('.cm-content') as HTMLElement;
		const root = getComputedStyle(document.documentElement);
		const read = (k: string) => root.getPropertyValue(k).trim();
		const gutters = document.querySelector('.cm-gutters') as HTMLElement;
		// The backdrop the selection ACTUALLY lands on, read while the selection is up.
		// Compositing over `--bg` instead is how a 4.5 floor passed on a surface
		// delivering 3.96 — see the note at the assertion.
		const active = document.querySelector('.cm-activeLine') as HTMLElement | null;
		return {
			activeLineBg: active ? getComputedStyle(active).backgroundColor : 'none',
			gutterLineHeight: gutters ? getComputedStyle(gutters).lineHeight : 'no gutters',
			contentLineHeight: getComputedStyle(el).lineHeight,
			drawnBands: document.querySelectorAll('.cm-selectionBackground').length,
			nativeSelectionLength: String(window.getSelection() ?? '').length,
			// `::selection` is readable through getComputedStyle's pseudo-element form,
			// which is what lets this assert the native path rather than screenshot it.
			selectionBg: getComputedStyle(el, '::selection').backgroundColor,
			caretColor: getComputedStyle(el).caretColor,
			bg: read('--bg'),
			accent: read('--accent'),
			textBody: read('--text-body'),
		};
	});
}

for (const scheme of ['dark', 'light'] as const) {
	test(`both deck editors select natively, identically, and legibly — ${scheme}`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });

		const readings: Record<string, Reading> = {};
		for (const s of SURFACES) readings[s.name] = await readSurface(page, s.url);

		for (const s of SURFACES) {
			const m = readings[s.name];
			const where = `${scheme}/${s.name}`;

			// The root cause, pinned where it is actually observable. A drawn band means
			// drawSelection() is back — with it the hairline, the duplicate token, and a
			// base-theme rule that out-specifies ours.
			// THE GUTTER MUST SHARE THE CONTENT'S LINE-HEIGHT. `.cm-gutters` is a SIBLING of
			// `.cm-content` inside `.cm-scroller`, so it inherits nothing from it: declare
			// line-height only on `.cm-content` and the gutter silently falls back to
			// @codemirror/view's base `.cm-scroller { line-height: 1.4 }`. The gutter BOXES
			// keep their explicit pixel heights from `GutterElement.update`, so nothing
			// jumps — the number GLYPH inside each box just drifts up, on every line, all
			// the way down the file. Measured when it broke: 18.9px against 21.6px.
			// Nothing in the tree measured this before, which is exactly why it shipped.
			expect(m.gutterLineHeight, `${where}: the gutter's line-height (${m.gutterLineHeight}) must match the content's (${m.contentLineHeight}) or the line numbers drift off their lines`).toBe(m.contentLineHeight);

			expect(m.drawnBands, `${where}: a drawn .cm-selectionBackground is back — the selection should be the browser's native highlight`).toBe(0);
			expect(m.nativeSelectionLength, `${where}: select-all produced no native selection`).toBeGreaterThan(0);

			// The wash is `color-mix(… var(--accent) 18%, transparent)`, which keeps the
			// accent's channels and moves only alpha — so the painted rgb IS the accent's.
			// That is the tightest available statement that native-widgets.css painted this.
			const wash = parse(m.selectionBg);
			for (const [i, ch] of hexToRgb(m.accent).entries()) {
				expect(wash.rgb[i], `${where}: ::selection tracks --accent (${m.accent})`).toBeGreaterThanOrEqual(ch - 1);
				expect(wash.rgb[i], `${where}: ::selection tracks --accent (${m.accent})`).toBeLessThanOrEqual(ch + 1);
			}
			expect(wash.alpha, `${where}: the selection keeps its alpha (an 18% mix)`).toBeLessThan(1);

			// The caret is `--text-body`, never `--accent`: it marks the insertion point
			// among the text you are typing, and accent carries no AA guarantee against
			// the canvas. Both editors now get this from lib/editor-chrome.js.
			expect(parse(m.caretColor).rgb, `${where}: the caret is --text-body (${m.textBody})`).toEqual(hexToRgb(m.textBody));

			// What the reader actually gets. 4.5 is full AA, and it is why the wash is 18%:
			// at the 22% this replaced, cuoio/light — the site's default palette and mode —
			// measured 4.32. It also still catches the defect this spec was first written
			// for: when CodeMirror's base theme won the Playground's band, it read 1.21.
			// THE BACKDROP IS NOT `--bg`, and an earlier version of this spec assumed it was.
			// `highlightActiveLine()` decorates the line at the caret whether or not the
			// range is empty, so on a surface that installs it the selection covering that
			// line sits on TWO stacked accent washes (12% + 18% composites to 27.84%). Over
			// bare `--bg` this measured 4.61 and passed; what a reader actually got on
			// cuoio/light — the default palette and mode — was 3.96, under AA. The
			// Playground now stands its active-line band down while a selection is up,
			// which is what makes this floor true rather than arithmetic. Reading the band
			// from the live DOM keeps the spec honest if that ever regresses.
			const band = m.activeLineBg === 'none' || !m.activeLineBg ? null : parse(m.activeLineBg);
			const ground = band && band.alpha > 0 ? composite(band.rgb, hexToRgb(m.bg), band.alpha) : hexToRgb(m.bg);
			const over = composite(wash.rgb, ground, wash.alpha);
			expect(ratio(hexToRgb(m.textBody), over), `${where}: body text over the selection, on its REAL backdrop (active-line band: ${m.activeLineBg})`).toBeGreaterThanOrEqual(4.5);
		}

		// THE PARITY CLAIM, stated directly rather than inferred from two passing arms:
		// one product, one selection appearance. This is the assertion that would have
		// caught the original divergence on the day it was introduced.
		expect(readings.playground.selectionBg, 'the two editors must paint the SAME selection').toBe(readings.studio.selectionBg);
		expect(readings.playground.caretColor, 'the two editors must paint the SAME caret').toBe(readings.studio.caretColor);
	});
}
