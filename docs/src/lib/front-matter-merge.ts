// Merging a pasted deck's front matter into the open deck's (2026-11-15-compose-markdown-clipboard.md §5).
// Its own module, loaded by the Compose paste on first use (markdown-clipboard.ts `land`), because
// `front-matter.ts` ships at startup on every route and this runs only inside a paste: kept there it cost the
// Studio, the Playground and the home page 239 gzipped bytes each (the route budget, docs-build on #3234).
import frontMatterKey from '../../../lib/core/front-matter-key.js';
import { frontMatterBlock, innerFrontMatter } from './front-matter';

/** A top-level key line: a bare key, or a quoted one (`"theme": …`), which YAML reads the same. */
const KEY_LINE = /^(?:"([^"\n]+)"|'([^'\n]+)'|([A-Za-z_][\w-]*))[ \t]*:/;
const keyOf = (line: string): string | null => {
	const m = KEY_LINE.exec(line);
	return m ? (m[1] ?? m[2] ?? m[3]) : null;
};
/** A line that is only a comment or blank: it belongs to the key BELOW it when it sits right above one. */
const isNote = (line: string) => !line.trim() || /^#/.test(line);

/** The settings a front-matter block names, in order, without repeats. */
export function frontMatterKeys(block: string): string[] {
	const keys: string[] = [];
	for (const line of innerFrontMatter(block).split('\n')) {
		const key = keyOf(line);
		if (key && !keys.includes(key)) keys.push(key);
	}
	return keys;
}

type Entry = { key: string; pre: string[]; body: string[] };

/**
 * A front-matter block's top-level entries. An entry is a column-0 key line and EVERYTHING after it up to the next
 * column-0 key line: an indented body, a list written at column 0 (`class:` then `- lead`), and blank lines inside a
 * nested map or a block scalar all belong to it. Only the run of comment and blank lines directly above the next key
 * moves to that key (`pre`), so replacing a key never takes the note above its neighbor; lines before the first key
 * ride in `head`. The checker on #3234 found the earlier, indentation-only rule dropping column-0 lists and cutting
 * a nested map at its first blank line.
 */
function frontMatterEntries(inner: string): { head: string[]; entries: Entry[] } {
	const head: string[] = [];
	const entries: Entry[] = [];
	for (const line of inner.split('\n')) {
		const key = keyOf(line);
		if (key) {
			const prev = entries[entries.length - 1];
			const from = prev ? prev.body : head;
			// The trailing run of notes above this key is its own.
			let cut = from.length;
			while (cut > (prev ? 1 : 0) && isNote(from[cut - 1])) cut--;
			const pre = from.splice(cut);
			entries.push({ key, pre, body: [line] });
		} else if (entries.length) entries[entries.length - 1].body.push(line);
		else head.push(line);
	}
	return { head, entries };
}

/** An entry's VALUE, for comparison: a one-line value read by the engine's own scalar rule (`frontMatterScalar`, so
 *  `cuoio`, `'cuoio'` and `cuoio  # mine` are one value), a longer one by its lines with spacing evened out. */
function entryValue(e: Entry): string {
	const first = e.body[0].slice(e.body[0].indexOf(':') + 1);
	const rest = e.body.slice(1).filter((l) => l.trim() && !/^[ \t]*#/.test(l));
	if (!rest.length) return frontMatterKey.frontMatterScalar(first);
	return [first.trim(), ...rest.map((l) => l.replace(/[ \t]+#.*$/, '').replace(/[ \t]+/g, ' ').trimEnd())].join('\n');
}

/**
 * The open deck's front-matter block with a PASTED deck's settings applied, and the settings that changed:
 *   · each top-level key the paste carries replaces the deck's entry for that key whole (a block value, a nested
 *     map or a column-0 list with it), in place, keeping the deck's comment above it;
 *   · a key only the paste carries is added at the end, with the comment above it in the paste;
 *   · a key only the deck carries keeps its bytes;
 *   · a key whose VALUE is the same in both is left alone, comment and spacing included, and is not reported;
 *   · a key the paste repeats counts once, by its last value, as a reader takes it.
 * The owner's ruling (2026-11-16): a pasted deck's front matter is respected. The result always ends with the
 * closing `---` on its own line and a blank line, whatever the pasted text ended with: `---# One` is not a fence.
 */
export function mergeFrontMatterBlocks(deckBlock: string, pastedBlock: string): { block: string; changed: string[] } {
	if (!pastedBlock || !frontMatterBlock(pastedBlock)) return { block: deckBlock, changed: [] };
	const pastedInner = innerFrontMatter(pastedBlock);
	// The last copy of a repeated key is the one a reader takes, so it is the one applied.
	const last = new Map<string, Entry>();
	for (const e of frontMatterEntries(pastedInner).entries) {
		last.delete(e.key);
		last.set(e.key, e);
	}
	const pasted = [...last.values()];
	if (!deckBlock || !frontMatterBlock(deckBlock)) {
		return { block: `---\n${pastedInner.replace(/\n+$/, '')}\n---\n\n`, changed: pasted.map((e) => e.key) };
	}
	const deckInner = innerFrontMatter(deckBlock);
	const deck = frontMatterEntries(deckInner);
	const changed: string[] = [];
	const at = new Map<string, number>();
	deck.entries.forEach((e, i) => {
		at.set(e.key, i);
	});
	for (const e of pasted) {
		const i = at.get(e.key);
		if (i === undefined) {
			at.set(e.key, deck.entries.length);
			deck.entries.push(e);
		} else if (entryValue(deck.entries[i]) !== entryValue(e)) {
			deck.entries[i] = { key: e.key, pre: deck.entries[i].pre, body: e.body };
		} else continue;
		changed.push(e.key);
	}
	if (!changed.length) return { block: deckBlock, changed };
	const inner = [...deck.head, ...deck.entries.flatMap((e) => [...e.pre, ...e.body])].join('\n').replace(/\n+$/, '');
	const open = /^---[ \t]*\r?\n/.exec(deckBlock)?.[0] ?? '---\n';
	const close = deckBlock.slice(open.length + deckInner.length);
	return { block: open + inner + close, changed };
}
