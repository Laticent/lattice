// Merging a pasted deck's front matter into the open deck's (2026-11-15-compose-markdown-clipboard.md §5).
// Its own module, loaded by the Compose paste on first use (markdown-clipboard.ts `land`), because
// `front-matter.ts` ships at startup on every route and this runs only inside a paste: kept there it cost the
// Studio, the Playground and the home page 239 gzipped bytes each (the route budget, docs-build on #3234).
import { frontMatterBlock, innerFrontMatter } from './front-matter';

/** A top-level key line: a bare key, or a quoted one (`"theme": …`), which YAML reads the same. */
const KEY_LINE = /^(?:"([^"\n]+)"|'([^'\n]+)'|([A-Za-z_][\w-]*))[ \t]*:/;

/** The settings a front-matter block names, in order, without repeats. */
export function frontMatterKeys(block: string): string[] {
	const keys: string[] = [];
	for (const line of innerFrontMatter(block).split('\n')) {
		const m = KEY_LINE.exec(line);
		const key = m && (m[1] ?? m[2] ?? m[3]);
		if (key && !keys.includes(key)) keys.push(key);
	}
	return keys;
}

type Entry = { key: string; pre: string[]; body: string[] };

/**
 * A front-matter block's top-level entries: each key line with the indented lines that belong to it (`body`: a
 * `style: |` body, a nested map), and the comment and blank lines just above it (`pre`). A comment belongs to the
 * key it sits over, so replacing a key never deletes the note above the NEXT one; lines after the last key ride in
 * `tail`.
 */
function frontMatterEntries(inner: string): { entries: Entry[]; tail: string[] } {
	const entries: Entry[] = [];
	let pending: string[] = [];
	for (const line of inner.split('\n')) {
		const m = KEY_LINE.exec(line);
		if (m) {
			entries.push({ key: m[1] ?? m[2] ?? m[3], pre: pending, body: [line] });
			pending = [];
		} else if (/^[ \t]+\S/.test(line) && entries.length && !pending.length) entries[entries.length - 1].body.push(line);
		else pending.push(line);
	}
	return { entries, tail: pending };
}

/**
 * The open deck's front-matter block with a PASTED deck's settings applied, and the settings that changed:
 *   · each top-level key the paste carries replaces the deck's entry for that key whole (a block value with its
 *     body), in place, keeping the deck's comment above it;
 *   · a key only the paste carries is added before the closing `---`, with the comment above it in the paste;
 *   · a key only the deck carries keeps its bytes;
 *   · a key whose value is the same in both is left alone and is not reported.
 * The owner's ruling (2026-11-16): a pasted deck's front matter is respected. The result always ends with the
 * closing `---` on its own line and a blank line, whatever the pasted text ended with: `---# One` is not a fence.
 */
export function mergeFrontMatterBlocks(deckBlock: string, pastedBlock: string): { block: string; changed: string[] } {
	if (!pastedBlock || !frontMatterBlock(pastedBlock)) return { block: deckBlock, changed: [] };
	const pastedInner = innerFrontMatter(pastedBlock);
	const pasted = frontMatterEntries(pastedInner);
	if (!deckBlock || !frontMatterBlock(deckBlock)) {
		const changed = [...new Set(pasted.entries.map((e) => e.key))];
		return { block: `---\n${pastedInner.replace(/\n+$/, '')}\n---\n\n`, changed };
	}
	const deckInner = innerFrontMatter(deckBlock);
	const deck = frontMatterEntries(deckInner);
	const changed: string[] = [];
	// The LAST copy of a repeated key is the one the reader takes (`getFrontMatter`), so that is the one replaced.
	const at = new Map<string, number>();
	deck.entries.forEach((e, i) => {
		at.set(e.key, i);
	});
	for (const e of pasted.entries) {
		const i = at.get(e.key);
		if (i === undefined) {
			at.set(e.key, deck.entries.length);
			deck.entries.push(e);
		} else if (deck.entries[i].body.join('\n') !== e.body.join('\n')) {
			deck.entries[i] = { key: e.key, pre: deck.entries[i].pre, body: e.body };
		} else continue;
		if (!changed.includes(e.key)) changed.push(e.key);
	}
	if (!changed.length) return { block: deckBlock, changed };
	const inner = [...deck.entries.flatMap((e) => [...e.pre, ...e.body]), ...deck.tail].join('\n');
	const open = /^---[ \t]*\r?\n/.exec(deckBlock)?.[0] ?? '---\n';
	const close = deckBlock.slice(open.length + deckInner.length);
	return { block: open + inner + close, changed };
}
