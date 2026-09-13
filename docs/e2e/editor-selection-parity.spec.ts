import { expect, test } from '@playwright/test';
import { BUILTIN_PALETTES } from '../src/lib/theme-catalog.generated';

// Both deck editors DRESS THE SAME WAY, on the real surfaces, on every palette.
//
// The filename says selection because that is what forced the spec into existence.
// Its subject is everything the two editors must not differ on: the selection, the
// caret, and the focus ring.
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
// THE FOCUS RING RIDES ALONG HERE rather than in a spec of its own, because it is the
// same claim about the same pair of surfaces and the sweep is already open on both: 18
// palettes x 2 modes x 2 editors, four page loads. Its own argument — why a ring at all
// when the caret already satisfies WCAG 2.4.7 — is
// engineering/decisions/2026-09-13-editor-focus-ring.md.
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

/**
 * The focus ring, as computed.
 *
 * It is read off `.cm-editor::after`, not off the element's `outline`, because that is
 * where the ring is drawn — an inset `outline` is erased along the gutter by
 * CodeMirror's own sticky, opaque `.cm-gutters`, so the shared chrome uses a
 * z-ordered pseudo-element instead. See `lib/editor-chrome.js`. An `::after` with no
 * rule reports `content: 'none'` and a 0px border, which is what the blurred arm wants.
 */
type Ring = {
	content: string;
	style: string;
	width: string;
	color: string;
	/** The ring's USED box, and the editor's, so a zero-area or displaced ring fails. */
	box: [number, number];
	editorBox: [number, number];
	/**
	 * `.cm-editor`'s own `outline` — the OTHER channel, and the one a first cut of the
	 * ring dropped. @codemirror/view's base theme paints `1px dotted #212121` on
	 * `&.cm-focused`; replacing the suppression with the ring instead of adding to it
	 * brought that back on every editor, painted wherever the host does not clip it.
	 */
	baseOutline: string;
};

/**
 * Block until the editor's box stops moving.
 *
 * The geometry assertion compares the ring's used box against the editor's, and both
 * are read in one `evaluate` — but on a surface that mounts CodeMirror into a box still
 * being laid out (the Specimen, which swaps faces and then grows), a read can land
 * mid-layout and report a 58px editor under an 878px ring. That is a flake in the
 * measurement, not a defect in the ring, so wait for two consecutive identical widths
 * rather than for a magic threshold.
 */
async function awaitStableBox(page: import('@playwright/test').Page, scope = '') {
	const width = () => page.evaluate((sel) => (document.querySelector(`${sel}.cm-editor`) as HTMLElement)?.getBoundingClientRect().width ?? 0, scope);
	let last = -1;
	await expect
		.poll(async () => {
			const now = await width();
			const settled = now > 0 && now === last;
			last = now;
			return settled;
		}, { message: `${scope || 'the editor'}'s box never settled` })
		.toBe(true);
}

/** `.cm-editor` and its `::after`, in whatever focus state the page is in. */
const readRing = (page: import('@playwright/test').Page, scope = ''): Promise<Ring> =>
	page.evaluate((sel) => {
		const el = document.querySelector(`${sel}.cm-editor`) as HTMLElement;
		const cs = getComputedStyle(el, '::after');
		const own = getComputedStyle(el);
		return {
			content: cs.content,
			style: cs.borderTopStyle,
			width: cs.borderTopWidth,
			color: cs.borderTopColor,
			// Chromium resolves a positioned pseudo-element's used width/height, so this
			// catches the shapes a color read cannot: zero-area, `inset: 100%`, a ring
			// anchored to a box other than the editor's. Sub-pixel on both sides —
			// `clientWidth` rounds 647.547 to 648 and would fail a real ring.
			box: [Number.parseFloat(cs.width), Number.parseFloat(cs.height)] as [number, number],
			editorBox: [el.getBoundingClientRect().width, el.getBoundingClientRect().height] as [number, number],
			baseOutline: `${own.outlineStyle} ${own.outlineWidth}`,
		};
	}, scope);

/**
 * The ring's used box IS the editor's, to within a sub-pixel.
 *
 * A color read alone cannot tell a ring from a rule that resolves to nothing: a
 * zero-area pseudo-element, one at `inset: 100%`, and one anchored to a different box
 * all report the same `solid 2px var(--accent)`.
 */
function expectRingFillsEditor(ring: Ring, where: string) {
	// WIDTH IS THE EDITOR'S MINUS ONE, on purpose. The ring's right edge insets 1px so a
	// strip of canvas separates it from the pane splitter, which paints `--border` — the
	// same value as `--accent` on onyx, ardesia and the a11y palettes, where the two
	// otherwise fuse into one band (measured: 1.11:1 on onyx/dark). See the note in
	// lib/editor-chrome.js. Height still matches exactly; a ring that stopped insetting,
	// or inset on the wrong axis, fails here.
	const want: [number, number] = [ring.editorBox[0] - 1, ring.editorBox[1]];
	for (const [i, axis] of (['width', 'height'] as const).entries()) {
		expect(Math.abs(ring.box[i] - want[i]), `${where}: the focus ring's ${axis} is ${ring.box[i]}, expected ${want[i]} (the editor's ${axis} is ${ring.editorBox[i]})`).toBeLessThan(0.5);
	}
}

