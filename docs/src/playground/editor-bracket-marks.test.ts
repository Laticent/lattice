// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The bracket-match marks, and the cascade they have to win to exist at all.
//
// `bracketMatching()` marks a pair with `.cm-matchingBracket` and a partnerless
// bracket with `.cm-nonmatchingBracket`. @codemirror/language ships a BASE theme for
// both, and `EditorView.baseTheme` compiles `&` to the base theme's own generated
// class — so `&.cm-focused .cm-matchingBracket` carries THREE classes. A bare
// `.cm-matchingBracket` key in our own `EditorView.theme()` compiles to TWO and loses,
// which is exactly what shipped: `--cm-match` resolved on every palette and nothing
// read it, while CodeMirror's `#328c8252` teal painted the mark on all 36
// palette-modes. `Prec.lowest` on the base theme does not help — precedence orders
// stylesheets, and specificity is settled before order.
//
// The e2e spec (e2e/playground-bracket-contrast.spec.ts) proves the outcome on the
// real Playground, which is the only place a cascade can actually be observed. It is
// nightly. THIS test is the per-PR guard, and it is written against the dependency
// rather than against a remembered number: it reads @codemirror/language's base
// selector out of node_modules and fails if ours stops out-specifying it. A version
// bump that lengthens the base selector reintroduces the bug silently otherwise.

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EDITOR = path.join(HERE, 'editor.js');
const BASE_THEME = path.resolve(HERE, '../../node_modules/@codemirror/language/dist/index.js');

const source = () => fs.readFileSync(EDITOR, 'utf8');

/** Classes in a compiled selector. `&` IS a class (the theme's own), so it counts.
 *  Lookbehind rather than a consuming guard: `[^\\][.&]` eats the character before the
 *  dot, so `&.cm-focused .cm-x` counted 2 instead of 3 — harmless while both sides were
 *  undercounted by the same amount, wrong the moment they are not. */
const classCount = (sel: string) => (sel.match(/(?<!\\)[.&]/g) ?? []).length;

/** The base theme's own selector for `cls`, read from the installed package. */
function baseSelectorFor(cls: string): string {
	const src = fs.readFileSync(BASE_THEME, 'utf8');
	const m = src.match(new RegExp(`"([^"]*\\.${cls})"\\s*:\\s*\\{`));
	expect(m, `@codemirror/language no longer declares a base rule for .${cls} — re-read its base theme before trusting this test`).toBeTruthy();
	return m![1];
}

/** Our theme key that targets `cls`, as written in editor.js. */
function ourSelectorFor(cls: string): string {
	const m = source().match(new RegExp(`^\\t'([^']*\\.${cls}[^']*)':`, 'm'));
	expect(m, `editor.js has no theme key targeting .${cls}`).toBeTruthy();
	return m![1];
}

describe("the bracket marks out-specify CodeMirror's base theme", () => {
	for (const cls of ['cm-matchingBracket', 'cm-nonmatchingBracket']) {
		it(`.${cls} beats the base rule in BOTH focus states`, () => {
			const base = baseSelectorFor(cls);
			const ours = ourSelectorFor(cls).split(',').map((s) => s.trim());
			expect(ours.length, `.${cls} needs two arms: the base rule is scoped to .cm-focused, so the focused and blurred states are different cascades`).toBeGreaterThanOrEqual(2);

			const focusedArm = ours.find((s) => s.includes('.cm-focused'));
			const blurredArm = ours.find((s) => !s.includes('.cm-focused'));
			expect(focusedArm, `.${cls} has no .cm-focused arm to beat "${base}"`).toBeTruthy();
			expect(blurredArm, `.${cls} has no un-focused arm — the mark would fall back to the base color on blur`).toBeTruthy();
			expect(
				classCount(focusedArm!),
				`"${focusedArm}" carries ${classCount(focusedArm!)} classes and the base theme's "${base}" carries ${classCount(base)} — ours must be strictly higher or the base rule paints the mark`,
			).toBeGreaterThan(classCount(base));
		});
	}

	it('each mark seeds from a palette token, so the a11y palettes get their own hues', () => {
		const src = source();
		// The base literals are a fixed teal and a fixed red — the red lands on the four
		// a11y palettes that exist to avoid exactly that hue.
		expect(src).toMatch(/'--cm-match':\s*'var\(--accent\)'/);
		expect(src).toMatch(/'--cm-nonmatch':\s*'var\(--fail\)'/);
	});

	it('the marks RING the cell and never wash it', () => {
		// The bracket at the caret is always on the active line — the caret is what marks
		// it — so a wash would stack on the active-line band. Swept over 18
		// palettes x 2 modes x the six inks these editors paint, that stack fails AA from
		// 10% upward (4.42 for --text-body on cuoio/light, the default palette and mode),
		// and 8% is too faint to be worth a token. A ring sits at the cell's edge instead
		// of under the ink, so it costs no text contrast at all.
		const src = source();
		for (const cls of ['cm-matchingBracket', 'cm-nonmatchingBracket']) {
			const block = src.match(new RegExp(`'[^']*\\.${cls}[^']*':\\s*\\{([^}]*)\\}`))?.[1];
			expect(block, `no declaration block for .${cls}`).toBeTruthy();
			expect(block, `.${cls} must not fill the cell — a wash over the active line cannot clear AA at any visible alpha`).toMatch(/backgroundColor:\s*'transparent'/);
			expect(block, `.${cls} must draw its ring`).toMatch(/outline:\s*'1px (solid|dashed) var\(--cm-(match|nonmatch)\)'/);
		}
	});

	it('matched and unmatched differ by LINE STYLE, not only hue', () => {
		const src = source();
		const styleOf = (cls: string) =>
			src.match(new RegExp(`'[^']*\\.${cls}[^']*':\\s*\\{([^}]*)\\}`))![1].match(/outline:\s*'1px (\w+)/)![1];
		// The base theme separated these two by color alone. Keeping a second channel means
		// a reader who cannot resolve accent-vs-fail still sees which bracket has no partner.
		expect(styleOf('cm-matchingBracket')).toBe('solid');
		expect(styleOf('cm-nonmatchingBracket')).toBe('dashed');
	});
});
