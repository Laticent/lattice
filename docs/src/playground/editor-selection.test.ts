import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The selection wash is ONE appearance with ONE owner: `::selection` in
// styles/native-widgets.css, the browser's native highlight, which covers prose,
// the Playground's editor, the Studio's deck editor and the Component studio's
// CodeField alike.
//
// IT USED TO HAVE THREE OWNERS, and this test used to pin two of them against each
// other. The Playground installed `drawSelection()`, which replaces the native
// highlight with `.cm-selectionBackground` divs that cannot read `::selection` — so
// it carried its own `--cm-selection` token, and the numbers agreed only as long as
// someone remembered. The Studio's theme carried a THIRD copy, which nothing
// compared and nothing could render: with no `drawSelection()` there are no such
// divs (measured on the real Studio — zero elements after a select-all).
//
// Dropping `drawSelection()` collapses all of that. Nothing in either editor needed
// it: no multiple selections, no rectangular selection, no search multi-cursor. It
// was buying a drawn caret and a drawn selection, and charging a 1px hairline the
// Studio's editor never drew, a duplicate token, and a whole class of cascade bug
// (@codemirror/view's base theme out-specified the drawn band and slabbed light
// lavender over every palette — #2139).
//
// So this test no longer reconciles copies. It asserts there is only one.

const ROOT = path.resolve(__dirname, '../..');
const EXPECTED_ALPHA = 18;
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Every file that could re-grow a local selection wash or re-install the extension.
 *  The shared module is on this list deliberately: it is now the single most likely
 *  home for a re-added rule, which is exactly what makes it easy to forget. The two
 *  Studio components are here because they import `@codemirror/view` directly and are
 *  where a `drawSelection()` would actually be installed for that surface — neither is
 *  on a route the e2e drives, so this tier is the only thing watching CodeField. */
const EDITOR_THEMES = [
	'src/playground/editor.js',
	'src/components/studio/editor-theme.ts',
	'src/lib/editor-chrome.js',
	'src/components/studio/Editor.tsx',
	'src/components/studio/CodeField.tsx',
];

describe('the selection wash has exactly one owner', () => {
	it('::selection in native-widgets.css carries the measured value', () => {
		// The VALUE is measured, not chosen by eye. Across 18 palettes x 2 modes,
		// against the six inks these editors paint (`--text-heading`, `--text-body`,
		// `--text-muted` and the three `--syntax-*-ink`), at 18% primary text clears AA
		// on all 36 palette-modes and secondary text clears AA-large 3:1 with margin. At
		// the 22% this replaced, primary text failed on cuoio/light — the site's default
		// palette and mode — at 4.32, and secondary bottomed out at 3.01.
		const line = read('src/styles/native-widgets.css')
			.split('\n')
			.find((l) => /^\s*background:/.test(l) && l.includes('color-mix'));
		expect(line, 'native-widgets.css must carry the ::selection wash').toBeTruthy();
		expect(Number(line!.match(/var\(--accent\)\s+(\d+)%/)?.[1])).toBe(EXPECTED_ALPHA);
	});

	it('the text-fragment highlight rides the same ground', () => {
		// `::target-text` is deliberately matched to ::selection so a deep-linked
		// passage reads in-brand rather than in UA yellow. It pins its own ink, so only
		// the ground is shared — but the ground IS shared, and drifting it would give
		// one page two different accent washes.
		const block = read('src/styles/native-widgets.css').match(/::target-text\s*\{([^}]*)\}/);
		expect(block, 'native-widgets.css must carry the ::target-text rule').toBeTruthy();
		expect(block![1].match(/var\(--accent\)\s+(\d+)%/)?.[1]).toBe(String(EXPECTED_ALPHA));
	});

	for (const file of EDITOR_THEMES) {
		it(`${file} declares no selection of its own`, () => {
			const src = read(file);
			// A `.cm-selectionBackground` rule only does anything under `drawSelection()`,
			// and re-adding one is how the second and third copies got here.
			expect(src, `${file}: a .cm-selectionBackground rule means a drawn selection is back — it cannot read ::selection, so it is a second owner of this value`).not.toMatch(/cm-selectionBackground'\s*:/);
			expect(src, `${file}: --cm-selection is the token the drawn band needed; the native highlight reads ::selection instead`).not.toMatch(/'--cm-selection(-edge)?'\s*:/);
			expect(src, `${file}: a local ::selection rule re-forks the value that native-widgets.css owns for the whole site`).not.toMatch(/'::selection'\s*:/);
		});

		it(`${file} installs no drawSelection()`, () => {
			// The extension is the root cause, not the rules it needs. Adding it back
			// re-creates the drawn band, the duplicate token AND the base-theme cascade
			// fight in one line — so this is the assertion that actually holds the line.
			// If a surface ever genuinely needs it (multiple selections, rectangular
			// selection), that is a deliberate change with a contrast sweep attached, not
			// an import someone re-adds while reaching for something else in the same
			// `@codemirror/view` statement.
			// Matched as an IMPORT and as a CALL, never as a bare word: both files now
			// carry notes explaining why the extension is gone, and a test that cannot
			// tell prose from code would fail on its own documentation.
			const src = read(file);
			expect(src, `${file}: drawSelection is imported — it replaces the native highlight; see the note in playground/editor.js`).not.toMatch(/import\s*\{[^}]*\bdrawSelection\b[^}]*\}/);
			expect(src, `${file}: drawSelection() is installed — it replaces the native highlight; see the note in playground/editor.js`).not.toMatch(/^\s*drawSelection\s*\(/m);
		});
	}
});