/** What one palette paints, read while a selection is up. */
type Reading = {
	palette: string;
	activeLineBg: string;
	selectionBg: string;
	caretColor: string;
	ring: Ring;
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
	await awaitStableBox(page);
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
				// The focus ring, read in the state the sweep is already in — focused, because
				// selecting requires focus. Its blurred half is asserted once per surface.
				ring: ((el, cs, own) => ({
					content: cs.content,
					style: cs.borderTopStyle,
					width: cs.borderTopWidth,
					color: cs.borderTopColor,
					box: [Number.parseFloat(cs.width), Number.parseFloat(cs.height)] as [number, number],
					editorBox: [el.getBoundingClientRect().width, el.getBoundingClientRect().height] as [number, number],
					baseOutline: `${own.outlineStyle} ${own.outlineWidth}`,
				}))(
					document.querySelector('.cm-editor') as HTMLElement,
					getComputedStyle(document.querySelector('.cm-editor') as HTMLElement, '::after'),
					getComputedStyle(document.querySelector('.cm-editor') as HTMLElement),
				),
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
	test(`both deck editors dress alike — selection, caret and focus ring — ${scheme}`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });

		const structure: Record<string, Structure> = {};
		const readings: Record<string, Record<string, Reading>> = {};
		const blurredRing: Record<string, Ring> = {};
		for (const s of SURFACES) {
			structure[s.name] = await openSurface(page, s.url);
			readings[s.name] = await sweepPalettes(page);
			// The ring's other half, read once: an outline that is also there unfocused is a
			// border, not a focus affordance, and every focused read above would still pass.
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
			await expect(page.locator('.cm-editor.cm-focused')).toHaveCount(0);
			blurredRing[s.name] = await readRing(page);
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

			// The focus ring only means "focus is here" if it is absent otherwise.
			expect(Number.parseFloat(blurredRing[s.name].width) || 0, `${where}: the editor draws a ring while BLURRED (${JSON.stringify(blurredRing[s.name])}) — that is a border, not a focus ring`).toBe(0);

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

				// THE FOCUS RING IS THE SITE'S OWN — `outline: 2px solid var(--accent)`, the one
				// declaration in styles/native-widgets.css that every other focusable on this
				// site wears. The editors were outside it by an accident of selector shape:
				// that rule picks `:where(a, button, input, select, textarea, summary,
				// [tabindex])`, and `.cm-content` is a contenteditable div with no tabindex, so
				// what painted instead was @codemirror/view's own base theme. The caret alone
				// already met WCAG 2.4.7, so this is the consistency fix, not a conformance
				// one; the argument is in
				// engineering/decisions/2026-09-13-editor-focus-ring.md. It is drawn as a
				// z-ordered `::after` rather than an `outline` because CodeMirror's sticky,
				// opaque `.cm-gutters` (z-index 200, inside the `.cm-scroller` stacking
				// context) erases an INSET outline's left edge, and an outward one is clipped
				// by the `overflow: hidden` pane — measured both ways on the real Playground.
				expect(m.ring.content, `${at}: the focus ring's pseudo-element is not generated`).not.toBe('none');
				expect(m.ring.style, `${at}: the focus ring's line style`).toBe('solid');
				expect(Number.parseFloat(m.ring.width), `${at}: the focus ring is drawn at the site's 2px`).toBeGreaterThanOrEqual(2);
				expect(parse(m.ring.color).rgb, `${at}: the focus ring is --accent (${m.accent})`).toEqual(tokenRgb(m.accent));
				// A color read alone cannot tell a ring from a rule that resolves to nothing:
				// zero-area, `inset: 100%` and a ring anchored to another box all report the
				// same `solid 2px var(--accent)`. The used box has to BE the editor's.
				expectRingFillsEditor(m.ring, at);
				// THE OTHER CHANNEL. Drawing our ring is only half the job: without
				// `outline: none` beside it, @codemirror/view's base `1px dotted #212121`
				// paints too — a palette-blind near-black that this change exists to remove,
				// and which a first cut shipped by replacing the suppression instead of
				// adding to it. Invisible on a clipped pane, visible on the Specimen.
				expect(m.ring.baseOutline, `${at}: CodeMirror's base dotted outline is back beside our ring`).toBe('none 0px');
				// WCAG 1.4.11 asks 3:1 of a focus indicator against ADJACENT colors, and the ring
				// has two neighbors, not one: its inner side is over the editor canvas (`--bg`),
				// its outer side IS the editor's edge, so what abuts it there is whatever the
				// pane puts next to the editor (on the Studio, a `rgb(143,136,125)` border).
				// This checks the inner one, which is the tighter of the two on every palette
				// measured — 36 live readings, minimum 5.24:1 on carbone/light against a 3.0
				// floor. Saying "both sides are `--bg`" would be wrong, and was.
				expect(ratio(tokenRgb(m.accent), tokenRgb(m.bg)), `${at}: the focus ring against the canvas it is drawn on`).toBeGreaterThanOrEqual(3);

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
			// APPEARANCE only — the two panes are different sizes, so their rings' BOXES
			// legitimately differ. What must not differ is what the ring looks like.
			const look = (r: Ring) => ({ content: r.content, style: r.style, width: r.width, color: r.color, baseOutline: r.baseOutline });
			expect(look(readings.playground[palette].ring), `${scheme}/${palette}: the two editors must draw the SAME focus ring`).toEqual(look(readings.studio[palette].ring));
		}
	});
}

