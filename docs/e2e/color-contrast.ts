/**
 * "What is this color, and does it clear AA here?" — asked once, for every
 * contrast spec that asks it.
 *
 * WHY THIS EXISTS, and it is not DRY for its own sake. Three specs
 * (`editor-selection-parity`, `playground-bracket-contrast`,
 * `playground-kpi-pill`) carried byte-identical copies of `ratio` and of the
 * computed-color parser, and the first two also carried a hex parser that was
 * WRONG in a way no copy could see from where it sat:
 *
 *     const hexToRgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
 *
 * A custom property comes back from `getComputedStyle` as AUTHORED text, and the
 * generated sheet is minified — so `#FFFFFF` arrives as `#fff` and `#000000` as
 * `#000`. Slicing at fixed indexes reads NaN on those, every ratio built on them
 * becomes NaN, and `NaN >= 4.5` is false: the spec fails where it should pass,
 * and an `expect` written the other way round passes where it should fail. Only
 * a palette SWEEP reaches it — cuoio, the default every one of these specs drove,
 * has no shorthand token at all, and indaco's `--bg` is the first one a sweep
 * hits (#2194). The sweep fixed its own copy and left the sibling latent.
 *
 * A shared module is what stops the next spec inheriting the broken one by copy.
 *
 * WHY NOT `lib/theme/color.js`, which is the repo's color kernel (HARD RULE #1):
 * it answers a different question. Its `contrastRatio` takes two HEX STRINGS,
 * while every interesting reading here is a COMPOSITE — an alpha wash over a
 * ground — which has no hex spelling; and its `hexToRgb` throws on the 4- and
 * 8-digit forms, which the specs in this family do meet (CodeMirror's own base
 * literals, the thing `bracket-contrast` exists to catch, are `#328c8252` and
 * `#bb555544`). No shipped theme authors an 8-digit token today, so widening the
 * kernel to admit an alpha it would then discard would be changing engine color
 * validation to suit a test — more reach than this needs. These functions stay
 * here, where their scope is one browser's computed-style output.
 *
 * NODE SIDE ONLY. Everything here runs in the test process, on values already
 * read out of the page. A `page.evaluate` callback is serialized to the browser
 * and cannot close over an import, so the two specs that keep their own copies
 * are not oversights and are not meant to become callers: `crash-sentinel.spec.ts`
 * walks the layer chain off a 1×1 canvas inside the frame, and
 * `stage-window.spec.ts` measures the caption crawl inside the Stage window.
 */

/**
 * A palette token's rgb channels: `#rgb` · `#rgba` · `#rrggbb` · `#rrggbbaa`.
 *
 * Alpha is accepted and DROPPED — a token's own alpha is composited separately,
 * against the ground it actually lands on, by `composite()` below.
 *
 * Throws rather than returning NaN, so a token that stops being a hex literal is
 * a loud failure instead of an assertion that quietly stops meaning anything.
 */
export function tokenRgb(v: string): number[] {
	const digits = /^#([\da-f]{3,8})$/i.exec(v.trim())?.[1];
	if (!digits || ![3, 4, 6, 8].includes(digits.length)) throw new Error(`not a hex token: ${JSON.stringify(v)}`);
	const wide = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
	return [0, 2, 4].map((i) => Number.parseInt(wide.slice(i, i + 2), 16));
}

/**
 * A COMPUTED color — what `getComputedStyle` hands back, not what was authored.
 * `rgb()` / `rgba()` come back 0–255; `color(srgb …)` comes back 0–1.
 */
export function parseColor(c: string): { rgb: number[]; alpha: number } {
	const n = c.match(/-?[\d.]+/g)?.map(Number) ?? [];
	const isColorFn = c.startsWith('color(');
	const rgb = isColorFn ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3);
	return { rgb, alpha: n.length > 3 ? n[3] : 1 };
}

/** `parseColor`'s triple alone, for a color already known to be opaque. */
export const rgbOf = (c: string) => parseColor(c).rgb;

/** `over` at `alpha` laid on opaque `under` — the pixel a reader's eye gets. */
export const composite = (over: number[], under: number[], alpha: number) =>
	over.map((v, i) => v * alpha + under[i] * (1 - alpha));

/** WCAG 2.x contrast ratio between two OPAQUE sRGB triples, in [1, 21]. */
export function ratio(a: number[], b: number[]) {
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
