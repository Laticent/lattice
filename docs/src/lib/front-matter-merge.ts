// Merging a pasted deck's front matter into the open deck's (2026-11-15-compose-markdown-clipboard.md §5).
// Its own module, loaded by the Compose paste on first use (markdown-clipboard.ts `land`), because
// `front-matter.ts` ships at startup on every route and this runs only inside a paste: kept there it cost the
// Studio, the Playground and the home page 239 gzipped bytes each (the route budget, docs-build on #3234).
//
// THE KEYS ARE READ BY `keyGroups` (lib/core/front-matter-groups.js), the one reader the Marp-bundle exporter, the
// runtime's merge, the settings-block fold and the legend already share (HARD RULE #15). This file once split the
// block itself; three review rounds on #3234 found that private splitter dropping or misreading settings in a new
// way each time. A gap in how keys are read is fixed in that one reader, for every caller at once.
import frontMatterGroups from '../../../lib/core/front-matter-groups.js';
import frontMatterKey from '../../../lib/core/front-matter-key.js';
import { frontMatterBlock, innerFrontMatter } from './front-matter';

/** The settings a front-matter block names, in order, without repeats. */
export function frontMatterKeys(block: string): string[] {
	return [...new Set(frontMatterGroups.keyGroups(innerFrontMatter(block)).groups.map((g) => g.key))];
}

type Entry = { key: string; pre: string[]; body: string[] };

/** Is `line` the key line `key:` itself, not a stray line that merely starts with the key's name (`themes are…`)? */
export function isKeyLine(line: string, key: string): boolean {
	return line.startsWith(key) && /^[ \t]*:/.test(line.slice(key.length));
}

/** `keyGroups`' groups as entries: the lines that lead a group (`pre`: the note above the key), and the key line with
 *  its value (`body`). */
function entriesOf(inner: string): { entries: Entry[]; tail: string } {
	const { groups, tail } = frontMatterGroups.keyGroups(inner);
	const entries = groups.map((g) => {
		const lines = g.text.split('\n');
		// The key's own line: everything above it (a comment, or a line the reader could not place under a key, such as
		// a quoted `"theme":` the engine does not read either) leads the entry and is never compared or replaced.
		const at = Math.max(0, lines.findIndex((l) => isKeyLine(l, g.key)));
		return { key: g.key, pre: lines.slice(0, at), body: lines.slice(at) };
	});
	return { entries, tail };
}

/** An entry's VALUE, for comparison. A one-line value is read by the engine's own scalar rule (`frontMatterScalar`, so
 *  `cuoio`, `'cuoio'` and `cuoio  # mine` are one value). A longer one is its lines EXACTLY, with only trailing spaces
 *  and blank lines evened out: inside a `style: |` body a `#` is CSS (`color: #111`) and indentation is structure. */
function entryValue(e: Entry): string {
	const first = e.body[0].slice(e.body[0].indexOf(':') + 1);
	const rest = e.body.slice(1).filter((l) => l.trim());
	if (!rest.length) return frontMatterKey.frontMatterScalar(first);
	return [first.trim(), ...rest.map((l) => l.trimEnd())].join('\n');
}

/**
 * The open deck's front-matter block with a PASTED deck's settings applied, and the settings that changed:
 *   · each top-level key the paste carries replaces the deck's entry for that key whole (its value, however many
 *     lines `keyGroups` reads it as), in place, keeping the deck's comment above it;
 *   · a key only the paste carries is added at the end, with the comment above it in the paste;
 *   · a key only the deck carries, and the deck's comments after its last key, keep their bytes;
 *   · a key whose VALUE is the same in both is left alone and is not reported;
 *   · a key the paste repeats counts once, by its last value, as a reader takes it.
 * The owner's ruling (2026-11-16): a pasted deck's front matter is respected. The result always ends with the
 * closing `---` on its own line and a blank line, whatever the pasted text ended with: `---# One` is not a fence.
 */
export function mergeFrontMatterBlocks(deckBlock: string, pastedBlock: string): { block: string; changed: string[] } {
	if (!pastedBlock || !frontMatterBlock(pastedBlock)) return { block: deckBlock, changed: [] };
	const pastedInner = innerFrontMatter(pastedBlock);
	// The last copy of a repeated key is the one a reader takes, so it is the one applied.
	const last = new Map<string, Entry>();
	for (const e of entriesOf(pastedInner).entries) {
		last.delete(e.key);
		last.set(e.key, e);
	}
	const pasted = [...last.values()];
	if (!deckBlock || !frontMatterBlock(deckBlock)) {
		return { block: `---\n${pastedInner.replace(/\n+$/, '')}\n---\n\n`, changed: pasted.map((e) => e.key) };
	}
	const deckInner = innerFrontMatter(deckBlock);
	const deck = entriesOf(deckInner);
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
	const lines = [...deck.entries.flatMap((e) => [...e.pre, ...e.body]), ...(deck.tail ? [deck.tail] : [])];
	const inner = lines.join('\n').replace(/\n+$/, '');
	const open = /^---[ \t]*\r?\n/.exec(deckBlock)?.[0] ?? '---\n';
	const close = deckBlock.slice(open.length + deckInner.length);
	return { block: open + inner + close, changed };
}
