// The decks both equivalence checks run: every example and baseline deck, plus a synthetic one whose
// `$$` block holds a `---`, which splits a slide only when the math plugin is off.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const MATH_DECK = '---\ntheme: indaco\nsplit: headings\n---\n\n# A\n\n$$\nx\n\n# not a heading?\n\n---\n\ny\n$$\n\n# B\n\nbody\n';

/** [name, source] for every deck, the synthetic one first. */
export function decks() {
	const dirs = ['examples', 'test/integration/baseline-decks'];
	const files = dirs.flatMap((d) =>
		fs
			.readdirSync(path.join(ROOT, d))
			.filter((f) => f.endsWith('.md'))
			.sort()
			.map((f) => path.join(d, f)),
	);
	return [['synthetic-math', MATH_DECK], ...files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')])];
}

/** A copy of a deck the lint has things to say about: misspelled classes, a renamed register, and a
 *  `$$` block holding `---` with a class after it, so the math admission changes which slide it is on. */
export function perturb(src) {
	return (
		src.replace(/_class: ([a-z-]+)/g, '_class: $1x').replace(/^(---\n)/, '$1guards: strcit\nfluid: ture\n') +
		'\n\n---\n\n# Math\n\n$$\nx\n\n---\n\n<!-- _class: kpii -->\n\n# B\n$$\n\n- **Bold.** body\n'
	);
}
