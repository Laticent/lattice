import { expect, test } from '@playwright/test';
import { BUILTIN_PALETTES } from '../src/lib/theme-catalog.generated';

// Both deck editors select text the SAME way, on the real surfaces, on EVERY palette.
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
//
// WHY IT SWEEPS ALL 18 PALETTES, AND WHY THAT IS NOT THE SAME AS THE SWEEP THAT SET
// THE 18% WASH. The wash was chosen from a sweep of the token FILES — arithmetic
// over `--accent` and the six inks, across 18 palettes x 2 modes. That sweep is
// exactly the kind this surface has already been burned by twice: #2139's 2.71:1
// figure described a declaration that had lost its cascade, and the first cut of the
// bracket fix swept an alpha over `--bg`, a backdrop the mark never has. A contrast
// number is about a RENDERED surface; read off anything else it is arithmetic about a
// hypothesis. Before this, the browser only ever confirmed the DEFAULT palette, so 17
// of 18 rested on the file sweep. Now every palette is read off the live DOM, with the
// backdrop read from the DOM too rather than assumed to be the canvas.
//
// THE PALETTE IS SWITCHED BY ATTRIBUTE, WHICH IS WHAT THE CONTROL DOES.
// `setPalette()` in `lib/site-chrome.ts` sets `data-palette` on `<html>`, persists it,
// and announces `lattice-chrome-change`; this drives the same two steps. That the real
// select lands on that attribute is pinned by `site-chrome-first-paint.spec.ts`, so
// re-driving the widget 72 times here would re-test that spec's subject, not this
// one's. Every read asserts the palette it actually got, so a controller that reverted
// the attribute would fail rather than certify a stale reading.
//
// SIX INKS, TWO BARS, and the split is the bar these editors are held to (set in
// `engineering/gotchas/studio-playground.md` § "Select-all in the Playground editor
// paints a light lavender slab"): full AA for primary text, AA-large 3:1 for
// secondary. Holding every ink to 4.5 is not a stricter version of this test, it is a
// different and unreachable one — 35 of 36 palette-modes fail it at ANY alpha, because
// `--text-muted` is designed to sit close to the canvas and lifting it was tried and
// rejected on measurements.

/** AA, 4.5:1 — the editor's body and heading ink. */
const PRIMARY_INKS = ['--text-heading', '--text-body'] as const;
/** AA-large, 3:1 — comments, punctuation and the derived syntax inks. */
const SECONDARY_INKS = ['--text-muted', '--syntax-keyword-ink', '--syntax-string-ink', '--syntax-number-ink'] as const;
const INKS = [...PRIMARY_INKS, ...SECONDARY_INKS] as const;

/** Palette-independent facts about a surface — read once, not once per palette. */
type Structure = {
	gutterLineHeight: string;
	contentLineHeight: string;
	drawnBands: number;
	nativeSelectionLength: number;
};

/** What one palette paints, read while a selection is up. */
type Reading = {
	palette: string;
	activeLineBg: string;
	selectionBg: string;
	caretColor: string;
	bg: string;
	accent: string;
	inks: Record<string, string>;
	nativeSelectionLength: number;
};

const SURFACES = [
	{ name: 'playground', url: '/playground/?view=edit' },
	{ name: 'studio', url: '/studio/' },
] as const;

/**
 * A palette token's rgb channels.
 *
 * NOT a fixed-index slice, which is what this spec shipped with. A custom property
 * comes back as AUTHORED text, and the generated sheet is minified — so `#FFFFFF`
 * arrives as `#fff` and `#000000` as `#000`. Slicing at 1/3/5 reads NaN on those,
 * every ratio downstream becomes NaN, and `NaN >= 4.5` is false: the spec fails
 * where it should pass, and one `expect` shape over it would pass where it should
 * fail. The default-palette-only version could not meet this — every one of cuoio's
 * tokens is six digits — and indaco's `--bg` is the first shorthand the sweep hits.
 * Three sibling contrast specs still carry the index-slicing helper; they are safe
 * only because none of them changes palette (see the gotchas entry).
 *
 * Throws rather than returning NaN, so a token that stops being a hex literal is a
 * loud failure instead of an assertion that quietly stops meaning anything.
 */
