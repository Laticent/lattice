import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The selection wash is ONE appearance declared in TWO places, because it is painted
// by two mechanisms:
//
//   - `::selection` in styles/native-widgets.css — the browser's native highlight,
//     which covers prose, the Studio's deck editor and the Component studio's
//     CodeField, none of which draws its own selection;
//   - `--cm-selection` in playground/editor.js — read by the `.cm-selectionBackground`
//     divs that `drawSelection()` paints in the Playground's editor, which the native
//     highlight cannot reach.
//
// Nothing in the cascade makes them agree, so they agree only as long as someone
// remembers. This test is that memory: it reads both literals and fails when they part.
//
// The VALUE is measured, not chosen by eye. Across 18 palettes x 2 modes, against the
// six inks these editors paint (`--text-heading`, `--text-body`, `--text-muted` and the
// three `--syntax-*-ink`), at 18% primary text clears AA on all 36 palette-modes and
// secondary text clears AA-large 3:1 with margin. At the 22% this replaced, primary
// text failed on cuoio/light — the site's default palette and mode — at 4.32, and
// secondary bottomed out at 3.01. The floor is asserted on the real surface instead, in
// e2e/playground-selection-contrast.spec.ts; what lives here is only the agreement.

const ROOT = path.resolve(__dirname, '../..');
const EXPECTED_ALPHA = 18;

/** The accent percentage in the first `color-mix(in srgb, var(--accent) N%, transparent)`
 *  on a line matching `anchor`. */
function washAlpha(file: string, anchor: RegExp): number {
	const line = fs
		.readFileSync(path.join(ROOT, file), 'utf8')
		.split('\n')
		.find((l) => anchor.test(l) && l.includes('color-mix'));
	expect(line, `${file}: no wash declaration matched ${anchor}`).toBeTruthy();
	const m = line!.match(/var\(--accent\)\s+(\d+)%/);
	expect(m, `${file}: could not read the accent percentage from: ${line!.trim()}`).toBeTruthy();
	return Number(m![1]);
}

describe('the selection wash is one number in two files', () => {
	it('the native highlight and the drawn band use the same accent percentage', () => {
		const native = washAlpha('src/styles/native-widgets.css', /^\s*background:/);
		const drawn = washAlpha('src/playground/editor.js', /'--cm-selection'/);
		expect(native, 'styles/native-widgets.css ::selection').toBe(EXPECTED_ALPHA);
		expect(
			drawn,
			`playground/editor.js --cm-selection is ${drawn}% but ::selection is ${native}% — the Playground's drawn band and every other surface's native highlight would paint different selections`,
		).toBe(native);
	});

	it('the text-fragment highlight rides the same ground', () => {
		// `::target-text` is deliberately matched to ::selection so a deep-linked
		// passage reads in-brand rather than in UA yellow. It pins its own ink, so
		// only the ground is shared — but the ground is shared, and drifting it would
		// give one page two different accent washes.
		const css = fs.readFileSync(path.join(ROOT, 'src/styles/native-widgets.css'), 'utf8');
		const block = css.match(/::target-text\s*\{([^}]*)\}/);
		expect(block, 'native-widgets.css must carry the ::target-text rule').toBeTruthy();
		expect(block![1].match(/var\(--accent\)\s+(\d+)%/)?.[1]).toBe(String(EXPECTED_ALPHA));
	});
});
