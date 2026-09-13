import { expect, test } from '@playwright/test';

// The Playground editor's BRACKET-MATCH marks, on the real Playground.
//
// `bracketMatching()` marks the pair with `.cm-matchingBracket`, and a bracket with
// no partner with `.cm-nonmatchingBracket`. @codemirror/language's BASE theme paints
// both through `&.cm-focused .cm-…Bracket` — and `&` compiles to the base theme's own
// class, so that selector carries THREE classes. The editor's own key was a bare
// `.cm-matchingBracket`, which `EditorView.theme()` prefixes to TWO, so the base rule
// won: every palette got `#328c8252` teal, measured on the built site as
// `rgba(50, 140, 130, 0.32)` on cuoio light AND dark. `--cm-match` resolved the whole
// time; nothing read it. The unmatched bracket was never themed at all and took
// `#bb555544` — a fixed red, including on the four a11y palettes that exist to avoid
// that hue.
//
// This is the same trap `playground-selection-contrast.spec.ts` pins one package over,
// and it needs the same kind of test for the same reason (HARD RULE #23): a unit test
// can read the selector but cannot say which declaration won a cascade. It reads
// COMPUTED style rather than pixels so a failure says WHY.
//
// Two focus states, because the base rule is scoped to `.cm-focused`. Under the bare
// key the mark was teal while focused and an accent wash while blurred — measured — so
// a fix that only wins one state leaves the highlight changing color on blur.

/** The base-theme literals that mean our rule lost. */
const BASE_MATCH = 'rgba(50, 140, 130, 0.32)'; //  #328c8252
const BASE_NONMATCH = 'rgba(187, 85, 85, 0.27)'; // #bb555544

const hexToRgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
function parseRgb(c: string): number[] {
	const n = c.match(/-?[\d.]+/g)?.map(Number) ?? [];
	return c.startsWith('color(') ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3);
}
const composite = (over: number[], under: number[], alpha: number) => over.map((v, i) => v * alpha + under[i] * (1 - alpha));
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
/** One read of a bracket mark, plus the tokens needed to judge it. */
type Reading = {
	mark: { bg: string; color: string; width: string; style: string } | null;
	activeLine: string | null;
	bg: string;
	accent: string;
	fail: string;
	textMuted: string;
	textBody: string;
};

/** Narrows `mark` for the reads below; the expect is what actually fails the test. */
function assertMarked(mark: Reading['mark'], where: string): asserts mark is NonNullable<Reading['mark']> {
	expect(mark, `${where}: the bracket is still marked`).not.toBeNull();
}

/** Transparent in any spelling a browser may compute it to. */
const isTransparent = (c: string) => /^(transparent|rgba?\([^)]*,\s*0\s*\)|color\([^)]*\/\s*0\s*\))$/.test(c.trim());

for (const scheme of ['dark', 'light'] as const) {
	test(`playground: bracket marks ring in the palette, not CodeMirror's base literal — ${scheme}`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

		const content = page.locator('.cm-content').first();
		await expect(content).toBeVisible({ timeout: 30_000 });
		await content.click();
		await page.keyboard.press('ControlOrMeta+a');
		// A matched pair, and on the last line a bracket with no partner. Only ONE
		// bracket is marked at a time — `bracketMatching()` looks at the caret — so each
		// case gets its own caret position rather than one document state.
		await page.keyboard.type('# b\n\n[link](url)\n\n(lone');

		/** Put the caret where `cls` gets marked, then read it in both focus states. */
		const measure = async (cls: string, place: () => Promise<void>) => {
			await content.click();
			await place();
			await expect(page.locator(cls).first(), `${cls} is marked`).toBeVisible();
			const out = {} as Record<'focused' | 'blurred', Reading>;
			for (const focused of [true, false] as const) {
				if (!focused) {
					await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
					await expect(page.locator('.cm-editor.cm-focused')).toHaveCount(0);
				}
				out[focused ? 'focused' : 'blurred'] = await page.evaluate((sel) => {
					const root = getComputedStyle(document.documentElement);
					const read = (k: string) => root.getPropertyValue(k).trim();
					const el = document.querySelector(sel) as HTMLElement | null;
					const cs = el ? getComputedStyle(el) : null;
					const line = document.querySelector('.cm-activeLine') as HTMLElement | null;
					return {
						mark: cs ? { bg: cs.backgroundColor, color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle } : null,
						activeLine: line ? getComputedStyle(line).backgroundColor : null,
						bg: read('--bg'),
						accent: read('--accent'),
						fail: read('--fail'),
						textMuted: read('--text-muted'),
						textBody: read('--text-body'),
					};
				}, cls);
			}
			return out;
		};

		// Caret at the end of `[link](url)` — immediately after the closer.
		const matched = await measure('.cm-matchingBracket', async () => {
			await page.keyboard.press('ControlOrMeta+End');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('End');
		});
		// Caret immediately after the lone `(` on the last line.
		const unmatched = await measure('.cm-nonmatchingBracket', async () => {
			await page.keyboard.press('ControlOrMeta+End');
			for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
		});

		for (const focus of ['focused', 'blurred'] as const) {
			for (const [label, state, tokenKey, baseLiteral, wantStyle] of [
				['match', matched[focus], 'accent', BASE_MATCH, 'solid'],
				['nonmatch', unmatched[focus], 'fail', BASE_NONMATCH, 'dashed'],
			] as const) {
				const where = `${scheme}/${focus}/${label}`;
				const mark = state.mark;
				assertMarked(mark, where);

				// The defect: CodeMirror's base theme filling the mark because our rule lost.
				expect(mark.bg, `${where}: painted CodeMirror's base literal — the theme rule lost the cascade`).not.toBe(baseLiteral);
				// The fix is a RING, not a wash — a wash stacked on the active line cannot
				// clear AA at any visible alpha (see the note in playground/editor.js).
				expect(isTransparent(mark.bg), `${where}: the mark fills the cell (${mark.bg}) — it must ring it, not wash it`).toBe(true);

				// The ring IS the palette's token, which is the tightest available statement
				// that THIS rule painted rather than some literal.
				const want = hexToRgb(state[tokenKey]);
				expect(parseRgb(mark.color), `${where}: the ring is its token (${state[tokenKey]})`).toEqual(want);
				expect(Number.parseFloat(mark.width), `${where}: the ring is drawn`).toBeGreaterThan(0);
				// Line style separates matched from unmatched WITHOUT relying on hue.
				expect(mark.style, `${where}: the ring's line style`).toBe(wantStyle);

				// What the reader gets. A marked bracket is always on the active line, so the
				// ink's backdrop is the active-line band — and because the ring adds no fill,
				// that backdrop is exactly what it would be with no mark at all. A bracket is
				// punctuation, so `--text-muted` is the ink and AA-large 3:1 is its bar (the
				// bar the selection sweep set); `--text-body` is held to full AA because a
				// match can fall inside a fenced code block where body ink paints strings.
				const band = parseRgb(state.activeLine!);
				const alpha = Number(state.activeLine!.match(/[\d.]+\s*\)$/)?.[0].replace(')', '') ?? 1);
				const ground = composite(band, hexToRgb(state.bg), Number.isFinite(alpha) ? alpha : 1);
				expect(ratio(hexToRgb(state.textMuted), ground), `${where}: muted ink over the active line`).toBeGreaterThanOrEqual(3);
				expect(ratio(hexToRgb(state.textBody), ground), `${where}: body ink over the active line`).toBeGreaterThanOrEqual(4.5);
			}
		}
	});
}