function tokenRgb(v: string): number[] {
	const digits = /^#([\da-f]{3,8})$/i.exec(v.trim())?.[1];
	if (!digits || ![3, 4, 6, 8].includes(digits.length)) throw new Error(`not a hex token: ${JSON.stringify(v)}`);
	const wide = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
	return [0, 2, 4].map((i) => Number.parseInt(wide.slice(i, i + 2), 16));
}
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

/** Focus the editor and select its whole document. */
async function selectAll(page: import('@playwright/test').Page) {
	await page.locator('.cm-content').first().click();
	await page.keyboard.press('ControlOrMeta+a');
}

/**
 * Open a surface, put a selection up, and read what does not move with the palette.
 */
async function openSurface(page: import('@playwright/test').Page, url: string): Promise<Structure> {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 40_000 });
	await selectAll(page);
	return page.evaluate(() => {
		const el = document.querySelector('.cm-content') as HTMLElement;
		const gutters = document.querySelector('.cm-gutters') as HTMLElement;
		return {
			gutterLineHeight: gutters ? getComputedStyle(gutters).lineHeight : 'no gutters',
			contentLineHeight: getComputedStyle(el).lineHeight,
			drawnBands: document.querySelectorAll('.cm-selectionBackground').length,
			nativeSelectionLength: String(window.getSelection() ?? '').length,
		};
	});
}

/** Every palette's reading on the surface already open, in `BUILTIN_PALETTES` order. */
async function sweepPalettes(page: import('@playwright/test').Page): Promise<Record<string, Reading>> {
	const out: Record<string, Reading> = {};
	for (const palette of BUILTIN_PALETTES) {
		// Exactly what `setPalette()` does — set the root attribute, then announce on the
		// event the chrome's own listeners use.
		await page.evaluate((p) => {
			document.documentElement.setAttribute('data-palette', p);
			window.dispatchEvent(new CustomEvent('lattice-chrome-change'));
		}, palette);
		// Re-select rather than trusting the selection to survive a chrome rewrite: the
		// active-line stand-down and `::selection` both only mean anything while a range
		// is up, and a silently collapsed one would read as a clean pass.
		await selectAll(page);
		out[palette] = await page.evaluate((inks) => {
			const el = document.querySelector('.cm-content') as HTMLElement;
			const root = getComputedStyle(document.documentElement);
			const read = (k: string) => root.getPropertyValue(k).trim();
			// The backdrop the selection ACTUALLY lands on, read while the selection is up.
			// Compositing over `--bg` instead is how a 4.5 floor passed on a surface
			// delivering 3.96 — see the note at the assertion.
			const active = document.querySelector('.cm-activeLine') as HTMLElement | null;
			return {
				palette: document.documentElement.getAttribute('data-palette') ?? '',
				activeLineBg: active ? getComputedStyle(active).backgroundColor : 'none',
				// `::selection` is readable through getComputedStyle's pseudo-element form,
				// which is what lets this assert the native path rather than screenshot it.
				selectionBg: getComputedStyle(el, '::selection').backgroundColor,
				caretColor: getComputedStyle(el).caretColor,
				bg: read('--bg'),
				accent: read('--accent'),
				inks: Object.fromEntries(inks.map((k) => [k, read(k)])),
				nativeSelectionLength: String(window.getSelection() ?? '').length,
			};
		}, INKS as unknown as string[]);
	}
	return out;
}