// THE FOCUS RING'S TWO CHANNELS, pinned at the SOURCE because the e2e tier is nightly.
//
// `editorChrome` owes two declarations that are easy to confuse for one: `outline:
// 'none'`, which suppresses @codemirror/view's base `1px dotted #212121`, and the
// `::after`, which draws the site's ring. A first cut REPLACED the suppression with the
// ring, so the dotted near-black came back on every editor — computed on all four
// surfaces and painted on the one whose host does not clip it (the component-page
// Specimen, `overflow: visible`). Nothing in the tree could see it.
//
// The e2e spec now reads both channels on the real pages, which is the honest oracle
// (HARD RULE #23) — but it runs nightly, and this file is the per-PR half. It asks the
// cheap question a text read CAN answer: are both declarations still there, and is the
// CodeField still the one surface that declines the ring?
describe("the editor focus ring keeps both of its channels", () => {
	const chrome = read('src/lib/editor-chrome.js');

	it('suppresses CodeMirror\'s dotted default AND draws our ring', () => {
		expect(chrome, 'the base-theme suppression is gone — the dotted #212121 ring comes back').toContain("'&.cm-editor.cm-focused': { outline: 'none' }");
		expect(chrome, 'the ring itself is gone').toContain("'&.cm-editor.cm-focused::after'");
	});

	it('keeps the right edge inset past the pane splitter', () => {
		// The 1px inset is the whole subject of the commit that added it, and CI does not
		// run the e2e spec that measures it: `test:e2e:smoke` greps `@smoke`, which
		// `editor-selection-parity.spec.ts` does not carry, so it runs nightly only.
		// Reverting `inset` to `0` therefore passed every per-PR gate. A checker found
		// that; this is the cheap pin that closes it.
		expect(chrome, "the ring's right edge is flush again — it fuses with the pane splitter, which paints --border").toContain("inset: '0 1px 0 0'");
	});

	it('keeps the suppression OUTSIDE the focusRing branch', () => {
		// The suppression is unconditional on purpose: a surface that declines OUR ring
		// must not inherit THEIRS. Folding it inside the `focusRing` conditional would
		// re-ship the same defect for exactly the surfaces that opted out.
		const branch = chrome.slice(chrome.indexOf('...(focusRing'));
		expect(branch, 'the suppression moved inside the focusRing branch — an opted-out surface would get CodeMirror\'s dotted ring').not.toContain("outline: 'none'");
	});

	it('gives the embedded CodeField a theme that declines the ring', () => {
		const theme = read('src/components/studio/editor-theme.ts');
		expect(theme).toContain('export const editorTheme = studioTheme(true);');
		expect(theme).toContain('export const codeFieldTheme = studioTheme(false);');
		// The split only means anything if CodeField actually uses the ringless one.
		expect(read('src/components/studio/CodeField.tsx'), 'CodeField must use codeFieldTheme').toContain('codeFieldTheme');
		expect(read('src/components/studio/Editor.tsx'), 'the deck Editor must use editorTheme').toContain('editorTheme');
	});
});
