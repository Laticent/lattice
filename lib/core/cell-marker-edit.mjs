/**
 * cell-marker-edit — the Studio's Compose editor reading a state marker at the start of a table
 * cell (`[x] Signal taxonomy`), through the Segno list-text grammar (list-text-grammar.js,
 * generated into list-text.generated.js; decision 20: Segno is Lattice's one parser).
 *
 * The editor REWRITES source rather than renders it, so its shapes are its own and not
 * leading-marker.js's: it replaces a marker with at most ONE whitespace character after it (the
 * one it inserted), and it un-escapes the `\[x\]` its serializer writes. These replaced the
 * editor's four regular expressions (table-commands.ts CELL_MARKER and CELL_MARKER_BARE,
 * ComposeView.tsx CELL_MARKER_RE, deck-markdown.ts ESCAPED_LEADING_MARKER_RE), and
 * test/unit/tools/list-text-grammar.test.js holds them to what those returned.
 *
 * ESM, importing only the generated parser: the docs dev server serves a CommonJS file from lib/
 * only when it requires nothing itself (docs/src/plugins/vite-cjs-lib-dev.mjs), and the generated
 * parser requires nothing, where leading-marker.js requires it. Pure: no DOM, no fs.
 */
import listText from './list-text.generated.js';

// The parser keeps its tree in module state, valid until the next parse(): read it at once.
const LIST_KIND = Object.fromEntries(listText.parse('', 'track').tree.kinds.map((k, i) => [k, i]));

function read(s, rule) {
	const r = listText.parse(s, rule);
	if (!r.ok) return null;
	const { buf, top } = r.tree;
	let marker = '';
	let rest = s.length;
	for (let k = 0; k < top; k = buf[k + 3]) {
		if (buf[k] === LIST_KIND.mark) marker = s[buf[k + 1]];
		else if (buf[k] === LIST_KIND.rest) rest = buf[k + 1];
	}
	return { marker, rest };
}

/**
 * The marker leading a cell's text and the length the editor replaces when it changes it: the
 * marker and at most one whitespace character after it. `[x] Senior` → { marker: 'x', length: 4 };
 * `[x]Senior` → { marker: 'x', length: 3 }; null when the text does not lead with one of the six.
 * @param {string} text
 * @returns {{ marker: string, length: number } | null}
 */
export function readEditMarker(text) {
	const r = read(String(text), 'edit');
	return r && { marker: r.marker, length: r.rest };
}

/**
 * A serialized cell with its leading marker's escaped brackets restored: `\[!\] Late` →
 * `[!] Late`. Only a leading marker of the six: every other escaped bracket stays escaped, so a
 * `\[literal\]` or an escaped `\[text\](url)` never becomes a live link.
 * @param {string} text
 * @returns {string}
 */
export function unescapeLeadingMarker(text) {
	const s = String(text);
	const r = read(s, 'escaped');
	return r ? `[${r.marker}]${s.slice(r.rest)}` : s;
}