for (const scheme of ['dark', 'light'] as const) {
	test(`both deck editors select natively, identically, and legibly — ${scheme}`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });

		const structure: Record<string, Structure> = {};
		const readings: Record<string, Record<string, Reading>> = {};
		for (const s of SURFACES) {
			structure[s.name] = await openSurface(page, s.url);
			readings[s.name] = await sweepPalettes(page);
		}

		for (const s of SURFACES) {
			const st = structure[s.name];
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
			expect(st.gutterLineHeight, `${where}: the gutter's line-height (${st.gutterLineHeight}) must match the content's (${st.contentLineHeight}) or the line numbers drift off their lines`).toBe(st.contentLineHeight);

			expect(st.drawnBands, `${where}: a drawn .cm-selectionBackground is back — the selection should be the browser's native highlight`).toBe(0);
			expect(st.nativeSelectionLength, `${where}: select-all produced no native selection`).toBeGreaterThan(0);

			for (const palette of BUILTIN_PALETTES) {
				const m = readings[s.name][palette];
				const at = `${scheme}/${s.name}/${palette}`;

				// A reading is only worth asserting if it came from the palette it claims and
				// from a live selection. Either failing means the sweep certified nothing.
				expect(m.palette, `${at}: the palette did not stick`).toBe(palette);
				expect(m.nativeSelectionLength, `${at}: the selection collapsed before the read`).toBeGreaterThan(0);

				// The wash is `color-mix(… var(--accent) 18%, transparent)`, which keeps the
				// accent's channels and moves only alpha — so the painted rgb IS the accent's.
				// That is the tightest available statement that native-widgets.css painted this.
				const wash = parse(m.selectionBg);
				for (const [i, ch] of tokenRgb(m.accent).entries()) {
					expect(wash.rgb[i], `${at}: ::selection tracks --accent (${m.accent})`).toBeGreaterThanOrEqual(ch - 1);
					expect(wash.rgb[i], `${at}: ::selection tracks --accent (${m.accent})`).toBeLessThanOrEqual(ch + 1);
				}
				expect(wash.alpha, `${at}: the selection keeps its alpha (an 18% mix)`).toBeLessThan(1);

				// The caret is `--text-body`, never `--accent`: it marks the insertion point
				// among the text you are typing, and accent carries no AA guarantee against
				// the canvas. Both editors now get this from lib/editor-chrome.js.
				expect(parse(m.caretColor).rgb, `${at}: the caret is --text-body (${m.inks['--text-body']})`).toEqual(tokenRgb(m.inks['--text-body']));

				// What the reader actually gets, for every ink these editors paint. 4.5 is full
				// AA, and it is why the wash is 18%: at the 22% this replaced, cuoio/light — the
				// site's default palette and mode — measured 4.32. It also still catches the
				// defect this spec was first written for: when CodeMirror's base theme won the
				// Playground's band, it read 1.21.
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
				const ground = band && band.alpha > 0 ? composite(band.rgb, tokenRgb(m.bg), band.alpha) : tokenRgb(m.bg);
				const over = composite(wash.rgb, ground, wash.alpha);
				for (const ink of INKS) {
					const floor = (PRIMARY_INKS as readonly string[]).includes(ink) ? 4.5 : 3;
					expect(ratio(tokenRgb(m.inks[ink]), over), `${at}: ${ink} over the selection, on its REAL backdrop (active-line band: ${m.activeLineBg})`).toBeGreaterThanOrEqual(floor);
				}
			}
		}

		// THE PARITY CLAIM, stated directly rather than inferred from two passing arms:
		// one product, one selection appearance, on every palette. This is the assertion
		// that would have caught the original divergence on the day it was introduced.
		for (const palette of BUILTIN_PALETTES) {
			expect(readings.playground[palette].selectionBg, `${scheme}/${palette}: the two editors must paint the SAME selection`).toBe(readings.studio[palette].selectionBg);
			expect(readings.playground[palette].caretColor, `${scheme}/${palette}: the two editors must paint the SAME caret`).toBe(readings.studio[palette].caretColor);
		}
	});
}