// THE OTHER TWO EDITOR SURFACES, and why they get their own pass.
//
// The sweep above drives the two DECK editors, which is where the selection question
// lives. The chrome question is wider: `lib/editor-chrome.js` also dresses the
// component-page Specimen (the Playground's `createEditor`) and every Studio
// `CodeField` (LayoutStudio, Fabricate, CraftLab). A checker found two defects on
// exactly those two surfaces, both invisible to a spec that only opened the first two:
//
//   · the Specimen's host is `overflow: visible`, so it is the ONE place
//     @codemirror/view's base `1px dotted #212121` actually PAINTS when the
//     suppression is missing. On the Playground and the Studio the pane clips it, so
//     the regression was computed on all four surfaces and visible on one.
//   · CraftLab's `CodeField` host is `max-h-[26rem] overflow-auto` with no definite
//     height, so `.cm-editor` grows to the whole document (measured: clientHeight 415
//     against scrollHeight 846). An inset ring anchored to the editor scrolls its top
//     and bottom edges out of view there, which is why `codeFieldTheme` declines it.
//
// So this pass asks a different question of each: EVERY editor suppresses the dotted
// default, and only a full-pane editor draws the ring. It runs once rather than per
// mode — presence and suppression do not move with the color scheme, and the palette
// sweep above already covers what does.
const CHROME_SURFACES = [
	{
		name: 'specimen',
		url: '/components/statement/big-number/',
		scope: '.specimen-editor-host ',
		ring: true,
		open: async (page: import('@playwright/test').Page) => {
			await page.locator('.specimen-face-btn[data-face="source"]').first().click();
			// The Specimen focuses its editor on mount, so no click is needed — and the
			// click that would focus it lands before CodeMirror exists.
			await expect(page.locator('.specimen-editor-host .cm-editor.cm-focused')).toHaveCount(1, { timeout: 30_000 });
		},
	},
	{
		name: 'craft-lab CodeField',
		url: '/craft/components/anatomy/',
		scope: '.craft-lab-editor ',
		ring: false,
		open: async (page: import('@playwright/test').Page) => {
			await page.locator('.craft-lab-editor .cm-content').first().click();
			await expect(page.locator('.craft-lab-editor .cm-editor.cm-focused')).toHaveCount(1, { timeout: 30_000 });
		},
	},
] as const;

test("every editor kills CodeMirror's dotted default, and only a full-pane editor rings", async ({ page }) => {
	for (const s of CHROME_SURFACES) {
		await page.goto(s.url, { waitUntil: 'domcontentloaded' });
		// `open` comes FIRST: on the Specimen the editor does not exist until the Edit
		// face is chosen, so waiting for `.cm-content` before it is a guaranteed timeout.
		await s.open(page);
		await expect(page.locator(`${s.scope}.cm-content`).first()).toBeVisible({ timeout: 40_000 });
		await awaitStableBox(page, s.scope);
		const ring = await readRing(page, s.scope);

		// THE SUPPRESSION IS UNCONDITIONAL. Declining our ring never means inheriting
		// theirs — this is the arm that fails if the two channels are ever confused again.
		expect(ring.baseOutline, `${s.name}: CodeMirror's base dotted outline paints here (${JSON.stringify(ring)})`).toBe('none 0px');

		if (s.ring) {
			expect(ring.content, `${s.name}: the focus ring's pseudo-element is not generated`).not.toBe('none');
			expect(ring.style, `${s.name}: the focus ring's line style`).toBe('solid');
			expectRingFillsEditor(ring, s.name);
		} else {
			// Not "no affordance" — the HOST owns it here. What must not happen is our ring
			// drawing a second, square indicator inside a rounded one, or an inset ring
			// anchored to an editor its host scrolls.
			expect(ring.content, `${s.name}: an embedded field drew the editor ring — its host owns the affordance`).toBe('none');
		}
	}
});
